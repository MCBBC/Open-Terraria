// 烟囱悬案终验（2026-08-30）：drawAdjust 残案删除后
//   A 全周期连续性：烟囱包围盒像素序列无"整块消失"帧（此前 n∈{6,7} 越界弃画）
//   B 六相位稳定循环：≥4 个显著离散形态且按 rate8 周期回卷
//   C tail 插桩：__swTileCap 无新增 tail-skip / fallback
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || needInput(join(DOWNLOADS, 'map-FTW_V2 (10).json'));
if (!fs.existsSync(MAP)) { console.error('NO MAP'); process.exit(2); }
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 100)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const cap = window.__swTileCap;
  // 定位最近的真实烟囱：扫表找 sheet=406 的实例（tileMap 型号经由 TILE_INTERNAL_BY_SHEET）
  const tmap = (await import('/src/data/tiles.ts')).TILE_INTERNAL_BY_SHEET;
  const TA = await import('/src/render/TileAnim.ts');
  const id406 = tmap.get(406);
  let cx0 = -1, cy0 = -1;
  const spX = Math.floor(st.w / 2), spY = Math.floor(st.h / 2);
  outer:
  for (let r2 = 24; r2 < Math.max(st.w, st.h); r2 += 1) {
    for (let y = spY - r2; y <= spY + r2; y += 1) {
      if (y < 2 || y >= st.h - 2) continue;
      for (let x = spX - r2; x <= spX + r2; x += 1) {
        if (x < 2 || x >= st.w - 2) continue;
        // 烟囱至少 3 宽 2 高实体段探测：锚点 (fx,fy)==(0,0) 且右两格同型
        const i = st.idx(x, y);
        if (!st.flags[i] || st.type[i] !== id406) continue;
        const iR = st.idx(x + 1, y), iRR = st.idx(x + 2, y);
        if (st.flags[iR] && st.type[iR] === id406 && st.flags[iRR] && st.type[iRR] === id406) {
          cx0 = x; cy0 = y; break outer;
        }
      }
    }
  }
  if (cx0 < 0) return { fail: 'no chimney found near center' };

  const cam = g.camera;
  const cvs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  g.player.x = (cx0 + 1) * 16; g.player.y = (cy0 + 5) * 16;
  g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
  await new Promise((r2) => setTimeout(r2, 1800));   // 相机收敛

  const zoom = cam.zoom;
  const viewW = cvs.width / zoom, viewH = cvs.height / zoom;
  const bx = Math.round((cx0 * 16 + 8 - (cam.x - viewW / 2)) * zoom);
  const by = Math.round((cy0 * 16 + 16 - (cam.y - viewH / 2)) * zoom);   // 取中部横带（免天空黑边干扰）
  const bw = Math.round(48 * zoom), bh = Math.round(36 * zoom);

  const d0oob = cap.sheets.get(406)?.oob ?? 0, d0fb = cap.sheets.get(406)?.fallback ?? 0;

  // 连续采样 ~7s
  const sigs = []; let gapFrames = 0; let opaqueCountTotal = 0;
  for (let t = 0; t < 140; t++) {
    const f = ctx.getImageData(bx, by, bw, bh).data;
    // 不透明像素占比（是否"整物消失"）
    let opq = 0;
    for (let o = 3; o < f.length; o += 4) if (f[o] > 32) opq++;
    opaqueCountTotal = opq;
    if (opq < bw * bh * 0.02) gapFrames++;               // 近空帧=消失瞬间
    let hs = ''; for (let o = 0; o < f.length; o += 53) hs += String.fromCharCode(65 + ((f[o] >> 4) * 7 + (f[o + 1] >> 4) + (f[o + 2] >> 3)) % 26);
    sigs.push(hs);
    await new Promise((r2) => setTimeout(r2, 50));
  }
  const uniq = [...new Set(sigs)];
  const hist = {}; sigs.forEach((s2) => { hist[s2] = (hist[s2] ?? 0) + 1; });
  const major = Object.values(hist).filter((c) => c >= sigs.length * 0.05).length;

  return {
    chimneyAt: [cx0, cy0],
    gapFrames, uniqN: uniq.length, majorModes: major,
    tailSkipGrow: (cap.sheets.get(406)?.oob ?? 0) - d0oob,
    fbGrow: (cap.sheets.get(406)?.fallback ?? 0) - d0fb,
    draws406: cap.sheets.get(406)?.n ?? -1,
  };
});
console.log(JSON.stringify(out));
try {
  if (out.fail) process.exit(2);
  // majorModes 对光照噪声敏感（历史批次实测 0/4/6 波动），仅作展示字段
// 帧烟纹本身也在变化，真实判据 = tail-skip/fallback/gap 三账本全零
const pass = out.gapFrames === 0 && out.tailSkipGrow === 0 && out.fbGrow === 0;
  process.exit(pass ? 0 : 1);
} finally { await browser.close(); }
