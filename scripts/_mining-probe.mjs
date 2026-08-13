// 挖掘链路回归探针(2026-08-13"铜镐无法挖掘"双根因修复):
//   1) 剑分支 cwMelee 未豁免工具 → tryMine 永不被调(修复:tool 真值走工具分支)
//   2) HitTile 自创衰减 > 积累速率 → 永远凑不满 100(修复:对齐原版无周期衰减)
// 断言:落地稳定后持铜镐 400 帧,鼠标下方石块被挖掉(tile→0)
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
  const mineInfo = [];
  g.tryMine = (tx, ty, power, type, spd, useT) => {
    hitTileCalls++;
    const t = g.world.store.get(tx, ty);
    const before = mineInfo.length < 400;
    const r = origTryMine(tx, ty, power, type, spd, useT);
    if (before) mineInfo.push({ tx, ty, power, type, tile: t, canBreak: g.toolCanBreak(t, power, type),
      miningAfter: g.mining ? { x: g.mining.x, y: g.mining.y, progress: g.mining.progress } : null });
    return r;
  };
  // 先等玩家落地稳定(排除出生下落+相机跟随导致的鼠标世界格漂移)
  for (let i = 0; i < 180; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 400; i++) {
    g.smartCursor.showing = false;
    g.fixedUpdate(1 / 60);
    if (i < 8 || i % 15 === 0) {
      trace.push({ i, useTime: g.player.useTime, swingT: g.swing ? g.swing.t : null,
        mining: !!g.mining, tileType: st.get(targetTx, targetTy) });
    }
  }
  g.tryMine = origTryMine;
  res.trace = trace;
  res.tryMineCalls = hitTileCalls;
  if (mineInfo.length) {
    res.hitDamage = g.hitTiles.getDamage(mineInfo[0].tx, mineInfo[0].ty);
    res.atkMult = g.player.attackSpeedMult;
    res.miningBuff = g.player.buffs.has(2); // Mining buff id 近似
  }
  res.mineInfo = mineInfo;
  res.mouseTile = g.camera.tileUnder(g.input.mouseX, g.input.mouseY);
  res.targetTile = [targetTx, targetTy];
  const lastM = mineInfo[mineInfo.length - 1];
  res.tileAfter = lastM ? st.get(lastM.tx, lastM.ty) : st.get(targetTx, targetTy);
  res.minedAt = lastM ? [lastM.tx, lastM.ty] : null;
  res.lastProgress = lastM ? lastM.progress : null;
  res.progressSeries = mineInfo.filter((_, i) => i % 25 === 0).map((m) => m.progress);
  res.pageErrors = (window.__swProbeErrors || []);
  return res;
});
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('挖掘链被调(tryMine>0)', out.tryMineCalls > 100, `calls=${out.tryMineCalls}`);
check('目标格被挖掉(tile→0)', out.tileAfter === 0, `tile=${out.tileAfter}`);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
