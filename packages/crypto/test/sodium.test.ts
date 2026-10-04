import { describe, expect, it } from 'vitest';
import { getSodium } from '../src/index.js';

describe('libsodium', () => {
  it('siap dan mendukung Argon2id serta XChaCha20-Poly1305', async () => {
    const sodium = await getSodium();
    expect(sodium.crypto_pwhash_ALG_ARGON2ID13).toBeTypeOf('number');
    expect(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES).toBe(32);
  });
});
