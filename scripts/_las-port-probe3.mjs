// Lights And Shadows 探针 v3:树影验证(godray pow³ 修正后)。
// 出生点树林正午,同机位 A/B(hooks 内存摘除),下半屏(地面/树区)像素差统计。
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
const LOG = fs.openSync('/tmp/las-probe3.log', 'w');
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
  userDataDir: '/tmp/las-profile3-' + Date.now() % 100000,
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

// 正午 + 静止(出生点=地表树林)
await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 2000));
});
await new Promise((r) => setTimeout(r, 1500));

// 下半屏像素指纹(地面/树区——影子出现区;跳过 UI 边缘)
const fpLower = () => page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')];
  for (const c of cs) {
    const ctx = c.getContext('2d');
    if (!ctx || c.width < 800) continue;
    const y0 = Math.floor(c.height * 0.55);
    const d = ctx.getImageData(0, y0, c.width, c.height - y0 - 40).data;
    let sum = 0, sat = 0, n = 0;
    for (let i = 0; i < d.length; i += 991) {
      sum += d[i] + d[i + 1] + d[i + 2];
      if (d[i] + d[i + 1] + d[i + 2] < 700) sat++;   // 非饱和像素占比
      n++;
    }
    return { sum, satPct: +(sat / n * 100).toFixed(1), n };
  }
  return { canvas: 'none' };
});
const onFp = await fpLower();
await page.screenshot({ path: `${SHOT}/v3-noon-on.png` });
const diagOn = await page.evaluate(() => ({
  sfx: window.__swGame?.renderer?.sfxPathUsed,
  stats: window.__swGame?.renderer?.sfxPathStats,
}));
log(`on: ${JSON.stringify(onFp)} ${JSON.stringify(diagOn)}`);

await page.evaluate(async () => {
  const h = await import('/src/mods/hooks.ts');
  h._resetModHooksForTests();
});
await new Promise((r) => setTimeout(r, 1200));
const offFp = await fpLower();
await page.screenshot({ path: `${SHOT}/v3-noon-off.png` });
log(`off: ${JSON.stringify(offFp)}`);
log(`diff: sumΔ=${Math.abs(onFp.sum - offFp.sum)} (${((Math.abs(onFp.sum - offFp.sum) / Math.max(1, offFp.sum)) * 100).toFixed(2)}%), satPct on=${onFp.satPct} off=${offFp.satPct}`);

await browser.close();
log('PROBE3-DONE');
process.exit(0);
