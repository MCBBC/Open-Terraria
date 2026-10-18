// 烟囱闪烁 A/B 因果实验(自包含):起 dev → 载 FTW_V2 → 基线闪烁量 → 清壁炉 → 复测
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const PORT = process.env.SW_PORT || '5217';
const MAP = process.env.MAP || needInput(join(DOWNLOADS, 'map-FTW_V2 (10).json'));

const vite = spawn('npx', ['vite', '--port', PORT, '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, SW_NO_HMR: '1', SW_CACHE: '/tmp/sw-vite-' + PORT },
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 4000));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 200)));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate((t) => window.__swFlow.loadJson(t), fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 700));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const camX = g.player.cx - cv.width / 2, camY = g.player.cy - cv.height / 2;
  const sx = Math.round(4130 * 16 - camX), sy = Math.round(433 * 16 - camY);
  const cw = 64, chh = 80;
  const measure = async (label) => {
    const fr = [];
    for (let k = 0; k < 24; k++) {
      fr.push(ctx.getImageData(sx, sy, cw, chh).data.slice());
      await new Promise((r2) => setTimeout(r2, 33));
    }
    let flips = 0; const perFrame = [];
    for (let k = 1; k < fr.length; k++) {
      let c = 0;
      for (let o = 0; o < fr[k].length; o += 4) {
        if (Math.abs(fr[k][o] - fr[k - 1][o]) > 20 || Math.abs(fr[k][o + 1] - fr[k - 1][o + 1]) > 20 || Math.abs(fr[k][o + 2] - fr[k - 1][o + 2]) > 20) c++;
      }
      perFrame.push(c); flips += c;
    }
    console.log(`[${label}] 每帧变化:`, perFrame.join(','));
    return flips;
  };
  // 贴玩家到烟囱旁
  g.player.x = 4131 * 16 + 8; g.player.y = (437 - 3) * 16;
  g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
  await new Promise((r2) => setTimeout(r2, 800));
  const base = await measure('A 含壁炉');
  // 清壁炉
  for (let xx = 4130; xx <= 4132; xx++) for (let yy = 442; yy <= 443; yy++) g.world.store.setTile(xx, yy, 0);
  for (let k = 0; k < 30; k++) { g.fixedUpdate(1 / 60); g.postUpdate(); }
  const nofire = await measure('B 无壁炉');
  return { base, nofire };
});
console.log(JSON.stringify(out));
await browser.close();
vite.kill();
process.exit(out && out.nofire < out.base ? 0 : 1);
