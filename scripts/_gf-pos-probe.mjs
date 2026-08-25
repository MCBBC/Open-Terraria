// 一次性:蓄力冰矛挂位测量——鼠标置左下(复刻用户截图方位),量 orb 实际绘制位 vs
// 玩家盒中心/脚底/举起法杖位,判定挂位偏差
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
  const idx = window.__swItems['vi_6153_GlacierFang'];
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.player.inv.selected = 0;
  g.player.mana = 200; g.player.baseMaxMana = 200;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx + 60;    // 鼠标在角色【左下】(复刻用户截图方位)
  g.input.mouseY = sy - 60;
  g.input.mouseDown = true; g.input.mouseHeld = true;
});
await sleep(900);
const m = await p.evaluate(() => {
  const g = window.__swGame;
  const pl = g.player;
  const orbs = (g.entities?.all?.() ?? []).filter((e) => e && e.projId === 1115);
  const o = orbs[0];
  const [ssx, ssy] = g.camera.worldToScreen(pl.cx, pl.cy);
  return {
    player: { cx: Math.round(pl.cx), cy: Math.round(pl.cy), x: Math.round(pl.x), y: Math.round(pl.y), h: pl.h, w: pl.w },
    orb: o ? { cx: Math.round(o.cx), cy: Math.round(o.cy), rot: +Math.atan2(o.vy, o.vx).toFixed(2) } : null,
    screen: { px: Math.round(ssx), py: Math.round(ssy) },
    crop: { x: Math.max(0, Math.round(ssx - 75)), y: Math.max(0, Math.round(ssy - 100)), width: 150, height: 170 }
  };
});
console.log('MEASURE:', JSON.stringify(m));
await p.screenshot({ path: '/tmp/mooncloud-probe/gf-pos-upright.png', clip: m.crop });
await b.close();
console.log('DONE');
