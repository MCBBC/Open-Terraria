// Lights And Shadows 探针 v10:翻转触发条件扫描(用户十周年世界)。
// 维度:时段×位置×天气×DPR;方向判定=太阳在画面上/下半(正午太阳应在上)。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { zipSync } = require('fflate');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const WLD = process.env.LAS_WLD || '/Users/vinlic/Downloads/十周年纪念种子 (3).wld';
const DPR = Number(process.env.LAS_DPR || '1');
const SHOT = '/tmp/las-shots';
fs.mkdirSync(SHOT, { recursive: true });
const LOG = fs.openSync('/tmp/las-probe10.log', 'w');
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
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  userDataDir: '/tmp/las-profile10-' + Date.now() % 100000,
  args: ['--no-proxy-server'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: DPR },
});
const page = await browser.newPage();
page.on('pageerror', (e) => log(`PAGE-EXC ${String(e).slice(0, 300)}`));
page.on('console', (m) => {
  const t = m.text();
  if (/lights_and_shadows|编译失败|链接失败/i.test(t)) log(`PAGE: ${t.slice(0, 240)}`);
});

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
await page.evaluate(async (bytes) => {
  await globalThis.__swMods.install(new Uint8Array(bytes));
}, Array.from(zipBytes));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
log(`load ok, DPR=${DPR}`);

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

// 方向判定:glCanvas→scratch,上半 vs 下半平均亮度(正午太阳在上=上亮;
// 且取天空区:排除 UI 区用 x 中带)。翻转时下亮。
const orient = (tag) => page.evaluate((t) => {
  const gc = document.getElementById('glCanvas')
    || [...document.querySelectorAll('canvas')].find((c) => { try { return !!c.getContext('webgl2'); } catch { return false; } });
  if (!gc || gc.width < 100) return { tag: t, err: 'no-glcanvas' };
  const s = document.createElement('canvas');
  s.width = gc.width; s.height = gc.height;
  const ctx = s.getContext('2d');
  ctx.drawImage(gc, 0, 0);
  const w = s.width, h = s.height;
  const band = (y0, y1) => {
    const d = ctx.getImageData(Math.floor(w * 0.35), y0, Math.floor(w * 0.3), y1 - y0).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 1013) sum += d[i] + d[i + 1] + d[i + 2];
    return sum;
  };
  const top = band(0, Math.floor(h * 0.3));
  const bot = band(Math.floor(h * 0.7), h - 1);
  const g = window.__swGame;
  const r = g.renderer;
  return {
    tag: t, top, bot, verdict: top >= bot ? 'upright' : 'FLIPPED?',
    tod: +g.world.clock.timeOfDay.toFixed(3), sfx: r?.sfxPathUsed,
    c10eFrame: r?._c10eFrame, aurora: !!r?.sky?.aurora?.tileColorState?.(),
    dpr: window.devicePixelRatio, cw: gc.width, ch: gc.height,
    weather: g.world?.weather?.raining ?? '?',
  };
}, tag);

// 扫描:正午出生点 → 10:40 → 黄昏 → 夜 → 雨天 → 地下边缘
const run = async (label, mutate) => {
  await page.evaluate(mutate);
  await new Promise((r) => setTimeout(r, 2000));
  const o = await orient(label);
  log(`${label}: ${JSON.stringify(o)}`);
};
await run('noon-spawn', async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5; g.player.vx = 0; g.player.vy = 0;
});
await run('t1040-spawn', async () => { window.__swGame.world.clock.timeOfDay = 0.4444; });
await run('dusk-spawn', async () => { window.__swGame.world.clock.timeOfDay = 0.78; });
await run('night-spawn', async () => { window.__swGame.world.clock.timeOfDay = 0.95; });
await run('noon-rain', async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  if (g.world.weather) { g.world.weather.raining = true; }
});
await run('noon-underground-edge', async () => {
  const g = window.__swGame;
  g.world.weather.raining = false;
  const gl = g.world.groundLevel ?? 300;
  g.player.x = Math.floor(g.world.store.w / 2) * 16;
  g.player.y = (gl + 40) * 16;
  g.player.vy = 0; g.player.vx = 0;
});
await run('noon-surface-back', async () => {
  const g = window.__swGame;
  const gl = g.world.groundLevel ?? 300;
  g.player.y = (gl - 6) * 16;
  g.player.vy = 0; g.player.vx = 0;
});

await browser.close();
log('PROBE10-DONE');
process.exit(0);
