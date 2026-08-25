// 诊断:c 段假人未命中根因 + 链条贴图 resource 证据
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${ORIGIN}/?play=small&golemdbg=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swItems)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1200));
const van = await page.evaluate(async () => (await (await fetch('sprites/vanilla.json')).json()).items ?? {});
const keyFor = (vid) => {
  for (const [idStr, m] of Object.entries(van)) {
    if (Number(idStr) === vid) return 'vi_' + vid + '_' + String(m.key).replace(/[^A-Za-z0-9]/g, '');
  }
  return null;
};
await page.evaluate((key) => {
  const g = window.__swGame;
  const id = window.__swItems?.[key];
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 1 };
  g.cb.onInventoryChanged?.();
}, keyFor(1297));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const pre = {};
  pre.keyId = window.__swItems?.['vi_1297_GolemFist'];
  const vc = await import('/src/data/vanillaItemCombat.ts');
  const pd = await import('/src/data/vanillaProjectiles.ts');
  const held0 = g.player.inv.heldItem?.();
  pre.heldBeforeEquip = held0 ? { id: held0.id } : null;
  const cwTest = vc.combatWeapon({ key: 'vi_1297_GolemFist', vid: 1297 });
  pre.cwTest = cwTest ? { kind: cwTest.kind, shoot: cwTest.shoot } : null;
  pre.aiStyle262 = pd.projectileData(262)?.aiStyle ?? 'missing';
  const st0 = { hp: g.player.hp, dead: g.player.dead, x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  // 走廊平整(同主探针)
  const st = g.world.store;
  const pt = Math.floor(g.player.cx / 16);
  const pr = Math.floor(g.player.cy / 16);
  for (let tx = pt + 1; tx <= pt + 48; tx++) {
    // 仅清空气隧道(pr-10..pr+2),不填任何实块——填实块会把玩家埋进地里
    for (let ty = pr - 10; ty <= pr + 2; ty++) st.setTileSilent(tx, ty, 0);
  }
  const st1 = { hp: g.player.hp, dead: g.player.dead, x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  g.entities.projectiles.length = 0;
  const origAdd2 = g.entities.add.bind(g.entities);
  window.__addedLog = [];
  g.entities.add = (e, b) => {
    window.__addedLog.push({ cls: e.constructor?.name, b, projId: e.projId ?? null });
    if (e.constructor?.name === 'AnchoredProj') {
      let dv = false;
      try {
        Object.defineProperty(e, 'dead', {
          configurable: true,
          get() { return dv; },
          set(v) {
            if (v === true && !dv) {
              window.__deadStack = new Error('dead<-true').stack;
              window.__deadA0 = e.a0;
            }
            dv = v;
          },
        });
      } catch (err) { window.__deadHookErr = String(err); }
    }
    return origAdd2(e, b);
  };
  // 不重复 add——先确认 spawnEnemy 是否已入桶
  const before = g.entities.enemies.length;
  const slime = g.spawnEnemy('slime_green', g.player.cx + 250, g.player.cy - 10);
  const addedAlready = g.entities.enemies.length > before;
  if (!addedAlready && slime) g.entities.add(slime, 'enemies');
  const info = { addedAlready, slimeNull: !slime, rows: [] };
  g.input.mouseX = g.renderer.canvas.width / 2 + 400;
  g.input.mouseY = g.renderer.canvas.height / 2;
  g.player.useTime = 0;
  g.input.mouseDown = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  for (let i = 0; i < 70; i++) {
    g.fixedUpdate(1 / 60);
    const f = g.entities.projectiles.find((e) => e.constructor?.name === 'AnchoredProj' && e.projId === 262);
    const sl = slime;
    if (i < 45 || (f && f.a0 === 1 && i < 50)) {
      info.rows.push({
        i,
        fist: f ? { x: Math.round(f.cx - g.player.cx), y: Math.round(f.cy - g.player.cy), a0: f.a0, w: f.w } : null,
        slime: sl ? { dx: Math.round(sl.x - g.player.cx), dy: Math.round(sl.y - g.player.cy), w: sl.w, h: sl.h, dead: !!sl.dead, iframes: sl.iframes ?? null, hp: sl.hp ?? null } : null,
      });
    }
    info.rows.push({ i, allProjs: g.entities.projectiles.map((e) => e.constructor?.name), fA0: f ? f.a0 : null });
    if (i > 8) break;
  }
  // 链条贴图加载证据(资源时序)
  info.st0=st0; info.st1=st1;
  const held = g.player.inv.heldItem?.() ?? g.player.inv.slots?.[g.player.inv.selected];
  const def = held ? (window.__swItemDefs?.[held.id] ?? null) : null;
  info.held = held ? { id: held.id } : null;
  info.defVid = def ? (def.vid ?? null) : 'no-def-map';
  info.useTime = g.player.useTime;
  info.uiBlocking = !!g.input.uiBlocking;
  info.annotateMode = !!g.annotateMode;
  const f2=g.entities.projectiles.find((e)=>e.constructor?.name==='AnchoredProj');
  info.finalFist=f2?{a0:f2.a0,dead:f2.dead}:null;
  info.pre = pre;
  info.addedLog = window.__addedLog;
  g.entities.add = origAdd2;
  // 页面模块里的 combatWeapon 对真实 heldDef 的判定
  try {
    const vc2 = await import('/src/data/vanillaItemCombat.ts');
    const heldDefReal = g.player.inv.heldItem?.();
    const defObj = heldDefReal ? (g.itemsDefByInternal?.[heldDefReal.id] ?? null) : null;
    info.realCw = defObj ? (vc2.combatWeapon(defObj) ? { kind: vc2.combatWeapon(defObj).kind } : null) : 'no-defobj';
    info.heldDefKeys = heldDefReal ? Object.keys(heldDefReal) : null;
  } catch (e2) { info.realCwErr = String(e2); }
  return info;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
