// Lights And Shadows 探针 v5:复现"翻转+滤镜丢失"——mod pass 与原版滤镜共存
// (bloodMoon=true → FilterBloodMoon 入链=链长 2),分帧记录链路分档与朝向。
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
const LOG = fs.openSync('/tmp/las-probe5.log', 'w');
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
  userDataDir: '/tmp/las-profile5-' + Date.now() % 100000,
  args: ['--no-proxy-server'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => log(`PAGE-EXC ${String(e).slice(0, 300)}`));
page.on('console', (m) => {
  const t = m.text();
  if (/lights_and_shadows|编译失败|链接失败|sfx|GLScreenFilters/i.test(t)) log(`PAGE: ${t.slice(0, 240)}`);
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

// 链路分档仪表:包一层 GLScreenFilters 双入口 + 每帧 sfxPath 采样
await page.evaluate(() => {
  const w = globalThis.__lasPathLog = [];
  const orig = { pipe: 0, stack: 0, legacy: 0 };
  globalThis.__lasPathTally = orig;
});

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

const state = () => page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  return {
    sfx: r?.sfxPathUsed, c10eFrame: r?._c10eFrame, composited: r?._c10eComposited,
    lowK: r?._worldLowK, stackMode: r?.swPipe?.screenStackMode,
    stats: r?.sfxPathStats,
  };
});

// ---- 阶段 1:纯 mod(链长 1)基线 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  g.world.clock.bloodMoon = false;
  g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 1500));
});
await new Promise((r) => setTimeout(r, 1000));
log(`S1 state: ${JSON.stringify(await state())}`);
await page.screenshot({ path: `${SHOT}/v5-s1-modonly.png` });

// ---- 阶段 2:血月(原版 FilterBloodMoon 入链=链长 2)——用户场景复现 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.bloodMoon = true;   // dawn 清除前常驻;monoScan 每帧吃此旗
  await new Promise((r) => setTimeout(r, 2500));
});
log(`S2 state: ${JSON.stringify(await state())}`);
await page.screenshot({ path: `${SHOT}/v5-s2-bloodmoon.png` });
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: `${SHOT}/v5-s2-bloodmoon-2.png` });

// ---- 阶段 3:链路分档强制翻面(c10eChainSource 路径 vs 当前) ----
await page.evaluate(() => {
  const R = window.__swGame.renderer.constructor;
  R.c10eK1SetForTest(false);   // ?c10ek1=0 同:链源恒走折叠 scratch 路径
});
await new Promise((r) => setTimeout(r, 1500));
log(`S3(c10ek1=0) state: ${JSON.stringify(await state())}`);
await page.screenshot({ path: `${SHOT}/v5-s3-foldpath.png` });

// ---- 阶段 4:关血月回基线 ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.bloodMoon = false;
  const R = g.renderer.constructor;
  R.c10eK1SetForTest(true);
});
await new Promise((r) => setTimeout(r, 1500));
log(`S4 state: ${JSON.stringify(await state())}`);

await browser.close();
log('PROBE5-DONE');
process.exit(0);
