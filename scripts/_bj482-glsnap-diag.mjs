// ★BJ482 诊断 v3:深场对照臂 comp-only / echo-only 裸差分交替测量——
//   定谳 C3 G 通道残差来源（补差 vs 回声模型谁不准）。
// 用法: SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs scripts/_bj482-glsnap-diag.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERR', String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5213') + '/?play=small&c10e=0',
  { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1500));
}
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const orig = r.flushVoidLensComplements.bind(r);
  r.__diag = { compDeltas: [], echoDeltas: [], metas: [] };
  let callN = 0;
  r.flushVoidLensComplements = function () {
    const comps = (r._voidLensComps || []).map((c) => ({ ...c }));
    const echoes = (r._voidLensEchoComps || []).map((e) => ({ ...e, exs: [...(e.exs || [])], eys: [...(e.eys || [])] }));
    if (!comps.length) return orig();
    callN++;
    const mode = callN % 2 === 1 ? 'comp' : 'echo';   // 奇数帧=只补差,偶数帧=只回声
    const c = comps[0];
    const rw = c.dw + 8, rh = c.dh + 8, x0 = c.xd - 4, y0 = c.yd - 4;
    const hud = this.ctx;
    const tc = document.createElement('canvas');
    tc.width = 34; tc.height = 48;
    const tctx = tc.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(c.img, c.sx, c.sy, 34, 48, 0, 0, 34, 48);
    const tex = tctx.getImageData(0, 0, 34, 48).data;
    const before = hud.getImageData(x0, y0, rw, rh).data;
    // ★每 8 帧插一次 combined 全量帧（不清任何表）→ 与 separated 帧对照
    const combined = callN % 8 === 5;
    const savedE = r._voidLensEchoComps, savedC = r._voidLensComps;
    if (combined) { /* combined:不清 */ }
    else if (mode === 'comp') r._voidLensEchoComps = [];
    else r._voidLensComps = [];
    try {
      orig();
    } finally {
      r._voidLensEchoComps = savedE;
      r._voidLensComps = savedC;
    }
    const after = hud.getImageData(x0, y0, rw, rh).data;
    const t = r.lighting?.clock?.globalTimeWrappedHourly ?? 0;
    const aEcho = Math.cos(t * Math.PI * 2 / 5) * 0.1 + 0.3;
    const tint = [c.lr, c.lg, c.lb].map((l) => Math.round(0.5 * (255 - l)));
    const pts = [[17, 18], [17, 22], [17, 26], [13, 20], [21, 24], [9, 14], [25, 30]];
    const rows = pts.map(([txp, typ]) => {
      const ii = ((c.yd - y0 + typ) * rw + (c.xd - x0 + txp)) * 4;
      const ti = (typ * 34 + txp) * 4;
      return {
        txp, typ,
        tex: [tex[ti], tex[ti + 1], tex[ti + 2]],
        delta: [after[ii] - before[ii], after[ii + 1] - before[ii + 1], after[ii + 2] - before[ii + 2]],
        headroom: [255 - before[ii], 255 - before[ii + 1], 255 - before[ii + 2]],
      };
    });
    r.__diag.metas.push({ mode: combined ? 'combined' : mode, aEcho: +aEcho.toFixed(3), light: [c.lr, c.lg, c.lb],
      exs: echoes[0]?.exs, eys: echoes[0]?.eys, alpha: echoes[0]?.alpha,
      xd: c.xd, yd: c.yd, x0, y0, rw, rh, tintSum: tint[0] + tint[1] + tint[2],
      tint });
    if (combined) r.__diag.combinedFrames = (r.__diag.combinedFrames || []).concat([{ rows, before: rows.map((x) => x.headroom) }]);
    else (mode === 'comp' ? r.__diag.compDeltas : r.__diag.echoDeltas).push(rows);
    return undefined;
  };
});
await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const VAULT = TILE_BY_KEY['v_491_void_vault'];
  const px0 = Math.floor(p.cx / 16);
  const deepY = Math.min(st.h - 12, 330);
  for (let yy = deepY - 9; yy <= deepY - 1; yy++) {
    for (let xx = px0 - 6; xx <= px0 + 8; xx++) st.setTileSilent(xx, yy, 0);
  }
  for (let xx = px0 - 6; xx <= px0 + 8; xx++) if (!st.isSolid(xx, deepY)) st.setTile(xx, deepY, 1, 0, 0);
  const top = deepY - 3;
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) st.setTileSilent(px0 + dx, top + dy, VAULT, dx * 18, dy * 18);
  }
  p.x = (px0 - 10) * 16; p.y = (deepY - 4) * 16 - 20; p.vx = 0; p.vy = 0;
  await new Promise((r) => setTimeout(r, 1600));
});
await new Promise((r) => setTimeout(r, 700));
const diag = await page.evaluate(() => window.__swGame.renderer.__diag);
// 汇总:comp-only 与 echo-only 的逐通道均值 delta（只取 headroom 充足未钳顶样本）
const summarize = (arr) => {
  const sum = [0, 0, 0]; let n = 0;
  for (const frame of arr) for (const row of frame) {
    if (row.delta.some((d, k) => d > row.headroom[k] + 1)) continue;   // 钳顶样本剔除
    for (let k = 0; k < 3; k++) sum[k] += row.delta[k];
    n++;
  }
  return n ? sum.map((v) => +(v / n).toFixed(1)) : null;
};
console.log('comp-only avgDelta:', JSON.stringify(summarize(diag.compDeltas)));
console.log('echo-only avgDelta:', JSON.stringify(summarize(diag.echoDeltas)));
console.log('metas[0..3]:', JSON.stringify(diag.metas.slice(0, 4)));
console.log('compDelta frame0:', JSON.stringify(diag.compDeltas[0]));
console.log('echoDelta frame0:', JSON.stringify(diag.echoDeltas[0]));
await browser.close();
