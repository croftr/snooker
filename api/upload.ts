import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleUpload } from '../server/handlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const out = await handleUpload(req);
  res.status(out.status).json(out.json);
}
