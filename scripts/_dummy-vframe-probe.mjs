import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const SAVE = needInput(join(DOWNLOADS, 'map-Starter_World (27).json'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
page.on('console', (m) => { if (m.text().includes('vframe') || m.text().includes('378')) console.log('[console]', m.text()); });
await page.goto(`${ORIGIN}/?play=small&beh=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1000));
const text = readFileSync(SAVE, 'utf8');
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, text);
await new Promise((r) => setTimeout(r, 2500));
const r = await page.evaluate(() => {
  const g = window.__swGame;
  const a = g.renderer.atlas;
  const out = { vframe378: null, vnpc488: null, ensureTiles378: null, tileMeta378: null };
  try { out.vframe378 = a.vframeAt(378, 0, 0); } catch (e) { out.vframe378 = 'THROW ' + e.message; }
  try { const im = a.ensureVImage('vanilla/Tiles_378.png'); out.ensureTiles378 = im ? { w: im.width, h: im.height } : null; } catch (e) { out.ensureTiles378 = 'THROW ' + e.message; }
  try { out.vnpc488 = a.vnpc(488, 0); } catch (e) { out.vnpc488 = 'THROW ' + e.message; }
  try { out.tileMeta378 = a.meta?.tiles?.['378'] ?? (a.tileMeta ? 'has tileMeta' : 'no tileMeta field'); } catch (e) { out.tileMeta378 = 'THROW'; }
  return out;
});
console.log('图集探针:', JSON.stringify(r, (k, v) => v instanceof HTMLCanvasElement ? 'canvas' : (v instanceof HTMLImageElement ? `img ${v.width}x${v.height}` : v)).slice(0, 400));
await browser.close();
