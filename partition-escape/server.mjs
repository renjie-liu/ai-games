import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const files = new Set(['index.html', 'style.css', 'app.mjs', 'engine.mjs', 'partner.mjs']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' };
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535');
const server = http.createServer(async (req, res) => {
  const file = new URL(req.url, 'http://localhost').pathname.replace(/^\//, '') || 'index.html';
  if (!files.has(file) || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(path.join(root, file));
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Could not read local asset'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Try PORT=4174 node server.mjs` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`隔墙 · offline prototype → http://127.0.0.1:${port}\nNo model, credentials, downloads, or external requests. Ctrl+C to stop.`));
