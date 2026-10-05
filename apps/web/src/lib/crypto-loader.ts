// libsodium dimuat malas: layar awal tidak menunggu WASM kripto (PRD §10.7 menghitung bundle tanpa libsodium).
export type CryptoModule = typeof import('@blackchat/crypto');

let loading: Promise<CryptoModule> | undefined;

export function loadCrypto(): Promise<CryptoModule> {
  loading ??= import('@blackchat/crypto').then(async (module) => {
    await module.ready();
    return module;
  });
  return loading;
}
