const encoder = new TextEncoder();
const decoder = new TextDecoder();

type ImportObject = {
  wasi_snapshot_preview1: {
    proc_exit: (code) => void;
    random_get: (bufPtr, bufLen) => number;
    fd_seek: () => number;
    fd_write: (fd, iovs_ptr, iovs_len, nwritten_ptr) => number;
    fd_close: () => number;
    fd_fdstat_get: () => number;
  };
  env: {
    "syscall/js.valueInvoke": (
      ret_addr,
      v_addr,
      args_ptr,
      args_len,
      args_cap,
    ) => void;
    "syscall/js.valueDelete": (v_addr, p_ptr, p_len) => void;
    "syscall/js.copyBytesToGo": (
      ret_addr,
      dest_addr,
      dest_len,
      dest_cap,
      source_addr,
    ) => void;
    "syscall/js.valueSet": (v_addr, p_ptr, p_len, x_addr) => void;
    "syscall/js.copyBytesToJS": (
      ret_addr,
      dest_addr,
      source_addr,
      source_len,
      source_cap,
    ) => void;
    "syscall/js.valueNew": (
      ret_addr,
      v_addr,
      args_ptr,
      args_len,
      args_cap,
    ) => void;
    "syscall/js.valueInstanceOf": (v_addr, t_addr) => boolean;
    "runtime.ticks": () => number;
    "runtime.sleepTicks": (timeout) => void;
    "syscall/js.valueLoadString": (
      v_addr,
      slice_ptr,
      slice_len,
      slice_cap,
    ) => void;
    "syscall/js.stringVal": (ret_ptr, value_ptr, value_len) => void;
    "syscall/js.valueIndex": (ret_addr, v_addr, i) => void;
    "syscall/js.valueLength": (v_addr) => any;
    "syscall/js.valueCall": (
      ret_addr,
      v_addr,
      m_ptr,
      m_len,
      args_ptr,
      args_len,
      args_cap,
    ) => void;
    "syscall/js.finalizeRef": (sp) => void;
    "syscall/js.valueGet": (retval, v_addr, p_ptr, p_len) => void;
    "syscall/js.valuePrepareString": (ret_addr, v_addr) => void;
    "syscall/js.valueSetIndex": (v_addr, i, x_addr) => void;
  };
};

let logLine: any = [];

export default class Go {
  private _callbackTimeouts: Map<any, any>;
  private _nextCallbackTimeoutID: number;
  private _inst?: any;
  private _values: any[] = [NaN, 0, null, true, false, global, this];
  private _ids: Map<any, any> = new Map<any, any>();
  private _idPool: any[] = [];
  private _goRefCounts: any[] = [];
  private exited = false;
  private _resolveCallbackPromise?: () => void;
  importObject: ImportObject;

  constructor() {
    this._callbackTimeouts = new Map();
    this._nextCallbackTimeoutID = 1;

    const mem = () => {
      // The buffer may change when requesting more memory.
      return new DataView(this._inst.exports.memory.buffer);
    };

    const setInt64 = (addr, v) => {
      mem().setUint32(addr + 0, v, true);
      mem().setUint32(addr + 4, Math.floor(v / 4294967296), true);
    };

    const getInt64 = (addr) => {
      const low = mem().getUint32(addr + 0, true);
      const high = mem().getInt32(addr + 4, true);
      return low + high * 4294967296;
    };

    const loadValue = (addr) => {
      const f = mem().getFloat64(addr, true);
      if (f === 0) {
        return undefined;
      }
      if (!isNaN(f)) {
        return f;
      }

      const id = mem().getUint32(addr, true);
      return this._values[id];
    };

    const storeValue = (addr, v) => {
      const nanHead = 0x7ff80000;

      if (typeof v === "number") {
        if (isNaN(v)) {
          mem().setUint32(addr + 4, nanHead, true);
          mem().setUint32(addr, 0, true);
          return;
        }
        if (v === 0) {
          mem().setUint32(addr + 4, nanHead, true);
          mem().setUint32(addr, 1, true);
          return;
        }
        mem().setFloat64(addr, v, true);
        return;
      }

      switch (v) {
        case undefined:
          mem().setFloat64(addr, 0, true);
          return;
        case null:
          mem().setUint32(addr + 4, nanHead, true);
          mem().setUint32(addr, 2, true);
          return;
        case true:
          mem().setUint32(addr + 4, nanHead, true);
          mem().setUint32(addr, 3, true);
          return;
        case false:
          mem().setUint32(addr + 4, nanHead, true);
          mem().setUint32(addr, 4, true);
          return;
      }

      let id = this._ids.get(v);
      if (id === undefined) {
        id = this._idPool.pop();
        if (id === undefined) {
          id = this._values.length;
        }
        this._values[id] = v;
        this._goRefCounts[id] = 0;
        this._ids.set(v, id);
      }
      this._goRefCounts[id]++;
      let typeFlag = 1;
      switch (typeof v) {
        case "string":
          typeFlag = 2;
          break;
        case "symbol":
          typeFlag = 3;
          break;
        case "function":
          typeFlag = 4;
          break;
      }
      mem().setUint32(addr + 4, nanHead | typeFlag, true);
      mem().setUint32(addr, id, true);
    };

    const loadSlice = (array, len, cap?) => {
      return new Uint8Array(this._inst.exports.memory.buffer, array, len);
    };

    const loadSliceOfValues = (array, len, cap) => {
      const a = new Array(len);
      for (let i = 0; i < len; i++) {
        a[i] = loadValue(array + i * 8);
      }
      return a;
    };

    const loadString = (ptr, len) => {
      return decoder.decode(
        new DataView(this._inst.exports.memory.buffer, ptr, len),
      );
    };

    const timeOrigin = Date.now() - performance.now();
    this.importObject = {
      wasi_snapshot_preview1: {
        fd_write: (fd, iovs_ptr, iovs_len, nwritten_ptr) => {
          let nwritten = 0;
          if (fd == 1) {
            for (let iovs_i = 0; iovs_i < iovs_len; iovs_i++) {
              let iov_ptr = iovs_ptr + iovs_i * 8;
              let ptr = mem().getUint32(iov_ptr + 0, true);
              let len = mem().getUint32(iov_ptr + 4, true);
              nwritten += len;
              for (let i = 0; i < len; i++) {
                let c = mem().getUint8(ptr + i);
                if (c == 13) {
                  // CR
                  // ignore
                } else if (c == 10) {
                  // LF
                  // write line
                  let line = decoder.decode(new Uint8Array(logLine));
                  logLine = [];
                  console.log(line);
                } else {
                  logLine.push(c);
                }
              }
            }
          } else {
            console.error("Invalid file descriptor:", fd);
          }
          mem().setUint32(nwritten_ptr, nwritten, true);
          return 0;
        },
        fd_close: () => 0, // dummy
        fd_fdstat_get: () => 0, // dummy
        fd_seek: () => 0, // dummy
        proc_exit: (code) => {
          if (global.process) {
            // Node.js
            process.exit(code);
          } else {
            // Can't exit in a browser.
            throw "Trying to exit with code " + code;
          }
        },
        random_get: (bufPtr, bufLen) => {
          crypto.getRandomValues(loadSlice(bufPtr, bufLen));
          return 0;
        },
      },
      env: {
        "runtime.ticks": () => {
          return timeOrigin + performance.now();
        },
        "runtime.sleepTicks": (timeout) => {
          setTimeout(this._inst.exports.go_scheduler, timeout);
        },
        "syscall/js.finalizeRef": (sp) => {
          console.error("syscall/js.finalizeRef not implemented");
        },
        "syscall/js.stringVal": (ret_ptr, value_ptr, value_len) => {
          const s = loadString(value_ptr, value_len);
          storeValue(ret_ptr, s);
        },
        "syscall/js.valueGet": (retval, v_addr, p_ptr, p_len) => {
          let prop = loadString(p_ptr, p_len);
          let value = loadValue(v_addr);
          let result = Reflect.get(value, prop);
          storeValue(retval, result);
        },
        "syscall/js.valueSet": (v_addr, p_ptr, p_len, x_addr) => {
          const v = loadValue(v_addr);
          const p = loadString(p_ptr, p_len);
          const x = loadValue(x_addr);
          Reflect.set(v, p, x);
        },
        "syscall/js.valueDelete": (v_addr, p_ptr, p_len) => {
          const v = loadValue(v_addr);
          const p = loadString(p_ptr, p_len);
          Reflect.deleteProperty(v, p);
        },
        "syscall/js.valueIndex": (ret_addr, v_addr, i) => {
          storeValue(ret_addr, Reflect.get(loadValue(v_addr), i));
        },
        "syscall/js.valueSetIndex": (v_addr, i, x_addr) => {
          Reflect.set(loadValue(v_addr), i, loadValue(x_addr));
        },
        "syscall/js.valueCall": (
          ret_addr,
          v_addr,
          m_ptr,
          m_len,
          args_ptr,
          args_len,
          args_cap,
        ) => {
          const v = loadValue(v_addr);
          const name = loadString(m_ptr, m_len);
          const args = loadSliceOfValues(args_ptr, args_len, args_cap);
          try {
            const m = Reflect.get(v, name);
            storeValue(ret_addr, Reflect.apply(m, v, args));
            mem().setUint8(ret_addr + 8, 1);
          } catch (err) {
            storeValue(ret_addr, err);
            mem().setUint8(ret_addr + 8, 0);
          }
        },
        "syscall/js.valueInvoke": (
          ret_addr,
          v_addr,
          args_ptr,
          args_len,
          args_cap,
        ) => {
          try {
            const v = loadValue(v_addr);
            const args = loadSliceOfValues(args_ptr, args_len, args_cap);
            storeValue(ret_addr, Reflect.apply(v, undefined, args));
            mem().setUint8(ret_addr + 8, 1);
          } catch (err) {
            storeValue(ret_addr, err);
            mem().setUint8(ret_addr + 8, 0);
          }
        },
        "syscall/js.valueNew": (
          ret_addr,
          v_addr,
          args_ptr,
          args_len,
          args_cap,
        ) => {
          const v = loadValue(v_addr);
          const args = loadSliceOfValues(args_ptr, args_len, args_cap);
          try {
            storeValue(ret_addr, Reflect.construct(v, args));
            mem().setUint8(ret_addr + 8, 1);
          } catch (err) {
            storeValue(ret_addr, err);
            mem().setUint8(ret_addr + 8, 0);
          }
        },
        "syscall/js.valueLength": (v_addr) => {
          return loadValue(v_addr).length;
        },
        "syscall/js.valuePrepareString": (ret_addr, v_addr) => {
          const s = String(loadValue(v_addr));
          const str = encoder.encode(s);
          storeValue(ret_addr, str);
          setInt64(ret_addr + 8, str.length);
        },
        "syscall/js.valueLoadString": (
          v_addr,
          slice_ptr,
          slice_len,
          slice_cap,
        ) => {
          const str = loadValue(v_addr);
          loadSlice(slice_ptr, slice_len, slice_cap).set(str);
        },
        "syscall/js.valueInstanceOf": (v_addr, t_addr) => {
          return loadValue(v_addr) instanceof loadValue(t_addr);
        },
        "syscall/js.copyBytesToGo": (
          ret_addr,
          dest_addr,
          dest_len,
          dest_cap,
          source_addr,
        ) => {
          let num_bytes_copied_addr = ret_addr;
          let returned_status_addr = ret_addr + 4;

          const dst = loadSlice(dest_addr, dest_len, dest_cap);
          const src = loadValue(source_addr);
          if (
            !(src instanceof Uint8Array || src instanceof Uint8ClampedArray)
          ) {
            mem().setUint8(returned_status_addr, 0);
            return;
          }
          const toCopy = src.subarray(0, dst.length);
          dst.set(toCopy);
          setInt64(num_bytes_copied_addr, toCopy.length);
          mem().setUint8(returned_status_addr, 1);
        },
        "syscall/js.copyBytesToJS": (
          ret_addr,
          dest_addr,
          source_addr,
          source_len,
          source_cap,
        ) => {
          let num_bytes_copied_addr = ret_addr;
          let returned_status_addr = ret_addr + 4;

          const dst = loadValue(dest_addr);
          const src = loadSlice(source_addr, source_len, source_cap);
          if (
            !(dst instanceof Uint8Array || dst instanceof Uint8ClampedArray)
          ) {
            mem().setUint8(returned_status_addr, 0);
            return;
          }
          const toCopy = src.subarray(0, dst.length);
          dst.set(toCopy);
          setInt64(num_bytes_copied_addr, toCopy.length);
          mem().setUint8(returned_status_addr, 1);
        },
      },
    };
  }

  async run(instance) {
    this._inst = instance;
    const mem = new DataView(this._inst.exports.memory.buffer);

    while (true) {
      const callbackPromise = new Promise((resolve) => {
        this._resolveCallbackPromise = () => {
          if (this.exited) {
            throw new Error("Bad callback: Go program has already exited");
          }
          setTimeout(resolve, 0);
        };
      });
      this._inst.exports._start();
      if (this.exited) {
        break;
      }
      await callbackPromise;
    }
  }

  _resume() {
    if (this.exited) {
      throw new Error("Go program has already exited");
    }
    this._inst.exports.resume();
  }
}

if (
  typeof global !== "undefined" ||
  typeof window !== "undefined" ||
  typeof self !== "undefined"
) {
  if (typeof global !== "undefined") {
    // global already exists
  } else if (typeof window !== "undefined") {
    window.global = window;
  } else if (typeof self !== "undefined") {
    self.global = self;
  } else {
    throw new Error(
      "Cannot export Go (neither global, window nor self is defined)",
    );
  }

  if (!global.require && typeof require !== "undefined") {
    global.require = require;
  }

  // @ts-ignore
  if (!global.fs && global.require) {
    global.fs = require("fs");
  }

  const enosys = () => {
    const err = new Error("not implemented");
    // @ts-ignore
    err.code = "ENOSYS";
    return err;
  };

  if (!global.fs) {
    let outputBuf = "";
    global.fs = {
      constants: {
        O_WRONLY: -1,
        O_RDWR: -1,
        O_CREAT: -1,
        O_TRUNC: -1,
        O_APPEND: -1,
        O_EXCL: -1,
      },
      writeSync: (fd, buf) => {
        outputBuf += decoder.decode(buf);
        const nl = outputBuf.lastIndexOf("\n");
        if (nl != -1) {
          console.log(outputBuf.substr(0, nl));
          outputBuf = outputBuf.substr(nl + 1);
        }
        return buf.length;
      },
      write: (fd, buf, offset, length, position, callback) => {
        if (offset !== 0 || length !== buf.length || position !== null) {
          callback(enosys());
          return;
        }
        const n = global.fs.writeSync(fd, buf);
        callback(null, n);
      },
      open: (path, flags, mode, callback) => {
        callback(enosys());
      },
      fsync: (fd, callback) => {
        callback(null);
      },
      fdatasync: (fd, callback) => {
        callback(null);
      },
      close: (fd, callback) => {
        callback(null);
      },
      createReadStream: enosys,
      createWriteStream: enosys,
      ftruncate: (fd, length, callback) => {
        callback(enosys());
      },
      readFile: (path, callback) => {
        callback(enosys());
      },
      writeFile: (path, data, callback) => {
        callback(enosys());
      },
      truncate: (path, length, callback) => {
        callback(enosys());
      },
      readdir: (path, callback) => {
        callback(enosys());
      },
      unlink: (path, callback) => {
        callback(enosys());
      },
      rmdir: (path, callback) => {
        callback(enosys());
      },
      mkdir: (path, perm, callback) => {
        callback(enosys());
      },
      stat: (path, callback) => {
        callback(enosys());
      },
      lstat: (path, callback) => {
        callback(enosys());
      },
      fstat: (fd, callback) => {
        callback(enosys());
      },
      rename: (oldPath, newPath, callback) => {
        callback(enosys());
      },
      symlink: (target, path, callback) => {
        callback(enosys());
      },
      link: (existingPath, newPath, callback) => {
        callback(enosys());
      },
      readlink: (path, callback) => {
        callback(enosys());
      },
      chmod: (path, mode, callback) => {
        callback(enosys());
      },
      lchmod: (path, mode, callback) => {
        callback(enosys());
      },
      fchmod: (fd, mode, callback) => {
        callback(enosys());
      },
      chown: (path, uid, gid, callback) => {
        callback(enosys());
      },
      lchown: (path, uid, gid, callback) => {
        callback(enosys());
      },
      fchown: (fd, uid, gid, callback) => {
        callback(enosys());
      },
      utimes: (path, atime, mtime, callback) => {
        callback(enosys());
      },
      futimes: (fd, atime, mtime, callback) => {
        callback(enosys());
      },
      realpath: (path, callback) => {
        callback(enosys());
      },
      fallocate: (fd, mode, offset, length, callback) => {
        callback(enosys());
      },
      copyFile: (src, dest, flags, callback) => {
        callback(enosys());
      },
    };
  }

  if (!global.crypto) {
    global.crypto = {
      // @ts-ignore
      getRandomValues: (arr: number[]) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
      },
    };
  }

  if (!global.performance) {
    // @ts-ignore
    global.performance = {
      now: () => Date.now(),
    };
  }

  if (!global.TextEncoder) {
    global.TextEncoder = TextEncoder;
  }

  if (!global.TextDecoder) {
    // @ts-ignore
    global.TextDecoder = TextDecoder;
  }

  if (!global.Buffer) {
    global.Buffer = {
      // @ts-ignore
      isBuffer: (x) => false,
    };
  }

  if (!global.process) {
    // @ts-ignore
    global.process = {
      getuid: () => -1,
      getgid: () => -1,
      geteuid: () => -1,
      getegid: () => -1,
      getgroups: () => [],
      pid: -1,
      ppid: -1,
      umask: () => 0,
      cwd: () => "/",
      chdir: (dir) => {},
    };
  }

  if (!global.Error) {
    // @ts-ignore
    global.Error = class extends Error {};
  }
}
