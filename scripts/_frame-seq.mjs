import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('http://localhost:5199/?play=small&fs=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
const seq = await page.evaluate(async () => {
  const g = window.__swGame;
  const npc = g.entities.npcs.find((n) => n.npcKey === 'merchant');
  if (!npc) return { err: 'no merchant' };
  npc.facing = 1; npc.wanderT = 100000;
  const frames = [];
  for (let i = 0; i < 200; i++) {
    frames.push({ f: npc.frame, vx: +npc.vx.toFixed(2) });
    await new Promise((r) => setTimeout(r, 50));
  }
  return frames;
});
if (seq.err) { console.log(JSON.stringify(seq)); process.exit(0); }
const vxMoving = seq.filter((s) => Math.abs(s.vx) > 0.1).map((s) => s.f);
const inRange = vxMoving.every((f) => f >= 2 && f <= 15);
console.log(JSON.stringify({ framesWhileMoving: vxMoving.join(','), allInRange2to15: inRange, uniq: [...new Set(seq.map((s) => s.f))].join(',') }));
await browser.close();
