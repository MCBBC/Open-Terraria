// Lights And Shadows WebGL2 移植实机探针:装 mod→进世界→昼夜/地下截图→A/B 像素差→FPS。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_las-port-probe.mjs
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
const LOG = fs.openSync('/tmp/las-probe.log', 'w');
const log = (t) => { fs.writeSync(LOG, t + '\n'); console.log(t); };

// ---- 打包 mod 目录为 .swmod 字节 ----
const modDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'mods', 'lights-and-shadows');
const walk = (dir, rel = '', out = {}) => {
  for (const name of fs.readdirSync(join(dir, rel))) {
    const p = rel ? `${rel}/${name}` : name;
    if (fs.statSync(join(dir, p)).isDirectory()) { walk(dir, p, out); continue; }
    if (p === 'PORTING.md' || p.startsWith('reference/')) continue;   // 文档不入包(减包体)
    out[p] = new Uint8Array(fs.readFileSync(join(dir, p)));
  }
  return out;
};
const zipBytes = zipSync(walk(modDir));
log(`mod zip: ${zipBytes.length} bytes`);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  userDataDir: '/tmp/las-profile-' + Date.now() % 100000,
  args: ['--no-proxy-server', '--use-angle=metal'],   // 真实 GPU 面(Mac)
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => log(`PAGE-EXC ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  const t = m.text();
  if (/lights|Lights|mod:|GLPipeline|WebGL|sfx/i.test(t)) log(`PAGE: ${t.slice(0, 240)}`);
});

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
const gpu = await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (!gl) return 'NO-WEBGL2';
  return String(gl.getParameter(gl.RENDERER));
});
log(`GPU: ${gpu}`);

// ---- 安装 mod(内存 zip)→ 重载生效 ----
await page.evaluate(async (bytes) => {
  await globalThis.__swMods.install(new Uint8Array(bytes));
}, Array.from(zipBytes));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
const loadRes = await page.evaluate(() => {
  const r = globalThis.__swMods.result();
  return { errors: r.errors, loaded: r.loaded.map((m) => m.id ?? m) };
});
log(`load result: ${JSON.stringify(loadRes)}`);
if (!JSON.stringify(loadRes).includes('lights_and_shadows')) { log('FATAL: mod 未装载'); process.exit(1); }

// ---- 进世界(单人→新建→创建) ----
await page.waitForFunction(() => document.body && document.body.innerText.includes('单人模式'), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
const clickText = (txt) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === t && e.offsetParent);
  if (!els.length) return false;
  els[els.length - 1].click();
  return true;
}, txt);
log(`boot: ${await clickText('单人模式')}`);
await new Promise((r) => setTimeout(r, 1200));
log(`new: ${await clickText('新建')}`);
await new Promise((r) => setTimeout(r, 1500));
log(`create-char: ${await page.evaluate(() => {
  const b = document.querySelector('[data-act="create"]');
  if (b && b.offsetParent) { b.click(); return true; } return false;
})}`);
await new Promise((r) => setTimeout(r, 1500));
log(`char-row: ${await page.evaluate(() => {
  const row = document.querySelector('.sw-vitem.sw-vpanel-item');
  if (row && row.offsetParent) { row.click(); return true; } return false;
})}`);
await new Promise((r) => setTimeout(r, 1500));
log(`create-world: ${await clickText('创建世界')}`);
await new Promise((r) => setTimeout(r, 900));
log(`create-ok: ${await clickText('创建')}`);
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w && !!window.__swGame?.player, { timeout: 420000, polling: 2000 });
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button,div,span')].filter((e) => e.textContent?.trim() === '我已知晓' && e.offsetParent);
  if (btns.length) btns[btns.length - 1].click();
});
await new Promise((r) => setTimeout(r, 1000));
log('IN-GAME');

// ---- 场景驱动:正午地表(把玩家挪到地表开阔处) ----
const sceneInfo = await page.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = g.world.store;
  const surfaceY = Math.floor(g.world.groundLevel ?? st.h * 0.3);
  // 找中列地表:自上而下第一个实心 tile
  const cx = Math.floor(st.w / 2);
  let sy = 20;
  for (let y = 20; y < st.h - 20; y++) { if (st.solid?.(cx, y) ?? false) { sy = y; break; } }
  g.world.clock.timeOfDay = 0.5;   // 正午
  g.player.x = cx * 16;
  g.player.y = (sy - 4) * 16;
  g.player.vy = 0; g.player.vx = 0;
  await sleep(2500);
  return { cx, sy, groundLevel: g.world.groundLevel, time: g.world.clock.timeOfDay };
}).catch((e) => ({ err: String(e).slice(0, 160) }));
log(`scene: ${JSON.stringify(sceneInfo)}`);
await new Promise((r) => setTimeout(r, 2500));
const diag = await page.evaluate(() => {
  const r = window.__swGame?.renderer;
  return {
    sfxPath: r?.sfxPathUsed, pathStats: r?.sfxPathStats,
    colorOfTheSkies: r?.colorOfTheSkies, time: window.__swGame.world.clock.timeOfDay,
    isDay: window.__swGame.world.clock.isDay, moonPhase: window.__swGame.world.clock.moonPhase,
  };
});
log(`diag: ${JSON.stringify(diag)}`);
await page.screenshot({ path: `${SHOT}/day-noon.png` });

// ---- FPS 采样(管线全开) ----
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const loop = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(loop); else res(n / 3); };
  requestAnimationFrame(loop);
}));
log(`FPS(mod-on,noon): ${fps.toFixed(1)}`);

// ---- A/B:摘除 mod hook(内存态,_resetModHooksForTests;重载即恢复) ----
const abOn = await page.screenshot({ path: `${SHOT}/ab-on.png` });
log(`ab-on shot: ${abOn.length} bytes`);
await page.evaluate(async () => {
  const h = await import('/src/mods/hooks.ts');
  h._resetModHooksForTests();
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${SHOT}/ab-off.png` });
const fpsOff = await page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const loop = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(loop); else res(n / 3); };
  requestAnimationFrame(loop);
}));
log(`FPS(mod-off via hook reset): ${fpsOff.toFixed(1)}`);
const diagOff = await page.evaluate(() => ({ sfxPath: window.__swGame?.renderer?.sfxPathUsed }));
log(`diag-off: ${JSON.stringify(diagOff)}`);

// ---- 夜晚 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.95;   // 深夜
  await new Promise((r) => setTimeout(r, 2000));
});
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: `${SHOT}/night.png` });
const nightDiag = await page.evaluate(() => ({
  isDay: window.__swGame.world.clock.isDay, time: window.__swGame.world.clock.timeOfDay,
}));
log(`night: ${JSON.stringify(nightDiag)}`);

// ---- 黄昏(日落 godray 最强档) ----
await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.80;
  await new Promise((r) => setTimeout(r, 2000));
});
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: `${SHOT}/dusk.png` });

// ---- GL 资源账(管线 FBO/程序) ----
const glAccount = await page.evaluate(() => {
  const r = window.__swGame?.renderer;
  const stats = globalThis.__swRenderLog?.snap?.() ?? {};
  return { sfxPath: r?.sfxPathUsed, stats: Object.keys(stats).length };
});
log(`gl-account: ${JSON.stringify(glAccount)}`);

await browser.close();
log('PROBE-DONE');
fs.closeSync(LOG);
process.exit(0);
