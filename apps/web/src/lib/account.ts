// Register, login, pemulihan sesi, kunci otomatis, logout, dan hangus (PRD §4.2–§4.3, §5.2–§5.4).
// Kunci rahasia hanya ada di modul ini dan di-wipe saat sesi berakhir (PRD §12 aturan 9).
import {
  base64urlDecode,
  base64urlEncode,
  ERRORS,
  LABELS,
  SESSION,
  SIZES,
  vUsername,
} from '@blackchat/protocol';
import type { Identity } from '@blackchat/crypto';
import { app } from './app-state.svelte';
import { loadCrypto, type CryptoModule } from './crypto-loader';
import { ActivityTracker, type IdleState } from './idle';
import { deriveKeysInWorker } from './kdf';
import { RelayError, relayApi, relayWsUrl } from './relay-api';
import { navigate } from './router.svelte';
import {
  broadcastPresence,
  idbKeyStore,
  sessionTabStore,
  SessionManager,
  type SessionSecrets,
  type SessionView,
} from './session';
import { strings } from './strings';
import { RelayConnection } from './ws';
import type { EventFrame } from '@blackchat/protocol';

export type AccountErrorCode =
  | 'username_format'
  | 'too_short'
  | 'same_as_username'
  | 'common'
  | 'mismatch'
  | 'taken'
  | 'credentials'
  | 'rate_limited'
  | 'network'
  | 'generic';

export class AccountError extends Error {
  override readonly name = 'AccountError';
  constructor(
    readonly code: AccountErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

interface Active {
  crypto: CryptoModule;
  identity: Identity;
  vaultKey: Uint8Array;
  secrets: SessionSecrets;
  view: SessionView;
  connection: RelayConnection;
  tracker: ActivityTracker;
  detach: () => void;
}

let active: Active | null = null;
/** Room yang dibuka ulang setelah refresh (PRD §15.2: refresh membuka room yang benar). */
let resumeRoom: string | null = null;
let presence: ReturnType<typeof broadcastPresence> | undefined;

// ================================================================ kait untuk modul chat (W8)

/** Sesi yang sedang aktif, untuk modul room/pesan. Kunci rahasia tidak pernah keluar dari objek ini. */
export interface ActiveSession {
  crypto: CryptoModule;
  identity: Identity;
  username: string;
  userId: string;
  /** Perkiraan waktu hangus akun sendiri (jam perangkat). */
  expiresAtLocal: number;
  connection: RelayConnection;
}

type Hooks = {
  ready: Set<(resumed: { lastRoomId: string | null }) => void>;
  event: Set<(event: EventFrame) => void>;
  end: Set<() => void>;
};

const hooks: Hooks = { ready: new Set(), event: new Set(), end: new Set() };

export function onSessionReady(fn: (resumed: { lastRoomId: string | null }) => void): void {
  hooks.ready.add(fn);
}
export function onRelayEvent(fn: (event: EventFrame) => void): void {
  hooks.event.add(fn);
}
export function onSessionEnd(fn: () => void): void {
  hooks.end.add(fn);
}

export function activeSession(): ActiveSession | null {
  if (!active) return null;
  return {
    crypto: active.crypto,
    identity: active.identity,
    username: active.secrets.username,
    userId: active.secrets.userId,
    expiresAtLocal: active.secrets.expiresAtLocal,
    connection: active.connection,
  };
}

/** Simpan layar & room terakhir (terenkripsi) agar refresh membuka room yang benar (PRD §5.4 langkah 4). */
export function rememberView(screen: SessionView['screen'], lastRoomId: string | null): void {
  if (!active) return;
  active.view = { screen };
  active.secrets.lastRoomId = lastRoomId;
  void session.save(active.secrets, active.view);
}

function sessionManager(): SessionManager {
  presence ??= broadcastPresence();
  return new SessionManager({
    keys: idbKeyStore,
    tab: sessionTabStore,
    presence,
    now: () => Date.now(),
    randomTabId: () => base64urlEncode(crypto.getRandomValues(new Uint8Array(SIZES.TAB_ID))),
  });
}

const session = sessionManager();

const b64 = base64urlEncode;
const unb64 = base64urlDecode;

function fromRelayError(error: unknown): AccountError {
  if (error instanceof AccountError) return error;
  if (error instanceof RelayError) {
    if (error.code === ERRORS.RATE_LIMITED)
      return new AccountError('rate_limited', error.retryAfterSeconds);
    if (error.code === ERRORS.CONFLICT) return new AccountError('taken');
    if (error.code === 'network') return new AccountError('network');
  }
  return new AccountError('generic');
}

// ================================================================ username

/** Validasi langsung di layar Register: "Tersedia" / "Sudah dipakai" (PRD §10.3). */
export async function checkUsername(username: string): Promise<'available' | 'taken' | 'invalid'> {
  if (!vUsername(username).ok) return 'invalid';
  try {
    await relayApi.lookup(username);
    return 'taken';
  } catch (error) {
    if (error instanceof RelayError && error.status === 404) return 'available';
    throw fromRelayError(error);
  }
}

// ================================================================ register & login

export async function register(username: string, password: string, repeat: string): Promise<void> {
  if (!vUsername(username).ok) throw new AccountError('username_format');
  const c = await loadCrypto();
  const problem = c.checkPasswordPolicy(username, password);
  if (problem) throw new AccountError(problem);
  if (password !== repeat) throw new AccountError('mismatch');

  const identity = c.generateIdentity();
  const salt = c.newSalt();
  try {
    const keys = await deriveKeysInWorker(password, salt);
    const fields = {
      username,
      salt: b64(salt),
      authKey: b64(keys.authKey),
      edPk: b64(identity.edPk),
      xPk: b64(identity.xPk),
      xPkSig: b64(identity.xPkSig),
      vault: b64(c.sealVault(keys.vaultKey, identity.edSk, identity.xSk)),
    };
    c.wipe(keys.authKey);
    const sig = b64(c.signFields(identity.edSk, LABELS.REQ_REGISTER, fields));
    const response = await relayApi.register({ ...fields, sig });
    if (response.userId !== identity.userId) throw new AccountError('generic');
    await begin(c, identity, keys.vaultKey, {
      username,
      userId: identity.userId,
      seq: 0,
      contacts: null,
      remainingMs: response.remainingMs,
    });
  } catch (error) {
    c.wipeIdentity(identity);
    throw fromRelayError(error);
  }
}

export async function login(username: string, password: string): Promise<void> {
  if (!vUsername(username).ok || password.length === 0) throw new AccountError('credentials');
  const c = await loadCrypto();
  let identity: Identity | undefined;
  try {
    const { salt } = await relayApi.salt(username);
    const keys = await deriveKeysInWorker(password, unb64(salt));
    let response;
    try {
      response = await relayApi.login({ username, authKey: b64(keys.authKey) });
    } catch (error) {
      c.wipe(keys.vaultKey);
      if (error instanceof RelayError && error.status === 401)
        throw new AccountError('credentials');
      throw error;
    } finally {
      c.wipe(keys.authKey);
    }
    let opened: { edSk: Uint8Array; xSk: Uint8Array };
    try {
      opened = c.openVault(keys.vaultKey, unb64(response.vault));
    } catch {
      c.wipe(keys.vaultKey);
      throw new AccountError('credentials');
    }
    identity = c.identityFromSecretKeys(opened.edSk, opened.xSk);
    // Kunci dari vault harus cocok dengan yang terdaftar di server.
    if (
      b64(identity.edPk) !== response.edPk ||
      b64(identity.xPk) !== response.xPk ||
      identity.userId !== response.userId
    ) {
      c.wipe(keys.vaultKey);
      throw new AccountError('generic');
    }
    await begin(c, identity, keys.vaultKey, {
      username,
      userId: response.userId,
      seq: response.seq,
      contacts: response.contacts,
      remainingMs: response.remainingMs,
    });
  } catch (error) {
    if (identity) c.wipeIdentity(identity);
    throw fromRelayError(error);
  }
}

// ================================================================ pemulihan sesi (refresh)

/** Dipanggil sekali saat aplikasi dimuat. true jika sesi dipulihkan. */
export async function restore(): Promise<boolean> {
  try {
    const restored = await session.restore();
    if (!restored) return false;
    const c = await loadCrypto();
    const { secrets, view } = restored;
    const identity = c.identityFromSecretKeys(unb64(secrets.edSk), unb64(secrets.xSk));
    if (identity.userId !== secrets.userId) {
      await session.clear();
      return false;
    }
    start(
      c,
      identity,
      unb64(secrets.vaultKey),
      secrets,
      view,
      Math.max(0, secrets.expiresAtLocal - Date.now()),
    );
    return true;
  } catch {
    await session.clear().catch(() => undefined);
    return false;
  } finally {
    app.booting = false;
  }
}

// ================================================================ siklus hidup sesi

interface Fresh {
  username: string;
  userId: string;
  seq: number;
  contacts: string | null;
  remainingMs: number;
}

async function begin(
  c: CryptoModule,
  identity: Identity,
  vaultKey: Uint8Array,
  fresh: Fresh,
): Promise<void> {
  const secrets: SessionSecrets = {
    username: fresh.username,
    userId: fresh.userId,
    edPk: b64(identity.edPk),
    edSk: b64(identity.edSk),
    xPk: b64(identity.xPk),
    xSk: b64(identity.xSk),
    xPkSig: b64(identity.xPkSig),
    vaultKey: b64(vaultKey),
    seq: fresh.seq,
    contacts: fresh.contacts,
    expiresAtLocal: Date.now() + fresh.remainingMs,
    lastRoomId: null,
  };
  const view: SessionView = { screen: 'home' };
  await session.create(secrets, view);
  start(c, identity, vaultKey, secrets, view, fresh.remainingMs);
}

const ACTIVITY_EVENTS = SESSION.ACTIVITY_EVENTS;

function start(
  c: CryptoModule,
  identity: Identity,
  vaultKey: Uint8Array,
  secrets: SessionSecrets,
  view: SessionView,
  remainingMs: number,
): void {
  app.username = secrets.username;
  app.userId = secrets.userId;
  app.remainingMs = remainingMs;
  app.idleWarning = false;
  app.notice = null;

  const tracker = new ActivityTracker({
    now: () => Date.now(),
    persist: (t) => void session.touch(t),
    onState: (state: IdleState) => {
      app.idleWarning = state === 'warning';
      if (state === 'locked') void end('locked');
    },
  });

  const connection = new RelayConnection({
    url: relayWsUrl(secrets.userId),
    userId: secrets.userId,
    signChallenge: (nonce) => c.signWsChallenge(identity.edSk, secrets.userId, nonce),
    onStatus: (status) => {
      app.connection = status;
      if (status === 'expired') void end('expired');
    },
    onReady: (ms) => {
      app.remainingMs = ms;
      if (!active) return;
      active.secrets.expiresAtLocal = Date.now() + ms;
      void session.save(active.secrets, active.view);
      // Room terakhir hanya dibuka ulang sekali, saat sesi dipulihkan dari refresh.
      const lastRoomId = resumeRoom;
      resumeRoom = null;
      for (const fn of hooks.ready) fn({ lastRoomId });
    },
    onEvent: (event) => {
      for (const fn of hooks.event) fn(event);
    },
  });

  const onActivity = () => tracker.touch();
  const onCheck = () => tracker.check();
  for (const type of ACTIVITY_EVENTS)
    addEventListener(type, onActivity, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onCheck);
  addEventListener('focus', onCheck);
  const interval = setInterval(onCheck, SESSION.CHECK_INTERVAL_MS);
  const detach = () => {
    for (const type of ACTIVITY_EVENTS) removeEventListener(type, onActivity, { capture: true });
    document.removeEventListener('visibilitychange', onCheck);
    removeEventListener('focus', onCheck);
    clearInterval(interval);
  };

  active = { crypto: c, identity, vaultKey, secrets, view, connection, tracker, detach };
  resumeRoom = view.screen === 'chat' ? secrets.lastRoomId : null;
  connection.start();
  navigate('home');
}

export type EndReason = 'logout' | 'locked' | 'expired';

/** Akhiri sesi (PRD §5.4 langkah 8): hapus storage sesi, wipe kunci, tutup WebSocket. */
export async function end(reason: EndReason): Promise<void> {
  const current = active;
  active = null;
  resumeRoom = null;
  for (const fn of hooks.end) fn();
  if (current) {
    current.detach();
    current.connection.stop();
    current.crypto.wipeIdentity(current.identity);
    current.crypto.wipe(current.vaultKey);
  }
  await session.clear();
  app.username = '';
  app.userId = '';
  app.remainingMs = 0;
  app.idleWarning = false;
  app.connection = 'idle';
  if (reason === 'expired') navigate('expired');
  else if (reason === 'locked') {
    app.notice = strings.session.locked;
    navigate('login');
  } else navigate('welcome');
}

/** "Tetap masuk" pada peringatan kunci (aktivitas eksplisit). */
export function stayActive(): void {
  active?.tracker.touch();
}

/** "Gunakan di sini" setelah akun dibuka di tab lain (4409). */
export function useHere(): void {
  active?.connection.takeOver();
}
