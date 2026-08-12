// M4 验收（DOM 流程版）：标题 → 角色列表 → 世界列表 → 建世界 → 生成页（双进度条+实时地图预览）→ 进游戏
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.URL || '' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelector('.sw-title-menu'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));

mkdirSync('shots', { recursive: true });

// 标题 → 角色列表（DOM）
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 800));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 800));
}
// 点角色 → 世界列表（DOM）
await page.click('.sw-item');
await page.waitForFunction(() => {
  const t = document.querySelector('.sw-list-title');
  return t && t.textContent === '选择世界';
}, { timeout: 10000 });
await new Promise((r) => setTimeout(r, 800));

// 新建世界（DOM）→ 小 → 创建
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise((r) => setTimeout(r, 200));
await page.click('[data-act=create]');

// 生成页（VUI）+ 预览
await page.waitForFunction(() => window.__swVUI?.ui?.current?.constructor?.name === 'UIWorldLoadState', { timeout: 10000 });
await page.waitForFunction(() => window.__swVUI.ui.current && window.__swVUI.ui.current.hasPreview === true, { timeout: 30000 });
const sample = () => page.evaluate(() => {
  const st = window.__swVUI.ui.current;
  if (!st) return null;
  const prev = st.children.find((c) => c.constructor.name === 'GenWorldPreview');
  const d = prev ? prev.getDimensions() : null;
  return {
    pct: st.pct, header: st.header.text, hasPreview: st.hasPreview,
    preview: d ? { x: Math.round(d.x), y: Math.round(d.y), w: Math.round(d.width), h: Math.round(d.height) } : null,
  };
});
await page.screenshot({ path: 'shots/m4-1-gen-early.png' });
const early = await sample();
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: 'shots/m4-2-gen-mid.png' });
const mid = await sample();

await page.waitForFunction(() => window.__swGame && window.__swGame.player, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 2000));
await page.screenshot({ path: 'shots/m4-3-ingame.png' });

const final = await page.evaluate(() => ({
  inGame: !!window.__swGame,
  worldSize: window.__swGame ? [window.__swGame.world.w, window.__swGame.world.h] : null,
}));
console.log('early:', JSON.stringify(early));
console.log('mid:  ', JSON.stringify(mid));
console.log('final:', JSON.stringify(final));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
const ok = errors.length === 0 && final.inGame && early && early.preview;
if (!ok) { console.error('GEN PREVIEW SMOKE FAILED'); process.exit(1); }
console.log('GEN PREVIEW SMOKE OK');
