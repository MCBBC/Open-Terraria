// BJ349 方向全反复现:鼠标左/右两侧各射击+挥砍,记录弹初速符号/facing/screenToWorld
// 判据:mouse 右 → facing=1 且弹 vx>0;mouse 左 → facing=-1 且 vx<0。反了=盘上真回归。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR:' + String(e.message).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 240000, polling: 1000 });
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const vc = await import('/src/data/vanillaItemCombat.ts');
  const DEFS = items.ITEM_DEFS;
  const IBK = items.ITEM_BY_KEY;
  // 找 musket(vid 98)/musket ball(vid 97) 与一件纯近战(melee,shoot==0)
  const findDef = (vid) => { for (let i = 0; i < DEFS.length; i++) { const d = DEFS[i]; if (d && d.vid === vid) return { id: i, key: d.key, vid: d.vid }; } return null; };
  const gun = findDef(98), ammo = findDef(97);
  // 近战:vid 122 Copper Broadsword 附近的 melee 件——扫 uc.melee && shoot==0 && damage>0 && useAnimation>=10
  let melee = null;
  for (let vid = 1; vid < 800 && !melee; vid++) {
    const uc = vc.itemCombat ? vc.itemCombat(vid) : null;
    if (uc && uc.melee === true && !(uc.shoot > 0) && (uc.damage ?? 0) >= 4 && (uc.useAnimation ?? 99) >= 10) {
      const f = findDef(vid); if (f) melee = { ...f, uc: { dmg: uc.damage, ua: uc.useAnimation, ut: uc.useTime } };
    }
  }
  const inv = g.player.inv;
  if (gun) { inv.slots[0] = { id: gun.id, stack: 1 }; }
  if (ammo) { inv.slots[5] = { id: ammo.id, stack: 999 }; }
  g.player.selectedSlot = 0;
  const vw = innerWidth, vh = innerHeight;
  const p0 = { cx: g.player.cx, cy: g.player.cy, facing: g.player.facing };
  const shot = [];
  // 弹快照:步进前记录已有弹引用,步进后收集新增
  const snapProjs = () => { const s = new Set(); for (const e of (g.entities.projectiles ?? [])) s.add(e); return s; };
  const collectNew = (before) => {
    const nw = [];
    for (const e of (g.entities.projectiles ?? [])) if (!before.has(e)) nw.push({ cls: e.constructor?.name, projId: e.projId, vx: e.vx, vy: e.vy, x: e.x, y: e.y });
    return nw;
  };
  // ---- 场景 A:鼠标右 ----
  g.input.mouseX = vw - 120; g.input.mouseY = Math.round(vh / 2);
  const swR = g.camera.screenToWorld(g.input.mouseX, g.input.mouseY);
  let before = snapProjs();
  g.input.mouseDown = true;
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  const projsR = collectNew(before);
  const facingR = g.player.facing;
  // 清场:杀掉场上所有弹
  for (const e of (g.entities.projectiles ?? [])) { try { e.dead = true; } catch {} }
  await new Promise(r => setTimeout(r, 60));
  // ---- 场景 B:鼠标左 ----
  g.input.mouseX = 120; g.input.mouseY = Math.round(vh / 2);
  const swL = g.camera.screenToWorld(g.input.mouseX, g.input.mouseY);
  before = snapProjs();
  g.input.mouseDown = true;
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  const projsL = collectNew(before);
  const facingL = g.player.facing;
  for (const e of (g.entities.projectiles ?? [])) { try { e.dead = true; } catch {} }
  await new Promise(r => setTimeout(r, 60));
  // ---- 场景 C:近战挥砍(mouse 右/左),观测 facing 序列 ----
  if (melee) {
    inv.slots[0] = { id: melee.id, stack: 1 };
    g.player.selectedSlot = 0;
    g.input.mouseX = vw - 120; g.input.mouseY = Math.round(vh / 2);
    g.input.mouseDown = true;
    for (let i = 0; i < 4; i++) g.fixedUpdate(1 / 60);
    const swingFacingR = g.player.facing;
    const swingAimR = g.swing ? { aim: g.swing.aim, t: g.swing.t, dur: g.swing.dur } : null;
    g.input.mouseDown = false;
    for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);
    g.input.mouseX = 120;
    g.input.mouseDown = true;
    for (let i = 0; i < 4; i++) g.fixedUpdate(1 / 60);
    const swingFacingL = g.player.facing;
    const swingAimL = g.swing ? { aim: g.swing.aim, t: g.swing.t, dur: g.swing.dur } : null;
    g.input.mouseDown = false;
    for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);
    var swing = { swingFacingR, swingAimR, swingFacingL, swingAimL };
  }
  const trim = (a) => a.slice(0, 6).map(e => ({ cls: e.cls, pid: e.projId, vx: +Number(e.vx ?? 0).toFixed(2), vy: +Number(e.vy ?? 0).toFixed(2) }));
  return {
    vw, vh, p0, gun, ammo, melee,
    swR: { wx: +swR[0].toFixed(1), wy: +swR[1].toFixed(1) },
    swL: { wx: +swL[0].toFixed(1), wy: +swL[1].toFixed(1) },
    playerCx: +p0.cx.toFixed(1),
    facingR, facingL,
    projsR: trim(projsR), nR: projsR.length,
    projsL: trim(projsL), nL: projsL.length,
    swing,
  };
});
console.log('BJ349=' + JSON.stringify(out, null, 1));
if (errs.length) console.log('ERRS:', JSON.stringify(errs.slice(0, 5)));
await browser.close();
