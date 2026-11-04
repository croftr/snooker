import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleData } from '../server/handlers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const out = await handleData(req);
  res.setHeader('Cache-Control', 'no-store');
  res.status(out.status).json(out.json);
}
