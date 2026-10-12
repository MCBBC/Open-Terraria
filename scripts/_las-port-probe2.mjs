// Lights And Shadows 探针 v2:出生点地表(不传送),昼夜三档 + 同位 A/B 像素差。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_las-port-probe2.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { zipSync } = require('fflate');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const SHOT = '/tmp/las-shots';
fs.mkdirSync(SHOT, { recursive: true });
const LOG = fs.openSync('/tmp/las-probe2.log', 'w');
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
  userDataDir: '/tmp/las-profile2-' + Date.now() % 100000,
  args: ['--no-proxy-server'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => log(`PAGE-EXC ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  const t = m.text();
  if (/lights_and_shadows|GLPipeline.*las|sfx/i.test(t)) log(`PAGE: ${t.slice(0, 240)}`);
});

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
await page.evaluate(async (bytes) => {
  await globalThis.__swMods.install(new Uint8Array(bytes));
}, Array.from(zipBytes));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
const loadRes = await page.evaluate(() => {
  const r = globalThis.__swMods.result();
  return { errors: r.errors, ids: r.loaded.map((m) => m.manifest?.id) };
});
log(`load: ${JSON.stringify(loadRes)}`);

await page.waitForFunction(() => document.body && document.body.innerText.includes('单人模式'), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
const clickText = (txt) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === t && e.offsetParent);
  if (!els.length) return false;
  els[els.length - 1].click();
  return true;
}, txt);
await clickText('单人模式');
await new Promise((r) => setTimeout(r, 1200));
await clickText('新建');
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
await clickText('创建世界');
await new Promise((r) => setTimeout(r, 900));
await clickText('创建');
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w && !!window.__swGame?.player, { timeout: 420000, polling: 2000 });
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === '我已知晓' && e.offsetParent);
  if (btns.length) btns[btns.length - 1].click();
});
await new Promise((r) => setTimeout(r, 1000));
log('IN-GAME');

const setTime = async (tod) => {
  await page.evaluate(async (t) => {
    const g = window.__swGame;
    g.world.clock.timeOfDay = t;
    g.player.vx = 0; g.player.vy = 0;
    await new Promise((r) => setTimeout(r, 1800));
  }, tod);
  await new Promise((r) => setTimeout(r, 1200));
};
const diag = () => page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const ambOn = g.player.cy < g.world.groundLevel * 16 + 800;
  return {
    sfxPath: r?.sfxPathUsed, cots: r?.colorOfTheSkies,
    tod: +g.world.clock.timeOfDay.toFixed(3), isDay: g.world.clock.isDay,
    playerCy: Math.round(g.player.cy), groundLevel: g.world.groundLevel, ambOn,
    frame: g.renderer?.sfxPathStats?.pipe ?? 0,
  };
});

// ---- 正午 ----
await setTime(0.5);
log(`noon diag: ${JSON.stringify(await diag())}`);
await page.screenshot({ path: `${SHOT}/v2-noon.png` });
// ---- 午后(日光暖金 t≈0.8) ----
await setTime(0.72);
log(`afternoon diag: ${JSON.stringify(await diag())}`);
await page.screenshot({ path: `${SHOT}/v2-afternoon.png` });
// ---- 夜(月光) ----
await setTime(0.95);
log(`night diag: ${JSON.stringify(await diag())}`);
await page.screenshot({ path: `${SHOT}/v2-night.png` });

// ---- 回正午做同位 A/B ----
await setTime(0.5);
const fp = () => page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')];
  for (const c of cs) {
    const ctx = c.getContext('2d');
    if (!ctx || c.width < 800) continue;
    const d = ctx.getImageData(0, 0, c.width, Math.min(c.height, 600)).data;
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 997) { sum += d[i] + d[i + 1] + d[i + 2]; n++; }
    return { canvas: c.id || c.className || 'anon', sum, n };
  }
  return { canvas: 'none' };
});
const onFp = await fp();
await page.screenshot({ path: `${SHOT}/v2-ab-on.png` });
await page.evaluate(async () => {
  const h = await import('/src/mods/hooks.ts');
  h._resetModHooksForTests();
});
await new Promise((r) => setTimeout(r, 1200));
const offFp = await fp();
await page.screenshot({ path: `${SHOT}/v2-ab-off.png` });
const diagOff = await diag();
log(`ab: on-sum=${JSON.stringify(onFp)} off-sum=${JSON.stringify(offFp)} off-sfx=${diagOff.sfxPath}`);

// FPS 对比(off 态先测,再恢复 on)——同世界同机位
const fpsOf = () => page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const loop = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(loop); else res(n / 4); };
  requestAnimationFrame(loop);
}));
const fpsOff = await fpsOf();
log(`FPS mod-off: ${fpsOff.toFixed(1)}`);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
// quickload 回世界
await page.evaluate(() => { location.href = location.origin + '/?quickload'; });
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w && !!window.__swGame?.player, { timeout: 300000, polling: 2000 }).catch(() => log('quickload fail'));
const inWorld = await page.evaluate(() => !!window.__swGame?.world);
if (inWorld) {
  await setTime(0.5);
  const fpsOn = await fpsOf();
  const d = await diag();
  log(`FPS mod-on: ${fpsOn.toFixed(1)} (sfx=${d.sfxPath}, frames=${d.frame})`);
}
await browser.close();
log('PROBE2-DONE');
process.exit(0);
