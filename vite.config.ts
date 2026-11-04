import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serves /api/* during `npm run dev` using the same handlers as the Vercel
 * functions, so there is no need for `vercel dev`. Data goes to data/local.json
 * unless FORCE_CLOUD=1 is set.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      Object.assign(process.env, loadEnv('development', process.cwd(), ''));
      if (!process.env.FORCE_CLOUD) process.env.SNOOKER_STORAGE = 'local';

      server.middlewares.use('/api', async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const raw = Buffer.concat(chunks).toString('utf8');
          const handlers = await server.ssrLoadModule('/server/handlers.ts');
          const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
          const route = handlers.routes[name];
          const out = route
            ? await route({ method: req.method, headers: req.headers, body: raw ? JSON.parse(raw) : undefined })
            : { status: 404, json: { error: 'Not found' } };
          res.statusCode = out.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(out.json));
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Dev API error' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  server: { watch: { ignored: ['**/data/local.json'] } },
});
