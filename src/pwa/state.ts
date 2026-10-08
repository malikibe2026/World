// App-install and update state shared by the banners and the sidebar.
import { create } from 'zustand';
import { applyUpdate, registerServiceWorker } from './register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'wsa.installDismissedAt';
const DISMISS_DAYS = 30;

export const isStandalone = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

/** iPhone / iPad (iPadOS reports itself as a Mac with touch). No install prompt there: show steps. */
export const isIOS = (): boolean =>
  typeof navigator !== 'undefined' && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

function dismissedRecently(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - t < DISMISS_DAYS * 86400 * 1000;
  } catch {
    return false;
  }
}

interface PwaState {
  installEvent: BeforeInstallPromptEvent | null;
  installed: boolean;
  bannerDismissed: boolean;
  updateReady: boolean;
  offline: boolean;
  install: () => Promise<void>;
  dismissBanner: () => void;
  update: () => void;
}

export const usePwa = create<PwaState>((set, get) => ({
  installEvent: null,
  installed: isStandalone(),
  bannerDismissed: dismissedRecently(),
  updateReady: false,
  offline: typeof navigator !== 'undefined' && navigator.onLine === false,
  install: async () => {
    const e = get().installEvent;
    if (!e) return;
    await e.prompt();
    const { outcome } = await e.userChoice;
    set({ installEvent: null, installed: outcome === 'accepted' || get().installed });
  },
  dismissBanner: () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
    set({ bannerDismissed: true });
  },
  update: () => applyUpdate(),
}));

/** Call once at start-up. */
export function initPwa() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // shown by our own banner instead of the browser mini-bar
    usePwa.setState({ installEvent: e as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => usePwa.setState({ installed: true, installEvent: null }));
  window.addEventListener('online', () => usePwa.setState({ offline: false }));
  window.addEventListener('offline', () => usePwa.setState({ offline: true }));
  registerServiceWorker(() => usePwa.setState({ updateReady: true }));
}
