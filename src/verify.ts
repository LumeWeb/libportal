// @ts-ignore
import baoWasm from "./wasm/bao.wasm";
import Go from "./go_wasm.js";

export async function getVerifiableStream(
  root: Uint8Array,
  proof: Uint8Array,
  data: ReadableStream,
) {
  const wasm = await getWasmInstance();
  // @ts-ignore
  const reader = new VariableChunkStream(data);
  let bytesToRead;

  const getNextBytes = async () => {
    bytesToRead = getWasmProperty(wasmId, "write_promise");
    bytesToRead = await bytesToRead;
  };

  const callExports = (name: string) => {
    // @ts-ignore
    return wasm.exports[name]();
  };

  // @ts-ignore
  const exit = () => {
    callExports("exit");
    cleanup();
  };

  const done = (controller: ReadableStreamDefaultController) => {
    controller.close();
    exit();
  };

  const cleanup = () => {
    const win = getWin();
    const props = Object.getOwnPropertyNames(win);

    props
      .filter((item) => item.startsWith(`bao_${wasmId}`))
      .forEach((item) => {
        delete win[item];
      });
  };

  await getNextBytes();
  // @ts-ignore
  const wasmId = callExports("start");
  getWasmProperty(wasmId, "set_root")(root);
  getWasmProperty(wasmId, "set_proof")(proof);

  return new ReadableStream({
    async pull(controller) {
      let chunk;

      try {
        chunk = await reader.read(bytesToRead);
        if (chunk.value) {
          getWasmProperty(wasmId, "write")(chunk.value);
        }
      } catch (e) {
        // @ts-ignore
        exit();
        controller.error(e);
      }

      const result = getWasmProperty(wasmId, "result");

      const wasmDone = result === undefined;

      if (result === undefined) {
        await getNextBytes();
      }

      if (chunk.done || wasmDone) {
        if (wasmDone) {
          if (result) {
            done(controller);
          } else {
            controller.error(getWasmProperty(wasmId, "error"));
          }
        } else {
          done(controller);
        }
      }
    },
    async cancel(reason: any) {
      await reader.cancel(reason);
      exit();
    },
  });
}

function getWin() {
  return globalThis || self || window;
}

function getWasmProperty(id: number, prop: string) {
  return getWin()[`bao_${id}_${prop}`];
}

async function getWasmInstance() {
  const go = new Go();
  let wasm = (await baoWasm(
    go.importObject,
  )) as WebAssembly.WebAssemblyInstantiatedSource;
  go.run(wasm);

  return wasm;
}

class VariableChunkStream {
  private reader: ReadableStreamDefaultReader;
  private currentChunk: Uint8Array = new Uint8Array();
  private currentChunkSize = 0;
  private readerDone = false;

  constructor(stream: ReadableStream) {
    this.reader = stream.getReader();
  }

  async read(bytes: number) {
    if (this.currentChunk.length === 0 && !this.readerDone) {
      const { done, value } = await this.reader.read();
      if (done) {
        return { done: true };
      }
      this.currentChunk = value;
      this.currentChunkSize = this.currentChunk.length;
    }

    if (this.currentChunkSize > bytes) {
      const chunk = this.currentChunk.slice(0, bytes);
      this.currentChunk = this.currentChunk.slice(bytes);
      this.currentChunkSize -= bytes;
      return { value: chunk, done: false };
    }
    if (this.currentChunkSize < bytes && !this.readerDone) {
      const { done, value } = await this.reader.read();
      if (done) {
        this.readerDone = true;
      }
      this.currentChunk = new Uint8Array([...this.currentChunk, ...value]);
      this.currentChunkSize += value.length;
      return this.read(bytes);
    }

    const chunk = this.currentChunk;
    this.currentChunk = new Uint8Array();
    this.currentChunkSize = 0;
    return { value: chunk, done: this.readerDone };
  }

  async cancel(reason: any) {
    await this.reader.cancel(reason);
    this.currentChunk = new Uint8Array();
    this.currentChunkSize = 0;
  }
}
