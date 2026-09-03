// 定位 .wld 世界的沙漠(沙带 x 范围+表面高度)——为原版运行时比对导航
// 用法: SW_WLD=<路径> node tools/run-diag.mjs scripts/_wld-desert-locate.mjs
import fs from 'node:fs';
import path from 'node:path';
const vite = await import('vite');
const server = await vite.createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
});
const { parseWldToSave } = await server.ssrLoadModule('/src/wld/WldImport.ts');

const WLD = process.env.SW_WLD ?? path.join(process.env.HOME, 'Library/Application Support/Terraria/Worlds/SandboxWorld世界.wld');
const r = parseWldToSave(new Uint8Array(fs.readFileSync(WLD)));
const save = r.save;
const h = save.header;
const spawnX = h.spawnX ?? h.spawn?.[0] ?? -1, spawnY = h.spawnY ?? h.spawn?.[1] ?? -1;
console.log(`世界「${h.name}」 ${h.width}×${h.height} groundLevel=${h.groundLevel} rockLevel=${h.rockLevel} spawn=(${spawnX},${spawnY}) desertBG=${h.bgStyles?.desert}`);

// 解 tiles(稳定/内部 id 空间都试):RLE varint 流 → 每列 near-surface 沙计数
const b64 = save.tiles;
const raw = Buffer.from(b64, 'base64');
let pos = 0;
const rv = () => { let s = 0, v = 0; for (;;) { const b = raw[pos++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; } return v >>> 0; };
const W = h.width, H = h.height;
const yLim = Math.round((h.groundLevel ?? 300) + 90);
// 对每个候选 id 统计"表面带内沙柱"列覆盖
const cand = {};
let idx = 0;
const n = W * H;
while (pos < raw.length && idx < n) {
  const run = rv() + 1;
  const t = rv();
  if (t !== 0) { rv(); rv(); }
  if (t !== 0) {
    const c = cand[t] ?? (cand[t] = new Int32Array(W));
    const end = Math.min(idx + run, n);
    for (let k = idx; k < end; k++) {
      const yy = Math.floor(k / W);
      if (yy > yLim) break;
      const xx = k - yy * W;
      c[xx]++;
    }
  }
  idx += run;
}
// 取列覆盖最宽且连续≥300 列的前 3 个 id
const score = Object.entries(cand).map(([t, c]) => {
  let best = 0, run = 0, b1 = 0, b2 = 0, rs = -1;
  for (let x = 0; x < W; x++) {
    if (c[x] >= 40) { if (rs < 0) rs = x; }
    else if (rs >= 0) { if (x - rs > best) { best = x - rs; b1 = rs; b2 = x; } rs = -1; }
  }
  if (rs >= 0 && W - rs > best) { best = W - rs; b1 = rs; b2 = W; }
  return { t: +t, best, b1, b2, total: c.reduce((a, v) => a + v, 0) };
}).filter((e) => e.best >= 60).sort((a, b) => b.best - a.best).slice(0, 6);
console.log('表面带宽带候选 id(内部 id 空间):', score.map((e) => `id${e.t}: x ${e.b1}..${e.b2} (宽${e.best})`).join(' ; '));
// 每个候选给表面高度采样
for (const e of score.slice(0, 6)) {
  const c = cand[e.t];
  const cx = Math.floor((e.b1 + e.b2) / 2);
  let surf = 0;
  for (let y = 0; y < H; y++) { if (c[cx] > 0) { /* c 是计数非占用 */ } }
  // 精确找表面:重扫该列第一个该 id 格
  const raw2 = Buffer.from(b64, 'base64');
  let p2 = 0; let i2 = 0;
  const rv2 = () => { let s = 0, v = 0; for (;;) { const b = raw2[p2++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) break; s += 7; } return v >>> 0; };
  let found = -1;
  while (p2 < raw2.length && i2 < n) {
    const run = rv2() + 1; const t = rv2();
    if (t !== 0) { rv2(); rv2(); }
    if (t === e.t) {
      const end = Math.min(i2 + run, n);
      for (let k = i2; k < end; k++) {
        const yy = Math.floor(k / W); const xx = k - yy * W;
        if (xx === cx && yy > 20) { found = yy; break; }
      }
      if (found >= 0) break;
    }
    i2 += run;
  }
  console.log(`id${e.t} 中心列 x=${cx} 首现 y=${found} → 站 ${found} 行附近,出生向${cx > spawnX ? '右' : '左'}约 ${Math.abs(cx - spawnX)} 格(~${(Math.abs(cx - spawnX) / 25).toFixed(0)} 秒全速跑)`);
}
