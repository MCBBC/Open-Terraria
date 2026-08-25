// 一次性:冰川之牙终验——钩 useSwing 捕获游戏自建 def,真实输入路径触发,验证举杖层级
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1000);
await p.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.slots[0] = { id: 6153, stack: 1 };
  g.player.inv.selected = 0;
  g.player.mana = 200; g.player.baseMaxMana = 200;
  const orig = g.useSwing.bind(g);
  g.useSwing = function (def, aim, mult) {
    window.__lastDef = def ? { key: def.key, vid: def.vid } : null;
    return orig(def, aim, mult);
  };
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx + 60;
  g.input.mouseY = sy - 60;
  g.input.mouseDown = true;
  g.input.mouseHeld = true;
});
await sleep(120);
const mid = await p.evaluate(() => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  return {
    lastDef: window.__lastDef,
    swing: g.swing ? { t: g.swing.t, us: g.swing.useStyle, item: g.swing.item } : null,
    crop: { x: Math.max(0, Math.round(sx - 70)), y: Math.max(0, Math.round(sy - 90)), width: 140, height: 150 }
  };
});
console.log('MID:', JSON.stringify({ def: mid.lastDef, swing: mid.swing }));
await p.screenshot({ path: '/tmp/mooncloud-probe/gf-final.png', clip: mid.crop });
await b.close();
console.log('DONE');
