// 一次性:冰川之牙(6153,useStyle5 魔法)挥舞层级+持位取证——新代码上复现用户场景
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1200);
// 冰川之牙塞槽 0 选中;鼠标置角色右上方(举杖朝向);mouseDown 边沿+按住
const setup = await p.evaluate(() => {
  const g = window.__swGame;
  const inv = g.player.inv;
  inv.slots[0] = { id: 6153, stack: 1 }; g.player.mana = 200; g.player.baseMaxMana = 200;
  inv.selected = 0;
  const r = g.renderer.canvas.getBoundingClientRect();
  // 鼠标指向玩家右上方 45°(屏幕坐标)
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx + 60;
  g.input.mouseY = sy - 60;
  g.input.mouseDown = true;
  g.input.mouseHeld = true;
  return { held: inv.heldItem()?.id, mouse: [g.input.mouseX, g.input.mouseY] };
});
console.log('SETUP:', JSON.stringify(setup));
// 持续按住 1.2s(autoReuse 魔法杖连续施法),期间拍 3 帧
for (let i = 0; i < 3; i++) {
  await sleep(400);
  await p.evaluate(() => {
    const g = window.__swGame;
    g.input.mouseDown = true;   // 边沿语义持续满足
    g.input.mouseHeld = true;
  });
  const crop = await p.evaluate(() => {
    const g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
    return { x: Math.max(0, Math.round(sx - 80)), y: Math.max(0, Math.round(sy - 100)), width: 160, height: 160 };
  });
  await p.screenshot({ path: `${OUT}/glacier-${i}.png`, clip: crop });
}
const st = await p.evaluate(() => {
  const g = window.__swGame;
  return { swing: g.player.useTime > 0 ? 'using' : 'idle', swingObj: g.swing ? { t: g.swing.t, us: g.swing.useStyle, item: g.swing.item } : null };
});
console.log('STATE:', JSON.stringify(st));
await b.close();
console.log('DONE →', OUT);
