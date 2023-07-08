import isNode from "detect-node";
export default async function (imports) {
  if (isNode) {
    const fs = await import("fs/promises");

    // @ts-ignore
    const wasmPath = new URL("wasm/bao.wasm", import.meta.url);
    const wasm = await fs.readFile(wasmPath);
    return (await WebAssembly.instantiate(wasm, imports)).instance;
  }

  // @ts-ignore
  let wasm = await import("./wasm/bao.wasm?init");
  wasm = wasm.default || wasm;
  return (await wasm(imports)).instance;
}
