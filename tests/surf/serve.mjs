// Minimal static server that mirrors production paths:
//   /surf/*  -> games/surf/*      /*  -> srv/*
// Usage: node tests/surf/serve.mjs [port]   (default 8000)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const port = Number(process.argv[2]) || 8000;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/surf') {
    res.writeHead(301, { location: '/surf/' }).end();
    return;
  }
  const [base, rel] = path.startsWith('/surf/') ? ['games/surf', path.slice(6)] : ['srv', path.slice(1)];
  const dir = join(root, base);
  let file = normalize(join(dir, rel));
  if (!file.startsWith(dir)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/surf/`));
