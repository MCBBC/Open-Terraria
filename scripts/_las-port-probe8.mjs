// Lights And Shadows 探针 v8:gravDir=−1(重力翻转)× mod 常驻链 复现。
// 用户症状(世界翻转+效果消失)疑为原版 Gravity View 翻转与常驻滤镜链交互。
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
const LOG = fs.openSync('/tmp/las-probe8.log', 'w');
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
  userDataDir: '/tmp/las-profile8-' + Date.now() % 100000,
  args: ['--no-proxy-server'],
  defaultViewport: { width: 1600, height: 900 },
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

const state = () => page.evaluate(() => {
  const g = window.__swGame;
  return {
    sfx: g.renderer?.sfxPathUsed, gravDir: g.player?.gravDir, flipY: g.renderer?.cam?.flipY,
    composited: g.renderer?._c10eComposited, c10eFrame: g.renderer?._c10eFrame,
  };
});

// 基线(gravDir=1)
await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 1500));
});
await new Promise((r) => setTimeout(r, 800));
log(`S1 normal: ${JSON.stringify(await state())}`);
await page.screenshot({ path: `${SHOT}/v8-s1-normal.png` });

// gravDir=−1(mod 在链) —— 用户场景(forcedGravityT=每 tick 强制翻转的正确入口)
await page.evaluate(async () => {
  const g = window.__swGame;
  g.player.forcedGravityT = 1000000;
  await new Promise((r) => setTimeout(r, 2000));
});
log(`S2 gravDir=-1 (mod on): ${JSON.stringify(await state())}`);
await page.screenshot({ path: `${SHOT}/v8-s2-gravity-mod.png` });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${SHOT}/v8-s2-gravity-mod-2.png` });

// 对照:gravDir=−1 + mod 摘除(引擎自身翻转基线)
await page.evaluate(async () => {
  const h = await import('/src/mods/hooks.ts');
  h._resetModHooksForTests();
});
await new Promise((r) => setTimeout(r, 1500));
log(`S3 gravDir=-1 (mod off): ${JSON.stringify(await state())}`);
await page.screenshot({ path: `${SHOT}/v8-s3-gravity-nomod.png` });

await browser.close();
log('PROBE8-DONE');
process.exit(0);
