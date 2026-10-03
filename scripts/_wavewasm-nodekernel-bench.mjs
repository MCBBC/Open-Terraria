// 纯 node 独立核基准:JS W3 快路径循环逐字复制(WaterWaves.ts L1172-1195 公式段)
// @ts-nocheck 供 run-diag 运行;分辨 vitest-node 2.8ms vs 浏览器 0.673ms 谁是真相
const W = 480, H = 270, N = W * H;
const R = new Float32Array(N), G = new Float32Array(N), R2 = new Float32Array(N), G2 = new Float32Array(N);
for (let i = 0; i < N; i++) { R[i] = 0.5 + Math.sin(i * 0.37) * 0.21; G[i] = 0.5 + Math.cos(i * 0.11) * 0.2; }
const WATER_DAMP = Math.pow(2, -0.0551415532827);
function stepJs() {
  const w = W, h = H;
  for (let y = 0; y < h; y++) {
    const yU = y > 0 ? y - 1 : 0;
    const rowM = y * w, rowU = yU * w, rowD = (y < h - 1 ? y + 1 : h - 1) * w;
    for (let x = 0; x < w; x++) {
      const xL = x > 0 ? x - 1 : 0;
      const xR = x < w - 1 ? x + 1 : w - 1;
      const c = R[rowM + x], cg = G[rowM + x];
      const signedC = 2 * c - 1;
      const S = (2 * R[rowM + xL] - 1) + (2 * R[rowM + xR] - 1)
        + (2 * R[rowU + x] - 1) + (2 * R[rowD + x] - 1);
      const wv = (cg - 0.5) * (10 / 3);
      const newH = (signedC + 2 * (S * 0.25 - signedC) + wv * Math.abs(wv)) * WATER_DAMP;
      const i = rowM + x;
      const q = Math.round(512 * (newH * 0.5 + 0.5));
      let rq = Math.round((q < 0 ? 0 : q > 512 ? 1 : q / 512) * 256);
      if (rq <= 0) rq = 0; else if (rq > 256) rq = 256;
      R2[i] = rq / 256;
      const dv = newH - signedC;
      let gq = Math.round((0.5 + 0.3 * Math.sign(dv) * Math.sqrt(Math.abs(dv))) * 256);
      if (gq < 0) gq = 0; else if (gq > 256) gq = 256;
      G2[i] = gq / 256;
    }
  }
  return [R2, G2];
}
for (let i = 0; i < 30; i++) stepJs();
const t = [];
for (let b = 0; b < 12; b++) {
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) stepJs();
  t.push((performance.now() - t0) / 30);
}
t.sort((a, b) => a - b);
console.log(`node standalone JS kernel 480x270: min=${t[0].toFixed(3)} p50=${t[6].toFixed(3)} max=${t[t.length - 1].toFixed(3)} ms/step`);
console.log('node v8:', process.versions.v8, 'node:', process.versions.node);
