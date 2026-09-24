// ★BJ331 主案复现：seed 152394290 / 8400×2400 大世界 真生成+进入——捕 `amount is not defined`。
// 源码态(vite dev)先行：若复现 → stack 可读直接定位文件:行。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5206';
const SEED = process.env.BJ331_SEED ?? '152394290';
const W = Number(process.env.BJ331_W ?? 8400);
const H = Number(process.env.BJ331_H ?? 2400);
const POST_ENTER_MS = Number(process.env.BJ331_POST ?? 15000);

const browser = await puppeteer.launch({
  protocolTimeout: 900000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--js-flags=--max-old-space-size=4096'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
const stalls = [];
let crashed = false;
page.on('pageerror', (e) => {
  const msg = String(e.message ?? e);
  errs.push({ msg: msg.slice(0, 300), stack: String(e.stack ?? '').slice(0, 2000) });
  if (/amount is not defined|帧循环异常/i.test(msg)) crashed = true;
  console.log('[PAGEERROR]', msg.slice(0, 400));
  if (/amount/i.test(msg)) console.log('[PAGEERROR-STACK]\n' + String(e.stack ?? '').slice(0, 2000));
});
page.on('console', async (m) => {
  const texts = await Promise.all(m.args().map((a) => a.jsonValue().then((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))).catch(() => '<unserializable>')));
  const line = `${m.type()}: ${texts.join(' ')}`;
  if (/卡死|worldGen.*超时|回退|fallback|amount|帧循环/i.test(line)) {
    stalls.push(line.slice(0, 400));
    console.log('[console]', line.slice(0, 400));
  }
});
page.on('worker', (w) => console.log('[worker spawn]', w.url().slice(-60)));

const t0 = Date.now();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
console.log('[probe] menu ok', Date.now() - t0, 'ms');

// 隐藏启动遮罩,走真实 newWorld 桥(=生成+进入全链)
await page.evaluate(() => {
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
console.log('[probe] starting real worldgen', `${W}x${H}`, 'seed', SEED);
const genP = page.evaluate(async (seed, w, h) => {
  await window.__swFlow.newWorld(seed, w, h);
  return 'newWorld-resolved';
}, SEED, W, H).catch((e) => 'newWorld-threw: ' + String(e).slice(0, 300));

// 轮询等待进入(不阻塞 pageerror 捕获)
let entered = false;
for (let i = 0; i < 1200; i++) { // 最多 10 分钟
  await new Promise((r) => setTimeout(r, 500));
  const st = await page.evaluate(() => ({
    world: !!window.__swGame?.world,
    player: !!window.__swGame?.player,
    w: window.__swGame?.world?.w ?? 0,
    h: window.__swGame?.world?.h ?? 0,
    tick: window.__swGame?.tickCount ?? -1,
    dead: window.__swGame ? 'game-present' : 'no-game',
  })).catch(() => null);
  if (st && i % 20 === 0) console.log('[probe]', Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(st));
  if (crashed) break;
  if (st?.world && st?.player) { entered = true; console.log('[probe] ENTERED at', Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(st)); break; }
}

// 进入后再观察一段时间（崩溃可能在进入后数秒才炸）
if (entered && !crashed) {
  console.log('[probe] post-enter observation', POST_ENTER_MS, 'ms');
  const endAt = Date.now() + POST_ENTER_MS;
  while (Date.now() < endAt && !crashed) await new Promise((r) => setTimeout(r, 1000));
}

const finalState = await page.evaluate(() => {
  const g = window.__swGame;
  if (!g) return { game: false };
  return {
    game: true, tick: g.tickCount, w: g.world?.w, h: g.world?.h,
    entities: g.entities?.total ?? -1,
    fps: g.perf?.fps ?? null,
    player: g.player ? { x: g.player.x, y: g.player.y, dead: g.player.dead } : null,
  };
}).catch((e) => ({ evalErr: String(e).slice(0, 200) }));

console.log('[probe] newWorldP:', await genP);
console.log('[probe] entered:', entered, 'crashed:', crashed);
console.log('[probe] finalState:', JSON.stringify(finalState));
console.log('[probe] pageerrors:', errs.length, JSON.stringify(errs.slice(0, 5), null, 1));
console.log('[probe] stallLines:', stalls.length);
await browser.close().catch(() => {});
process.exit(0);
