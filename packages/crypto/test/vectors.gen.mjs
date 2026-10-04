// Pembuat test/vectors.json. Sengaja TIDAK memakai kode src/: setiap nilai dihitung langsung
// dari libsodium mengikuti rumus di PRD §4 dan D-002/D-008, sehingga vektor ini menjadi
// pembanding independen bagi implementasi. Jalankan ulang hanya jika spesifikasi berubah
// (dan catat di docs/DECISIONS.md):  node test/vectors.gen.mjs > test/vectors.json
import sodium from 'libsodium-wrappers-sumo';

await sodium.ready;
const s = sodium;
const enc = new TextEncoder();
const b64u = (b) => Buffer.from(b).toString('base64url');
const hex = (b) => Buffer.from(b).toString('hex');
const cat = (...parts) => Uint8Array.from(Buffer.concat(parts.map((p) => Buffer.from(p))));
const seq = (n, start) => Uint8Array.from({ length: n }, (_, i) => (start + i) & 0xff);

// base32 Crockford, ditulis ulang di sini (bukan diimpor) supaya independen.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function base32(bytes) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5)
    out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}

// ---------------------------------------------------------------- password → kunci (PRD §4.3, D-002)
const password = 'Kuda lumping 2026 ✓';
const salt = seq(16, 0);
const master = s.crypto_pwhash(
  64,
  enc.encode(password.normalize('NFC')),
  salt,
  3,
  64 * 1024 * 1024,
  s.crypto_pwhash_ALG_ARGON2ID13,
);
const authKey = s.crypto_generichash(32, enc.encode('bc-auth-v1'), master);
const vaultKey = s.crypto_generichash(32, enc.encode('bc-vault-v1'), master);

// ---------------------------------------------------------------- identitas (PRD §4.2)
function identity(edSeed, xSeed) {
  const ed = s.crypto_sign_seed_keypair(edSeed);
  const x = s.crypto_box_seed_keypair(xSeed);
  return {
    edSeed: hex(edSeed),
    xSeed: hex(xSeed),
    edPk: b64u(ed.publicKey),
    edSk: b64u(ed.privateKey),
    xPk: b64u(x.publicKey),
    xSk: b64u(x.privateKey),
    xPkSig: b64u(s.crypto_sign_detached(cat(enc.encode('bc-xpk-v1'), x.publicKey), ed.privateKey)),
    userId: base32(s.crypto_generichash(20, ed.publicKey, null)),
    _ed: ed,
    _x: x,
  };
}
const alice = identity(seq(32, 1), seq(32, 101));
const bob = identity(seq(32, 51), seq(32, 151));

// ---------------------------------------------------------------- vault (PRD §4.3) dengan nonce tetap
const vaultNonce = seq(24, 200);
const vault = cat(
  vaultNonce,
  s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    cat(alice._ed.privateKey, alice._x.privateKey),
    enc.encode('bc-vault-blob-v1'),
    null,
    vaultNonce,
    vaultKey,
  ),
);

// ---------------------------------------------------------------- kontak (PRD §4.8)
const contacts = [
  { userId: bob.userId, edPk: bob.edPk, username: 'rara', verified: true, blocked: false },
];
const contactsNonce = seq(24, 7);
const contactsBlob = cat(
  contactsNonce,
  s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    s.pad(enc.encode(JSON.stringify(contacts)), 4096),
    enc.encode('bc-contacts-v1'),
    null,
    contactsNonce,
    vaultKey,
  ),
);

// ---------------------------------------------------------------- tanda tangan request & challenge
const deleteFields = { seq: 7, userId: alice.userId }; // sudah urut kunci = canonical
const deleteSig = s.crypto_sign_detached(
  enc.encode(`bc-req-delete-v1${JSON.stringify(deleteFields)}`),
  alice._ed.privateKey,
);
const wsNonce = seq(32, 9);
const wsSig = s.crypto_sign_detached(
  cat(enc.encode('bc-ws-auth-v1'), enc.encode(alice.userId), wsNonce),
  alice._ed.privateKey,
);

// ---------------------------------------------------------------- safety number (PRD §4.4)
const [p1, p2] =
  s.compare(alice._ed.publicKey, bob._ed.publicKey) <= 0
    ? [alice._ed.publicKey, bob._ed.publicKey]
    : [bob._ed.publicKey, alice._ed.publicKey];
const safetyHash = s.crypto_generichash(32, cat(p1, p2), null);
const safety = (BigInt(`0x${hex(safetyHash)}`) % 10n ** 60n).toString().padStart(60, '0');

const strip = ({ _ed, _x, ...rest }) => rest;
process.stdout.write(
  `${JSON.stringify(
    {
      password: { password, salt: hex(salt), authKey: hex(authKey), vaultKey: hex(vaultKey) },
      alice: strip(alice),
      bob: strip(bob),
      vault: b64u(vault),
      contacts: { list: contacts, blob: b64u(contactsBlob) },
      deleteRequest: { fields: deleteFields, sig: b64u(deleteSig) },
      wsChallenge: { nonce: hex(wsNonce), sig: b64u(wsSig) },
      safetyNumber: safety.match(/.{5}/g),
    },
    null,
    2,
  )}\n`,
);
