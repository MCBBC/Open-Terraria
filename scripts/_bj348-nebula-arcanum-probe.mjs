// ★BJ348 实机探针——星云奥秘 3476（弹 617 球体 / 618 慢速段伴生火花 / 620 死亡爆裂碎片）
// 断言面：
//  A. 出手：617 在场；出生锚 = 玩家附近（杖尖/盒心）；初速 ≈ shootSpeed 7 朝瞄准向；
//     alpha 255 渐显（-15/t）；drawScale 慢速段升档；环绕尘 86/90/240 活跃。
//  B. 慢速段：每 30t 掷 618 火花（隐形载体=尘尾视觉）；有敌时锁敌追踪；敌受击。
//  C. 死亡爆（ai0≥600）：176×176 AoE 伤 + Item14 音 + 【原版 10-16 枚 620 碎片】←——
//     本仓疑似整缺（用户实报"射弹从球体中生成"链的死亡段）。
//  D. 观感截图：出手后 ~0.3s / ~2.5s 两帧（球体可见性/旋转/持械）。
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj348-nebula-arcanum-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  await g.newWorld('bj348', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  const out = { A: {}, B: {}, C: {}, D: {} };

  // ---- 落位：干净地表 ----
  let groundY = -1;
  const pcol0 = Math.trunc(4200 * 8);
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(pcol0, y)) { groundY = y; break; } }
  if (groundY < 0) { // 兜底：出生列
    const c0 = Math.trunc(p.x / 16);
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
    p.x = c0 * 16; p.y = groundY * 16 - p.h;
  } else {
    p.x = pcol0 * 16; p.y = groundY * 16 - p.h;
  }
  p.vx = 0; p.vy = 0;
  p.baseMaxMana = 400; p.mana = 400;

  // ---- 装备星云奥秘 ----
  const key3476 = Object.keys(items).find((k) => k.includes('3476'));
  if (!key3476) return { fail: 'item-key-3476-missing' };
  const itemId = items[key3476];
  p.inv.slots[0] = { id: itemId, stack: 1 };
  p.inv.selected = 0;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);

  const fireOnce = () => {
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };
  const projs = () => g.entities.projectiles;
  const byId = (id) => projs().filter((q) => q.projId === id);
  const dustCensus = (cx, cy, r) => {
    const pool = g.vanillaDust?.pool ?? [];
    const c = {};
    for (const d of pool) {
      if (!d || !d.active) continue;
      if (Math.abs(d.x - cx) < r && Math.abs(d.y - cy) < r) c[d.type] = (c[d.type] ?? 0) + 1;
    }
    return c;
  };

  // ================= A. 空旷出手 =================
  {
    const aimX = p.cx + 300, aimY = p.cy - 10;
    const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    p.mana = 400;
    fireOnce();
    const orbs = byId(617);
    out.A.spawned = orbs.length;
    if (orbs.length) {
      const o = orbs[0];
      out.A.spawnPos = { x: +o.cx.toFixed(1), y: +o.cy.toFixed(1) };
      out.A.playerCenter = { x: +p.cx.toFixed(1), y: +p.cy.toFixed(1) };
      out.A.spawnOffset = { dx: +(o.cx - p.cx).toFixed(1), dy: +(o.cy - p.cy).toFixed(1) };
      out.A.v0 = { vx: +o.vx.toFixed(2), vy: +o.vy.toFixed(2), sp: +Math.hypot(o.vx, o.vy).toFixed(2) };
      out.A.alpha0 = o.alpha;
      out.A.age0 = o.age;
      out.A.insidePlayerBoxAtBirth = (o.cx > p.x && o.cx < p.x + p.w && o.cy > p.y && o.cy < p.y + p.h);
      // 采样 90 拍（每 15 拍）
      const trace = [];
      for (let t = 1; t <= 90; t++) {
        g.fixedUpdate(1 / 60);
        if (t % 15 === 0 && o.dead !== true) {
          trace.push({ t, sp: +Math.hypot(o.vx, o.vy).toFixed(2), alpha: o.alpha, scale: +o.drawScale.toFixed(3), pos: [Math.round(o.cx), Math.round(o.cy)] });
        }
      }
      out.A.trace = trace;
      out.A.spinRotSample = typeof o.spinRot === 'number' ? +o.spinRot.toFixed(4) : String(o.spinRot);
      out.A.dustNearOrb = dustCensus(o.cx, o.cy, 90);
      out.A.sub618count90t = byId(618).length;
      out.A.stillAlive90t = !o.dead;
      // 慢速段速度应恒 4（归一）；fast→slow 相位切换见 trace
    }
    // 清场
    for (const q of projs()) q.dead = true;
  }

  // ================= B. 有敌出手（锁敌/618/接触伤） =================
  {
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const foe = Enemy.fromVanilla(3, p.cx + 320, p.cy - 4);
    if (foe) {
      foe.id = 987001;
      g.entities.add(foe, 'enemies');
      foe.hp = foe.maxHp;
    }
    const aimX = p.cx + 300, aimY = p.cy - 10;
    const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    p.mana = 400;
    fireOnce();
    const orbs = byId(617);
    out.B.orbSpawned = orbs.length > 0;
    const o = orbs[0];
    if (o) {
      out.B.foeHp0 = foe ? foe.hp : -1;
      let max618 = 0, sawHoming = false, foeHurtTick = -1;
      for (let t = 1; t <= 300; t++) {
        g.fixedUpdate(1 / 60);
        const s618 = byId(618);
        if (s618.length > max618) max618 = s618.length;
        if (!sawHoming && s618.length && Math.hypot(s618[0].vx, s618[0].vy) > 0.5) sawHoming = true;
        if (foe && foeHurtTick < 0 && (foe.hp < out.B.foeHp0 || foe.dead)) foeHurtTick = t;
        if (o.dead) { out.B.orbDiedTick = t; break; }
      }
      out.B.max618inFlight = max618;
      out.B.foeHurtTick = foeHurtTick;
      out.B.foeHpEnd = foe ? foe.hp : -1;
      out.B.foeDead = foe ? !!foe.dead : null;
      out.B.orbAliveAfter300 = !o.dead;
      out.B.dustNearOrbLate = dustCensus(o.cx, o.cy, 90);
    }
    if (foe) { g.entities.remove?.(foe) || (foe.dead = true); }
    for (const q of projs()) q.dead = true;
  }

  // ================= C. 死亡爆（ai0≥600 → Kill → AoE+620?） =================
  {
    const { Enemy } = await import('/src/entities/Enemy.ts');
    // 球慢速段向瞄准向漂 → 把敌怪放在瞄准向上 ~150px（176 盒=±88 内）
    const foe = Enemy.fromVanilla(3, p.cx + 180, p.cy - 4);
    if (foe) { foe.id = 987002; g.entities.add(foe, 'enemies'); foe.hp = foe.maxHp; }
    const aimX = p.cx + 300, aimY = p.cy - 10;
    const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    p.mana = 400;
    fireOnce();
    const orbs = byId(617);
    out.C.orbSpawned = orbs.length > 0;
    const o = orbs[0];
    if (o) {
      out.C.foeHp0 = foe ? foe.hp : -1;
      let shard620Seen = 0, explosionTick = -1, aoeTick = -1;
      for (let t = 1; t <= 660; t++) {
        g.fixedUpdate(1 / 60);
        const s620 = byId(620);
        if (s620.length > shard620Seen) shard620Seen = s620.length;
        if (explosionTick < 0 && o.dead) explosionTick = t;
        if (aoeTick < 0 && foe && (foe.hp < out.C.foeHp0 || foe.dead)) aoeTick = t;
        if (explosionTick >= 0 && t > explosionTick + 45) break;
      }
      out.C.explosionTick = explosionTick;         // 期望 ≈600
      out.C.shard620Seen = shard620Seen;           // ★原版 10-16；本仓预期 0=缺口
      out.C.aoeHurtTick = aoeTick;                 // 176×176 AoE 命中近敌
      out.C.foeHpEnd = foe ? foe.hp : -1;
      // 爆后残留 618 应被父亡链清空
      out.C.residual618 = byId(618).length;
    }
    if (foe) { g.entities.remove?.(foe) || (foe.dead = true); }
    for (const q of projs()) q.dead = true;
  }

  out.worldOk = !!g.world;
  return out;
});
console.log('[probe] result', JSON.stringify(out, null, 1));
console.log('[probe] pageerrors', pageErrors.length ? pageErrors.slice(0, 3) : 'none');

// ================= D. 观感截图（实时 rAF 两帧） =================
try {
  await page.evaluate(async () => {
    const g = window.__swGame;
    const p = g.player;
    const items = window.__swItems ?? {};
    const key3476 = Object.keys(items).find((k) => k.includes('3476'));
    p.inv.slots[0] = { id: items[key3476], stack: 1 };
    p.inv.selected = 0;
    p.baseMaxMana = 400; p.mana = 400;
    for (const q of g.entities.projectiles) q.dead = true;
    const aimX = p.cx + 260, aimY = p.cy - 30;
    const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    // 连发两轮模拟按住（autoReuse 30t 周期 → 手边恒有新球）
    for (let t = 0; t < 34; t++) { g.input.mouseHeld = true; g.fixedUpdate(1 / 60); }
    g.input.mouseHeld = false;
  });
  await new Promise((r) => setTimeout(r, 350));
  await page.screenshot({ path: '/tmp/sw-bj348-orb-early.png' });
  await new Promise((r) => setTimeout(r, 2200));
  await page.screenshot({ path: '/tmp/sw-bj348-orb-late.png' });
  console.log('[probe] screenshots saved /tmp/sw-bj348-orb-early.png /tmp/sw-bj348-orb-late.png');
} catch (e) {
  console.log('[probe] screenshot fail', String(e).slice(0, 120));
}
await browser.close().catch(() => {});
const ok = out && !out.fail && out.A && out.A.spawned > 0;
process.exit(ok && pageErrors.length === 0 ? 0 : 1);
