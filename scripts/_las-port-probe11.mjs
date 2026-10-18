// Lights And Shadows 探针 v11:7d 入口 CTM 变换监视 + 新旧 godray A/B。
// 假说:世界绘制段 save/restore 失衡泄漏 CTM→7d 全幅 drawImage 在泄漏变换下
// 出翻转;mod 常驻链把它从"滤镜帧偶发"放大成"每帧必现"。
import { DOWNLOADS, needInput } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { zipSync } = require('fflate');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const WLD = process.env.LAS_WLD || needInput(join(DOWNLOADS, '十周年纪念种子 (3).wld'));
const SHOT = '/tmp/las-shots';
fs.mkdirSync(SHOT, { recursive: true });
const LOG = fs.openSync('/tmp/las-probe11.log', 'w');
const log = (t) => { fs.writeSync(LOG, t + '\n'); console.log(t); };

const modDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mods', 'lights-and-shadows');
const walk = (dir, rel = '', out = {}) => {
  for (const name of fs.readdirSync(join(dir, rel))) {
    const p = rel ? `${rel}/${name}` : name;
    if (fs.statSync(join(dir, p)).isDirectory()) { walk(dir, p, out); continue; }
    if (p === 'PORTING.md' || p.startsWith('reference/')) continue;
    out[p] = new Uint8Array(fs.readFileSync(join(dir, p)));
  }
  return out;
};
const zipBytes = zipSync(walk(modDir));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: false, protocolTimeout: 600000,
  userDataDir: '/tmp/las-profile11-' + Date.now() % 100000,
  args: ['--no-proxy-server'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => log(`PAGE-EXC ${String(e).slice(0, 300)}`));
page.on('console', (m) => {
  const t = m.text();
  if (/lights_and_shadows|编译失败|链接失败|las/i.test(t)) log(`PAGE: ${t.slice(0, 240)}`);
});

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
await page.evaluate(async (bytes) => {
  await globalThis.__swMods.install(new Uint8Array(bytes));
}, Array.from(zipBytes));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
log('load ok');

await page.waitForFunction(() => document.body && document.body.innerText.includes('单人模式'), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
const clickText0 = (txt) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === t && e.offsetParent);
  if (!els.length) return false;
  els[els.length - 1].click();
  return true;
}, txt);
await clickText0('单人模式');
await new Promise((r) => setTimeout(r, 1500));
await clickText0('新建');
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const b = document.querySelector('[data-act="create"]');
  if (b && b.offsetParent) b.click();
});
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const row = document.querySelector('.sw-vitem.sw-vpanel-item');
  if (row && row.offsetParent) row.click();
});
await new Promise((r) => setTimeout(r, 1500));
const importBtns = await page.$$('[data-act="import"]');
await importBtns[importBtns.length - 1].click();
await new Promise((r) => setTimeout(r, 1000));
const fins = await page.$$('input[type=file]');
await fins[fins.length - 1].uploadFile(WLD);
let imported = false;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  if ((await page.$$('.sw-vsel .sw-vitem')).length > 0) { imported = true; break; }
}
if (!imported) { log('FATAL: 导入超时'); process.exit(1); }
log('imported');
const items = await page.$$('.sw-vsel .sw-vitem');
const imgs = await items[0].$$('.sw-vitem-btns img');
for (const img of imgs) {
  const src = await img.evaluate((e) => e.getAttribute('src') ?? '');
  if (src.includes('UI_ButtonPlay')) {
    await (await img.evaluateHandle((e) => e.parentElement ?? e)).asElement()?.click();
    break;
  }
}
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w && !!window.__swGame?.player, { timeout: 300000, polling: 2000 });
await new Promise((r) => setTimeout(r, 5000));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === '我已知晓' && e.offsetParent);
  if (btns.length) btns[btns.length - 1].click();
});
await new Promise((r) => setTimeout(r, 1000));
log('IN-GAME');

// ---- CTM 变换监视:包 drawScreenFilterChain,非恒等矩阵即记账 ----
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const orig = r.drawScreenFilterChain.bind(r);
  window.__lasTfLog = [];
  window.__lasTfFrames = 0;
  r.drawScreenFilterChain = function (ctx, ...args) {
    window.__lasTfFrames++;
    try {
      const m = ctx.getTransform();
      if (m.a !== 1 || m.b !== 0 || m.c !== 0 || m.d !== 1 || m.e !== 0 || m.f !== 0) {
        if (window.__lasTfLog.length < 12) {
          window.__lasTfLog.push({ a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f,
            frame: window.__lasTfFrames });
        }
      }
    } catch { /* ignore */ }
    return orig(ctx, ...args);
  };
});
log('CTM watch armed');

await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 1500));
});
await new Promise((r) => setTimeout(r, 1000));
const tfRead = () => page.evaluate(() => ({ frames: window.__lasTfFrames, nonIdentity: window.__lasTfLog }));
log(`noon watch: ${JSON.stringify(await tfRead())}`);
await page.screenshot({ path: `${SHOT}/v11-noon.png` });

// 时段扫描 + 向西游走(用户位置:出生点西 115 英尺≈西 74 tile)
await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.4444;
  // 出生点向西
  const gl = g.world.groundLevel ?? 300;
  g.player.x = Math.floor(g.world.store.w / 2) * 16 - 74 * 16;
  g.player.y = (gl - 6) * 16;
  g.player.vy = 0; g.player.vx = 0;
  await new Promise((r) => setTimeout(r, 1800));
});
await new Promise((r) => setTimeout(r, 800));
log(`t1040-west: ${JSON.stringify(await tfRead())}`);
await page.screenshot({ path: `${SHOT}/v11-west.png` });

await page.evaluate(async () => {
  const g = window.__swGame;
  for (const t of [0.3, 0.7, 0.9]) {
    g.world.clock.timeOfDay = t;
    await new Promise((r) => setTimeout(r, 600));
  }
  g.world.clock.timeOfDay = 0.5;
});
await new Promise((r) => setTimeout(r, 1500));
log(`sweep watch: ${JSON.stringify(await tfRead())}`);

// 血月+雨(事件态)
await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.bloodMoon = true;
  if (g.world.weather) g.world.weather.raining = true;
  await new Promise((r) => setTimeout(r, 2000));
});
log(`events watch: ${JSON.stringify(await tfRead())}`);
await page.screenshot({ path: `${SHOT}/v11-events.png` });

await browser.close();
log('PROBE11-DONE');
process.exit(0);
