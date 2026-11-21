import { createEffect, createSignal, onCleanup } from 'solid-js';

export function createLobbyMusic(src: string, isActive: () => boolean) {
  const [muted, setMuted] = createSignal(false);
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = 'auto';

  let unlocked = false;

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
    if (unlocked) return;
    syncPlayback();
  };

  window.addEventListener('pointerdown', handleFirstGesture);
  window.addEventListener('keydown', handleFirstGesture);

  createEffect(() => {
    isActive();
    muted();
    syncPlayback();
  });

  onCleanup(() => {
    window.removeEventListener('pointerdown', handleFirstGesture);
    window.removeEventListener('keydown', handleFirstGesture);
    audio.pause();
    audio.src = '';
  });

  const toggleMute = () => {
    setMuted((prev) => !prev);
  };

  return { muted, toggleMute };
}
