// ★四环验证 Ring3——618 星璇火花可见性/在场性探针（2026-09-28）。
// 问题：用户报"副弹似乎从我本机开始就一直不存在"。本探针实证：
//  A. 空场慢速段：617 减速入慢速段后 618 掷骰节奏/同屏峰值/骑乘轨道半径/尘尾 86 覆盖
//     （原版视觉本体=AI 尘,弹体贴图 α≡255 隐身——drawGlobalAlpha case 618 → 0）。
//  B. 有敌实战：618 对敌重复命中（localNPCHitCooldown=20 再命中）+ hp 流失归因采样。
//  C. 实机观感截图三帧（rAF 实时）+ zoom2 特写一帧 → /tmp/nb618-*.png。
// 运行：SW_ORIGIN=http://localhost:5238 node tools/run-diag.mjs scripts/_nb618-ring3-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5238', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  await g.newWorld('nb618', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  const out = { A: {}, B: {} };
  // 平地落位
  let col0 = -1, gy = -1;
  for (let c = 100; c < st.w - 200; c++) {
    let y0 = -1;
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c, y)) { y0 = y; break; } }
    if (y0 < 0) continue;
    let flat = true;
    for (let k = 1; k <= 60; k++) {
      let yy = -1;
      for (let y = Math.max(1, y0 - 3); y < y0 + 4; y++) { if (st.isSolid(c + k, y)) { yy = y; break; } }
      if (yy !== y0) { flat = false; break; }
    }
    if (flat) { col0 = c; gy = y0; break; }
  }
  p.x = col0 * 16; p.y = gy * 16 - p.h; p.vx = 0; p.vy = 0;
  const key3476 = Object.keys(items).find((k) => k.includes('3476'));
  if (!key3476) return { fail: 'item-3476-missing' };
  p.inv.slots[0] = { id: items[key3476], stack: 1 };
  p.inv.selected = 0;
  p.baseMaxMana = 900; p.mana = 900;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);

  const projs = () => g.entities.projectiles;
  const byId = (id) => projs().filter((q) => q.projId === id);
  const clear = () => { for (const q of projs()) q.dead = true; };
  const dustNear = (cx, cy, r, type) => {
    const pool = g.vanillaDust?.pool ?? [];
    let n = 0;
    for (const d of pool) {
      if (!d || !d.active) continue;
      if (d.type === type && Math.abs(d.x - cx) < r && Math.abs(d.y - cy) < r) n++;
    }
    return n;
  };
  const fire = () => {
    const aimX = p.cx + 260, aimY = p.cy - 8;
    const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    p.mana = 900;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };

  // ============ A. 空场：慢速段 618 节奏/峰值/轨道/尘尾 ============
  {
    fire();
    const orbs = byId(617);
    out.A.orbSpawned = orbs.length > 0;
    const o = orbs[0];
    if (o) {
      let first618 = -1, max618 = 0;
      const trace = [];
      for (let t = 1; t <= 640; t++) {
        g.fixedUpdate(1 / 60);
        const s618 = byId(618);
        if (first618 < 0 && s618.length > 0) first618 = t;
        if (s618.length > max618) max618 = s618.length;
        if (t % 60 === 0 && !o.dead) {
          let dSum = 0, dMax = 0, dustCovered = 0;
          for (const s of s618) {
            const dd = Math.hypot(s.cx - o.cx, s.cy - o.cy);
            dSum += dd; if (dd > dMax) dMax = dd;
            if (dustNear(s.cx, s.cy, 40, 86) > 0) dustCovered++;
          }
          trace.push({
            t, orbSp: +Math.hypot(o.vx, o.vy).toFixed(2), n618: s618.length,
            orbitMean: s618.length ? +(dSum / s618.length).toFixed(0) : 0,
            orbitMax: +dMax.toFixed(0),
            dust86Covered: `${dustCovered}/${s618.length}`,
          });
        }
        if (o.dead && t > 60) break;
      }
      out.A.first618Tick = first618;
      out.A.max618Concurrent = max618;
      out.A.trace = trace;
      out.A.orbLifeTick = 640 - byId(617).length === 0 ? 'dead-in-window' : 'alive-640';
    }
    clear();
  }

  // ============ B. 有敌：618 命中归因（hp 流失时 618 与敌近距） ============
  {
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const foe = Enemy.fromVanilla(3, p.cx + 320, p.cy - 4);
    if (foe) { foe.id = 987100; g.entities.add(foe, 'enemies'); foe.hp = foe.maxHp; }
    fire();
    const orbs = byId(617);
    out.B.orbSpawned = orbs.length > 0;
    const o = orbs[0];
    if (o && foe) {
      out.B.foeHp0 = foe.hp;
      const hits = [];
      let prevHp = foe.hp;
      let hitBy618 = 0, hitByOther = 0;
      for (let t = 1; t <= 640; t++) {
        g.fixedUpdate(1 / 60);
        if (foe.hp < prevHp) {
          const s618 = byId(618);
          const dNear = Math.min(...s618.map((s) => Math.hypot(s.cx - foe.cx, s.cy - foe.cy)), 1e9);
          const dOrb = o.dead ? 1e9 : Math.hypot(o.cx - foe.cx, o.cy - foe.cy);
          // 命中窗口：近距源（<80px 归 618/617 本体;同时在场 618 时倾向 618）
          if (dNear < 80 && dNear < dOrb) hitBy618++;
          else if (dOrb < 100) hitByOther++;
          hits.push({ t, dmg: prevHp - foe.hp, d618: dNear > 1e8 ? null : +dNear.toFixed(0), dOrb: dOrb > 1e8 ? null : +dOrb.toFixed(0) });
          prevHp = foe.hp;
        }
        if (foe.dead || (o.dead && t > 60)) break;
      }
      out.B.hitEvents = hits.slice(0, 14);
      out.B.hitBy618count = hitBy618;
      out.B.hitByOthercount = hitByOther;
      out.B.foeHpEnd = foe.hp;
      out.B.foeDead = !!foe.dead;
    }
    if (foe) { foe.dead = true; }
    clear();
  }
  out.worldOk = !!g.world;
  return out;
});
console.log('[ring3] result', JSON.stringify(out, null, 1));

// ============ C. 实机截图（rAF 实时;连发 + zoom1 三帧 + zoom2 特写） ============
try {
  await page.evaluate(async () => {
    const g = window.__swGame;
    const p = g.player;
    p.baseMaxMana = 2000; p.mana = 2000;
    for (const q of g.entities.projectiles) q.dead = true;
    g.camera.zoomTarget = 1;
    const aimX = p.cx + 220, aimY = p.cy - 8;
    const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    g.input.mouseHeld = true;   // autoReuse 30t 连发
  });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: '/tmp/nb618-view-early.png' });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: '/tmp/nb618-view-mid.png' });
  await new Promise((r) => setTimeout(r, 2000));
  // 停火清场后拍 zoom2 特写（瞄准更近,球+火花在画面中心域）
  await page.evaluate(() => {
    const g = window.__swGame;
    const p = g.player;
    g.input.mouseHeld = false;
    for (const q of g.entities.projectiles) q.dead = true;
    g.camera.zoomTarget = 2;
    const aimX = p.cx + 150, aimY = p.cy - 10;
    const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    g.input.mouseDown = true; g.input.mouseHeld = true;
  });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => { window.__swGame.input.mouseHeld = false; });
  await new Promise((r) => setTimeout(r, 3100));   // 入慢速段+伴生窗口
  await page.screenshot({ path: '/tmp/nb618-view-zoom2.png' });
  console.log('[ring3] screenshots: /tmp/nb618-view-early.png /tmp/nb618-view-mid.png /tmp/nb618-view-zoom2.png');
  // 兜底状态快照（截图同拍在场数 + 屏幕盒内全实体投影 → 定位"蓝珠行"归属）
  const snap = await page.evaluate(() => {
    const g = window.__swGame;
    const c618 = g.entities.projectiles.filter((q) => q.projId === 618).length;
    const c617 = g.entities.projectiles.filter((q) => q.projId === 617).length;
    const w2s = (wx, wy) => g.camera.worldToScreen(wx, wy);
    const box = { x0: 380, y0: 180, x1: 940, y1: 430 };
    const inBox = (sx, sy) => sx >= box.x0 && sx <= box.x1 && sy >= box.y0 && sy <= box.y1;
    const rows = [];
    for (const q of g.entities.projectiles) {
      const [sx, sy] = w2s(q.cx, q.cy);
      if (inBox(sx, sy)) rows.push({ k: 'p', id: q.projId, sx: Math.round(sx), sy: Math.round(sy), a: q.alpha });
    }
    const dusts = [];
    for (const d of g.vanillaDust?.pool ?? []) {
      if (!d?.active) continue;
      const [sx, sy] = w2s(d.x, d.y);
      if (inBox(sx, sy)) dusts.push({ t: d.type, sx: Math.round(sx), sy: Math.round(sy), s: +Number(d.scale).toFixed(1) });
    }
    const items = [];
    for (const e of g.entities?.items ?? []) {
      if (!e || e.dead) continue;
      const [sx, sy] = w2s(e.cx ?? e.x, e.cy ?? e.y);
      if (inBox(sx, sy)) items.push({ id: e.id ?? e.type, sx: Math.round(sx), sy: Math.round(sy) });
    }
    const [psx, psy] = w2s(g.player.cx, g.player.cy);
    // ★蓝珠行归属枚举：行屏幕盒(500-680, 288-330) → 世界盒，全实体数组扫
    const [wx0, wy0] = g.camera.screenToWorld(500, 288);
    const [wx1, wy1] = g.camera.screenToWorld(680, 330);
    const kinds = Object.keys(g.entities ?? {}).filter((k) => Array.isArray(g.entities[k]));
    const found = [];
    for (const k of kinds) {
      for (const e of g.entities[k]) {
        if (!e || (e.dead === true)) continue;
        const ex = e.cx ?? e.x, ey = e.cy ?? e.y;
        if (ex == null || ey == null) continue;
        if (ex >= wx0 - 40 && ex <= wx1 + 40 && ey >= wy0 - 40 && ey <= wy1 + 40) {
          found.push({ k, id: e.id ?? e.type ?? e.projId ?? null, sx: Math.round((w2s(ex, ey))[0]), sy: Math.round((w2s(ex, ey))[1]), item: e.itemId ?? e.stack ?? null });
        }
      }
    }
    return { c617, c618, rows, dusts: dusts.slice(0, 40), items, player: [Math.round(psx), Math.round(psy)], rowWorld: [Math.round(wx0), Math.round(wy0), Math.round(wx1), Math.round(wy1)], entityKinds: kinds.map((k) => `${k}:${g.entities[k].length}`), found };
  });
  console.log('[ring3] zoom2-shot in-flight snapshot', JSON.stringify(snap));
} catch (e) {
  console.log('[ring3] screenshot fail', String(e).slice(0, 140));
}
console.log('[ring3] pageerrors', pageErrors.length ? pageErrors.slice(0, 3) : 'none');
await browser.close().catch(() => {});
process.exit(out && !out.fail && out.A && out.A.orbSpawned ? 0 : 1);
