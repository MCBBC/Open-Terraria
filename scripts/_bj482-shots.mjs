// ★BJ482 目检截图:默认面(修后) vs ?c10e=0 对照,露天正午库体特写。
// 用法: SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs scripts/_bj482-shots.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'game', 'docs', 'evidence', 'bj482');
mkdirSync(OUT, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(extra, name) {
  const page = await browser.newPage();
  await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5213') + '/?play=small' + extra,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  let inGame = false;
  for (let i = 0; i < 200 && !inGame; i++) {
    inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!inGame) await wait(1500);
  }
  for (let i = 0; i < 10; i++) {
    const hit = await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); return true; }
      }
      return false;
    });
    if (!hit) break;
    await wait(600);
  }
  await page.evaluate(async () => {
    const g = window.__swGame, p = g.player, st = g.world.store;
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    const VAULT = TILE_BY_KEY['v_491_void_vault'];
    // 正午锁定
    g.world.time = 27000 % 86400 ?? 27000;
    if (g.world.setTime) g.world.setTime(27000);
    const px0 = Math.floor(p.cx / 16) + 6;
    let gy = 4; for (; gy < 600 && !st.isSolid(px0 + 30, gy); gy++) {}
    const top = gy - 3;
    for (let yy = gy - 12; yy <= gy - 1; yy++) {
      for (let xx = px0 - 8; xx <= px0 + 10; xx++) st.setTileSilent(xx, yy, 0);
    }
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) st.setTileSilent(px0 + dx, top + dy, VAULT, dx * 18, dy * 18);
    }
    p.x = (px0 - 5) * 16; p.y = (gy - 4) * 16 - 20; p.vx = 0; p.vy = 0;
  });
  await wait(2500);
  await page.evaluate(() => {
    const g = window.__swGame, st = g.world.store, p = g.player;
    const px0 = Math.floor((p.x + 5 * 16) / 16);
    const cx = (px0 + 1) * 16 - 80, cy = p.y - 40;
    g.renderer.camera = g.renderer.camera ?? {};
  }).catch(() => {});
  await wait(500);
  await page.screenshot({ path: join(OUT, `bj482-visual-${name}.png`), encoding: 'binary' });
  console.log(`saved ${name}`);
  await page.close();
}
await shot('', 'c10e');
await shot('&c10e=0', 'ctrl');
await browser.close();
