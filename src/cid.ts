import { base58btc } from "multiformats/bases/base58";
import * as edUtils from "@noble/curves/abstract/utils";

export const MAGIC_BYTES = new Uint8Array([0x26, 0x1f]);

export interface CID {
  hash: Uint8Array;
  size: bigint;
}

export function encodeCid(hash: Uint8Array, size: bigint);
export function encodeCid(hash: string, size: bigint);
export function encodeCid(hash: any, size: bigint) {
  if (typeof hash === "string") {
    hash = edUtils.hexToBytes(hash);
  }

  if (!(hash instanceof Uint8Array)) {
    throw new Error();
  }

  if (!size) {
    throw new Error("size required");
  }

  size = BigInt(size);

  const sizeBytes = new Uint8Array(8);
  const sizeView = new DataView(sizeBytes.buffer);
  sizeView.setBigInt64(0, size, true);

  const prefixedHash = Uint8Array.from([...MAGIC_BYTES, ...hash, ...sizeBytes]);
  return base58btc.encode(prefixedHash).toString();
}

export function decodeCid(cid: string): CID {
  let bytes = base58btc.decode(cid);

  if (!arrayBufferEqual(bytes.slice(0, 2).buffer, MAGIC_BYTES.buffer)) {
    throw new Error("Invalid cid");
  }

  bytes = bytes.slice(2);
  let cidHash = bytes.slice(0, 32);
  let size = bytes.slice(32);
  const sizeView = new DataView(size.buffer);

  return {
    hash: cidHash,
    size: sizeView.getBigInt64(0, true),
  };
}

function arrayBufferEqual(buf1, buf2) {
  if (buf1 === buf2) {
    return true;
  }

  if (buf1.byteLength !== buf2.byteLength) {
    return false;
  }

  var view1 = new DataView(buf1);
  var view2 = new DataView(buf2);

  var i = buf1.byteLength;
  while (i--) {
    if (view1.getUint8(i) !== view2.getUint8(i)) {
      return false;
    }
  }

  return true;
}
