import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile, unlink, stat } from "fs/promises";
import path from "path";
import { TEMP_FILE_TTL_SECONDS } from "@/lib/constants";

const s3 = process.env.S3_BUCKET
  ? new S3Client({
      region: process.env.S3_REGION ?? "eu-central-1",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    })
  : null;

const bucket = process.env.S3_BUCKET;
const localRoot = process.env.LOCAL_STORAGE_PATH ?? "/var/lib/pdfflow/jobs";

function localPath(key: string): string {
  const safe = key.replace(/\.\./g, "").replace(/^\/+/, "");
  return path.join(/* turbopackIgnore: true */ localRoot, safe);
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function isLocalFileExpired(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    const ageMs = Date.now() - info.mtimeMs;
    return ageMs > TEMP_FILE_TTL_SECONDS * 1000;
  } catch {
    return true;
  }
}

export async function uploadTempFile(key: string, data: Buffer): Promise<void> {
  if (s3 && bucket) {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        Expires: new Date(Date.now() + TEMP_FILE_TTL_SECONDS * 1000),
      })
    );
    return;
  }

  const filePath = localPath(key);
  await ensureDir(filePath);
  await writeFile(filePath, data);
}

export async function downloadTempFile(key: string): Promise<Buffer> {
  if (s3 && bucket) {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const bytes = await res.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  const filePath = localPath(key);
  if (await isLocalFileExpired(filePath)) {
    throw new Error("File not found or expired");
  }
  return readFile(filePath);
}

export async function deleteTempFile(key: string): Promise<void> {
  if (s3 && bucket) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }

  const filePath = localPath(key);
  await unlink(filePath).catch(() => {});
}
