// Navigasi di memori (PRD §12 aturan 8): URL tidak pernah memuat username, userId, atau roomId.
export type Screen =
  | 'welcome'
  | 'register'
  | 'login'
  | 'home'
  | 'chat'
  | 'verify'
  | 'settings'
  | 'expired'
  /** Hanya di build dev. */
  | 'burn-demo';

export const router = $state<{ screen: Screen }>({ screen: 'welcome' });

export function navigate(screen: Screen): void {
  router.screen = screen;
}
