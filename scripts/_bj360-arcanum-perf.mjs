// ★BJ360 星云奥秘爆炸 perf 画像探针（一次性诊断,经 tools/run-diag.mjs 运行）
// 环境变量：SW_ORIGIN（缺省 http://localhost:5202）私域实例；BOOMS（爆点批序列,逗号分隔枚数）
// 画像面：g.frame CPU 总时 + 分解（fixedUpdate / renderer.render / dust spawn / dust update /
//   dust lit+fullbright 两 pass / drawDustPremul 调用数 / gore / lighting addLight+compute）+
//   rAF 间隔（rafDt=真实帧时,>16.7 即掉帧）+ 活跃尘数。全部 CPU 侧计时（perf 判例:GPU 页不挂 trace）。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const BOOMS = (process.env.BOOMS || '3,8').split(',').map((s) => parseInt(s, 10));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2000));

await p.evaluate(() => {
  const g = window.__swGame;
  const P = (window.__bj360 = { recs: [], marks: [], orbs: [], doKillN: 0, goreSpawn: 0 });
  const acc0 = () => ({
    upd: 0, render: 0, dustSpawnN: 0, dustSpawnT: 0, dustUpdT: 0,
    addLightN: 0, addLightT: 0, computeT: 0,
    dustLitT: 0, dustFbT: 0, dustDrawN: 0, goreT: 0,
  });
  const proto = Object.getPrototypeOf(g);
  const protoFrame = proto.frame;
  let lastTs = performance.now();
  g.frame = function (now) {
    const a = (P._acc = acc0());
    const t0 = performance.now();
    try {
      return protoFrame.call(this, now);
    } finally {
      const t1 = performance.now();
      P.recs.push({
        t: now, cpu: +(t1 - t0).toFixed(2), rafDt: +(now - lastTs).toFixed(2), ...a,
        activeDust: this.vanillaDust?.activeCount ?? -1,
      });
      lastTs = now;
      if (P.recs.length > 6000) P.recs.shift();
    }
  };
  const protoUpd = proto.fixedUpdate;
  g.fixedUpdate = function (dt) {
    if (P.doKillN > 0) {
      P.doKillN = 0;
      P.marks.push({ t: performance.now(), rec: P.recs.length });
      for (const o of P.orbs) { try { if (!o.dead) o.killNow(this); } catch { /* noop */ } }
    }
    const t0 = performance.now();
    try { return protoUpd.call(this, dt); }
    finally { P._acc.upd += performance.now() - t0; }
  };
  const protoSd = proto.spawnDust;
  g.spawnDust = function (...args) {
    const t0 = performance.now();
    try { return protoSd.apply(this, args); }
    finally { P._acc.dustSpawnN++; P._acc.dustSpawnT += performance.now() - t0; }
  };
  const VD = g.vanillaDust;
  const protoVdu = Object.getPrototypeOf(VD).update;
  VD.update = function (...args) {
    const t0 = performance.now();
    try { return protoVdu.apply(this, args); }
    finally { P._acc.dustUpdT += performance.now() - t0; }
  };
  const L = g.lighting;
  const protoAl = Object.getPrototypeOf(L).addLight;
  L.addLight = function (x, y, r, gg, bb) {
    P._acc.addLightN++;
    const t0 = performance.now();
    try { return protoAl.call(this, x, y, r, gg, bb); }
    finally { P._acc.addLightT += performance.now() - t0; }
  };
  const protoCm = Object.getPrototypeOf(L).compute;
  L.compute = function (d) {
    const t0 = performance.now();
    try { return protoCm.call(this, d); }
    finally { P._acc.computeT += performance.now() - t0; }
  };
  const R = g.renderer;
  const RP = Object.getPrototypeOf(R);
  const protoRender = RP.render;
  R.render = function (...args) {
    const t0 = performance.now();
    try { return protoRender.apply(this, args); }
    finally { P._acc.render += performance.now() - t0; }
  };
  const protoDustPass = RP.drawVanillaDustPass;
  R.drawVanillaDustPass = function (fb, cam, player) {
    const t0 = performance.now();
    try { return protoDustPass.call(this, fb, cam, player); }
    finally {
      const d = performance.now() - t0;
      if (fb) P._acc.dustFbT += d; else P._acc.dustLitT += d;
    }
  };
  const protoDDP = RP.drawDustPremul;
  R.drawDustPremul = function (...args) { P._acc.dustDrawN++; return protoDDP.apply(this, args); };
  const protoGore = RP.drawGorePieces;
  R.drawGorePieces = function (ctx, cam, vw, vh) {
    const t0 = performance.now();
    try { return protoGore.call(this, ctx, cam, vw, vh); }
    finally { P._acc.goreT += performance.now() - t0; }
  };
  // 基线静默期记录起终点
  P.baselineStart = P.recs.length;
});

// 生成器：直接 spawn 617 球（Arrow ctor 与 BJ348b 测试同签名），慢速段起步（|v|<4）
// ai0 计到 ≥250 即满配 9 枚 618 火花（30,60,...,240 共 9 掷）→ 最坏爆炸工况
async function boom(n) {
  await p.evaluate(async (nOrbs) => {
    const g = window.__swGame;
    const P = window.__bj360;
    const { Arrow } = await import('/src/entities/Arrow.ts');
    const pl = g.player;
    P.orbs = [];
    for (let i = 0; i < nOrbs; i++) {
      const orb = new Arrow(pl.cx - 10 + (i % 4) * 4, pl.cy - 90 - Math.floor(i / 4) * 30,
        3.9, 0, 100, 5, 617, { grav: 0, life: 3600, pierce: 3 });
      g.entities.add(orb, 'projectiles');
      P.orbs.push(orb);
    }
    P.boomN = nOrbs;
    P.stage = 'fly';
  }, n);
  // 等所有球慢速段 ai0 ≥ 250（60Hz 逻辑步进 ≈ 260/60 s + 起飞余量）
  await p.waitForFunction(() => {
    const P = window.__bj360;
    return P.orbs.every((o) => o.dead || o.na617Ai0 >= 250);
  }, { timeout: 30000, polling: 200 });
  // 取消意外死亡球影响记录（dead 球不再 killNow）
  await p.evaluate(() => {
    const P = window.__bj360;
    P.stage = 'boom';
    P.doKillN = 1;                       // 下一 fixedUpdate 帧内引信（spawn 计入该帧分解）
    P.orbs = P.orbs.filter((o) => !o.dead);
  });
  await new Promise((r) => setTimeout(r, 3200));   // 爆炸 + 620 追踪弹 40t 尾迹 + 尘衰减
  await p.evaluate(() => { window.__bj360.stage = 'settle'; });
}

// 基线 3s（常态：只有玩家光环/Torch 等环境尘,无球）
await new Promise((r) => setTimeout(r, 3000));

const stageMarks = [];
for (const n of BOOMS) {
  const before = await p.evaluate(() => window.__bj360.recs.length);
  await boom(n);
  const after = await p.evaluate(() => window.__bj360.recs.length);
  stageMarks.push({ n, before, after });
}

const data = await p.evaluate(() => JSON.stringify({
  recs: window.__bj360.recs, marks: window.__bj360.marks, stageMarks: window.__bj360.stageMarksSnapshot || null,
}));
await p.evaluate(() => { window.__bj360.stageMarksSnapshot = window.__bj360.stageMarks; });
const out = JSON.parse(data);

// ---- 分析 ----
const recs = out.recs;
const markRecIdx = out.marks.map((m) => m.rec);   // 引信帧在 recs 中的下标（push 于 kill 前）
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : NaN; };

console.log('==== 基线（爆前 3s 全帧）====');
const bl = recs.slice(0, Math.max(0, markRecIdx[0] - 30));
const blCpu = bl.map((r) => r.cpu), blRaf = bl.map((r) => r.rafDt);
console.log(`n=${bl.length} cpu med=${med(blCpu).toFixed(2)} p95=${pct(blCpu, 0.95).toFixed(2)} max=${Math.max(...blCpu).toFixed(2)} | raf med=${med(blRaf).toFixed(2)} p95=${pct(blRaf, 0.95).toFixed(2)} max=${Math.max(...blRaf).toFixed(2)} | activeDust med=${med(bl.map((r) => r.activeDust))}`);

let off = 0;
for (const sm of stageMarks) {
  const idx = markRecIdx[off++];
  console.log(`\n==== 爆发 ${sm.n} 球（mark recs[${idx}]）====`);
  const win = recs.slice(idx, Math.min(recs.length, idx + 60));
  console.log('帧#  cpu   rafDt  upd  render dustSp(T/N) dustUpd litPass fbPass drawN gore  lightsN addL(T) compute active');
  win.slice(0, 24).forEach((r, i) => {
    console.log(
      `${String(i).padStart(3)} ${r.cpu.toFixed(2).padStart(6)} ${r.rafDt.toFixed(1).padStart(6)}` +
      ` ${r.upd.toFixed(2).padStart(6)} ${r.render.toFixed(2).padStart(6)}` +
      ` ${r.dustSpawnT.toFixed(2).padStart(5)}/${String(r.dustSpawnN).padStart(4)}` +
      ` ${r.dustUpdT.toFixed(2).padStart(6)} ${r.dustLitT.toFixed(2).padStart(6)} ${r.dustFbT.toFixed(2).padStart(6)}` +
      ` ${String(r.dustDrawN).padStart(5)} ${r.goreT.toFixed(2).padStart(5)}` +
      ` ${String(r.addLightN).padStart(6)} ${r.addLightT.toFixed(2).padStart(6)} ${r.computeT.toFixed(2).padStart(6)} ${String(r.activeDust).padStart(5)}`);
  });
  const eWin = win.slice(0, 6);
  const sustained = win.slice(4, 44);
  const blTail = bl.slice(-120);
  console.log(`爆炸窗(前6帧) cpu max=${Math.max(...eWin.map((r) => r.cpu)).toFixed(2)} raf max=${Math.max(...eWin.map((r) => r.rafDt)).toFixed(1)}`);
  console.log(`尾迹窗(4..44帧) cpu med=${med(sustained.map((r) => r.cpu)).toFixed(2)} p95=${pct(sustained.map((r) => r.cpu), 0.95).toFixed(2)} max=${Math.max(...sustained.map((r) => r.cpu)).toFixed(2)} | raf max=${Math.max(...sustained.map((r) => r.rafDt)).toFixed(1)} | activeDust med=${med(sustained.map((r) => r.activeDust))} max=${Math.max(...sustained.map((r) => r.activeDust))}`);
  console.log(`基线对照 cpu med=${med(blTail.map((r) => r.cpu)).toFixed(2)} p95=${pct(blTail.map((r) => r.cpu), 0.95).toFixed(2)} max=${Math.max(...blTail.map((r) => r.cpu)).toFixed(2)}`);
  // 爆炸帧分解求和
  const b0 = win[0];
  if (b0) {
    const parts = { upd: b0.upd, render: b0.render, dustSpawnT: b0.dustSpawnT, dustUpdT: b0.dustUpdT, dustLitT: b0.dustLitT, dustFbT: b0.dustFbT, goreT: b0.goreT, addLightT: b0.addLightT, computeT: b0.computeT };
    const sum = Object.values(parts).reduce((a, b2) => a + b2, 0);
    console.log(`爆炸帧分解: ` + Object.entries(parts).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' ') + ` | 分解和=${sum.toFixed(2)} vs cpu=${b0.cpu.toFixed(2)} | dustSpawnN=${b0.dustSpawnN} drawN=${b0.dustDrawN} lightsN=${b0.addLightN}`);
  }
}
await b.close();
console.log('\n[probe done]');
