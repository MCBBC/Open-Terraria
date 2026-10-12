// Lights And Shadows 探针 v12:湿淋淋世界 A/B 判别(abOldGodray on/off)+缓冲读回。
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
const WLD = process.env.LAS_WLD || '/Users/vinlic/Downloads/湿淋淋的谨慎小块田地 (1).wld';
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
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
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

// ---- A/B 判别:abOldGodray off(新数学,预期翻转?)→ on(旧数学,预期正) ----
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
  return { tag: t, top, bot, verdict: top >= bot ? 'upright' : 'FLIPPED?' };
}, tag);

const glDump = (tag) => page.evaluate((t) => {
  const g = window.__swGame;
  const pipe = g.renderer?.swPipe;
  const gl = pipe?.glx;
  if (!gl) return { tag: t, err: 'no-gl' };
  const stat = (name) => {
    const f = pipe.fbos?.get?.(name);
    if (!f?.fbo) return { err: `no-${name}` };
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
    const w = Math.min(f.w, 120), h = Math.min(f.h, 68);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let mn = 1, mx = 0, sum = 0, n = 0, nan = 0;
    for (let i = 0; i < px.length; i += 4) {
      const v = px[i] / 255;
      mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; n++;
    }
    return { mn: +mn.toFixed(3), mx: +mx.toFixed(3), avg: +(sum / n).toFixed(4) };
  };
  const err = gl.getError();
  return { tag: t, glErr: err, godray: stat('las_godray'), ambient: stat('las_ambient'), lit: stat('las_lit') };
}, tag);


// 运行时 override:劫持 exec 读的 config——不可达,改走真实通道:store kv+reload 慢。
// 直接方案:hooks._resetModHooksForTests + 重新注册一个引用旧/新程序的 pass 不可达
// (程序在 mod 闭包里)→ 最实用:两次页面生命周期,浏览器 profile 的 kv 先写后 reload。
const kvToggle = async (on) => {
  await page.evaluate(async (v) => {
    const { kvGet, kvSet } = await import('/src/save/KvStore.ts');
    const cur = JSON.parse((await kvGet('sw.mods.config.lights_and_shadows')) || '{}');
    cur.abOldGodray = v;
    await kvSet('sw.mods.config.lights_and_shadows', JSON.stringify(cur));
  }, on);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => !!window.__swGame?.world, { timeout: 120000, polling: 1500 }).catch(() => { });
  await new Promise((r) => setTimeout(r, 3000));
};

await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  g.player.vx = 0; g.player.vy = 0;
});
await new Promise((r) => setTimeout(r, 2000));
log(`AB-off(新数学): ${JSON.stringify(await orient('new'))}`);
log(`dump: ${JSON.stringify(await glDump('new'))}`);
await page.screenshot({ path: `${SHOT}/v12-ab-off.png` });

await kvToggle(true);
log(`AB-on(旧数学): ${JSON.stringify(await orient('old'))}`);
log(`dump: ${JSON.stringify(await glDump('old'))}`);
await page.screenshot({ path: `${SHOT}/v12-ab-on.png` });

await kvToggle(false);
log(`AB-off again: ${JSON.stringify(await orient('new2'))}`);
await page.screenshot({ path: `${SHOT}/v12-ab-off2.png` });

await browser.close();
log('PROBE10-DONE');
process.exit(0);
