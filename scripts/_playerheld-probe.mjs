// 一次性:主角静持层级取证——火把(holdStyle=1)静持,验证手持物在身体之上
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1500);
// 火把(id=8)塞快捷栏 0 并选中 → holdStyle 1 静持恒显
const ok = await p.evaluate(() => {
  const g = window.__swGame;
  const inv = g.player.inv;
  inv.slots[0] = { id: 739, stack: 1 };
  inv.selected = 0;
  return { held: inv.heldItem()?.id };
});
console.log('STAFF:', JSON.stringify(ok));
await sleep(800);
const crop = await p.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  return { x: Math.max(0, Math.round(sx - 30)), y: Math.max(0, Math.round(sy - 65)), width: 70, height: 80 };
});
await p.screenshot({ path: `${OUT}/held-staff.png`, clip: crop });
console.log('DONE →', OUT);
await b.close();
