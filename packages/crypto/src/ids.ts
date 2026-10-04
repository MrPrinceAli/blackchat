import { base64urlEncode, SIZES } from '@blackchat/protocol';
import { randomBytes } from './bytes.js';

/** msgId acak 16 byte, base64url (PRD §4.7). */
export function newMsgId(): string {
  return base64urlEncode(randomBytes(SIZES.MSG_ID));
}

/** opNonce acak 16 byte untuk bukti member (PRD §4.6). */
export function newOpNonce(): Uint8Array {
  return randomBytes(SIZES.OP_NONCE);
}

/** tabId acak 16 byte, base64url (PRD §5.4). */
export function newTabId(): string {
  return base64urlEncode(randomBytes(SIZES.TAB_ID));
}
