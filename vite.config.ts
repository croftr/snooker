import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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

/**
 * Writes dist/sw.js with the list of files to keep on the device. The version
 * comes from their contents, so every deploy that changes anything updates phones.
 */
function serviceWorker(): Plugin {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

  return {
    name: 'service-worker',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist');
      const wanted = (f: string) =>
        f.endsWith('.woff2') ? /latin/.test(f) : /\.(html|js|css|svg|png|jpg|webmanifest)$/.test(f);
      const files = walk(dist).filter(wanted).sort();
      const template = fs.readFileSync('sw/sw.js', 'utf8');
      const hash = createHash('sha256').update(template);
      for (const f of files) hash.update(f).update(fs.readFileSync(f));
      const urls = files.map((f) => '/' + path.relative(dist, f).split(path.sep).join('/'));
      const source = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__FILES__', JSON.stringify(urls));
      fs.writeFileSync(path.join(dist, 'sw.js'), source);
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi(), serviceWorker()],
  server: { watch: { ignored: ['**/data/local.json'] } },
  // `npm run preview` tests the real offline build: it borrows the API from `npm run dev`.
  preview: { proxy: { '/api': 'http://localhost:5173' } },
});
