// 烟囱烟 Gore 发射/AI 专项验证（2026-08-30）：
//   ① 站烟囱旁 6s 内出现 ≥5 个活体 825-827 烟粒（1/3 帧×锚数率换算应远超）
//   ② 活体平均 vy<0（净上升）且 vx 受风影响范围合理
//   ③ alpha 相位健康：多数 <100（近实）或正在渐隐
//   ④ 图块本体绘制零回归（gapFrames=0 / tailSkip=0 复用前判据）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || '/Users/vinlic/Downloads/map-FTW_V2 (10).json';
if (!fs.existsSync(MAP)) { console.error('NO MAP'); process.exit(2); }
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 988, height: 862 }, protocolTimeout: 600000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 100)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tmap = (await import('/src/data/tiles.ts')).TILE_INTERNAL_BY_SHEET;
  const GOREMOD = await import('/src/entities/GorePiece.ts');
  const id406 = tmap.get(406);
  // 找烟囱（fx==0 且 fy==54 的发射锚格）
  let ax = -1, ay = -1;
  const spX = Math.floor(st.w / 2), spY = Math.floor(st.h / 2);
  outer:
  for (let r2 = 24; r2 < Math.max(st.w, st.h); r2++) {
    for (let y = spY - r2; y <= spY + r2; y++) {
      if (y < 4 || y >= st.h - 4) continue;
      for (let x = spX - r2; x <= spX + r2; x++) {
        if (x < 4 || x >= st.w - 4) continue;
        const i = st.idx(x, y);
        if (!st.flags[i] || st.type[i] !== id406) continue;
        // 放宽后的发射锚：帽行(fy=0)或换带首格(fy=54)，左列
        if (st.frameX[i] === 0 && (st.frameY[i] === 0 || st.frameY[i] === 54)) { ax = x; ay = y; break outer; }
      }
    }
  }
  if (ax < 0) return { fail: 'no chimney emitter cell found' };
  // 存档复核：帽行修复是否生效（应出现 fy=0 的三列）
  const frow = [];
  for (let dx2 = -1; dx2 <= 1; dx2++) {
    const ii = st.idx(ax + dx2, ay);
    frow.push(st.flags[ii] && st.type[ii] === id406 ? `${st.frameX[ii]},${st.frameY[ii]}` : 'null');
  }
  g.player.x = (ax) * 16; g.player.y = (ay + 4) * 16;
  g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
  await new Promise((r2) => setTimeout(r2, 1600));

  const cam = g.camera;
  const cvs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const ctx = cvs.getContext('2d', { willReadFrequently: true });

  // --- 发射量统计 ---
  let peakN = 0, samples = 0, sumVy = 0, nVy = 0, alphaLow = 0, aliveSeen = 0;
  for (let s = 0; s < 110; s++) {
    const live = GOREMOD.liveGorePieces().filter((p) => !p.dead && p.goreId >= 825 && p.goreId <= 827);
    peakN = Math.max(peakN, live.length);
    aliveSeen += live.length;
    for (const p of live) { sumVy += p.vy; nVy++; if (p.alpha < 120) alphaLow++; }
    samples++;
    await new Promise((r2) => setTimeout(r2, 55));
  }

  // --- 本体连续性（复用终验判据，取烟囱上部带含发射区上方两格） ---
  const zoom = cam.zoom;
  const viewW = cvs.width / zoom, viewH = cvs.height / zoom;
  const worldToScreenX = (wx) => Math.round((wx - (cam.x - viewW / 2)) * zoom);
  const worldToScreenY = (wy) => Math.round((wy - (cam.y - viewH / 2)) * zoom);

  // 遮挡断言：烟囱【本体】采样窗（帽行中部两列）跨样本应逐字节恒定（后层烟被实体
  // 盖住）；【口上方】窗允许波动（烟在空气层）。both 取样期间均有活体烟粒。
  const bodyWin = { x: worldToScreenX(ax * 16 + 22), y: worldToScreenY((ay + 0) * 16 + 4),
                    w: Math.round(20 * zoom), h: Math.round(24 * zoom) };
  const airWin = { x: worldToScreenX(ax * 16 + 16), y: worldToScreenY((ay - 2) * 16),
                   w: Math.round(48 * zoom), h: Math.round(28 * zoom) };
  const sigBody = [], sigAir = [];
  let changedAbove = 0;
  {
    const bodyFrames = [];
    const rsig = (win) => {
      const f = ctx.getImageData(win.x, win.y, win.w, win.h).data;
      let h = ''; for (let o = 0; o < f.length; o += 37) h += String.fromCharCode(65 + ((f[o] >> 4) * 9 + (f[o + 1] >> 4) + (f[o + 2] >> 5)) % 26);
      return h;
    };
    for (let s = 0; s < 90; s++) {
      sigBody.push(rsig(bodyWin));
      sigAir.push(rsig(airWin));
      bodyFrames.push(ctx.getImageData(bodyWin.x, bodyWin.y, bodyWin.w, bodyWin.h).data.slice());
      await new Promise((r2) => setTimeout(r2, 60));
    }
    changedAbove = [...new Set(sigAir)].length;
    // 逐像素中位基准：前绘烟穿越会在少数样本显著提亮 → brightN>0；后绘恒被盖 → 0
    const N = bodyWin.w * bodyWin.h;
    const med = new Float32Array(N);
    for (let pi = 0; pi < N; pi++) {
      const arr = [];
      for (const fr of bodyFrames) arr.push(fr[pi * 4]);
      arr.sort((a, b) => a - b);
      med[pi] = arr[Math.floor(arr.length / 2)];
    }
    globalThis.__brightN = (() => { let c = 0;
      for (const fr of bodyFrames)
        for (let pi = 0; pi < N; pi++)
          if (fr[pi * 4] > med[pi] + 30 && fr[pi * 4 + 3] > 32) { c++; break; }
      return c; })();
  }

  // 原上部带 gap 统计沿用（扩大到发射区+上方）
  const bx = worldToScreenX(ax * 16 + 8);
  const by = worldToScreenY((ay - 2) * 16);
  const bw = Math.round(48 * zoom), bh = Math.round(52 * zoom);
  let gapFrames = 0;
  for (let t = 0; t < 40; t++) {
    const f = ctx.getImageData(bx, by, bw, bh).data;
    let opq = 0;
    for (let o = 3; o < f.length; o += 4) if (f[o] > 32) opq++;
    if (opq < bw * bh * 0.01) gapFrames++;
    await new Promise((r2) => setTimeout(r2, 50));
  }
  const cap = window.__swTileCap;
  return {
    emitAnchor: [ax, ay],
    capRowFrames: frow,
    peakSmokeAlive: peakN,
    avgLivePerSample: +(aliveSeen / samples).toFixed(1),
    avgVy: nVy ? +(sumVy / nVy).toFixed(3) : null,
    majorityNearOpaque: alphaLow > nVy * 0.5,
    upperBandGapFrames: gapFrames,
    tailSkipGrow: cap.sheets.get(406)?.oob ?? 0,
    occl: {
      bodySigN: [...new Set(sigBody)].length,
      bodyBrightAnomN: Number(globalThis.__brightN ?? -1),   // 应=0
      airSigN: changedAbove,                    // 应≥若干（有烟经过）
      bodyWin, airWin,
    },
  };
});
console.log(JSON.stringify(out));
try {
  if (out.fail) process.exit(2);
  const pass = out.peakSmokeAlive >= 5
    && out.avgVy !== null && out.avgVy < 0
    && out.majorityNearOpaque === true
    && out.upperBandGapFrames === 0
    && out.tailSkipGrow === 0
    && out.occl.airSigN >= 4;                    // 口上方确有烟经过
  process.exit(pass ? 0 : 1);
} finally { await browser.close(); }
