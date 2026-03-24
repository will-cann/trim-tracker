import { useState, useEffect, useCallback, useRef } from 'react';

interface UseSpeechRecognitionReturn {
    isListening: boolean;
    interimTranscript: string;
    finalTranscript: string;
    startListening: () => void;
    stopListening: () => void;
    hasSupport: boolean;
    resetTranscript: () => void;
}

export const useSpeechRecognition = (): UseSpeechRecognitionReturn => {
    const [isListening, setIsListening] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState('');
    const [finalTranscript, setFinalTranscript] = useState('');
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const finalRef = useRef('');

    useEffect(() => {
        if (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognitionInstance = new SpeechRecognition();

            recognitionInstance.continuous = false;
            recognitionInstance.interimResults = true;
            recognitionInstance.lang = 'en-US';

            recognitionInstance.onstart = () => {
                setIsListening(true);
            };

            recognitionInstance.onend = () => {
                setIsListening(false);
                setInterimTranscript('');
            };

            recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const text = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalRef.current = (finalRef.current ? finalRef.current + ' ' : '') + text.trim();
                        setFinalTranscript(finalRef.current);
                        setInterimTranscript('');
                    } else {
                        interim += text;
                    }
                }
                if (interim) {
                    setInterimTranscript(interim);
                }
            };

            recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
                console.error('Speech recognition error', event.error);
                setIsListening(false);
                setInterimTranscript('');
            };

            setRecognition(recognitionInstance);
        }
    }, []);

    const startListening = useCallback(() => {
        if (recognition) {
            try {
                finalRef.current = '';
                setFinalTranscript('');
                setInterimTranscript('');
                recognition.start();
            } catch (error) {
                console.error('Error starting speech recognition:', error);
            }
        }
    }, [recognition]);

    const stopListening = useCallback(() => {
        if (recognition) {
            recognition.stop();
        }
    }, [recognition]);

    const resetTranscript = useCallback(() => {
        finalRef.current = '';
        setFinalTranscript('');
        setInterimTranscript('');
    }, []);

    return {
        isListening,
        interimTranscript,
        finalTranscript,
        startListening,
        stopListening,
        hasSupport: !!recognition,
        resetTranscript
    };
};
