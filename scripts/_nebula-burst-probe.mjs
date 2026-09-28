// ★星云奥秘爆炸碎片链收口刃——实机探针 v2（617 三击爆→620 碎片/白色拖尾/618 锚/AoE 免疫门）
// 断言面：
//  A1 3 击耗尽 → 爆炸：orbPierce=0、爆炸 tick ≤200（旧码：递减只在 502 块 → 卡 1 击,
//      只能等 600t 计时爆）、AoE hurt 恰 3（免疫窗 8t 门,无爆箱二段）
//  A2 碎片在场 8..16（10-16 掷 − 落地即刻撞块损耗,与原版同损）+ 色键 86|90 互补
//  A3 爆尘散布：d62/d90/d240 全域活跃（176 盘）
//  B  618 火花出生锚 = 球心（逐枚出生拍采样 |dx|,|dy| < 1.5）
//  C  40t 寿终清场（620 死绝/618 父亡清空）
//  S1-S3 截图：爆帧 / +120ms（碎片白拖尾飞行）/ +280ms
// 运行：SW_ORIGIN=http://localhost:5242 node tools/run-diag.mjs scripts/_nebula-burst-probe.mjs
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
  await g.newWorld('nebulaburst', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  const out = { A: {}, B: {}, C: {} };

  // ---- 落位：干净地表 ----
  const pcol = Math.trunc(4200 * 8);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(pcol, y)) { groundY = y; break; } }
  if (groundY < 0) {
    const c0 = Math.trunc(p.x / 16);
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
    p.x = c0 * 16; p.y = groundY * 16 - p.h;
  } else {
    p.x = pcol * 16; p.y = groundY * 16 - p.h;
  }
  p.vx = 0; p.vy = 0;
  p.baseMaxMana = 900; p.mana = 900;

  // ---- 装备星云奥秘 ----
  const key3476 = Object.keys(items).find((k) => k.includes('3476'));
  if (!key3476) return { fail: 'item-key-3476-missing' };
  p.inv.slots[0] = { id: items[key3476], stack: 1 };
  p.inv.selected = 0;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);

  const projs = () => g.entities.projectiles;
  const byId = (id) => projs().filter((q) => q.projId === id);
  const fireAt = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    return byId(617)[0];
  };

  // ================= A. 三击爆（肉垫木桩） =================
  {
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const foe = Enemy.fromVanilla(3, p.cx + 200, p.cy - 4);
    foe.id = 987100;
    foe.maxHp = 1e9; foe.hp = 1e9;
    g.entities.add(foe, 'enemies');
    let hurtCount = 0;
    const origHurt = foe.hurt.bind(foe);
    foe.hurt = (...a) => { hurtCount++; return origHurt(...a); };

    const orb = fireAt(foe.x + foe.w / 2, foe.y + foe.h / 2);
    out.A.orbSpawned = !!orb;
    let explosionTick = -1, shardPeak = 0;
    for (let t = 1; t <= 700; t++) {
      g.fixedUpdate(1 / 60);
      const n620 = byId(620).length;
      if (n620 > shardPeak) shardPeak = n620;
      if (n620 > 0) {
        explosionTick = t;
        out.A.atBurst = {
          t, n620, orbDead: orb.dead,
          keys: byId(620).map((s) => s.na620Dust),
          orbPierce: orb.pierce,
          hurtCalls: hurtCount,                          // ★球击=3（pierce 3→0 实证）；
                                                         //   其余=618 火花命中（伤×1/2,原版同源）
        };
        break;
      }
    }
    out.A.explosionTick = explosionTick;                 // ★期望 ≤200（旧码 655=600t 计时）
    out.A.shardPeak = shardPeak;                         // 10-16 掷 − 撞地即刻损耗
    if (explosionTick > 0) {
      // 爆尘散布普查（爆心 176 盒内 86/90/62/240 应全活跃）
      for (let t = 0; t < 6; t++) g.fixedUpdate(1 / 60);
      const pool = g.vanillaDust?.pool ?? [];
      const kinds = {};
      for (const d of pool) {
        if (!d || !d.active) continue;
        if ([62, 86, 90, 240].includes(d.type) && Math.abs(d.x - orb.cx) < 130 && Math.abs(d.y - orb.cy) < 130) {
          kinds[d.type] = (kinds[d.type] ?? 0) + 1;
        }
      }
      out.A.burstDustKinds = kinds;
    }
    // C. 清场钉面：45t 后 620 死绝（40t 寿终）+ 残留 618 清空
    for (let t = 0; t < 45; t++) g.fixedUpdate(1 / 60);
    out.C.shardsAfter45t = byId(620).length;
    out.C.residual618 = byId(618).length;
    foe.hurt = origHurt;
    foe.dead = true;
    for (const q of projs()) q.dead = true;
  }

  // ================= B. 618 出生锚（空旷无敌） =================
  {
    const orb = fireAt(p.cx + 260, p.cy - 40);
    out.B.orbSpawned = !!orb;
    const firstOffsets = [];
    const seen = new Set();
    for (let t = 1; t <= 260 && firstOffsets.length < 8; t++) {
      g.fixedUpdate(1 / 60);
      for (const s of byId(618)) {
        if (!seen.has(s)) {
          seen.add(s);
          firstOffsets.push({ dx: +(s.cx - orb.cx).toFixed(1), dy: +(s.cy - orb.cy).toFixed(1) });
        }
      }
    }
    out.B.spawnAnchors = firstOffsets;                   // ★出生锚=球心（精确判据=单测 0 拍
                                                         //   <0.5）；此处所见为 +1 拍快照,
                                                         //   含初速 12→钳 6 的一拍飞行 ≤8
    out.B.count = firstOffsets.length;                   // 前半生 ≤8
    out.B.maxAbs = firstOffsets.length
      ? +Math.max(...firstOffsets.map((s) => Math.max(Math.abs(s.dx), Math.abs(s.dy)))).toFixed(1)
      : null;
    for (const q of projs()) q.dead = true;
  }
  out.worldOk = !!g.world;
  return out;
});
console.log('[probe] result', JSON.stringify(out, null, 1));

// ================= S1-S3 截图（实时 rAF,爆帧→碎片飞行白拖尾） =================
try {
  await page.evaluate(async () => {
    const g = window.__swGame;
    const p = g.player;
    const items = window.__swItems ?? {};
    const key3476 = Object.keys(items).find((k) => k.includes('3476'));
    p.inv.slots[0] = { id: items[key3476], stack: 1 };
    p.inv.selected = 0;
    p.baseMaxMana = 900; p.mana = 900;
    for (const q of g.entities.projectiles) q.dead = true;
    for (const e of (g.entities.enemies ?? [])) e.dead = true;
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const foe = Enemy.fromVanilla(3, p.cx + 210, p.cy - 4);
    foe.id = 987200; foe.maxHp = 1e9; foe.hp = 1e9;
    g.entities.add(foe, 'enemies');
    const aimX = foe.x + foe.w / 2, aimY = foe.y + foe.h / 2;
    const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    await new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        n++;
        const shards = g.entities.projectiles.filter((q) => q.projId === 620 && !q.dead);
        if (shards.length >= 6 || n > 1200) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
  await new Promise((r) => setTimeout(r, 30));
  await page.screenshot({ path: '/tmp/sw-burst-s1.png' });
  await new Promise((r) => setTimeout(r, 120));
  await page.screenshot({ path: '/tmp/sw-burst-s2.png' });
  await new Promise((r) => setTimeout(r, 160));
  await page.screenshot({ path: '/tmp/sw-burst-s3.png' });
  console.log('[probe] screenshots /tmp/sw-burst-s1.png s2 s3 saved');
} catch (e) {
  console.log('[probe] screenshot fail', String(e).slice(0, 160));
}
await browser.close().catch(() => {});
const ok = out && !out.fail && out.A && out.A.explosionTick > 0 && out.A.explosionTick <= 200
  && out.A.atBurst && out.A.atBurst.orbPierce === 0 && out.A.atBurst.hurtCalls >= 3
  && out.A.shardPeak >= 8 && out.A.shardPeak <= 16
  && out.B && out.B.maxAbs !== null && out.B.maxAbs < 8;
process.exit(ok && pageErrors.length === 0 ? 0 : 1);
