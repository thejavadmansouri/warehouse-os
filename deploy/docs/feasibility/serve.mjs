import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const root = process.cwd();
const types = { '.html': 'text/html; charset=utf-8', '.pdf': 'application/pdf', '.ttf': 'font/ttf', '.png': 'image/png', '.css': 'text/css' };
createServer((req, res) => {
  const p = join(root, normalize(decodeURIComponent(req.url.split('?')[0])));
  if (!existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(8899, '127.0.0.1', () => console.log('ready on 8899'));
