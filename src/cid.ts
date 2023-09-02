import { base58btc } from "multiformats/bases/base58";
import * as edUtils from "@noble/curves/abstract/utils";
import { CID_HASH_TYPES, CID_TYPES } from "@lumeweb/libs5";

export interface CID {
  hash: Uint8Array;
  size: bigint;
  type: number;
  hashType: number;
}

export function encodeCid(
  hash: Uint8Array,
  size: bigint,
  type?: number,
  hashType?: number,
);
export function encodeCid(
  hash: string,
  size: bigint,
  type?: number,
  hashType?: number,
);
export function encodeCid(
  hash: any,
  size: bigint,
  type = CID_TYPES.RAW,
  hashType = CID_HASH_TYPES.BLAKE3,
) {
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

  const prefixedHash = Uint8Array.from([type, hashType, ...hash, ...sizeBytes]);
  return base58btc.encode(prefixedHash).toString();
}

export function decodeCid(cid: string): CID {
  let bytes = base58btc.decode(cid);

  if (!Object.values(CID_TYPES).includes(bytes[0])) {
    throw new Error("Invalid cid type");
  }

  if (!Object.values(CID_HASH_TYPES).includes(bytes[1])) {
    throw new Error("Invalid cid hash type");
  }

  const type = bytes[0];
  const hashType = bytes[1];

  bytes = bytes.slice(2);
  let cidHash = bytes.slice(0, 32);
  let size = bytes.slice(32);
  const sizeView = new DataView(size.buffer);

  return {
    hash: cidHash,
    size: sizeView.getBigInt64(0, true),
    type,
    hashType,
  };
}
