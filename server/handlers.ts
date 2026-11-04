import { createHash, timingSafeEqual } from 'node:crypto';
import { ConflictError, isLocal, readDoc, writeDoc, writeImage } from './store.js';

export interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
}
export interface ApiResult {
  status: number;
  json: unknown;
}

const MAX_DOC = 2_000_000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const sha = (s: string) => createHash('sha256').update(s).digest();

/** Null when allowed, otherwise the response to send. Fails closed in production. */
function denied(req: ApiRequest): ApiResult | null {
  const expected = process.env.SNOOKER_EDIT_PASSWORD;
  if (!expected) {
    return isLocal() ? null : { status: 503, json: { error: 'SNOOKER_EDIT_PASSWORD is not set on the server' } };
  }
  const given = req.headers['x-edit-password'];
  const ok = typeof given === 'string' && timingSafeEqual(sha(given), sha(expected));
  return ok ? null : { status: 401, json: { error: 'Wrong password' } };
}

function validDoc(d: any): boolean {
  return (
    d && d.schema === 1 && d.players?.bob && d.players?.mike &&
    Array.isArray(d.tournaments) &&
    d.tournaments.every((t: any) => t.id && t.format && Array.isArray(t.sessions)) &&
    Array.isArray(d.bonusRules) && Array.isArray(d.decrees) && Array.isArray(d.records) &&
    Array.isArray(d.awards) && Array.isArray(d.gallery) && d.plantBoy
  );
}

const METHOD_NOT_ALLOWED: ApiResult = { status: 405, json: { error: 'Method not allowed' } };

async function guarded(fn: () => Promise<ApiResult>): Promise<ApiResult> {
  try {
    return await fn();
  } catch (e: any) {
    console.error('Storage error:', e);
    const access = e?.name === 'AccessDenied' || e?.$metadata?.httpStatusCode === 403;
    const missing = e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
    return {
      status: 500,
      json: {
        error: missing
          ? 'snooker-data-v1.json is not in the bucket yet'
          : access
            ? 'S3 refused access: check the IAM key, or that snooker-data-v1.json has been uploaded'
            : 'Storage error',
      },
    };
  }
}

export async function handleData(req: ApiRequest): Promise<ApiResult> {
  return guarded(async () => {
    if (req.method === 'GET') {
      const { body, etag } = await readDoc();
      return { status: 200, json: { doc: JSON.parse(body), etag } };
    }
    if (req.method === 'PUT') {
      const no = denied(req);
      if (no) return no;
      const { doc, etag } = req.body ?? {};
      if (!validDoc(doc) || typeof etag !== 'string') return { status: 400, json: { error: 'Invalid document' } };
      const text = JSON.stringify(doc, null, 1);
      if (text.length > MAX_DOC) return { status: 413, json: { error: 'Document too large' } };
      try {
        return { status: 200, json: { etag: await writeDoc(text, etag) } };
      } catch (e) {
        if (e instanceof ConflictError) return { status: 409, json: { error: 'Someone else saved first' } };
        throw e;
      }
    }
    return METHOD_NOT_ALLOWED;
  });
}

export async function handleUpload(req: ApiRequest): Promise<ApiResult> {
  return guarded(async () => {
    if (req.method !== 'POST') return METHOD_NOT_ALLOWED;
    const no = denied(req);
    if (no) return no;
    const { name, type, data } = req.body ?? {};
    if (typeof name !== 'string' || !IMAGE_TYPES.has(type) || typeof data !== 'string') {
      return { status: 400, json: { error: 'Expected a JPEG, PNG or WebP image' } };
    }
    return { status: 200, json: { url: await writeImage(name, type, Buffer.from(data, 'base64')) } };
  });
}

export async function handleAuth(req: ApiRequest): Promise<ApiResult> {
  if (req.method !== 'POST') return METHOD_NOT_ALLOWED;
  return denied(req) ?? { status: 200, json: { ok: true } };
}

export const routes: Record<string, (req: ApiRequest) => Promise<ApiResult>> = {
  data: handleData,
  upload: handleUpload,
  auth: handleAuth,
};
