// Lights And Shadows 探针 v4:godray 定量验证(readPixels las_godray FBO)+
// 正确画布指纹(glCanvas→scratch 2D)+树冠区裁剪截图。
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
const LOG = fs.openSync('/tmp/las-probe4.log', 'w');
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
  userDataDir: '/tmp/las-profile4-' + Date.now() % 100000,
  args: ['--no-proxy-server'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => log(`PAGE-EXC ${String(e).slice(0, 200)}`));
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
log(`load: ${JSON.stringify(await page.evaluate(() => {
  const r = globalThis.__swMods.result();
  return { errors: r.errors, ids: r.loaded.map((m) => m.manifest?.id) };
}))}`);

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

await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 2000));
});
await new Promise((r) => setTimeout(r, 1500));

// ---- 定量:readPixels las_godray / las_ambient(经 pipe.fbos,TS private 仅编译期) ----
const glProbe = () => page.evaluate(() => {
  const g = window.__swGame;
  const pipe = g.renderer?.swPipe;
  const gl = pipe?.glx;
  if (!gl) return { err: 'no-pipe' };
  const stat = (name) => {
    const f = pipe.fbos?.get?.(name);
    if (!f?.fbo) return { err: `no-${name}` };
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
    const w = Math.min(f.w, 160), h = Math.min(f.h, 90);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let max = 0, sum = 0, n = 0, big = 0;
    for (let i = 0; i < px.length; i += 4) {
      const v = px[i] / 255;
      if (v > max) max = v;
      sum += v; n++;
      if (v > 0.1) big++;
    }
    return { max: +max.toFixed(3), avg: +(sum / n).toFixed(4), over10Pct: +((big / n) * 100).toFixed(1) };
  };
  return {
    godray: stat('las_godray'),
    ambient: stat('las_ambient'),
    mask: stat('las_mask'),
    sun: (() => {
      const st = { screenY: g.renderer?.cam ? undefined : undefined };
      return undefined;
    })(),
  };
});
log(`gl-probe: ${JSON.stringify(await glProbe())}`);

// ---- 正确画布指纹:glCanvas → scratch drawImage → getImageData(下半屏) ----
const fpGL = () => page.evaluate(() => {
  const gc = document.getElementById('glCanvas')
    || [...document.querySelectorAll('canvas')].find((c) => { try { return !!c.getContext('webgl2'); } catch { return false; } });
  if (!gc) return { err: 'no-glcanvas' };
  const s = document.createElement('canvas');
  s.width = gc.width; s.height = gc.height;
  const ctx = s.getContext('2d');
  ctx.drawImage(gc, 0, 0);
  const y0 = Math.floor(s.height * 0.55);
  const d = ctx.getImageData(0, y0, s.width, s.height - y0 - 40).data;
  let sum = 0, n = 0;
  for (let i = 0; i < d.length; i += 991) { sum += d[i] + d[i + 1] + d[i + 2]; n++; }
  return { sum, n };
});
const onFp = await fpGL();
await page.screenshot({ path: `${SHOT}/v4-noon-on.png` });
log(`on-fp: ${JSON.stringify(onFp)}`);

await page.evaluate(async () => {
  const h = await import('/src/mods/hooks.ts');
  h._resetModHooksForTests();
});
await new Promise((r) => setTimeout(r, 1200));
const offFp = await fpGL();
await page.screenshot({ path: `${SHOT}/v4-noon-off.png` });
log(`off-fp: ${JSON.stringify(offFp)}`);
log(`diff: Δsum=${onFp.sum - offFp.sum} (${((Math.abs(onFp.sum - offFp.sum) / Math.max(1, offFp.sum)) * 100).toFixed(2)}%)`);

await browser.close();
log('PROBE4-DONE');
process.exit(0);
