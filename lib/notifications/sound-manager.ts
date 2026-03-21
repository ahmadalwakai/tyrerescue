// lib/notifications/sound-manager.ts
'use client';

const STORAGE_KEY = 'admin-notification-sound-enabled';

let audioInstance: HTMLAudioElement | null = null;
let userHasInteracted = false;

export function markUserInteraction(): void {
  if (!userHasInteracted) {
    userHasInteracted = true;
    getAudio();
  }
}

function getAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!audioInstance) {
    try {
      audioInstance = new Audio('/sounds/admin-notification.mp3');
      audioInstance.volume = 0.5;
      audioInstance.load();
    } catch {
      console.warn('[Sound] Failed to create Audio instance');
      return null;
    }
  }
  return audioInstance;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // localStorage might be full or blocked
  }
}

export function playNotificationSound(): void {
  if (!isSoundEnabled()) return;
  if (!userHasInteracted) return;

  const audio = getAudio();
  if (!audio) return;

  audio.currentTime = 0;
  audio.play().catch(() => {
    // Autoplay blocked — silently fail
  });
}
