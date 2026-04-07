import { useState, useCallback, useRef, useEffect } from 'react';
import type { SpeechMode } from '../types/definitions';
import { apiService } from '../services/apiService';

interface UseDeepgramOptions {
    mode: SpeechMode;
    onTranscript: (text: string, isFinal: boolean) => void;
    onUtteranceEnd?: () => void;
    onError?: (error: string) => void;
    /**
     * Returns a list of terms to prime the recognizer with at connect time.
     * Called once per startListening() — Deepgram does not support changing
     * keyterms on a live connection. Capped at 100 terms server-side.
     */
    getKeyterms?: () => string[];
}

interface UseDeepgramReturn {
    isConnected: boolean;
    isListening: boolean;
    startListening: () => Promise<void>;
    stopListening: () => void;
    error: string | null;
}

// Convert Float32 audio samples to Int16 PCM buffer
function float32ToInt16(float32Array: Float32Array): ArrayBuffer {
    const int16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16.buffer;
}

// Downsample from source sample rate to target (16kHz)
function downsample(buffer: Float32Array, sourceSampleRate: number, targetSampleRate: number): Float32Array {
    if (sourceSampleRate === targetSampleRate) return buffer;
    const ratio = sourceSampleRate / targetSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
        const index = Math.round(i * ratio);
        result[i] = buffer[index];
    }
    return result;
}

export const useDeepgram = ({
    mode,
    onTranscript,
    onUtteranceEnd,
    onError,
    getKeyterms,
}: UseDeepgramOptions): UseDeepgramReturn => {
    const [isConnected, setIsConnected] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    // Tracks whether the current close was initiated by the user (stopListening
    // or unmount) vs. a true connection failure. User-initiated closes should
    // not surface as errors — Deepgram frequently returns code 1005 (no
    // status) on clean close, which would otherwise trip the onError path.
    const userInitiatedCloseRef = useRef(false);
    const modeRef = useRef(mode);
    const onTranscriptRef = useRef(onTranscript);
    const onUtteranceEndRef = useRef(onUtteranceEnd);
    const onErrorRef = useRef(onError);
    const getKeytermsRef = useRef(getKeyterms);

    // Sync refs in effects to satisfy React 19 lint rules
    useEffect(() => { modeRef.current = mode; }, [mode]);
    useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
    useEffect(() => { onUtteranceEndRef.current = onUtteranceEnd; }, [onUtteranceEnd]);
    useEffect(() => { onErrorRef.current = onError; }, [onError]);
    useEffect(() => { getKeytermsRef.current = getKeyterms; }, [getKeyterms]);

    const cleanup = useCallback(() => {
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (wsRef.current) {
            if (wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close();
            }
            wsRef.current = null;
        }
        setIsConnected(false);
        setIsListening(false);
    }, []);

    // Cleanup on unmount — also flag as user-initiated so the onclose
    // handler doesn't surface an "unexpected close" error.
    useEffect(() => () => {
        userInitiatedCloseRef.current = true;
        cleanup();
    }, [cleanup]);

    const startListening = useCallback(async () => {
        setError(null);
        userInitiatedCloseRef.current = false;

        try {
            // 1. Get Deepgram API key from our auth-gated endpoint
            const { key } = await apiService.getDeepgramToken(modeRef.current);

            // 2. Get microphone
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });
            streamRef.current = stream;

            // 3. Build Deepgram WebSocket URL based on mode
            const params = new URLSearchParams({
                encoding: 'linear16',
                sample_rate: '16000',
                channels: '1',
                model: 'nova-3',
                language: 'en-US',
                punctuate: 'true',
                interim_results: 'true',
                smart_format: 'true',
                numerals: 'true',
            });

            if (modeRef.current === 'ambient') {
                // Long-running: no endpointing, keep alive
                params.set('endpointing', 'false');
                params.set('vad_events', 'true');
            } else {
                // Push-to-talk: detect end of speech
                params.set('endpointing', '300');
                params.set('utterance_end_ms', '1500');
            }

            // Keyterm boosting — primes the recognizer with domain vocabulary
            // and dynamic proper nouns (strain names, room names, trimmer
            // names) so they get heard correctly. Nova-3 supports up to 100
            // keyterms via repeated keyterm= params.
            const keyterms = getKeytermsRef.current?.() || [];
            const dedupedKeyterms = Array.from(new Set(keyterms.map(t => t.trim()).filter(Boolean))).slice(0, 100);
            // URLSearchParams.append handles repeated params natively.
            for (const term of dedupedKeyterms) {
                params.append('keyterm', term);
            }

            const wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
            const ws = new WebSocket(wsUrl, ['token', key]);
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnected(true);
                setIsListening(true);

                // 4. Set up audio pipeline
                const audioContext = new AudioContext({ sampleRate: 16000 });
                audioContextRef.current = audioContext;

                const source = audioContext.createMediaStreamSource(stream);
                const processor = audioContext.createScriptProcessor(4096, 1, 1);
                processorRef.current = processor;

                processor.onaudioprocess = (e) => {
                    if (ws.readyState !== WebSocket.OPEN) return;
                    const inputData = e.inputBuffer.getChannelData(0);
                    const downsampled = downsample(inputData, audioContext.sampleRate, 16000);
                    const pcm = float32ToInt16(downsampled);
                    ws.send(pcm);
                };

                source.connect(processor);
                processor.connect(audioContext.destination);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Handle utterance_end event (action mode: speech finished)
                    if (data.type === 'UtteranceEnd') {
                        onUtteranceEndRef.current?.();
                        return;
                    }

                    // Handle transcript results
                    if (data.channel?.alternatives?.[0]) {
                        const transcript = data.channel.alternatives[0].transcript;
                        if (transcript) {
                            const isFinal = data.is_final === true;
                            onTranscriptRef.current(transcript, isFinal);
                        }
                    }
                } catch {
                    // Ignore non-JSON messages
                }
            };

            ws.onerror = () => {
                const msg = 'Speech connection error';
                setError(msg);
                onErrorRef.current?.(msg);
                cleanup();
            };

            ws.onclose = (event) => {
                // Suppress errors for user-initiated closes (stopListening or
                // unmount). Deepgram commonly returns 1005 (no status) on a
                // clean close and the browser reports 1006 when we close the
                // WS from the client side — neither is a failure.
                const isClean = event.code === 1000 || event.code === 1005 || event.code === 1006;
                if (!userInitiatedCloseRef.current && !isClean) {
                    const msg = `Speech connection closed unexpectedly (${event.code})`;
                    setError(msg);
                    onErrorRef.current?.(msg);
                }
                cleanup();
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to start speech recognition';
            setError(msg);
            onErrorRef.current?.(msg);
            cleanup();
        }
    }, [cleanup]);

    const stopListening = useCallback(() => {
        // Mark this close as user-initiated so the onclose handler doesn't
        // surface it as an error.
        userInitiatedCloseRef.current = true;

        // Stop audio pipeline immediately so no more audio is sent
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        // Update state immediately so UI reflects "stopped"
        setIsListening(false);

        // Send close frame to Deepgram to flush any final transcript, then close
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'CloseStream' }));
            setTimeout(() => {
                if (wsRef.current) {
                    wsRef.current.close();
                    wsRef.current = null;
                }
                setIsConnected(false);
            }, 300);
        } else {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setIsConnected(false);
        }
    }, []);

    return {
        isConnected,
        isListening,
        startListening,
        stopListening,
        error,
    };
};
