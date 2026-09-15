// 住房光标退出语义探针（2026-09-15 用户实报：分配成功后光标滞留分配态）：
//   A 分配成功 → housingMode=null（TryMovingNPC Main.cs:45929-45936 SetMouseNPC(-1,-1)）
//   B 成功退出后世界左键恢复使用（pickaxe useTime>0,不再被分配态吞点击）
//   C 世界右键 = 取消臂（:45941-45945 Sound12+SetMouseNPC(-1,-1)）
//   D 查询态保留（PerformHousingCheck :45918-45927 不清携带,连查多间=原版）
//   E 关背包清态（DrawInterface_27_Inventory :46429 !playerInventory → SetMouseNPC(-1,-1)）
//   F HousingPanel 条：槽点击选中 → 成功退出后仅摘选中面板保持（cursorChanged keepPanel）
//   G HousingPanel 条：canvas 右键 = 取消+面板保持（bind 右键支）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 300)));
const B = process.env.SW_ORIGIN || 'http://localhost:5224';
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld, { timeout: 180000 });
await page.evaluate(async () => { await window.__swFlow.newWorld('housingexit', 4200, 1200); });
await page.waitForFunction(() => !!window.__swGame && !!window.__swUI, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const r = {};
  const raf = (n) => new Promise((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); });
  const pump = async (n = 3) => { for (let k = 0; k < n; k++) { g.fixedUpdate(1 / 60); g.postUpdate(); await raf(1); await new Promise((res) => setTimeout(res, 8)); } };
  const T = await import('/src/data/tiles.ts');
  const BK = T.TILE_BY_KEY;
  // ---- 相机对准屏心 → 空中搭房（避让出生点已有入住=occupied）----
  await pump(5);
  const cx = innerWidth / 2, cy = innerHeight / 2;
  const [wx0, wy0] = g.camera.screenToWorld(cx, cy);
  const bx = Math.floor(wx0 / 16), by = Math.floor(wy0 / 16);
  g.player.x = wx0; g.player.y = wy0 - 60; g.player.vx = 0; g.player.vy = 0;
  await pump(5);
  const st = g.world.store;
  const set = (x, y, t, px, py) => st.setTileSilent(x, y, t, px ?? 0, py ?? 0);
  const ax = bx + 150, ay = by - 8;   // 房锚：远spawn(+150 格)——出生原版房+向导 home 在 spawn 侧=occupied
  g.player.x = ax * 16 + 8; g.player.y = (ay - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  const fx0 = ax - 6, fx1 = ax + 6, fyT = ay - 3, fyB = ay + 3;   // 地板/天花板 x 域、上下沿
  for (let x = fx0 - 2; x <= fx1 + 2; x++) for (let y = fyT - 2; y <= fyB + 2; y++) set(x, y, 0);   // 清域(树/地形)
  for (let x = fx0; x <= fx1; x++) { set(x, fyT, BK['wood']); set(x, fyB, BK['wood']); }
  for (let y = fyT + 1; y <= fyB - 1; y++) { set(fx0, y, BK['wood']); set(fx1, y, BK['wood']); }
  for (let y = fyT + 1; y <= fyB - 1; y++) for (let x = fx0 + 1; x <= fx1 - 1; x++) st.wall[st.idx(x, y)] = 4;
  for (const dx of [fx0, fx1]) for (let y = ay - 1; y <= ay + 1; y++) set(dx, y, 17, 0, (y - (ay - 1)) * 18);   // 双侧门 17
  set(fx0 + 1, fyT + 1, BK['torch'], 22);
  set(fx1 - 1, fyT + 1, BK['torch'], 44);
  set(ax + 1, ay, BK['chair'], 0, 0);
  set(ax + 1, ay + 1, BK['chair'], 0, 18);
  for (let x = ax + 2; x <= ax + 4; x++) { set(x, ay, BK['table'], (x - ax - 2) * 18); set(x, ay + 1, BK['table'], (x - ax - 2) * 18, 18); }
  for (const [x, fx] of [[ax - 2, 0], [ax - 1, 18]]) { set(x, ay, BK['workbench'], fx); set(x, ay + 1, BK['workbench'], fx, 18); }
  await pump(3);
  // 点击位 = 房内空气格(ax, ay-1) 的屏幕坐标（玩家已传送至房边,相机随行后反算）
  const [hx, hy] = g.camera.worldToScreen(ax * 16 + 8, (ay - 1) * 16 + 8);
  g.input.mouseX = hx; g.input.mouseY = hy;
  // ---- 召唤商人 17 → 全员 home 停泊远处（入驻轮只找【无家】NPC;停泊后车轮闲置,
  //      新房源不再被自动认领——occupied=他人 home 落房内,豁免按 housingCategory
  //      不按身份,自认领同类别同样判 occupied,Housing.ts scoreRoom :363-373）----
  const err = g.debugSpawnNpc(17, 1, false);
  let i = 0;
  for (const n of g.entities.npcs) {
    if (n.npcKey && !n.dead) { n.home = { x: ax + 500 + (i++) * 10, y: ay + 200 }; n.leashHome = false; }
  }
  const npc = g.entities.npcs.find((n) => n.npcKey && n.vanillaId === 17 && !n.dead);
  r.spawn = { err, npcKey: npc?.npcKey ?? null };
  if (!npc) return { fail: 'no town npc', ...r };
  const fakeX = npc.home.x;
  r.clickPx = [hx, hy];
  // ---- A 分配成功 → 退出分配态 ----
  g.housingMode = { kind: 'assign', npcKey: npc.npcKey };
  g.input.mouseDown = true;
  await pump(2);
  g.input.mouseDown = false;
  await pump(2);
  r.A = { modeAfter: g.housingMode, homeSet: !!npc.home && Math.abs(npc.home.x - fakeX) > 5, prio: g.prioritizedTownNPCType };
  // ---- B 退出后世界左键恢复使用（铜镐 3509 点本房木地板=真实可挖目标）----
  const pickId = window.__swFlow.itemByVid(3509);
  g.player.inv.add(pickId, 1);
  g.player.inv.selected = 0;
  const [mx2, my2] = g.camera.worldToScreen((ax - 1) * 16 + 8, (ay + 3) * 16 + 8);
  g.input.mouseX = mx2; g.input.mouseY = my2;
  const woodBefore = st.type[st.idx(ax - 1, ay + 3)];
  g.input.mouseDown = true;
  await pump(2);
  g.input.mouseDown = false;
  await pump(2);
  r.B = { pickId, modeStill: g.housingMode, useTime: g.player.useTime, itemAnim: g.player.itemAnimation ?? null, woodBefore, woodAfter: st.type[st.idx(ax - 1, ay + 3)] };
  r.B = { pickId, modeStill: g.housingMode, useTime: g.player.useTime, itemAnim: g.player.itemAnimation ?? null };
  // ---- C 世界右键取消 ----
  g.housingMode = { kind: 'assign', npcKey: npc.npcKey };
  const homeBefore = !!npc.home;
  g.input.rightDown = true;
  await pump(2);
  g.input.rightDown = false;
  await pump(2);
  r.C = { modeAfter: g.housingMode, homeBefore };
  // ---- D 查询态保留（原版连查多间）----
  g.housingMode = { kind: 'query' };
  g.input.mouseDown = true;
  await pump(2);
  g.input.mouseDown = false;
  await pump(2);
  r.D = { modeAfter: g.housingMode };
  // ---- E 关背包清态 ----
  g.housingMode = { kind: 'assign', npcKey: npc.npcKey };
  ui.closeInventory();
  r.E = { modeAfter: g.housingMode };
  // ---- F/G HousingPanel 条入口 ----
  const { HousingPanel } = await import('/src/ui/HousingPanel.ts');
  const panel = new HousingPanel(g, (m) => { g.housingMode = m; }, () => {});
  window.__swHousingPanel = panel;
  // F1: 槽左键选中（第 1 行 0 号查询器槽右缘列 x=画布右-56..）
  const cvs = panel.canvas;
  const rect = cvs.getBoundingClientRect();
  const ev = (btn, x, y) => { const e = new MouseEvent('mousedown', { button: btn, bubbles: true, cancelable: true }); Object.defineProperty(e, 'offsetX', { value: x }); Object.defineProperty(e, 'offsetY', { value: y }); cvs.dispatchEvent(e); };
  ev(0, 28, 28);   // 0 号查询器槽
  r.F1 = { modeAfter: g.housingMode };
  ev(2, 28, 28);   // canvas 右键 = 取消+面板保持
  r.G = { modeAfter: g.housingMode, panelAlive: !!document.querySelector('.sw-panel') && cvs.isConnected };
  // F2: NPC 槽选中（第 2 行）→ 走真实成功链 → 面板保持仅摘选中
  const rowN = Math.floor(cvs.height / 56);
  if (rowN >= 2) ev(0, 28, 28 + 56);
  r.F2 = { modeAfter: g.housingMode };
  // 真实成功退出经 cb.onHousingCursor(null,true)（mainFlow → cursorChanged(null,true)）
  g.housingMode = { kind: 'assign', npcKey: npc.npcKey };
  panel.cursorChanged(null, true);
  r.F3 = { modeAfter: g.housingMode, panelAlive: cvs.isConnected, panelCursorNull: !panel.canvas.dataset.x && true };
  panel.destroy();
  delete window.__swHousingPanel;
  return r;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
const ok = out && !out.fail
  && out.A && out.A.modeAfter === null && out.A.homeSet
  && out.B && out.B.modeStill === null && (out.B.useTime > 0 || out.B.itemAnim)
  && out.C && out.C.modeAfter === null
  && out.D && out.D.modeAfter && out.D.modeAfter.kind === 'query'
  && out.E && out.E.modeAfter === null
  && out.F1 && out.F1.modeAfter && out.F1.modeAfter.kind === 'query'
  && out.G && out.G.modeAfter === null && out.G.panelAlive
  && out.F2 && out.F2.modeAfter && out.F2.modeAfter.kind === 'assign'
  && out.F3 && out.F3.modeAfter === null;
process.exit(ok ? 0 : 1);
