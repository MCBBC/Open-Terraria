// ★BJ360 画像②：A=0 直绘支 getImageData 读回归因 + 尘型直方图（一次性诊断）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const BOOMS = (process.env.BOOMS || '1,3').split(',').map((s) => parseInt(s, 10));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2000));

await p.evaluate(() => {
  const g = window.__swGame;
  const P = (window.__bj360 = { recs: [], marks: [], orbs: [], doKillN: 0 });
  const acc0 = () => ({
    upd: 0, render: 0, dustSpawnN: 0, dustLitT: 0, dustFbT: 0,
    gidN: 0, gidT: 0, pidN: 0, pidT: 0,
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
      P.recs.push({ t: now, cpu: +(t1 - t0).toFixed(2), rafDt: +(now - lastTs).toFixed(2), ...a });
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
    P._acc.dustSpawnN++;
    return protoSd.apply(this, args);
  };
  const R = g.renderer;
  const RP = Object.getPrototypeOf(R);
  const protoDustPass = RP.drawVanillaDustPass;
  R.drawVanillaDustPass = function (fb, cam, player) {
    const t0 = performance.now();
    try { return protoDustPass.call(this, fb, cam, player); }
    finally {
      const d = performance.now() - t0;
      if (fb) P._acc.dustFbT += d; else P._acc.dustLitT += d;
    }
  };
  // canvas 读回归因（全页 getImageData/putImageData 计时——尘 A=0 支为爆炸窗主导消费者）
  const CP = CanvasRenderingContext2D.prototype;
  const oGid = CP.getImageData, oPid = CP.putImageData;
  CP.getImageData = function (...args) {
    const t0 = performance.now();
    try { return oGid.apply(this, args); }
    finally { P._acc.gidN++; P._acc.gidT += performance.now() - t0; }
  };
  CP.putImageData = function (...args) {
    const t0 = performance.now();
    try { return oPid.apply(this, args); }
    finally { P._acc.pidN++; P._acc.pidT += performance.now() - t0; }
  };
});

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
  }, n);
  await p.waitForFunction(() => {
    const P = window.__bj360;
    return P.orbs.every((o) => o.dead || o.na617Ai0 >= 250);
  }, { timeout: 30000, polling: 200 });
  await p.evaluate(() => {
    const P = window.__bj360;
    P.doKillN = 1;
    P.orbs = P.orbs.filter((o) => !o.dead);
  });
  await new Promise((r) => setTimeout(r, 3200));
}

await new Promise((r) => setTimeout(r, 2500));
const stageMarks = [];
for (const n of BOOMS) {
  const before = await p.evaluate(() => window.__bj360.recs.length);
  await boom(n);
  const after = await p.evaluate(() => window.__bj360.recs.length);
  stageMarks.push({ n, before, after });
}
// 尘型直方图（尾迹窗中部采样一次）
const hist = await p.evaluate(() => {
  const vd = window.__swGame.vanillaDust;
  const h = {};
  for (const d of vd.pool) {
    if (!d.active) continue;
    h[d.type] = (h[d.type] || 0) + 1;
  }
  return { h, total: Object.values(h).reduce((a, c) => a + c, 0) };
});

const out = await p.evaluate(() => JSON.stringify({ recs: window.__bj360.recs, marks: window.__bj360.marks }));
const { recs, marks } = JSON.parse(out);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : NaN; };

console.log('尘型直方图（尾迹窗采样）:', JSON.stringify(hist));
let off = 0;
for (const sm of stageMarks) {
  const idx = marks[off++].rec;
  console.log(`\n==== 爆发 ${sm.n} 球（recs[${idx}]）====`);
  const win = recs.slice(idx, Math.min(recs.length, idx + 50));
  console.log('帧#   cpu  rafDt   upd render  dustSp  litT   fbT   gidN   gidT  pidN   pidT');
  win.slice(0, 30).forEach((r, i) => {
    console.log(
      `${String(i).padStart(3)} ${r.cpu.toFixed(1).padStart(6)} ${r.rafDt.toFixed(0).padStart(6)}` +
      ` ${r.upd.toFixed(1).padStart(6)} ${r.render.toFixed(1).padStart(6)} ${String(r.dustSpawnN).padStart(6)}` +
      ` ${r.dustLitT.toFixed(2).padStart(6)} ${r.dustFbT.toFixed(2).padStart(5)}` +
      ` ${String(r.gidN).padStart(6)} ${r.gidT.toFixed(1).padStart(6)} ${String(r.pidN).padStart(6)} ${r.pidT.toFixed(1).padStart(6)}`);
  });
  const sustained = win.slice(4, 44);
  console.log(`尾迹窗: cpu med=${med(sustained.map((r) => r.cpu)).toFixed(1)} p95=${pct(sustained.map((r) => r.cpu), 0.95).toFixed(1)} max=${Math.max(...sustained.map((r) => r.cpu)).toFixed(1)} | raf max=${Math.max(...sustained.map((r) => r.rafDt)).toFixed(0)}`);
  console.log(`尾迹窗: litT med=${med(sustained.map((r) => r.dustLitT)).toFixed(2)} p95=${pct(sustained.map((r) => r.dustLitT), 0.95).toFixed(2)} | gidT med=${med(sustained.map((r) => r.gidT)).toFixed(2)} p95=${pct(sustained.map((r) => r.gidT), 0.95).toFixed(2)} max=${Math.max(...sustained.map((r) => r.gidT)).toFixed(2)} | gidN max=${Math.max(...sustained.map((r) => r.gidN))}`);
}
await b.close();
console.log('\n[probe2 done]');
