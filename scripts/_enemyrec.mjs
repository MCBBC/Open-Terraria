// enemyMove 录制验证：跑 90t 后读 recorder 环形缓冲，确认 enemyMove 事件落账
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = needInput(join(DOWNLOADS, 'map-害兽姐妹会.json'));
const json = fs.readFileSync(MAP, 'utf8');

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => window.__swFlow, { timeout: 60000 });

const out = await page.evaluate(async (text) => {
  await window.__swFlow.loadJson(text);
  const g = window.__swGame;
  const p = g.player;
  p.x = 49537 - p.w / 2; p.y = 3808 - p.h / 2; p.vx = 0; p.vy = 0;
  await window.__swFlow.spawnVanillaEnemy(1, 3094.5 * 16, 244.5 * 16);
  const slime = g.enemies().find((e) => e.vanillaId === 1 && !e.dead);
  if (slime) { slime.w = slime.def.width = 26; slime.h = slime.def.height = 20; }
  for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60);
  const rec = g.recorder;
  const probe = { key: slime.key, id: slime.id, defKey: slime.def.key, vanillaId: slime.vanillaId };
  const events = [];
  for (let i = 0; i < rec.total && i < rec.buf.length; i++) {
    const e = rec.buf[i % rec.buf.length];
    if (e && e.k === 'enemyMove') events.push(e);
  }
  return {
    enemyMoveCount: events.length,
    sample: events.slice(-4).map((e) => e.d),
    kinds: (() => { const m = {}; for (let i = 0; i < rec.total && i < rec.buf.length; i++) { const e = rec.buf[i % rec.buf.length]; if (e) m[e.k] = (m[e.k] || 0) + 1; } return m; })(),
  };
}, json);
console.log(JSON.stringify(out, null, 1));
await browser.close();
