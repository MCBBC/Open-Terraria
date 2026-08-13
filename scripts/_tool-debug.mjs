// 铜镐/铜斧挖掘链路复现探针:持铜镐点击泥土,逐帧追踪 tool 解析/swing/useTime/tryMine
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const res = {};
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  // 玩家站地面上,鼠标对准脚下泥块
  g.player.x = (px0 + 0.5) * 16; g.player.y = (gy - 3) * 16;
  const id = window.__swItems['vi_3509_copper_pickaxe'];
  g.player.inv.add(id, 1);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === id);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  res.itemKey = 'ok';
  // 鼠标对准玩家正下方泥块(脚下一格)
  const targetTx = px0, targetTy = gy;
  const [wx, wy] = g.camera.worldToScreen ? g.camera.worldToScreen(targetTx * 16 + 8, targetTy * 16 + 8) : [640, 460];
  g.input.mouseX = wx; g.input.mouseY = wy;
  // 逐帧追踪
  const trace = [];
  let hitTileCalls = 0;
  const origTryMine = g.tryMine.bind(g);
  g.tryMine = (tx, ty, power, type, spd, useT) => { hitTileCalls++; return origTryMine(tx, ty, power, type, spd, useT); };
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 400; i++) {
    g.fixedUpdate(1 / 60);
    if (i < 8 || i % 15 === 0) {
      trace.push({ i, useTime: g.player.useTime, swingT: g.swing ? g.swing.t : null,
        mining: !!g.mining, tileType: st.get(targetTx, targetTy) });
    }
  }
  g.tryMine = origTryMine;
  res.trace = trace;
  res.tryMineCalls = hitTileCalls;
  res.tileAfter = st.get(targetTx, targetTy);
  res.pageErrors = (window.__swProbeErrors || []);
  return res;
});
console.log(JSON.stringify(out, null, 1));
process.exit(0);
