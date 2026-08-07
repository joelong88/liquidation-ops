// A short synthesized beep on every scan — no audio asset to host, works offline.
// Reuses one AudioContext across calls since browsers cap how many can be created.
let ctx: AudioContext | null = null

export function playScanSound(kind: 'success' | 'error' = 'success') {
  if (typeof window === 'undefined') return
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = kind === 'success' ? 880 : 220
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15)
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
  } catch {
    // Audio isn't critical — never let a sound failure block a scan.
  }
}
