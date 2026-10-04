// Pembuat test/vectors-room.json. Seperti vectors.gen.mjs, TIDAK memakai kode src/: semua nilai
// dihitung langsung dari libsodium mengikuti PRD §4.5–§4.7, D-001, D-008, D-009. File ini juga
// menjadi acuan relay (W5) untuk memverifikasi member proof dengan @noble/hashes (D-007).
//   node test/vectors-room.gen.mjs > test/vectors-room.json
import { readFileSync } from 'node:fs';
import sodium from 'libsodium-wrappers-sumo';

await sodium.ready;
const s = sodium;
const base = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));
const enc = new TextEncoder();
const b64u = (b) => Buffer.from(b).toString('base64url');
const unb64u = (t) => Uint8Array.from(Buffer.from(t, 'base64url'));
const hex = (b) => Buffer.from(b).toString('hex');
const cat = (...parts) => Uint8Array.from(Buffer.concat(parts.map((p) => Buffer.from(p))));
const seq = (n, start) => Uint8Array.from({ length: n }, (_, i) => (start + i) & 0xff);
const H = (len, msg, key = null) => s.crypto_generichash(len, msg, key);

/** JSON kanonik: kunci diurutkan rekursif, tanpa spasi (cukup untuk data vektor ini). */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

const A = {
  edPk: unb64u(base.alice.edPk),
  edSk: unb64u(base.alice.edSk),
  xPk: unb64u(base.alice.xPk),
  xSk: unb64u(base.alice.xSk),
};
const B = {
  edPk: unb64u(base.bob.edPk),
  edSk: unb64u(base.bob.edSk),
  xPk: unb64u(base.bob.xPk),
  xSk: unb64u(base.bob.xSk),
};

// ---------------------------------------------------------------- room (PRD §4.6, D-001)
const shared = s.crypto_scalarmult(A.xSk, B.xPk);
if (hex(shared) !== hex(s.crypto_scalarmult(B.xSk, A.xPk))) throw new Error('DH tidak simetris');
const roomIdRaw = H(32, enc.encode('bc-room-id-v1'), shared);
const member = (edPk) => {
  const memberKey = H(32, cat(enc.encode('bc-member-v1'), edPk), shared);
  return {
    inboxRoomId: hex(H(32, cat(enc.encode('bc-inbox-room-v1'), edPk), shared)),
    memberKey: b64u(memberKey),
    memberTag: hex(H(16, enc.encode('bc-tag-v1'), memberKey)),
  };
};
const room = {
  shared: hex(shared),
  roomId: hex(roomIdRaw),
  alice: member(A.edPk),
  bob: member(B.edPk),
};

// ---------------------------------------------------------------- bukti member (PRD §4.6, D-009)
const msgId = seq(16, 90);
const op = {
  kind: 'send',
  roomId: room.roomId,
  msgId: b64u(msgId),
  ttl: 5,
  body: b64u(seq(40 + 256, 0)),
  keyForPeer: b64u(seq(80, 1)),
  keyForSelf: b64u(seq(80, 2)),
  chunks: 0,
};
const opCanonical = canonical(op);
const opHash = H(32, enc.encode(`bc-op-v1${opCanonical}`));
const opNonce = seq(16, 33);
const proof = H(32, cat(enc.encode('bc-proof-v1'), opNonce, opHash), unb64u(room.alice.memberKey));

// ---------------------------------------------------------------- pesan teks A → B (PRD §4.5, §4.7)
const unsigned = {
  v: 1,
  kind: 'text',
  msgId: b64u(msgId),
  roomId: room.roomId,
  fromEdPk: base.alice.edPk,
  ttl: 5,
  ts: 1_800_000_000_000,
  text: 'jam 8 di tempat biasa <img src=x onerror=alert(1)>',
};
const sig = s.crypto_sign_detached(enc.encode(`bc-inner-v1${canonical(unsigned)}`), A.edSk);
const inner = { ...unsigned, sig: b64u(sig) };
const contentKey = seq(32, 160);
const bodyNonce = seq(24, 120);
const body = cat(
  bodyNonce,
  s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    s.pad(enc.encode(canonical(inner)), 256),
    cat(enc.encode('bc-msg-v1'), roomIdRaw, msgId),
    null,
    bodyNonce,
    contentKey,
  ),
);

// ---------------------------------------------------------------- header tersegel untuk A tentang B (D-009)
const header = {
  v: 1,
  peerUserId: base.bob.userId,
  peerUsername: 'rara',
  peerEdPk: base.bob.edPk,
  peerXPk: base.bob.xPk,
  peerXPkSig: base.bob.xPkSig,
  peerExpiresAt: 500_000 * 3_600_000,
};
const sealedHeader = s.crypto_box_seal(s.pad(enc.encode(JSON.stringify(header)), 512), A.xPk);

process.stdout.write(
  `${JSON.stringify(
    {
      room,
      proof: { op, opCanonical, opHash: hex(opHash), opNonce: b64u(opNonce), proof: b64u(proof) },
      message: {
        inner,
        contentKey: hex(contentKey),
        body: b64u(body),
        keyForPeer: b64u(s.crypto_box_seal(contentKey, B.xPk)),
        keyForSelf: b64u(s.crypto_box_seal(contentKey, A.xPk)),
      },
      header: { plain: header, sealedForAlice: b64u(sealedHeader) },
    },
    null,
    2,
  )}\n`,
);
