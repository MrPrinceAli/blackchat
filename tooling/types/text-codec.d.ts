// TextEncoder/TextDecoder tersedia di browser, Workers, dan Node, tetapi tidak ada di lib ES2022.
// Deklarasi minimal untuk paket yang dipakai di ketiganya (protocol, crypto) tanpa menarik lib DOM.
declare class TextEncoder {
  encode(input?: string): Uint8Array<ArrayBuffer>;
}
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
  decode(input?: Uint8Array): string;
}
