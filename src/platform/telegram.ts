/**
 * Обёртка над Telegram Mini App SDK.
 * Игра обязана работать и вне Telegram - в браузере на десктопе для отладки,
 * поэтому всё здесь опционально и молча деградирует.
 */

type HapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type NotificationType = "error" | "success" | "warning";

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string } };
  version: string;
  platform: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  HapticFeedback?: {
    impactOccurred(style: HapticStyle): void;
    notificationOccurred(type: NotificationType): void;
  };
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const webApp = (): TelegramWebApp | undefined => window.Telegram?.WebApp;

export const isTelegram = (): boolean => Boolean(webApp()?.initData);

export interface TelegramUser {
  id: number;
  name: string;
  username?: string;
}

export function currentUser(): TelegramUser | null {
  const u = webApp()?.initDataUnsafe?.user;
  if (!u) return null;
  return { id: u.id, name: u.first_name ?? "Игрок", username: u.username };
}

/**
 * Сырая строка initData. На сервер уходит как есть - там она проверяется
 * через HMAC-SHA-256 токеном бота. Доверять содержимому до проверки нельзя.
 */
export function rawInitData(): string {
  return webApp()?.initData ?? "";
}

export function setupViewport(background: string): void {
  const app = webApp();
  if (!app) return;
  app.ready();
  app.expand();
  app.disableVerticalSwipes?.();
  app.setHeaderColor?.(background);
  app.setBackgroundColor?.(background);
}

export function haptic(style: HapticStyle): void {
  webApp()?.HapticFeedback?.impactOccurred(style);
}

export function notify(type: NotificationType): void {
  webApp()?.HapticFeedback?.notificationOccurred(type);
}
