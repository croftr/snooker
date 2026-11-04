import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * The whole site is one JSON document (same idea as booky): one GetObject to
 * read, one PutObject to write. Writes use S3's If-Match so that two people
 * saving at once get a conflict rather than silently overwriting each other.
 * In `npm run dev` the document lives in data/local.json, copied from seed.json.
 */
const REGION = () => process.env.SNOOKER_AWS_REGION || 'eu-west-2';
const BUCKET = () => process.env.SNOOKER_S3_BUCKET || 'robs-booky-data';
const DATA_KEY = 'snooker-data-v1.json';
const IMAGE_PREFIX = 'images/snooker/';

export class ConflictError extends Error {}
export const isLocal = () => process.env.SNOOKER_STORAGE === 'local';

let client: S3Client | null = null;
function s3() {
  if (!client) {
    const accessKeyId = process.env.SNOOKER_AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.SNOOKER_AWS_SECRET_ACCESS_KEY;
    client = new S3Client({
      region: REGION(),
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
  }
  return client;
}

const md5 = (s: string) => createHash('md5').update(s).digest('hex');
const localPath = () => path.join(process.cwd(), 'data', 'local.json');

async function readLocal(): Promise<string> {
  try {
    return await fs.readFile(localPath(), 'utf8');
  } catch {
    const seed = await fs.readFile(path.join(process.cwd(), 'data', 'seed.json'), 'utf8');
    await fs.writeFile(localPath(), seed);
    return seed;
  }
}

export async function readDoc(): Promise<{ body: string; etag: string }> {
  if (isLocal()) {
    const body = await readLocal();
    return { body, etag: md5(body) };
  }
  // Any failure propagates: a failed read must never look like an empty database.
  const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET(), Key: DATA_KEY }));
  return { body: await res.Body!.transformToString(), etag: res.ETag! };
}

export async function writeDoc(body: string, etag: string): Promise<string> {
  if (isLocal()) {
    if (md5(await readLocal()) !== etag) throw new ConflictError();
    await fs.writeFile(localPath(), body);
    return md5(body);
  }
  try {
    const res = await s3().send(
      new PutObjectCommand({
        Bucket: BUCKET(),
        Key: DATA_KEY,
        Body: body,
        ContentType: 'application/json',
        IfMatch: etag,
      }),
    );
    return res.ETag!;
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 412 || e?.name === 'PreconditionFailed') throw new ConflictError();
    throw e;
  }
}

/** Stores a photo and returns its public URL. images/* is public-read in the booky bucket. */
export async function writeImage(name: string, type: string, bytes: Buffer): Promise<string> {
  const file = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  if (isLocal()) {
    const dir = path.join(process.cwd(), 'public', 'uploads');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, file), bytes);
    return `/uploads/${file}`;
  }
  const key = IMAGE_PREFIX + file;
  await s3().send(new PutObjectCommand({ Bucket: BUCKET(), Key: key, Body: bytes, ContentType: type }));
  return `https://${BUCKET()}.s3.${REGION()}.amazonaws.com/${key}`;
}
