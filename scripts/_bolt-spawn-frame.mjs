// 一次性:魔法弹出生帧精确定位——单发触发,首帧截弹体出生位 vs 玩家盒中心 vs 杖头
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
  const idx = window.__swItems['vi_6152_DaybloomStaff'];
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.player.inv.selected = 0;
  g.player.mana = 200; g.player.baseMaxMana = 200;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx - 100; g.input.mouseY = sy + 10;   // 左侧同高
});
// 单发:一帧 mouseDown
await p.evaluate(() => { window.__swGame.input.mouseDown = true; });
await sleep(80);
const st = await p.evaluate(() => {
  const g = window.__swGame;
  const bolts = (g.entities?.all?.() ?? []).filter((e) => e && e.projId === 1114);
  const pl = g.player;
  const [sx, sy] = g.camera.worldToScreen(pl.cx, pl.cy);
  const bolt = bolts[0];
  const bs = bolt ? g.camera.worldToScreen(bolt.cx, bolt.cy) : null;
  const ang = Math.atan2(g.input.mouseY - sy, g.input.mouseX - sx);
  const staffHead = { x: Math.round(sx + Math.cos(ang) * 18), y: Math.round(sy + Math.sin(ang) * 18) };
  let firstFrameSample = null;
  if (bolt && bs) {
    const c2 = g.renderer.canvas.getContext('2d');
    const d = c2.getImageData(bs[0] - 3, bs[1] - 3, 7, 7).data;
    let r = 0, gg = 0, b2 = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b2 += d[i + 2]; }
    firstFrameSample = [Math.round(r / 49), Math.round(gg / 49), Math.round(b2 / 49)];
  }
  return {
    bolts: bolts.length,
    boltScreen: bs ? { x: Math.round(bs[0]), y: Math.round(bs[1]) } : null,
    playerScreen: { x: Math.round(sx), y: Math.round(sy) },
    staffHeadTheoretical: staffHead,
    firstFrameSample
  };
});
console.log('SPAWN_FRAME:', JSON.stringify(st, null, 1));
await b.close();
console.log('DONE');
