import { ed25519 as ed } from "@noble/curves/ed25519";
import * as edUtils from "@noble/curves/abstract/utils";

import { RegisterRequest } from "./requests/account.js";
import fetch, {
  FormData,
  Blob,
  RequestInit,
  Response,
  HeadersInit,
} from "node-fetch";
import {
  LoginRequest,
  LogoutRequest,
  PubkeyChallengeRequest,
  PubkeyLoginRequest,
} from "./requests/auth.js";
import {
  UploadLimitResponse,
  UploadResponse,
  UploadStatusResponse,
} from "./responses/files.js";

import * as TUS from "tus-js-client";
import streamToBlob from "stream-to-blob";

import defer from "p-defer";
import { blake3 } from "@noble/hashes/blake3";
import { encodeCid } from "./cid.js";
import { Readable as NodeReadableStream } from "stream";
import {
  AuthStatusResponse,
  LoginResponse,
  PubkeyChallengeResponse,
} from "./responses/auth.js";

export interface ClientOptions {
  portalUrl: string;
  email?: string;
  password?: string;
  privateKey?: Uint8Array;
  jwt?: string;
}

interface FetchOptions {
  auth?: boolean;
  raw?: boolean;
  fullResponse?: boolean;
  method?: "GET" | "POST";
  data?: any;
}

export class Client {
  private _options: ClientOptions;
  private jwtSessionKey?: string;
  private uploadLimit?: bigint;

  constructor(options: ClientOptions) {
    if (!options) {
      throw new Error("ClientOptions is required ");
    }
    if (!options.portalUrl) {
      throw new Error("Portal url is required");
    }

    if (options.jwt) {
      this.jwtSessionKey = options.jwt;
    }

    this._options = options;
  }

  get email(): string {
    return this._options.email as string;
  }

  set email(email: string) {
    this._options.email = email;
  }

  get password(): string {
    return this._options.password as string;
  }

  set password(password: string) {
    this._options.email = password;
  }

  set privateKey(key: string) {
    this._options.privateKey = edUtils.hexToBytes(key);
  }

  async useNewPubkeyAccount() {
    this._options.privateKey = ed.utils.randomPrivateKey();
    this._options.password = undefined;
  }

  async register(): Promise<void> {
    if (!this._options.email) {
      throw new Error("Email required");
    }
    if (!this._options.password && !this._options.privateKey) {
      throw new Error("Password or private key required");
    }
    return this.post<void>("/api/v1/account/register", {
      email: this.email,
      password: this.password,
      pubkey: await this.getPubkeyHex(),
    } as RegisterRequest);
  }

  async login(): Promise<LoginResponse> {
    return this.post<LoginResponse>("/api/v1/auth/login", {
      email: this._options.email,
      password: this._options.password,
    } as LoginRequest);
  }

  async isLoggedIn() {
    const ret = await this.get<Response>("/api/v1/auth/status", {
      auth: true,
      fullResponse: true,
    });
    if (!ret.ok) {
      if (ret.status === 401) {
        return false;
      }

      throw new Error(
        `Unrecognized status code: ${ret.status} ${await ret.text()}`,
      );
    }

    const json = (await ret.json()) as AuthStatusResponse;

    return json.status as boolean;
  }

  async loginPubkey(): Promise<void> {
    if (!this._options.privateKey) {
      throw new Error("Private key is required");
    }

    const challenge = await this.post<PubkeyChallengeResponse>(
      "/api/v1/auth/pubkey/challenge",
      {
        pubkey: await this.getPubkeyHex(),
      } as PubkeyChallengeRequest,
    );

    const signature = ed.sign(
      new TextEncoder().encode(challenge.challenge),
      this._options.privateKey,
    );

    const loginRet = await this.post<LoginResponse>(
      "/api/v1/auth/pubkey/login",
      {
        pubkey: this.getPubkeyHex(),
        challenge: challenge.challenge,
        signature: edUtils.bytesToHex(signature),
      } as PubkeyLoginRequest,
    );

    this.jwtSessionKey = loginRet.token;
  }

  logout(request: LogoutRequest): Promise<void> {
    return this.post<void>("/api/v1/auth/logout", request);
  }

  async getBasicUploadLimit(): Promise<bigint> {
    if (this.uploadLimit) {
      return this.uploadLimit;
    }

    this.uploadLimit = (
      await this.get<UploadLimitResponse>("/api/v1/files/upload/limit", {
        auth: true,
      })
    ).limit;

    return this.uploadLimit;
  }

  async downloadFile(cid: string): Promise<ReadableStream> {
    return await this.get<any>(`/api/v1/files/download/${cid}`, {
      auth: true,
      raw: true,
    });
  }

  async downloadProof(cid: string): Promise<ArrayBuffer> {
    return await new Response(
      await this.get<any>(`/api/v1/files/proof/${cid}`, {
        auth: true,
        raw: true,
      }),
    ).arrayBuffer();
  }

  private async fetch<T>(path: string, options: FetchOptions): Promise<T> {
    let fetchOptions: RequestInit & { headers: HeadersInit } = {
      method: options.method,
      headers: {},
    };
    if (options.auth) {
      fetchOptions.headers["Authorization"] = `Bearer ${this.jwtSessionKey}`;
    }

    if (options.data) {
      fetchOptions.body = options.data;

      if (!(fetchOptions.body instanceof FormData)) {
        fetchOptions.headers["Content-Type"] = "application/json";
        fetchOptions.body = JSON.stringify(fetchOptions.body);
      }
    }

    const response = await fetch(this.getEndpoint(path), fetchOptions);

    if (!options.fullResponse) {
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Account required to take action");
        }
        throw new Error(`Request failed: ${await response.text()}`);
      }
    }

    if (options.fullResponse) {
      return response as T;
    }
    if (options.raw) {
      return response.body as T;
    }

    const out = await response.text();

    if (out) {
      return JSON.parse(out) as T;
    }

    return null as T;
  }

  private async get<T>(path: string, options: FetchOptions = {}): Promise<T> {
    return this.fetch<T>(path, { ...options, method: "GET" });
  }

  private async post<T>(
    path: string,
    data: any,
    options: FetchOptions = {},
  ): Promise<T> {
    return this.fetch<T>(path, { ...options, method: "POST", data });
  }

  private getEndpoint(path: string) {
    return `${this._options.portalUrl}${path}`;
  }

  getPubkeyHex() {
    return edUtils.bytesToHex(
      ed.getPublicKey(this._options.privateKey as Uint8Array),
    );
  }

  async uploadFile(stream: Blob, size?: bigint);
  async uploadFile(
    stream: ReadableStream,
    hashStream: ReadableStream,
    size: bigint,
  );
  async uploadFile(stream: Uint8Array, size?: bigint);
  async uploadFile(
    stream: NodeJS.ReadableStream,
    hashStream: NodeJS.ReadableStream,
    size?: bigint,
  );
  async uploadFile(
    stream: any,
    hashStream?: any,
    size?: bigint,
  ): Promise<string> {
    if (stream instanceof Uint8Array || stream instanceof Blob) {
      size = BigInt(stream.length);
    }

    if (["bigint", "number"].includes(typeof hashStream)) {
      size = BigInt(hashStream);
      hashStream = undefined;
    }

    const uploadLimit = await this.getBasicUploadLimit();
    if ((size as bigint) <= uploadLimit) {
      return this.uploadFileSmall(stream);
    }

    return this.uploadFileTus(stream, hashStream, size);
  }

  private async uploadFileSmall(stream: Blob): Promise<string>;
  private async uploadFileSmall(
    stream: ReadableStream,
    hashStream: ReadableStream,
  ): Promise<string>;
  private async uploadFileSmall(stream: Uint8Array): Promise<string>;
  private async uploadFileSmall(stream: NodeJS.ReadableStream): Promise<string>;
  private async uploadFileSmall(stream: any): Promise<string> {
    if (stream instanceof ReadableStream) {
      stream = await streamToBlob(stream);
    }

    if (stream instanceof NodeReadableStream) {
      let data = new Uint8Array();
      for await (const chunk of stream) {
        data = Uint8Array.from([...data, ...chunk]);
      }

      stream = data;
    }

    if (stream instanceof Uint8Array) {
      stream = new Blob([Buffer.from(stream)]);
    }

    if (!(stream instanceof Blob) && !(stream instanceof NodeReadableStream)) {
      throw new Error("Invalid stream");
    }

    const formData = new FormData();
    formData.set("file", stream as Blob);

    const response = await this.post<UploadResponse>(
      "/api/v1/files/upload",
      formData,
      { auth: true },
    );

    return response.cid;
  }

  private async uploadFileTus(stream: Blob, size?: bigint): Promise<string>;
  private async uploadFileTus(
    stream: ReadableStream,
    hashStream: ReadableStream,
    size?: bigint,
  ): Promise<string>;
  private async uploadFileTus(
    stream: Uint8Array,
    size?: bigint,
  ): Promise<string>;
  private async uploadFileTus(
    stream: NodeJS.ReadableStream,
    hashStream: ReadableStream,
    size?: bigint,
  ): Promise<string>;
  private async uploadFileTus(
    stream: any,
    hashStream?: any,
    size?: bigint,
  ): Promise<string> {
    if (["bigint", "number"].includes(typeof hashStream)) {
      size = BigInt(hashStream);
      hashStream = undefined;
    }

    const ret = defer();
    let hash = "";

    if (stream instanceof ReadableStream) {
      hash = await this.computeHash(hashStream);
    }

    if (stream instanceof NodeReadableStream) {
      hash = await this.computeHash(hashStream);
    }

    if (stream instanceof Uint8Array) {
      stream = new Blob([stream]);
      size = stream.size;
      hash = await this.computeHash(stream);
    }

    if (
      !(stream instanceof ReadableStreamDefaultReader) &&
      !(stream instanceof Blob) &&
      !(stream instanceof NodeReadableStream)
    ) {
      throw new Error("Invalid stream");
    }

    const checkFileExistsError = (error: TUS.DetailedError): boolean => {
      return error?.originalResponse?.getStatus() === 304;
    };

    const upload = new TUS.Upload(stream, {
      endpoint: this.getEndpoint("/api/v1/files/tus"),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      metadata: {
        hash,
      },
      chunkSize:
        stream instanceof ReadableStreamDefaultReader ||
        stream instanceof NodeReadableStream
          ? Number(await this.getBasicUploadLimit())
          : undefined,
      uploadSize: size ? Number(size) : undefined,
      onError: function (error) {
        if (checkFileExistsError(error as TUS.DetailedError)) {
          ret.resolve(upload.url);
          return;
        }
        ret.reject(error);
      },
      onSuccess: function () {
        ret.resolve(upload.url);
      },
      onShouldRetry: function (error) {
        return !checkFileExistsError(error as TUS.DetailedError);
      },
    });

    const prevUploads = await upload.findPreviousUploads();
    if (prevUploads.length) {
      upload.resumeFromPreviousUpload(prevUploads[0]);
    } else {
      upload.start();
    }

    await ret.promise;

    const cid = encodeCid(hash, size as bigint);

    while (true) {
      const status = await this.getUploadStatus(cid as string);

      if (status.status === "uploaded") {
        break;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
    }

    return cid as string;
  }

  async getUploadStatus(cid: string) {
    return this.get<UploadStatusResponse>(`/api/v1/files/status/${cid}`, {
      auth: true,
    });
  }

  private async computeHash(stream: Blob);
  private async computeHash(stream: ReadableStream);
  private async computeHash(stream: Uint8Array);
  private async computeHash(stream: NodeJS.ReadableStream);
  private async computeHash(stream: any): Promise<string> {
    if (stream instanceof Uint8Array) {
      stream = new Blob([stream]);
    }

    if (stream instanceof ReadableStream) {
      const hasher = blake3.create({});
      const forks = stream.tee();
      const reader = forks[0].getReader();

      // @ts-ignore
      for await (const chunk of reader.iterator()) {
        hasher.update(chunk);
      }

      return edUtils.bytesToHex(hasher.digest());
    }

    if (stream instanceof NodeReadableStream) {
      const hasher = blake3.create({});

      for await (const chunk of stream) {
        hasher.update(chunk);
      }

      return edUtils.bytesToHex(hasher.digest());
    }

    if (stream instanceof Blob) {
      const output = blake3(new Uint8Array(await stream.arrayBuffer()));

      return edUtils.bytesToHex(output);
    }

    throw new Error("Invalid stream");
  }
}
