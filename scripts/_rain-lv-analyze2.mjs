// 深挖数据分析:定位丢失环节
import fs from 'node:fs';
const { PNG } = await import('pngjs');
const cap = JSON.parse(fs.readFileSync('/tmp/rainlv4/cap.json', 'utf8'));
const frames = JSON.parse(fs.readFileSync('/tmp/rainlv4/frames.json', 'utf8'));
const flush = JSON.parse(fs.readFileSync('/tmp/rainlv4/flush.json', 'utf8'));
console.log(`cap=${cap.length} frames=${frames.length} flush=${flush.length}`);

const u = [0.403, 0.507, 0.761];
const rainHits = (px, w, h) => {
  let hits = 0;
  for (let p = 0; p < px.length; p += 4) {
    const r = px[p], g = px[p + 1], b = px[p + 2];
    const dot = r * u[0] + g * u[1] + b * u[2];
    const d2 = r * r + g * g + b * b - dot * dot;
    if (d2 < 42 * 42 && dot > 60 && dot < 292) hits++;
  }
  return hits;
};
const meanOf = (px) => {
  let r = 0, g = 0, b = 0, n = px.length / 4;
  for (let p = 0; p < px.length; p += 4) { r += px[p]; g += px[p + 1]; b += px[p + 2]; }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
};

// cap 逐帧:rain hits + mean + lightning + trace
const rows = cap.map((c, i) => {
  const f = frames[i];
  return {
    i, L: c.lightning, rainN: c.px ? rainHits(c.px, c.w, c.h) : -1,
    mean: c.px ? meanOf(c.px) : null,
    drops: f?.drops, built: f?.built, emitQ: f?.emit?.quads, emitRet: f?.emit?.ret,
    light: f?.light, bolts: f?.boltDraws, qbbox: f?.qbbox, ctm: f?.ctm,
    flushN0: f?.flushN0, flushN1: f?.flushN1,
  };
});
const bright = rows.filter((r) => r.L > 0.5 && r.rainN >= 0);
const med = bright.length ? bright.map((r) => r.rainN).sort((a, b) => a - b)[bright.length >> 1] : 0;
console.log(`bright frames=${bright.length} med rainN=${med}`);
const vanish = bright.filter((r) => r.rainN < med / 3);
console.log('vanish frames:', vanish.map((v) => v.i).join(','));

// 打印雷期明细(所有 L>0.3 帧前后)
let lo = -1;
for (let i = 0; i < rows.length; i++) {
  if (rows[i].L > 0.3) { if (lo < 0) lo = Math.max(0, i - 1); }
  else if (lo >= 0) {
    console.log(`-- 雷期 ${lo}..${i} --`);
    for (let j = lo; j <= i; j++) {
      const r = rows[j];
      console.log(`#${j} L=${r.L} rainN=${r.rainN} mean=[${r.mean}] drops=${r.drops} built=${r.built} emit=${r.emitQ}/${r.emitRet} light=[${r.light}] bolts=${r.bolts} qbbox=[${r.qbbox}]`);
    }
    lo = -1;
  }
}
if (lo >= 0) {
  console.log(`-- 雷期 ${lo}..end --`);
  for (let j = lo; j < rows.length; j++) {
    const r = rows[j];
    console.log(`#${j} L=${r.L} rainN=${r.rainN} mean=[${r.mean}] drops=${r.drops} built=${r.built} emit=${r.emitQ}/${r.emitRet} light=[${r.light}] bolts=${r.bolts} qbbox=[${r.qbbox}]`);
  }
}

// flush 记录:含雨批 emission 的 FBO 对账
console.log('\n-- 含雨批 flush(--前 40 全像素,FBO 直读) --');
let shown = 0;
for (let i = 0; i < flush.length; i++) {
  const f = flush[i];
  if (!f.hasBatch || !f.dQ) continue;
  if (f.px) {
    const hits = rainHits(f.px, f.fbo.rw, f.fbo.rh);
    console.log(`flush[${i}] n=${f.n} seq=${f.tierSeq.slice(0, 40)} bQ=${f.batchQ} dQ=${f.dQ} fboOpen0=${f.fboOpen0} FBO rainHits=${hits} mean=[${meanOf(f.px)}] err=${f.fbo.err}`);
  } else if (f.fboHits !== undefined) {
    console.log(`flush[${i}] n=${f.n} seq=${f.tierSeq.slice(0, 40)} bQ=${f.batchQ} dQ=${f.dQ} FBO rainHits=${f.fboHits}`);
  } else {
    console.log(`flush[${i}] n=${f.n} seq=${f.tierSeq.slice(0, 40)} bQ=${f.batchQ} dQ=${f.dQ} fboOpen0=${f.fboOpen0} ${f.fboErr ?? ''}`);
  }
  if (++shown >= 30) break;
}
const rebegins = flush.filter((f) => f.suspiciousRebegin);
console.log('\nsuspicious re-begin(world) count:', rebegins.length, rebegins.slice(0, 5).map((r) => JSON.stringify({ clear: r.clear, w: r.w, h: r.h })));

// vanish 帧导图
if (vanish.length) {
  const v = vanish[0].i;
  for (let j = Math.max(0, v - 1); j <= Math.min(cap.length - 1, v + 1); j++) {
    const c = cap[j];
    if (!c.px) continue;
    const png = new PNG({ width: c.w, height: c.h });
    png.data.set(c.px);
    fs.writeFileSync(`/tmp/rainlv4/cap-${j}.png`, PNG.sync.write(png));
  }
  console.log('exported cap frames around', v);
}
