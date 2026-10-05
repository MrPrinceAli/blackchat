// Format jam umur akun (PRD §10.3): ID `2h 14j 03m` / EN `2d 14h 03m` (hari, jam, menit);
// di bawah 1 jam ID `59m 12d` / EN `59m 12s` (menit, detik). Satuan dari bahasa aktif (D-024).
import { ACCOUNT, TIME } from '@blackchat/protocol';
import { strings } from './strings';

const DAY_MS = 24 * TIME.HOUR_MS;
const pad = (n: number): string => String(n).padStart(2, '0');

export function formatAccountClock(remainingMs: number): string {
  const u = strings.account.units;
  const ms = Math.max(0, remainingMs);
  if (ms < TIME.HOUR_MS) {
    const totalSeconds = Math.floor(ms / 1000);
    return `${pad(Math.floor(totalSeconds / 60))}${u.minute} ${pad(totalSeconds % 60)}${u.second}`;
  }
  const totalMinutes = Math.floor(ms / TIME.MINUTE_MS);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return ms >= DAY_MS
    ? `${days}${u.day} ${pad(hours)}${u.hour} ${pad(minutes)}${u.minute}`
    : `${pad(hours)}${u.hour} ${pad(minutes)}${u.minute}`;
}

/** Peringatan inline di 24 jam, 1 jam, dan 5 menit terakhir (PRD §10.3); null jika belum waktunya. */
export function accountWarning(remainingMs: number): string | null {
  const [day, hour, five] = ACCOUNT.WARNINGS_MS;
  if (remainingMs <= 0) return null;
  if (remainingMs <= five) return strings.account.warning(strings.account.spans.fiveMinutes);
  if (remainingMs <= hour) return strings.account.warning(strings.account.spans.hour);
  if (remainingMs <= day) return strings.account.warning(strings.account.spans.day);
  return null;
}
