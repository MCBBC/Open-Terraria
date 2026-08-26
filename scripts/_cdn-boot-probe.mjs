// 线上冷启动诊断(2026-08-26):sandbox.vinlic.com 全新访客视角,p0 小片
// (过渡图+标题曲)未落地的断链定位。产出:网络时序(zip 分片请求/console 错误/
// SW 状态/Cache API 条目与哨兵键)。一次加载=裸窗口,再 reload 让 SW 接管。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'https://sandbox.vinlic.com';
mkdirSync('/tmp/cdn-boot-probe', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  ...(process.env.SW_USERDIR ? { userDataDir: process.env.SW_USERDIR } : {}),
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const net = [];
const errors = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning') errors.push(`[${t}] ${m.text().slice(0, 300)}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${String(e).slice(0, 300)}`));
page.on('request', (r) => net.push({ t: Date.now(), ph: '', url: r.url(), st: '', bytes: 0 }));
page.on('response', async (res) => {
  const it = [...net].reverse().find((x) => x.url === res.request().url() && x.st === '');
  if (!it) return;
  it.st = res.status();
  it.bytes = (res.headers()['content-length'] ? +res.headers()['content-length'] : 0);
});

const dump = async (tag) => {
  const info = await page.evaluate(async () => {
    const swReg = await navigator.serviceWorker.getRegistration().catch(() => null);
    const keys = await caches.keys().catch(() => []);
    const detail = {};
    for (const k of keys) {
      try {
        const c = await caches.open(k);
        const all = await c.keys();
        const sentinel = {};
        for (const want of ['audios/music/Music_50.mp3', 'audios/music/Music_51.mp3', 'sprites/vanilla-ui/Fonts.png']) {
          sentinel[want] = !!(await c.match(want));
        }
        // 首尾样例键各2条,便于核对命名空间形态
        detail[k] = { entries: all.length, sample: all.slice(0, 2).map((r) => new URL(r.url).pathname), sentinel };
      } catch (e) { detail[k] = String(e); }
    }
    return {
      controller: !!navigator.serviceWorker.controller,
      regActive: swReg?.active?.scriptURL ?? null,
      regWaiting: swReg?.waiting?.scriptURL ?? null,
      scope: swReg?.scope ?? null,
      storage: Object.keys(detail).length ? detail : '(no caches)',
    };
  }).catch((e) => ({ evalErr: String(e) }));
  console.log(`\n===== ${tag} =====`);
  console.log(JSON.stringify(info, null, 1));
};

// —— 第一访:冷态全新 profile,SW 未注册,观察裸窗口 6s ——
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(6000);
await dump('第一访后(t≈6s,裸窗口)');
// reload 让 SW 安装并接管
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await sleep(Number(process.env.SW_WAIT ?? 20000));
await dump(`reload 后 ${Number(process.env.SW_WAIT ?? 20000) / 1000}s(SW 接管,warm 进行中)`);

console.log('\n===== zip 分片请求 ====');
for (const n of net.filter((x) => x.url.includes('/assets-zip/'))) {
  console.log(` ${n.st || '..'} ${(n.bytes / 1048576).toFixed(1)}MB ${n.url.split('/')[-1]}`);
}
const zips = net.filter((x) => x.url.includes('/assets-zip/') && /\.zip/.test(x.url));
console.log(`zip 片请求数=${zips.length},总字节=${(zips.reduce((a, b) => a + b.bytes, 0) / 1048576).toFixed(1)}MB`);

console.log('\n===== console error/warn(前 20)====');
for (const e of errors.slice(0, 20)) console.log(' ', e);

await browser.close();
process.exit(0);
