// ★BJ687 定谳探针：血红法杖蝙蝠两面——
//   Phase A（残影链诊断,确定性）：直读 bat.ghostRing 填充态 + 攻击弧 20t 后的环
//     快照（772 假说=755 早退分支缺 recordGhostTrail → 环恒空 → 绯红残影整链不渲染）
//   Phase B（接触伤害,真实链）：4 蝙蝠 + 高血敌,泵 600t,逐 30t 采样敌 hp/蝙蝠态
//   Phase C（视觉对拍）：强推 1 蝙蝠入弧（bA0=30）→ 18t → g.frame 渲染 → 画布
//     裁剪落盘（离线与原版截图 130 同脚本簇分析对拍）+ 页内绯红簇速报
// 用法: SW_ORIGIN=http://localhost:5206 node tools/run-diag.mjs scripts/_bj687-sanguine-bats.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger, freezeClock } from '../tools/probe/lib/index.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';
import fs from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5206';
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('世界就绪', gen.ok, JSON.stringify(gen).slice(0, 100));
await freezeClock(page, { tod: 0.345 });
await pump(page, 40);

// ---------- 场景：天空走廊 + 高血敌 ----------
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  p.debugGod = true;
  const st = g.world.store;
  const surf = [];
  for (let tx = 40; tx <= 110; tx++) {
    for (let ty = 8; ty < st.h; ty++) { if (st.hasTile(tx, ty)) { surf.push(ty); break; } }
  }
  surf.sort((a, b) => a - b);
  const topRow = surf[Math.floor(surf.length / 2)];
  p.x = 60 * 16; p.y = (topRow - 8) * 16; p.vx = 0; p.vy = 0;
  g.camera.x = p.cx; g.camera.y = p.cy;
  return { px: p.cx, py: p.cy, topRow };
});
console.log('场景:', JSON.stringify(setup));

// 敌怪（蓝弹跳怪 vid 3,落地后原地跳,不主动远追）
const eMeta = await spawnEnemy(page, 3, setup.px + 300, setup.py + 60);
L.chk('敌怪生成', eMeta.ok, JSON.stringify(eMeta).slice(0, 100));

// ---------- 授 buff 213 + 4 蝙蝠 ----------
const batInfo = await page.evaluate(async ({ ex, ey }) => {
  const g = window.__swGame;
  const p = g.player;
  const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
  const bt = buffTypeByVanilla(213);
  if (bt) p.buffs.set(bt, 300);          // MINION_BUFFS 杀支门（无 buff=同拍清杀）
  p.maxMinions = 6;                      // 探针直造 4 只绕开召唤链——须抬槽位防每拍自裁（:11040 原版 16812-16845）
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const m = new MinionProj(p.cx - 5, p.cy - 5, 755, 40, 4, false, 0, false, () => g.player);
    g.entities.add(m, 'projectiles');
    ids.push(m.id);
  }
  return { bt: String(bt), ids };
}, {});
console.log('蝙蝠:', JSON.stringify(batInfo));
L.chk('buff 213 授予', batInfo.bt !== 'undefined', `bt=${batInfo.bt}`);

// ---------- Phase B：接触伤害（600t 泵,逐 30t 采样） ----------
const dmgTrace = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const findBats = () => g.entities.projectiles.filter((e) => !e.dead && e.projId === 755);
  const trace = [];
  let enemy0 = null;
  for (const e of g.entities.enemies) if (e.vanillaId === 3 && !e.dead) { enemy0 = e; break; }
  if (enemy0) { enemy0.hp = 20000; enemy0.lifeMax = 20000; }
  for (let t = 0; t < 600; t += 30) {
    for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
    await wait(0);
    const bats = findBats();
    const en = g.entities.enemies.find((e) => e.vanillaId === 3 && !e.dead) ?? null;
    trace.push({
      t: t + 30,
      hp: en ? en.hp : null,
      enemyAlive: !!en,
      bats: bats.length,
      attacking: bats.filter((b) => b.bA0 !== 0).length,
      batPoses: bats.map((b) => [Math.round(b.cx - g.player.cx), Math.round(b.cy - g.player.cy)]),
    });
  }
  return { trace, enemyId: enemy0?.id ?? null };
}, {});
console.log('\nPhaseB 接触伤害轨迹:');
for (const s of dmgTrace.trace) {
  console.log(`  t=${s.t} hp=${s.hp} bats=${s.bats}(攻${s.attacking}) 敌Δ=(${s.batPoses.map((q) => q.join(',')).slice(0, 2).join(' | ')})`);
}
const firstHp = dmgTrace.trace[0]?.hp ?? null;
const lastHp = dmgTrace.trace[dmgTrace.trace.length - 1]?.hp ?? null;
const hpDrop = firstHp !== null && lastHp !== null ? firstHp - lastHp : -1;
console.log(`  → hp 首末: ${firstHp} → ${lastHp}（Δ=${hpDrop},attack 轮次有值=${dmgTrace.trace.some((s) => s.attacking > 0)}）`);

// ---------- Phase A：残影环诊断（确定性） ----------
const ringInfo = await page.evaluate(async () => {
  const g = window.__swGame;
  // 单蝙蝠隔离：其余 755 全杀（消除交叉干扰）
  const bats = g.entities.projectiles.filter((e) => !e.dead && e.projId === 755);
  for (let i = 1; i < bats.length; i++) bats[i].dead = true;
  const bat = bats[0];
  if (!bat) return { ok: false, why: 'no-bat' };
  const en = g.entities.enemies.find((e) => !e.dead);
  if (!en) return { ok: false, why: 'no-enemy' };
  // 定靶谓词直测
  const { canBeChasedBy } = await import('/src/entities/projTargets.ts');
  const tgtProbe = {
    found: !!bat.findEnemyById(g, en.id),
    chaseable: canBeChasedBy(en),
    enId: en.id, enVid: en.vanillaId, enDead: en.dead,
  };
  bat.bA0 = 30; bat.bA1 = en.id; bat.bHit.clear();
  window.__bj687Trace = [];
  // 原型包装：全内部链插桩（findEnemyById/tTarget/bHitTick/进出态）
  const proto = Object.getPrototypeOf(bat);
  const { canBeChasedBy: cbc } = await import('/src/entities/projTargets.ts');
  const orig = proto.batOfLightBody;
  proto.batOfLightBody = function (gg, pp, dd) {
    const ev = [];
    (window.__bj687Trace ??= []).push(ev);
    ev.push(`enter:a0=${this.bA0},a1=${this.bA1},p=${Math.round(this.cx)},${Math.round(this.cy)}`);
    const origFEI = proto.findEnemyById;
    proto.findEnemyById = function (g2, id2) {
      const t = origFEI.call(this, g2, id2);
      ev.push(`fei(${id2})→${t ? `ok chase=${cbc(t)}` : 'null'}`);
      return t;
    };
    const origTT = proto.tTarget;
    proto.tTarget = function (g2, x2, y2) {
      const t = origTT.call(this, g2, x2, y2);
      ev.push(`tTarget→${t ? `id${t.id} vid${t.vanillaId}` : 'null'}`);
      return t;
    };
    const origBHT = proto.bHitTick;
    proto.bHitTick = function (g2, pp2, dd2) {
      ev.push(`bHT-in:a0=${this.bA0},p=${Math.round(this.cx)},${Math.round(this.cy)}`);
      const r = origBHT.call(this, g2, pp2, dd2);
      return r;
    };
    try {
      const r = orig.call(this, gg, pp, dd);
      ev.push(`exit:a0=${this.bA0},a1=${this.bA1},p=${Math.round(this.cx)},${Math.round(this.cy)}`);
      return r;
    } finally {
      proto.findEnemyById = origFEI; proto.tTarget = origTT; proto.bHitTick = origBHT;
    }
  };
  const ring0 = { cap: bat.ghostRing?.cap, mode: bat.ghostRing?.mode, filled: bat.ghostRing?.filled };
  // 逐拍态采样（前 8 拍）：钉弧段是否中断/何时中断
  const seq = [];
  for (let i = 0; i < 20; i++) {
    g.fixedUpdate(1 / 60);
    if (i < 8) seq.push({ t: i + 1, bA0: bat.bA0, bA1: bat.bA1, cx: Math.round(bat.cx), cy: Math.round(bat.cy), dead: bat.dead });
  }
  const r = bat.ghostRing;
  const slots = [];
  if (r) for (let i = 0; i < 6; i++) slots.push(r.at(i) ? [Math.round(r.px[i]), Math.round(r.py[i])] : null);
  proto.batOfLightBody = orig;   // 还原原型（防污染后续 Phase C）
  return {
    ok: true, tgtProbe, ring0, after: r ? { filled: r.filled, cap: r.cap } : null,
    slots, batPos: [Math.round(bat.cx), Math.round(bat.cy)],
    bA0: bat.bA0, dead: bat.dead, seq, batsBefore: bats.length,
    trace: (window.__bj687Trace ?? []).slice(0, 3),
  };
}, {});
console.log('\nPhaseA 残影环:', JSON.stringify(ringInfo));
L.chk('755 幽灵环在攻击弧中填充（filled≥5）',
  !!ringInfo.after && ringInfo.after.filled >= 5,
  `filled=${ringInfo.after?.filled ?? 'null'} slots=${JSON.stringify(ringInfo.slots)}`);

// ---------- Phase C：视觉对拍（弧中程渲染 + 绯红簇速报） ----------
const visual = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { canBeChasedBy } = await import('/src/entities/projTargets.ts');
  const bat = g.entities.projectiles.find((e) => !e.dead && e.projId === 755);
  if (!bat) return { ok: false, why: 'no-bat' };
  // 定靶=可追击敌（PhaseA 教训:首敌可能是不可追击的世界怪,注入即正确复位）
  const en = g.entities.enemies.find((e) => !e.dead && canBeChasedBy(e));
  if (en) { bat.bA0 = 66; bat.bA1 = en.id; bat.bHit.clear(); }
  let vnow = performance.now();
  // 泵到弧中程（decel 7t + 弧 ~30t ≈ 38t）
  for (let f = 0; f < 38; f++) {
    vnow += 1000 / 60;
    g.frame(vnow);
    await wait(1);
  }
  g.camera.x = bat.cx; g.camera.y = bat.cy;
  vnow += 1000 / 60;
  g.frame(vnow); await wait(2);
  vnow += 1000 / 60;
  g.frame(vnow); await wait(60);
  // 画布裁剪（渲染器真值画布,BJ686 判例:page.screenshot 走合成层不可靠）
  const cv = g.renderer.canvas;
  const cc = document.createElement('canvas');
  cc.width = 640; cc.height = 420;
  const scr = g.camera.worldToScreen(bat.cx, bat.cy);
  const x = Math.max(0, Math.min(cv.width - 640, scr[0] - 320));
  const y = Math.max(0, Math.min(cv.height - 420, scr[1] - 210));
  cc.getContext('2d').drawImage(cv, x, y, 640, 420, 0, 0, 640, 420);
  const crop = cc.toDataURL('image/png');
  // 页内绯红簇速报（与离线 Python 同谓词）
  const c2 = cc.getContext('2d');
  const img = c2.getImageData(0, 0, 640, 420);
  const d = img.data;
  const mask = new Uint8Array(640 * 420);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 30) continue;
    if (r > 90 && gg < r * 0.55 && b < r * 0.8 && r - gg > 60) mask[p] = 1;
  }
  let total = 0;
  for (let i = 0; i < mask.length; i++) total += mask[i];
  // 联通簇（粗扫:行列投影带）
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let yy = 0; yy < 420; yy++) for (let xx = 0; xx < 640; xx++) {
    if (mask[yy * 640 + xx]) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
  }
  return {
    ok: true, crimsonPx: total,
    bbox: total ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null,
    batPos: [Math.round(bat.cx), Math.round(bat.cy)], scr: [Math.round(scr[0]), Math.round(scr[1])],
    cropAt: [x, y], png: crop, ringFilled: bat.ghostRing?.filled ?? null, bA0: bat.bA0,
  };
}, {});
if (visual.png) {
  fs.writeFileSync('/tmp/bj687-arc-crop.png', Buffer.from(visual.png.split(',')[1] ?? '', 'base64'));
}
console.log('\nPhaseC 视觉:', JSON.stringify({ ...visual, dataUrl: undefined }));
L.chk('弧中程绯红簇存在（crimsonPx>200）', (visual.crimsonPx ?? 0) > 200, `crimsonPx=${visual.crimsonPx} bbox=${JSON.stringify(visual.bbox)}`);

await browser.close();
L.print();
process.exit(L.exitCode());
