// Short synthesized tones on every scan — no audio asset to host, works offline.
// Reuses one AudioContext across calls since browsers cap how many can be created.
let ctx: AudioContext | null = null

function tone(freq: number, startOffset: number, duration: number) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.value = freq
  const startTime = ctx.currentTime + startOffset
  gain.gain.setValueAtTime(0.15, startTime)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration)
}

// 'success'/'error' are the plain single-beep outcomes used everywhere. 'hvi' (bins
// A/C — high-value output) gets a bright ascending two-note chime so operators can
// tell "handle carefully" apart by ear. 'attention' (bins E/F/G — uncommon outputs)
// gets a lower double-beep so those rarer outcomes don't blend into ordinary scans.
export type ScanSoundKind = 'success' | 'error' | 'hvi' | 'attention'

export function playScanSound(kind: ScanSoundKind = 'success') {
  if (typeof window === 'undefined') return
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    switch (kind) {
      case 'success':
        tone(880, 0, 0.15)
        break
      case 'error':
        tone(220, 0, 0.15)
        break
      case 'hvi':
        tone(1046.5, 0, 0.12)
        tone(1568, 0.12, 0.16)
        break
      case 'attention':
        tone(494, 0, 0.1)
        tone(494, 0.16, 0.14)
        break
    }
  } catch {
    // Audio isn't critical — never let a sound failure block a scan.
  }
}
