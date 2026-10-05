// Argon2id di Web Worker supaya UI tidak membeku selama "Mengamankan akun..." (PRD §10.3, D-002).
import { deriveKeys, ready } from '@blackchat/crypto';

interface Request {
  password: string;
  salt: Uint8Array;
}

const scope = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<Request>) => void): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.addEventListener('message', (event) => {
  void (async () => {
    try {
      await ready();
      const { authKey, vaultKey } = deriveKeys(event.data.password, event.data.salt);
      scope.postMessage({ ok: true, authKey, vaultKey }, [authKey.buffer, vaultKey.buffer]);
    } catch {
      scope.postMessage({ ok: false });
    }
  })();
});
