import { describe, expect, it } from 'vitest';
import { CryptoError, ready, sodium } from '../src/index.js';

// File terpisah: modul dimuat ulang (isolasi per file), jadi libsodium belum diinisialisasi.
describe('ready()', () => {
  it('sodium() melempar sebelum ready() selesai, lalu bekerja setelahnya', async () => {
    expect(() => sodium()).toThrow(CryptoError);
    await ready();
    await ready(); // idempoten
    expect(sodium().crypto_aead_xchacha20poly1305_ietf_KEYBYTES).toBe(32);
  });
});
