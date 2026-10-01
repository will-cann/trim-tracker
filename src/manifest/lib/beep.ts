let ctx: AudioContext | null = null

function tone(freq: number, startMs: number, durMs: number, gain = 0.08) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = freq
  g.gain.value = gain
  osc.connect(g).connect(ctx.destination)
  const t0 = ctx.currentTime + startMs / 1000
  osc.start(t0)
  osc.stop(t0 + durMs / 1000)
}

/**
 * USB scanners beep on every successful *read*, even when the tag is
 * rejected, so the app needs its own distinct error sound for the picker
 * to notice without looking at the screen.
 */
export function beep(kind: 'ok' | 'error' | 'done') {
  try {
    const Ctor = window.AudioContext
    if (!Ctor) return
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    if (kind === 'ok') tone(1320, 0, 70)
    else if (kind === 'done') {
      tone(1046, 0, 80)
      tone(1568, 90, 120)
    } else {
      tone(220, 0, 160, 0.12)
      tone(220, 200, 160, 0.12)
    }
  } catch {
    /* no audio available */
  }
}
