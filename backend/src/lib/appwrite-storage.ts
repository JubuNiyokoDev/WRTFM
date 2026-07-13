import { createHash, randomBytes } from "node:crypto";

export type StoredProofFile = {
  fileId: string;
  bucketId: string;
  endpoint: string;
  size: number;
  mimeType: string;
  originalName: string;
  sha256: string;
  viewUrl: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Appwrite storage`);
  }
  return value;
}

function appwriteEndpoint(): string {
  const endpoint = (process.env.APPWRITE_ENDPOINT ?? "https://appwrite.run.place/")
    .replace(/\/+$/, "");
  return endpoint.endsWith("/v1") ? endpoint : `${endpoint}/v1`;
}

function appwriteFileId(): string {
  return `proof_${Date.now().toString(36)}_${randomBytes(8).toString("hex")}`;
}

export function isAppwriteStorageConfigured(): boolean {
  return Boolean(
    process.env.APPWRITE_ENDPOINT &&
    process.env.APPWRITE_PROJECT_ID &&
    process.env.APPWRITE_API_KEY &&
    process.env.APPWRITE_PROOFS_BUCKET_ID,
  );
}

export function getFileHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function uploadProofFile(
  file: Express.Multer.File,
): Promise<StoredProofFile> {
  return uploadBufferFile({
    buffer: file.buffer,
    size: file.size,
    mimetype: file.mimetype,
    originalname: file.originalname,
  });
}

export async function uploadBufferFile(file: {
  buffer: Buffer;
  size?: number;
  mimetype: string;
  originalname: string;
}): Promise<StoredProofFile> {
  const endpoint = appwriteEndpoint();
  const projectId = requiredEnv("APPWRITE_PROJECT_ID");
  const apiKey = requiredEnv("APPWRITE_API_KEY");
  const bucketId = requiredEnv("APPWRITE_PROOFS_BUCKET_ID");
  const fileId = appwriteFileId();
  const sha256 = getFileHash(file.buffer);
  const fileBytes = file.buffer.buffer.slice(
    file.buffer.byteOffset,
    file.buffer.byteOffset + file.buffer.byteLength,
  ) as ArrayBuffer;

  const form = new FormData();
  form.set("fileId", fileId);
  form.set(
    "file",
    new Blob([fileBytes], { type: file.mimetype }),
    file.originalname,
  );

  const response = await fetch(
    `${endpoint}/storage/buckets/${bucketId}/files`,
    {
      method: "POST",
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey,
      },
      body: form,
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Appwrite upload failed: ${response.status} ${text.slice(0, 240)}`,
    );
  }

  return {
    fileId,
    bucketId,
    endpoint,
    size: file.size ?? file.buffer.length,
    mimeType: file.mimetype,
    originalName: file.originalname,
    sha256,
    viewUrl: `/api/proof-files/${fileId}/view`,
  };
}

export async function fetchProofFile(
  fileId: string,
): Promise<{ body: ArrayBuffer; contentType: string | null }> {
  const endpoint = appwriteEndpoint();
  const projectId = requiredEnv("APPWRITE_PROJECT_ID");
  const apiKey = requiredEnv("APPWRITE_API_KEY");
  const bucketId = requiredEnv("APPWRITE_PROOFS_BUCKET_ID");

  const response = await fetch(
    `${endpoint}/storage/buckets/${bucketId}/files/${fileId}/view`,
    {
      headers: {
        "X-Appwrite-Project": projectId,
        "X-Appwrite-Key": apiKey,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Appwrite file view failed: ${response.status}`);
  }

  return {
    body: await response.arrayBuffer(),
    contentType: response.headers.get("content-type"),
  };
}
