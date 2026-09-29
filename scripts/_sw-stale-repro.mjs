// SW 首访陈旧码复现实验 v2(两阶段):
// ①新 profile 访问构建 A(dist-analyze 现状)→SW 注册+旧 chunk 入 SW 缓存;
// ②伪重建:把 index.html 的主 chunk 改名为 index-REBUILT.js(B 覆盖目录);
// ③同 profile 再访:第一导航加载哪个 chunk?刷新一次后呢?
// 判据:第一导航 chunk=A 旧名 → 复现;= REBUILT → 现行 sw.js 无此病(用户浏览器持旧 SW)。
// 用法:node scripts/_sw-stale-repro.mjs
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT_A = '/Users/vinlic/Project/GLM/SandboxWorld/game/dist-analyze';
const ROOT_B = '/tmp/sw-stale-repro-B';
const PORT = 4193;
const PROFILE = '/tmp/sw-stale-repro-profile';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.zip': 'application/zip' };

// ---- 构造 B 覆盖目录:index.html 主 chunk 改名 index-REBUILT.js ----
rmSync(ROOT_B, { recursive: true, force: true });
mkdirSync(join(ROOT_B, 'assets'), { recursive: true });
const idxA = readFileSync(join(ROOT_A, 'index.html'), 'utf8');
const m = idxA.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
if (!m) { console.log('FAIL: 主 chunk 名未找到'); process.exit(1); }
const oldChunk = m[1];
copyFileSync(join(ROOT_A, 'assets', oldChunk), join(ROOT_B, 'assets', 'index-REBUILT.js'));
copyFileSync(process.env.SW_SRC ?? join(ROOT_A, 'sw.js'), join(ROOT_A, 'sw.js')); copyFileSync(join(ROOT_A, 'sw.js'), join(ROOT_B, 'sw.js'));
const idxB = idxA.replaceAll(oldChunk, 'index-REBUILT.js');
mkdirSync(join(ROOT_B, 'assets'), { recursive: true });
// ★2026-09-29 补课:idxB 此前只算没写——B 目录无 index.html → 全部回退 A,前两轮「复现」全是此假象
writeFileSync(join(ROOT_B, 'index.html'), idxB);
console.log('B 覆盖:', oldChunk, '→ index-REBUILT.js (index.html 已写入)');

// ---- 静态服务器:先 B 后 A,disk-per-request,html/sw no-cache、其余 immutable ----
let useB = false;
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const root = useB ? ROOT_B : ROOT_A;
  let f = join(root, p);
  if (!existsSync(f) || !statSync(f).isFile()) f = join(ROOT_A, p);   // B 覆盖缺失回退 A
  if (p==='/index.html'||p==='/sw.js') console.log('[server]', useB?'B':'A', p, '→', f.includes('REBUILT')||f.includes(ROOT_B)?'B来源':'A来源');
  if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('nf'); return; }
  const cc = (p.endsWith('.html') || p.endsWith('sw.js')) ? 'no-cache' : 'public, max-age=31536000, immutable';
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] ?? 'application/octet-stream', 'Cache-Control': cc });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(PORT, r));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
  userDataDir: PROFILE, protocolTimeout: 600000,
});

async function visit(tag) {
  const page = await browser.newPage();
  const loaded = [];
  page.on('response', (r) => {
    const u = r.url();
    if (/\/assets\/index-[A-Za-z0-9_-]+\.js/.test(u)) loaded.push(`${u.split('/').pop()} sw=${r.fromServiceWorker()} st=${r.status()}`);
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch((e) => console.log(tag, 'goto:', e.message.slice(0, 60)));
  await new Promise((r) => setTimeout(r, 2500));
  console.log(`[${tag}]`, loaded.length ? loaded.join(' | ') : '(零 index chunk 响应)');
  await page.close();
}

// ---- 阶段①:构建 A 首访(SW 注册) ----
await visit('A-首访(注册SW)');
// ★2026-09-29 补课:二次导航=文档经 ② 网络优先进版本缓存(用户真实场景=多次访问后
//   文档早已入缓存;单次导航时文档不在缓存,冷启动 serveAsset miss→网络→不触发此病)
await visit('A-二次导航(文档入版本缓存)');
await browser.close();

// ---- 阶段②:切 B(伪重建)+同 profile 重开 ----
useB = true;
const browser2 = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
  userDataDir: PROFILE, protocolTimeout: 600000,
});
async function visit2(tag, reload) {
  const page = await browser2.newPage();
  const loaded = [];
  page.on('response', (r) => {
    const u = r.url();
    if (/\/assets\/index-[A-Za-z0-9_-]+\.js/.test(u) || u === `http://localhost:${PORT}/`) loaded.push(`${u === `http://localhost:${PORT}/` ? 'DOC' : u.split('/').pop()} sw=${r.fromServiceWorker()} st=${r.status()}`);
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch((e) => console.log(tag, 'goto:', e.message.slice(0, 60)));
  await new Promise((r) => setTimeout(r, 2500));
  const src = await page.evaluate(() => document.querySelector('script[type=module]')?.getAttribute('src') ?? '(无)').catch(() => '(页面已死)');
  console.log(`[${tag}] 页面 module src=${src}`);
  if (reload) {
    console.log(`[${tag}]`, loaded.join(' | ') || '(零)');
    loaded.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));
    const src2 = await page.evaluate(() => document.querySelector('script[type=module]')?.getAttribute('src') ?? '(无)').catch(() => '(页面已死)');
    console.log(`[${tag}+刷新] 页面 module src=${src2}`);
  }
  console.log(`[${tag}${reload ? '+刷新' : ''}]`, loaded.join(' | ') || '(零)');
  await page.close();
}
await visit2('B-第一导航(用户所说「第一次进去」)', true);
const swState = await browser2.newPage().then(async (p) => {
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const s = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? { active: reg.active?.scriptURL, waiting: !!reg.waiting, controlling: !!navigator.serviceWorker.controller } : null;
  });
  await p.close(); return s;
});
console.log('SW 状态:', JSON.stringify(swState));
await browser2.close();
server.close();
process.exit(0);
