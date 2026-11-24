let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch {
    return null;
  }
  return audioCtx;
}

interface Blip {
  type: OscillatorType;
  from: number;
  to: number;
  duration: number;
  volume: number;
}

function playBlip(blip: Blip): void {
  const ctx = getContext();
  if (!ctx) return;
  const start = () => {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = blip.type;
    osc.frequency.setValueAtTime(blip.from, now);
    osc.frequency.exponentialRampToValueAtTime(blip.to, now + blip.duration);
    gain.gain.setValueAtTime(blip.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + blip.duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + blip.duration);
  };
  if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(start)
      .catch(() => {});
  } else {
    start();
  }
}

export function playShootSound(): void {
  playBlip({ type: 'square', from: 880, to: 140, duration: 0.14, volume: 0.1 });
}

export function playHitSound(): void {
  playBlip({ type: 'sawtooth', from: 220, to: 40, duration: 0.45, volume: 0.18 });
}
