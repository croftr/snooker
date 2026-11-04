import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAuth } from '../server/handlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const out = await handleAuth(req);
  res.status(out.status).json(out.json);
}
