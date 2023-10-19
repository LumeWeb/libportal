import { ed25519 as ed } from "@noble/curves/ed25519";
import * as edUtils from "@noble/curves/abstract/utils";

import { RegisterRequest } from "./requests/account.js";
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
import {
  AuthStatusResponse,
  LoginResponse,
  PubkeyChallengeResponse,
} from "./responses/auth.js";
import isNode from "detect-node";
import { utf8ToBytes } from "@noble/curves/abstract/utils";
import { CID, CID_TYPES } from "@lumeweb/libs5";

type NodeReadableStreamType = typeof import("stream").Readable;
type NodePassThroughStreamType = typeof import("stream").PassThrough;

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

  get portalUrl(): string {
    return this._options.portalUrl as string;
  }

  set email(email: string) {
    this._options.email = email;
  }

  get password(): string {
    return this._options.password as string;
  }

  get jwt(): string | undefined {
    return this.jwtSessionKey;
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
    if (this._options.privateKey) {
      return this.loginPubkey();
    }

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

  async loginPubkey(): Promise<LoginResponse> {
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
      utf8ToBytes(challenge.challenge),
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

    return { token: loginRet.token };
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
    const Response = await this.getFetchResponseObject();
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

      const _FormData = await this.getFormDataObject();

      if (!(fetchOptions.body instanceof _FormData)) {
        fetchOptions.headers["Content-Type"] = "application/json";
        fetchOptions.body = JSON.stringify(fetchOptions.body);
      } else {
        if (isNode) {
          const formDataToBlob = (
            await import("formdata-polyfill/formdata-to-blob.js")
          ).formDataToBlob;
          const Blob = (await import("node-fetch")).Blob;
          const blob = formDataToBlob(fetchOptions.body, Blob);
          // @ts-ignore
          fetchOptions.body = Buffer.from(await blob.arrayBuffer());
          fetchOptions.headers["Content-Type"] = blob.type;
        }
      }
    }

    const fetch = await this.getFetchObject();
    const response = await fetch(this.getEndpoint(path), fetchOptions as any);

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

  async uploadFile(stream: Blob, size?: bigint): Promise<CID>;
  async uploadFile(
    stream: ReadableStream,
    hashStream: ReadableStream,
    size: bigint,
  ): Promise<CID>;
  async uploadFile(stream: Uint8Array, size?: bigint): Promise<CID>;
  async uploadFile(
    stream: NodeJS.ReadableStream,
    hashStream: NodeJS.ReadableStream,
    size?: bigint,
  ): Promise<CID>;
  async uploadFile(stream: any, hashStream?: any, size?: bigint): Promise<CID> {
    const Blob = await this.getBlobObject();

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

  private async uploadFileSmall(stream: Blob): Promise<CID>;
  private async uploadFileSmall(
    stream: ReadableStream,
    hashStream: ReadableStream,
  ): Promise<CID>;
  private async uploadFileSmall(stream: Uint8Array): Promise<CID>;
  private async uploadFileSmall(stream: NodeJS.ReadableStream): Promise<CID>;
  private async uploadFileSmall(stream: any): Promise<CID> {
    const Blob = await this.getBlobObject();

    if (stream instanceof ReadableStream) {
      stream = await streamToBlob(stream);
    }

    let NodeReadableStream =
      (await this.getNodeReadableObject()) as NodeReadableStreamType;

    let NodePassThroughStream =
      (await this.getNodePassThroughObject()) as NodePassThroughStreamType;

    if (NodeReadableStream && stream instanceof NodeReadableStream) {
      const Response = await this.getFetchResponseObject();
      stream = await new Response(
        stream.pipe(new NodePassThroughStream()) as any,
      ).blob();
    }

    if (stream instanceof Uint8Array) {
      stream = new Blob([Buffer.from(stream)]);
    }

    if (
      !(stream instanceof Blob) &&
      !(NodeReadableStream && stream instanceof NodeReadableStream)
    ) {
      throw new Error("Invalid stream");
    }

    const _FormData = await this.getFormDataObject();

    const formData = new _FormData();
    formData.set("file", stream as Blob);

    const response = await this.post<UploadResponse>(
      "/api/v1/files/upload",
      formData,
      { auth: true },
    );

    return CID.decode(response.cid);
  }

  private async uploadFileTus(stream: Blob, size?: bigint): Promise<CID>;
  private async uploadFileTus(
    stream: ReadableStream,
    hashStream: ReadableStream,
    size?: bigint,
  ): Promise<CID>;
  private async uploadFileTus(stream: Uint8Array, size?: bigint): Promise<CID>;
  private async uploadFileTus(
    stream: NodeJS.ReadableStream,
    hashStream: ReadableStream,
    size?: bigint,
  ): Promise<CID>;
  private async uploadFileTus(
    stream: any,
    hashStream?: any,
    size?: bigint,
  ): Promise<CID> {
    if (["bigint", "number"].includes(typeof hashStream)) {
      size = BigInt(hashStream);
      hashStream = undefined;
    }

    const ret = defer();
    let hash = "";

    if (stream instanceof ReadableStream) {
      hash = await this.computeHash(hashStream);
    }

    let NodeReadableStream =
      (await this.getNodeReadableObject()) as NodeReadableStreamType;

    if (NodeReadableStream && stream instanceof NodeReadableStream) {
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
      !(NodeReadableStream && stream instanceof NodeReadableStream)
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

    const cid = CID.fromHash(hash, Number(size));

    while (true) {
      const status = await this.getUploadStatus(cid.toString());

      if (status.status === "uploaded") {
        break;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
    }

    return cid;
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

    let NodeReadableStream =
      (await this.getNodeReadableObject()) as NodeReadableStreamType;

    if (NodeReadableStream && stream instanceof NodeReadableStream) {
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

  private async getFormDataObject() {
    if (isNode) {
      return (await import("node-fetch")).FormData;
    }

    return FormData;
  }

  private async getBlobObject() {
    if (isNode) {
      return (await import("node-fetch")).Blob;
    }

    return Blob;
  }

  private async getNodeReadableObject() {
    if (isNode) {
      return (await import("stream")).Readable;
    }

    return undefined;
  }

  private async getNodePassThroughObject() {
    if (isNode) {
      return (await import("stream")).PassThrough;
    }

    return undefined;
  }

  private async getFetchObject() {
    if (isNode) {
      return (await import("node-fetch")).default;
    }

    return fetch;
  }

  private async getFetchResponseObject() {
    if (isNode) {
      return (await import("node-fetch")).Response;
    }

    return Response;
  }
}
