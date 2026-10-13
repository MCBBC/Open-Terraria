// ★BJ650 残影单份孤立渲染测量（2026-10-13 三轮定谳收口）：repo 实际渲染贡献 vs
//   反编译公式预测 tint×fade（fade=(12−i)/(60×1.5)）——排除渲染链放大/双画。
//   方法：页内构造 ProjGhostRing(864) 单槽填充 → 黑底 canvas → drawProjGhosts
//   逐 i 单槽渲染 → 读像素 → 与公式预测逐通道对拍。
// 用法(game/ 下): SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj650-single-ghost-measure.mjs
import {
  launchBrowser, openPage, bootstrap, createGame, ledger,
} from '../tools/probe/lib/index.mjs';

const L = ledger();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: 'bj650measure', size: 'small' });
L.chk('世界已建', gen.ok);
// 召唤刃（触发 atlas 加载 Projectile_864.png）
await page.evaluate(async () => {
  const g = window.__swGame;
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
  const m = new MinionProj(g.player.cx + 60, g.player.cy - 30, 864, 6, 0, false, 0, false, () => g.player);
  g.entities.add(m, 'projectiles');
  const bt = buffTypeByVanilla(271);
  if (bt !== undefined) g.player.buffs.set(bt, 300);
});
await wait(1200);

const meas = await page.evaluate(async () => {
  const g = window.__swGame;
  const { ProjGhostRing, drawProjGhosts, GHOST_TINT } = await import('/src/entities/projGhostTrail.ts');
  const setOv = (await import('/src/entities/Arrow.ts')).setProjSpriteOverride;
  setOv(864, { width: 18, height: 64 });
  // 贴图：vanilla Projectile_864.png（帧 1=白模 18×32）
  const cv = document.createElement('canvas');
  cv.width = 400; cv.height = 200;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const hsl = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = h * 6, x = c * (1 - Math.abs(hp % 2 - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
    const m2 = l - c / 2;
    return [r + m2, g + m2, b + m2];
  };
  const hue = 0.66;   // tier0（whoAmI=0）
  const tint01 = hsl(hue, 0.7, 0.6).map((v) => v * 0.7);
  const out = { copies: [], tint01: tint01.map((v) => +v.toFixed(4)) };
  const iv2 = setInterval(() => {}, 1e9);   // 页面保活（atlas 异步加载窗口）
  for (let i = 1; i <= 12; i += 5) {   // 采样 i=1,6,11 三档
    const ring = new ProjGhostRing(864);
    ring.record(100, 100, Math.PI, 1, true);   // 单槽（slot0=最新;i=1 读它）
    for (let k = 1; k < i; k++) ring.record(100, 100, Math.PI, 1, true);  // 填充至 i 槽同位
    ctx.clearRect(0, 0, 400, 200);
    ctx.fillStyle = '#202020';
    ctx.fillRect(0, 0, 400, 200);
    const { projSprite } = await import('/src/entities/Arrow.ts');
    const tex = projSprite(864);
    if (!tex || tex.width <= 0) { clearInterval(iv2); return { err: 'tex missing' }; }
    drawProjGhosts(ctx, {
      ring, id: 864, tex,
      frames: 2, frame: 0, bodyW: 10, bodyH: 10, bodyRot: Math.PI,
      bodyAlpha: 1, ai0: 0, ai1: 0, timeLeft: 3600, opacity: 1,
      vxLen: 0, spriteDirection: 1, whoAmI: 0,
    });
    const d = ctx.getImageData(90, 80, 30, 40).data;
    let mr = 0, mg = 0, mb = 0;
    for (let k = 0; k < d.length; k += 4) {
      if (d[k + 3] < 10) continue;
      if (d[k] + d[k + 1] + d[k + 2] > mr + mg + mb) { mr = d[k]; mg = d[k + 1]; mb = d[k + 2]; }
    }
    const fade = (12 - i) / 90;
    const pred = tint01.map((v) => +(v * fade * 255).toFixed(1));
    out.copies.push({ i, fade: +fade.toFixed(4), measured: [mr, mg, mb], pred });
  }
  // 叠栈预测（12 份同位）：Σfade=66/90
  const sumFade = 66 / 90;
  out.stackPred = tint01.map((v) => +(v * sumFade * 255).toFixed(1));
  out.stackMeasuredNote = '静止叠栈=12 份叠加,测量见自然态探针截图(+~0.28 蓝通道)';
  clearInterval(iv2);
  return out;
});
L.say(`单份测量: ${JSON.stringify(meas, null, 1)}`);
let ok = true;
for (const c of meas.copies) {
  const close = c.measured.every((v, k) => Math.abs(v - c.pred[k]) < 14);
  if (!close) ok = false;
  L.chk(`i=${c.i} 渲染≈公式 tint×fade`, close, `measured=${c.measured} pred=${c.pred}`);
}
L.say(`耗时 ${L.elapsed()}`);
L.print();
process.exit(L.ok ? 0 : 2);
