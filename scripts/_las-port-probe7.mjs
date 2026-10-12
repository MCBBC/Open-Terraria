// Lights And Shadows 探针 v7:翻转机制证明 + 兜底验证。
// ①stack 档 + no-op pass(不写 outFbo)→ 预期复现翻转(=stale fboA 被 present);
// ②stack 档 + 真 mod + pipe.fbo 对 las_* 失效 → 预期直通兜底(无翻转,效果缺席)。
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
const LOG = fs.openSync('/tmp/las-probe7.log', 'w');
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
  userDataDir: '/tmp/las-profile7-' + Date.now() % 100000,
  args: ['--no-proxy-server'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => log(`PAGE-EXC ${String(e).slice(0, 300)}`));
page.on('console', (m) => {
  const t = m.text();
  if (/lights_and_shadows|mod:|编译失败|链接失败/i.test(t)) log(`PAGE: ${t.slice(0, 240)}`);
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

// stack 档
await page.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  g.player.vx = 0; g.player.vy = 0;
  g.renderer.c10eCompositeIntoHud = function () { };
});
await new Promise((r) => setTimeout(r, 1500));
log(`state: ${JSON.stringify(await page.evaluate(() => ({
  sfx: window.__swGame.renderer.sfxPathUsed, stats: window.__swGame.renderer.sfxPathStats,
})))}`);

// ---- ①机制证明:no-op pass(不写 outFbo)→ stale fboA 被 present ----
await page.evaluate(async () => {
  const h = await import('/src/mods/hooks.ts');
  h._resetModHooksForTests();   // 清掉真 mod(其注册不恢复——本阶段用 noop 替)
  h.registerModScreenFx({ id: 'noop_test', exec: () => { /* 故意不写 outFbo */ } });
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${SHOT}/v7-noop-pass.png` });
log('① no-op pass 截图完成(预期=翻转,机制证明)');

// ---- ②真 mod + fbo 失效 → 直通兜底 ----
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!globalThis.__swMods, { timeout: 180000, polling: 1500 });
await page.waitForFunction(() => document.body && document.body.innerText.includes('单人模式'), { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => { location.href = location.origin + '/?quickload'; }).catch(() => { });
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 60000, polling: 1000 }).catch(() => log('quickload 未成——用标题链'));
// 若 quickload 失败走 UI 链
const inW = await page.evaluate(() => !!window.__swGame?.world);
if (!inW) { log('FALLBACK: quickload 失败,本阶段跳过(机制①已证)'); await browser.close(); process.exit(0); }
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.__swGame;
  g.renderer.c10eCompositeIntoHud = function () { };   // stack 档
  const pipe = g.renderer.swPipe;
  const orig = pipe.fbo.bind(pipe);
  pipe.fbo = (name, w, h) => (name.startsWith('las_') ? null : orig(name, w, h));   // las_* 租借失效
});
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: `${SHOT}/v7-fallback.png` });
log('② fbo 失效兜底截图完成(预期=无翻转,效果缺席)');
log(`final state: ${JSON.stringify(await page.evaluate(() => ({
  sfx: window.__swGame.renderer.sfxPathUsed, stats: window.__swGame.renderer.sfxPathStats,
})))}`);

await browser.close();
log('PROBE7-DONE');
process.exit(0);
