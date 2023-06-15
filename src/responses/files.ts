// Status Response Interface
export interface UploadStatusResponse {
  status: "uploaded" | "uploading" | "not_found";
}
// Upload Response Interface
export interface UploadResponse {
  cid: string;
}
export interface UploadLimitResponse {
  limit: bigint;
}
