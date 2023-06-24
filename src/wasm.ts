import isNode from "detect-node";
export default async function (imports) {
  if (isNode) {
    const fs = await import("fs/promises");

    // @ts-ignore
    const wasmPath = new URL("wasm/bao.wasm", import.meta.url);

    const wasm = await fs.readFile(wasmPath);

    return WebAssembly.instantiate(wasm, imports);
  }

  // @ts-ignore
  return await import("./wasm/bao.wasm");
}
