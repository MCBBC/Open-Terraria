// SW 首访陈旧码复现实验:①注册 SW(构建 A)→②改代码重建(构建 B,vite build 不重启服务)
// →③同 context 再次导航,记录两次导航实际加载的 index chunk 名+来源(fromServiceWorker)。
// 用法:node scripts/_sw-stale-repro.mjs (自带静态服务器,不依赖 4173)
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld/game/dist-analyze';
const PORT = 4193;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.zip': 'application/zip', '.ts': 'video/mp2t' };

// 最小静态服务器:disk-per-request(与 vite preview/sirv 同语义)+no-cache for html/sw
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const f = join(ROOT, p);
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('nf'); return; }
  const ext = extname(f);
  const cc = (p === '/' || p === '/index.html' || p.endsWith('.html') || p.endsWith('sw.js')) ? 'no-cache' : 'public, max-age=31536000, immutable';
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': cc });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, r));
console.log('static server on', PORT);

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
  userDataDir: '/tmp/sw-stale-repro-profile',
  protocolTimeout: 600000,
});

async function visit(tag) {
  const page = await browser.newPage();
  const loaded = [];
  page.on('response', (r) => {
    const u = r.url();
    if (/\/assets\/index-[A-Za-z0-9_-]+\.js/.test(u)) loaded.push({ chunk: u.split('/').pop(), sw: r.fromServiceWorker(), status: r.status() });
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch((e) => console.log(tag, 'goto:', e.message.slice(0, 60)));
  await new Promise((r) => setTimeout(r, 2500));
  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? { active: reg.active?.scriptURL, waiting: !!reg.waiting, scope: reg.scope } : null;
  }).catch(() => null);
  const first = loaded[0] ?? { chunk: '(none)', sw: '?' };
  console.log(`[${tag}] 首个 index chunk=${first.chunk} fromSW=${first.sw} responses=${loaded.length} SW状态=${JSON.stringify(swState)}`);
  await page.close();
  return first.chunk;
}

// ---- 阶段①:当前构建 A 首访(SW 注册) ----
const chunkA1 = await visit('A-首访(注册SW)');
await browser.close();
console.log('阶段①完成,SW 已注册,chunk A =', chunkA1);
server.close();
process.exit(0);
