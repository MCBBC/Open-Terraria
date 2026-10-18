// BJ253 诊断:页面运行时金币键/生成链逐环查
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

const diag = await page.evaluate(async () => {
  const out = {};
  // ① 模块运行时键值
  const itemsMod = await import('/src/data/items.ts');
  out.key73 = itemsMod.VANILLA_ITEM_KEY_BY_ID[73];
  out.key58 = itemsMod.VANILLA_ITEM_KEY_BY_ID[58];
  // ② 该键是否注册到 ITEM_BY_KEY（spawnDrop 门）
  const g = window.__swGame;
  const key = out.key73;
  out.spawnDropDirect = null;
  if (key) {
    const d = g.spawnDrop(g.player.cx, g.player.cy - 200, key, 1, 0, -2);
    out.spawnDropDirect = d ? { kind: 'drop', itemId: d.itemId, vid: d.itemId } : 'null';
  }
  // ③ CoinPortalProj 出币段源码面:直接 new 一个并推到 210 tick 数 spawnDrop 调用
  const { CoinPortalProj } = await import('/src/entities/CoinPortalProj.ts');
  let calls = 0;
  const spy = { spawnDrop: (...a) => { calls++; return g.spawnDrop(...a); }, spawnParticles: () => {} };
  const p = new CoinPortalProj(g.player.cx + 300, g.player.cy - 100);
  g.entities.add(p, 'projectiles');
  // 手动推 220 tick
  for (let t = 0; t < 220 && !p.dead; t++) p.fixedUpdate(1 / 60, spy);
  out.manualTicks = { calls, dead: p.dead, ai1: p['ai1'] };
  // ④ 直接移除该弹,避免污染
  p.dead = true;
  return out;
});
console.log(JSON.stringify(diag, null, 1));
await browser.close().catch(() => {});
process.exit(0);
