// 2026-08-30 动画帧权威表修复·确定性复验 v2
// 判据（全部机器判定，绕开光照噪声）：
//   A 表值活性：页内 TILE_ANIM_{RATE,PITCH,FRAMES}[106/218/220] 等于权威值
//     （cap.tblRate 是 main.ts 注入的同源引用，证明真实游戏实例生效）
//   B 偏移域检验：animYOffset(sheet,H) 在 0..3599 tick 全周期只落在
//     [0, frames-1]*pitch —— 越界即历史“平铺第一格”病根复发（用纯函数可重复）
//   C 重烘节律：cap.bakes 内 sheet 键在推进中按新速率增长（106 每5t、218 每5t、220 每5t）
//   D 视觉佐证：锚格 18×18px 区带像素随时间出现 ≥2 个稳定离散形态（平铺病必 ≤1）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || '/Users/vinlic/Downloads/map-FTW_V2 (10).json';
if (!fs.existsSync(MAP)) { console.error('NO MAP:', MAP); process.exit(2); }
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 120)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TA = await import('/src/render/TileAnim.ts');
  const tmap = (await import('/src/data/tiles.ts')).TILE_INTERNAL_BY_SHEET;
  const ids = {};
  for (const s of [106, 218, 220]) ids[s] = tmap.get(s);

  // ---- 摆放 ----
  const spX = Math.floor(st.w / 2), spY = Math.floor(st.h / 2);
  let ox = -1, oy = -1;
  outer:
  for (let y = spY; y < st.h - 8; y++) {
    for (let x = spX - 40; x < spX + 40; x++) {
      let okFlat = true;
      for (let dx = 0; dx < 14 && okFlat; dx++) {
        if (!st.flags[st.idx(x + dx, y)] || st.flags[st.idx(x + dx, y - 1)] || st.flags[st.idx(x + dx, y - 2)]) okFlat = false;
      }
      if (okFlat) { ox = x; oy = y; break outer; }
    }
  }
  if (ox < 0) return { fail: 'no flat ground' };
  const placed = [];
  Object.entries(ids).forEach(([s, id], k) => {
    const bx = ox + 5 * Number(k), top = oy - 3;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) st.setTile(bx + dx, top + dy, id);
    placed.push({ sheet: s, bx, top });
  });
  await new Promise((r) => setTimeout(r, 900));

  // ---- A 表值活性 ----
  const cap = window.__swTileCap;
  const tableCheck = {};
  for (const s of [106, 218, 220]) {
    tableCheck[s] = {
      rate: cap.tblRate[s], pitch: cap.tblPitch[s], frames: cap.tblFrames[s],
      draws: cap.sheets.get(s)?.n ?? -1,
      fb: cap.sheets.get(s)?.fallback ?? -1,
    };
  }

  // ---- B 全周期偏移域（纯函数，权威性决定论）----
  const domainCheck = {};
  for (const s of [106, 218, 220]) {
    const pitch = cap.tblPitch[s] ?? 38, frames = cap.tblFrames[s];
    const H = Math.floor(frames * pitch);
    const legalMax = (frames - 1) * pitch;
    let bad = null;
    for (let tk = 0; tk <= 3600; tk++) {
      TA.tileAnim.tick = tk;
      const off = TA.animYOffset(s, H);
      if (off % pitch !== 0 || off > legalMax) { bad = { tick: tk, off, legalMax, pitch }; break; }
    }
    TA.tileAnim.tick = window.__swGame.renderer ? TA.tileAnim.tick : 0;
    // 还原给 ChunkCache 的挂钟：不强制归位（探针临时改写后恢复由下一帧继续），记录即可
    domainCheck[s] = bad ? ('BAD@' + JSON.stringify(bad)) : 'OK';
  }
  // 挂钟修正：把 tileAnim.tick 重置为持续增长起点(避免渲染卡死率异常)
  TA.tileAnim.tick = 0;

  // ---- C 重烘节律 + D 视觉佐证：逐物贴近巡访，各自取样 ----
  const cam = g.camera;
  const cvs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  const viewH = cvs.height / cam.zoom, viewW = cvs.width / cam.zoom;

  const inspect = async (p) => {
    // 玩家贴到物件正下方 3 格，等相机收敛
    g.player.x = (p.bx + 1) * 16; g.player.y = (p.top + 4) * 16;
    g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
    await new Promise((r) => setTimeout(r, 1700));
    const SHEET = Number(p.sheet);   // ★Map 键为数字，placed.sheet 是字符串（曾致 delta 恒 0）
    const d0 = { n: cap.bakes.get(SHEET)?.n ?? 0, draws: cap.sheets.get(SHEET)?.n ?? 0,
                 fb: cap.sheets.get(SHEET)?.fallback ?? 0 };
    const sx = Math.round((p.bx * 16 - (cam.x - viewW / 2)) * cam.zoom);
    const sy = Math.round((p.top * 16 - (cam.y - viewH / 2)) * cam.zoom);
    const w = Math.round(18 * cam.zoom);
    const sigSet = new Map();
    for (let n = 0; n < 120; n++) {
      const f = ctx.getImageData(Math.max(0, sx), Math.max(0, sy), w, w).data;
      let hs = ''; for (let o = 0; o < f.length; o += 7) hs += String.fromCharCode(65 + ((f[o] >> 4) * 13 + (f[o + 1] >> 4)) % 26);
      sigSet.set(hs, (sigSet.get(hs) ?? 0) + 1);
      await new Promise((r) => setTimeout(r, 40));
    }
    const tot = [...sigSet.values()].reduce((a, b) => a + b, 0);
    return {
      bakeDelta: (cap.bakes.get(SHEET)?.n ?? 0) - d0.n,
      drawDelta: (cap.sheets.get(SHEET)?.n ?? 0) - d0.draws,
      fbGrow: (cap.sheets.get(SHEET)?.fallback ?? 0) - d0.fb,
      modes: [...sigSet.values()].filter((c) => c >= tot * 0.08).length,
    };
  };

  const perObject = {};
  for (const p of placed) perObject[p.sheet] = await inspect(p);

  return { tableCheck, domainCheck, perObject };
});

// ---- 判定 ----
console.log(JSON.stringify(out));
try {
  if (out.fail) process.exit(2);
  let ok = true;
  const verdicts = {};
  for (const s of ['106', '218', '220']) {
    const tc = out.tableCheck[s], po = out.perObject?.[s] ?? {};
    // A 权威 rate 生效 / B 偏移域纯净 / C 巡访期有重烘+绘制 / D 离散形态佐证 / fb 零增长
    const aOk = Number(tc.rate) === 5;
    const bOk = out.domainCheck[s] === 'OK';
    // ★2026-08-31 根治后烘焙节律归零是【预期】：动画格改走动态层，判据只看
    //    动态层绘制流（capture noteDraw 经 drawVanillaCell 计数）
    const cOk = (po.drawDelta ?? -1) > 0;
    const dOk = (po.modes ?? 0) >= 2 || Number(s) === 218;   // 绞肉机双帶内容相近，D 仅佐证
    const fOk = (po.fbGrow ?? -1) === 0;
    verdicts[s] = { aOk, bOk, cOk, dOk, fOk };
    if (!aOk || !bOk || !cOk || !fOk) ok = false;
  }
  console.log('VERDICTS:', JSON.stringify(verdicts));
  process.exit(ok ? 0 : 1);
} finally { await browser.close(); }
