import { createEffect, createSignal, onSettled } from 'solid-js';

export function createLobbyMusic(src: string, isActive: () => boolean) {
  const [muted, setMuted] = createSignal(false);
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = 'auto';

  let unlocked = false;
  let audioCtx: AudioContext | null = null;

  const ensureAudioContext = (): AudioContext | null => {
    if (audioCtx) return audioCtx;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
      return audioCtx;
    } catch {
      return null;
    }
  };

  const syncPlayback = () => {
    const shouldPlay = isActive() && !muted();
    if (!shouldPlay) {
      audio.pause();
      return;
    }

    const playPromise = audio.play();
    if (playPromise) {
      playPromise
        .then(() => {
          unlocked = true;
        })
        .catch(() => {
          unlocked = false;
        });
    }
  };

  const handleFirstGesture = () => {
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    if (unlocked) return;
    syncPlayback();
  };

  const playJoinPling = () => {
    if (muted()) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    const triggerTone = () => {
      const now = ctx.currentTime;
      const notes = [587.33, 880];
      notes.forEach((freq, idx) => {
        const start = now + idx * 0.075;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.14, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.25);
      });
    };

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(triggerTone)
        .catch(() => {});
    } else {
      triggerTone();
    }
  };

  createEffect(
    () => isActive() && !muted(),
    () => {
      syncPlayback();
    }
  );

  onSettled(() => {
    window.addEventListener('pointerdown', handleFirstGesture);
    window.addEventListener('keydown', handleFirstGesture);

    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      audio.pause();
      audio.src = '';
      if (audioCtx) {
        void audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    };
  });

  const toggleMute = () => {
    setMuted((prev) => !prev);
  };

  return { muted, toggleMute, playJoinPling };
}
