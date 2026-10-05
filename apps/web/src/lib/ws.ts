// Satu koneksi WebSocket ke InboxDO milik akun (PRD §6.1, §13.1): challenge-response Ed25519, reqId → Promise,
// heartbeat 25 dtk, reconnect backoff 0,5 → 1 → 2 → 4 → maks 10 dtk dengan jitter.
import {
  base64urlDecode,
  base64urlEncode,
  ERRORS,
  parseServerFrame,
  RESULT_DATA,
  WS,
  type ErrorCode,
  type EventFrame,
  type RequestFrame,
  type ResultDataMap,
} from '@blackchat/protocol';

export type ConnectionStatus =
  'idle' | 'connecting' | 'ready' | 'reconnecting' | 'replaced' | 'expired' | 'closed';

export class RequestError extends Error {
  override readonly name = 'RequestError';
  constructor(readonly code: ErrorCode | 'offline' | 'timeout') {
    super(code);
  }
}

/** Jeda reconnect ke-n (0-based): 500 × 2^n ms, maks 10 dtk, jitter ±20 %. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(WS.RECONNECT_BASE_MS * 2 ** attempt, WS.RECONNECT_MAX_MS);
  const jittered = base * (0.8 + random() * 0.4);
  return Math.round(Math.min(jittered, WS.RECONNECT_MAX_MS));
}

export interface ConnectionOptions {
  url: string;
  userId: string;
  /** Tanda tangan Ed25519 atas pesan challenge (dibuat oleh @blackchat/crypto). */
  signChallenge: (nonce: Uint8Array) => Uint8Array;
  onStatus: (status: ConnectionStatus) => void;
  onReady: (remainingMs: number) => void;
  onEvent: (event: EventFrame) => void;
  /** Untuk test. */
  createSocket?: (url: string) => WebSocket;
  requestTimeoutMs?: number;
}

type RequestType = RequestFrame['t'];
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** Frame request tanpa reqId (diisi otomatis). */
export type RequestInput = DistributiveOmit<RequestFrame, 'reqId'>;
type DataOf<T extends RequestType> = T extends keyof ResultDataMap ? ResultDataMap[T] : never;

interface Pending {
  t: RequestType;
  resolve: (data: unknown) => void;
  reject: (error: RequestError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class RelayConnection {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'idle';
  private attempt = 0;
  private reqId = 0;
  private readonly pending = new Map<number, Pending>();
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(private readonly options: ConnectionOptions) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  /** Tutup koneksi untuk selamanya (logout, kunci, hangus). */
  stop(): void {
    this.stopped = true;
    clearTimeout(this.retry);
    this.teardown(1000, 'selesai');
    this.setStatus('closed');
  }

  /** Setelah 4409: ambil alih lagi dari tab lain ("Gunakan di sini"). */
  takeOver(): void {
    if (this.status === 'replaced') {
      this.attempt = 0;
      this.start();
    }
  }

  get current(): ConnectionStatus {
    return this.status;
  }

  /** Jenis frame (`t`) menentukan tipe data result-nya. */
  request<F extends RequestInput>(frame: F): Promise<DataOf<F['t']>> {
    const t = frame.t;
    if (this.status !== 'ready' || !this.socket) return Promise.reject(new RequestError('offline'));
    const reqId = (this.reqId = (this.reqId % 2_000_000_000) + 1);
    const socket = this.socket;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new RequestError('timeout'));
      }, this.options.requestTimeoutMs ?? 15_000);
      this.pending.set(reqId, { t, resolve: resolve as (data: unknown) => void, reject, timer });
      socket.send(JSON.stringify({ ...frame, reqId }));
    });
  }

  // ---------------------------------------------------------------- internal

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus(status);
  }

  private open(): void {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = (this.options.createSocket ?? ((url) => new WebSocket(url)))(this.options.url);
    this.socket = socket;
    socket.addEventListener('message', (event) => this.onMessage(socket, event));
    socket.addEventListener('close', (event) => this.onClose(socket, event.code));
  }

  private onMessage(socket: WebSocket, event: MessageEvent): void {
    if (socket !== this.socket || typeof event.data !== 'string') return;
    const parsed = parseServerFrame(event.data);
    if (!parsed.ok) return;
    const frame = parsed.value;
    switch (frame.t) {
      case 'challenge': {
        const nonce = base64urlDecode(frame.nonce);
        socket.send(
          JSON.stringify({ t: 'auth', sig: base64urlEncode(this.options.signChallenge(nonce)) }),
        );
        return;
      }
      case 'ready':
        this.attempt = 0;
        this.setStatus('ready');
        this.startHeartbeat(socket);
        this.options.onReady(frame.remainingMs);
        return;
      case 'result': {
        const pending = this.pending.get(frame.reqId);
        if (!pending) return;
        this.pending.delete(frame.reqId);
        clearTimeout(pending.timer);
        if (!frame.ok) return pending.reject(new RequestError(frame.error));
        const validate = RESULT_DATA[pending.t as keyof ResultDataMap];
        const data = validate(frame.data);
        if (data.ok) pending.resolve(data.value);
        else pending.reject(new RequestError(ERRORS.INVALID));
        return;
      }
      case 'event':
        this.options.onEvent(frame);
        return;
      case 'pong':
      case 'expiring':
        return;
    }
  }

  private onClose(socket: WebSocket, code: number): void {
    if (socket !== this.socket) return;
    this.teardown();
    if (this.stopped) return;
    if (code === WS.CLOSE.REPLACED) return this.setStatus('replaced');
    if (code === WS.CLOSE.EXPIRED) return this.setStatus('expired');
    // 4401 (autentikasi gagal) dan putus jaringan sama-sama dicoba ulang dengan backoff.
    this.setStatus('reconnecting');
    this.retry = setTimeout(() => this.open(), backoffDelay(this.attempt++));
  }

  private startHeartbeat(socket: WebSocket): void {
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(WS.PING);
    }, WS.HEARTBEAT_MS);
  }

  private teardown(code?: number, reason?: string): void {
    clearInterval(this.heartbeat);
    const socket = this.socket;
    this.socket = null;
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      socket.close(code, reason);
    }
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new RequestError('offline'));
    }
    this.pending.clear();
  }
}
