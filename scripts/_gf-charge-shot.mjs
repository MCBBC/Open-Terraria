// 一次性:冰川之牙蓄力态终验——水平瞄准(对齐原版参考图),等 orb 出现后截蓄力中段
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
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
  g.input.mouseX = sx - 80;    // 鼠标与玩家同高、左侧=水平瞄准(原版参考图方位)
  g.input.mouseY = sy;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.__pin = setInterval(() => { g.input.mouseDown = true; g.input.mouseHeld = true; }, 50);
});
// 轮询等 orb 出现,出现后再蓄 300ms(charge≈20-35 中段)
let orbSeen = false;
for (let i = 0; i < 60; i++) {
  await sleep(50);
  orbSeen = await p.evaluate(() => (window.__swGame.entities?.all?.() ?? []).some((e) => e && e.projId === 1115));
  if (orbSeen) break;
}
await sleep(300);
const st = await p.evaluate(() => {
  const g = window.__swGame;
  const orbs = (g.entities?.all?.() ?? []).filter((e) => e && e.projId === 1115);
  const pl = g.player;
  const [sx, sy] = g.camera.worldToScreen(pl.cx, pl.cy);
  return {
    n: orbs.length,
    charge: orbs[0] ? +orbs[0].charge?.toFixed?.(1) : null,
    orbPos: orbs[0] ? { x: Math.round(orbs[0].cx), y: Math.round(orbs[0].cy) } : null,
    player: { cx: Math.round(pl.cx), cy: Math.round(pl.cy) },
    crop: { x: Math.max(0, Math.round(sx - 80)), y: Math.max(0, Math.round(sy - 95)), width: 160, height: 170 }
  };
});
await p.screenshot({ path: '/tmp/mooncloud-probe/gf-final-charge.png', clip: st.crop });
console.log('STATE:', JSON.stringify(st, null, 1).slice(0, 400));
await p.evaluate(() => { clearInterval(window.__swGame.__pin); });
await b.close();
console.log('DONE → /tmp/mooncloud-probe/gf-final-charge.png');
