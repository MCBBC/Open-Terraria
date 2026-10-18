// BJ253 诊断2:主循环路径实证——弹生成后让 rAF 主循环跑,枚举 drops 全体+inv 槽
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const MAP = needInput(join(DOWNLOADS, 'map-Starter_World (12).json'));
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* noop */ } });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp menu failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  void window.__swLoadJson(t).catch(() => {});
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
}, mapText);
await page.waitForFunction(() => window.__swGame?.world && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

// 生成弹(在开阔空中),不动它,让主循环跑
await page.evaluate(async () => {
  const g = window.__swGame;
  const { CoinPortalProj } = await import('/src/entities/CoinPortalProj.ts');
  const p = new CoinPortalProj(g.player.cx + 400, g.player.cy - 300);
  window.__bj253p = p;
  g.entities.add(p, 'projectiles');
});
await new Promise((r) => setTimeout(r, 3000));
const mid = await page.evaluate(() => {
  const g = window.__swGame;
  const p = window.__bj253p;
  const dropsAll = g.entities.drops.map((d) => d.itemId);
  return {
    alive: !p.dead,
    projCount: g.entities.projectiles.length,
    dropsAll: dropsAll.slice(0, 30),
    dropsN: dropsAll.length,
  };
});
console.log('MID(3s)', JSON.stringify(mid));
await new Promise((r) => setTimeout(r, 5000));
const fin = await page.evaluate(() => {
  const g = window.__swGame;
  const dropsAll = g.entities.drops.map((d) => ({ id: d.itemId, n: d.n }));
  const goldIds = new Set();
  for (const [k, id] of Object.entries(window.__swITEMS ?? {})) if (/^vi_73_/.test(k)) goldIds.add(id);
  let invGold = 0;
  const slots = g.player.inv.slots.map((s) => s ? { id: s.id, n: s.stack } : null);
  for (const s of slots) if (s && goldIds.has(s.id)) invGold += s.n;
  return {
    alive: !window.__bj253p.dead,
    dropsAll: dropsAll.slice(0, 30),
    dropsN: dropsAll.length,
    invGold,
    goldSlots: slots.filter((s) => s && goldIds.has(s.id)),
    playerPos: { x: Math.round(g.player.cx), y: Math.round(g.player.cy) },
  };
});
console.log('FIN(8s)', JSON.stringify(fin));
await browser.close().catch(() => {});
process.exit(0);
