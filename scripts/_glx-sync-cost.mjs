// GL 同步等待探针:量化"CPU→GPU 读回"三通道的单次延迟分布——
//   ① 2d getImageData(256×256,现 CPU 光照分支 willReadFrequently 形态)
//   ② WebGL2 readPixels(64×64 fbo,合成链潜在回读形态)
//   ③ drawImage 大图 blit(vanilla 物品图集整图→512 离屏,合成主干代表)
// 进世界后于出生点采集;判定阈值见 BASELINE 判定树第 2 支(GL 同步长尾>3ms
// 且 setRendererPriorityPolicy 可救 → Android 转 WebView 壳)。须在
// willReadFrequently 开关两侧各跑一轮(SW_ILLUM=0|1 仅记录当前态,双轮比对人工分档)。
// 用法:SW_N=200 SW_ORIGIN=http://localhost:5201 \
//   node tools/run-diag.mjs scripts/_glx-sync-cost.mjs
import { launch, origin, armPerfMeter, loadDefaultWorld, sleep, pct } from './_perf-lib.mjs';

const N = Number(process.env.SW_N ?? 200);

const b = await launch();
try {
  const p = await b.newPage();
  await armPerfMeter(p);
  await p.goto(`${origin()}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await loadDefaultWorld(p);

  const out = await p.evaluate(async (n) => {
    const bench = (label, fn) => {
      fn(); // 预热一次
      const ts = [];
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        fn();
        const d = performance.now() - t0;
        ts.push(d);
      }
      ts.sort((a, b2) => a - b2);
      return { label, n,
        meanMs: +(ts.reduce((a, x) => a + x, 0) / n).toFixed(3),
        p50: +ts[Math.floor(n * 0.5)].toFixed(3),
        p95: +ts[Math.floor(n * 0.95)].toFixed(3),
        p99: +ts[Math.floor(n * 0.99)].toFixed(3),
        max: +ts[n - 1].toFixed(3) };
    };

    // ① 2d getImageData 256×256(readback 主代表)
    const c2 = document.createElement('canvas');
    c2.width = c2.height = 256;
    const ctx2 = c2.getContext('2d', { willReadFrequently: true });
    ctx2.fillRect(0, 0, 256, 256);
    const r2 = bench('2d-getImageData-256', () => ctx2.getImageData(0, 0, 256, 256));

    // ② WebGL2 readPixels 64×64 fbo
    let r3 = null;
    try {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      gl.canvas.width = gl.canvas.height = 64;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 64, 64, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const px = new Uint8Array(64 * 64 * 4);
      r3 = bench('webgl-readPixels-64', () => gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px));
    } catch (e) { r3 = { label: 'webgl-readPixels-64', error: String(e) }; }

    // ③ vanilla 图集大图 blit(async 载图后测量)
    let r4 = null;
    try {
      const img = new Image();
      img.src = '/sprites/vanilla/Item_Atlas_0.png';
      await img.decode();
      const dst = document.createElement('canvas');
      dst.width = 512; dst.height = 512;
      const dctx = dst.getContext('2d');
      r4 = bench('drawImage-atlas-blit-512', () => dctx.drawImage(img, 0, 0));
    } catch (e) { r4 = { label: 'drawImage-atlas-blit-512', error: String(e) }; }

    return { n, results: [r2, r3, r4] };
  }, N);

  console.log(JSON.stringify({ probe: 'glx-sync-cost', ...out }));
} finally {
  await b.close();
}
