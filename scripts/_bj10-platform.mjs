// SW-BJ10 2026-09-07 双线真实管线复现探针（一次性诊断）：
// ① 放置线：真 tryPlace + 智能光标态——对角仅角接触平台放置（预修被 hasSupport 拒的
//    目标语义 = 用户实报根因）→ 真链断言 tile/帧。
// ② 渲染线：真 tryMine 锤四拍（平→坡1→坡2→半砖→回平），每拍等 chunk 重烘后读游戏
//    canvas 该格 16×16 像素哈希——「有声无形」修复后四态像素必须互异 + frameX 走原版
//    坡列（90/432/414）。chunk 链（setSlope 监听→markDirty→flushDirty 重烘）真实走通。
// 站位注意：SW-BJ10 新增平台实体门（PlaceTile :59896 EmptyTile 等价）→ 目标格须在
// 玩家盒外（行 ≤129 而盒 129-131 时取 ≤128）;射程盒 y=3 外扩 → 站行 132 可及行 ≥126。
// 世界 = 合成空 World（patch WorldGenClient,同 _bj3-platform-shot.mjs 先例）。
// 运行：SW_ORIGIN=http://localhost:5209 node tools/run-diag.mjs scripts/_bj10-platform.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = '/tmp/bj10-platform-shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj10-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj10', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));

const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const platId = tilesMod.TILE_BY_KEY['platform'];
  const dirtId = tilesMod.TILE_BY_KEY['dirt'];
  const item = items.ITEM_DEFS.find((d) => d.key === 'vi_94_wood_platform');
  const report = { placement: [], hammer: [], errors: [] };

  // 智能光标开（真实消费面：wanted → SpinSmartPlatform / TileTargetDesired 门）
  g.smartCursor.wanted = true;
  g.smartCursor.showing = true;

  const setPlayer = (tx, feetRow) => {
    g.player.maxHp = 999999; g.player.hp = 999999;   // 合成世界物理误伤中和（探针稳定性）
    g.player.x = tx * 16 + 2; g.player.y = feetRow * 16 - 44;
    g.player.vx = 0; g.player.vy = 0; g.player.hp = 999999; g.player.dead = false;
    g.player.cx = g.player.x; g.player.cy = g.player.y;
  };
  const place = (cx, cy) => {
    g.lastMineHitTick = -999; g.hammerPoundRelease = true; g.player.useTime = 0;
    // 模拟 lookup 本帧命中（真实循环每 tick SmartCursorLookup 先复位 showing=false 再按
    // 命中置位——直驱 tryPlace 必须自带该态,否则 TileTargetDesired 门按 miss 拦下）
    g.smartCursor.showing = true;
    g.smartCursor.x = cx; g.smartCursor.y = cy;
    g.smartCursor.lockedContinuity = { x: cx, y: cy };
    g.tryPlace(cx, cy, item);
  };
  const hammer = (cx, cy) => {
    g.hammerPoundRelease = true; g.lastMineHitTick = -999; g.player.useTime = 0;
    g.tryMine(cx, cy, 0, 'hammer', 20);
  };

  // ---- 地形：一条地板（行 132,列 40-80）;玩家站其上（盒行 129-131）----
  for (let x = 40; x <= 80; x++) st.setTileSilent(x, 132, dirtId, 0, 0);
  setPlayer(62, 132);
  g.chunks.markDirtyArea(38, 120, 82, 136);
  await new Promise((r) => setTimeout(r, 800));

  // ══ ① 放置线 ══
  // 既有台 (60,126) 直写;真链对角续放 (61,127)（仅角接触,预修拒=实报根因）
  st.setTileSilent(60, 126, platId, 0, 0);
  place(61, 127);
  report.placement.push({
    step: 'diagonal-up-right (corner-touch only)', x: 61, y: 127,
    ok: st.type[st.idx(61, 127)] === platId,
    type: st.type[st.idx(61, 127)], fx: st.frameX[st.idx(61, 127)], slope: st.slope[st.idx(61, 127)],
  });
  // 对照:悬空孤点 (63,126)（3×3 全空）→ 原版同拒
  place(63, 126);
  report.placement.push({
    step: 'isolated-air (must reject)', x: 63, y: 126,
    rejected: st.type[st.idx(63, 126)] === 0,
  });

  // ══ ② 渲染线：三台横排 + 中台锤四拍 ══
  // 行 128:首台 (46) 下方支撑脚手架直写（真链放置的首放原版也需支撑）,(47)(48) 真链续放
  setPlayer(47, 132);   // 射程盒（x=5 外扩 → 列 42-52;行 ≥126）盖住 46-48/128
  st.setTileSilent(46, 129, dirtId, 0, 0);
  place(46, 128);
  place(47, 128);
  place(48, 128);
  report.hammer.push({
    step: 'row-placed(3)',
    ok: [46, 47, 48].every((x) => st.type[st.idx(x, 128)] === platId),
    fx: [46, 47, 48].map((x) => st.frameX[st.idx(x, 128)]),
  });

  const cam = g.camera;
  const zoom = cam.zoom ?? 1.25;
  const cellHash = async (cx, cy) => {
    await new Promise((r) => setTimeout(r, 700));    // flushDirty(4/帧)重烘 + rAF
    const [sx, sy] = cam.worldToScreen(cx * 16, cy * 16);
    const canvas = g.renderer.canvas;   // BJ3 同式:渲染主画布(document 首个 canvas 可能是背景层)
    const ctx = canvas.getContext('2d');
    // worldToScreen 已含 zoom（BJ3 探针同式:源矩形直取,尺寸 ×zoom）
    const px = Math.round(sx), py = Math.round(sy);
    const w = Math.round(16 * zoom), h = Math.round(16 * zoom);
    const data = ctx.getImageData(px, py, w, h).data;
    let h1 = 0, lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      h1 = ((h1 << 5) - h1 + data[i] + data[i + 1] + data[i + 2]) | 0;
      if (data[i] + data[i + 1] + data[i + 2] > 30) lit++;
    }
    return { h: h1, lit };
  };
  const i47 = st.idx(47, 128);
  const states = [{ state: 'flat', fx: st.frameX[i47], slope: st.slope[i47], half: st.half[i47] ? 1 : 0, pix: await cellHash(47, 128) }];
  for (const beat of ['slope1', 'slope2', 'half', 'back-to-flat']) {
    hammer(47, 128);
    states.push({ state: beat, fx: st.frameX[i47], slope: st.slope[i47], half: st.half[i47] ? 1 : 0, pix: await cellHash(47, 128) });
  }
  report.hammer.push({ step: 'four-beat(cell 47,128)', states });
  report.hammer.push({
    step: 'pixel-diff-verdict',
    flat_vs_slope1: states[0].pix.h !== states[1].pix.h,
    slope1_vs_slope2: states[1].pix.h !== states[2].pix.h,
    slope2_vs_half: states[2].pix.h !== states[3].pix.h,
    half_vs_back: states[3].pix.h !== states[4].pix.h,
  });

  // ══ 对照矩阵行（四台四态同框,截图用）：行 126 列 64-67 ══
  setPlayer(66, 132);   // 射程盒盖住 64-67/128
  st.setTileSilent(64, 129, dirtId, 0, 0);
  place(64, 128); place(65, 128); place(66, 128); place(67, 128);
  hammer(65, 128);                       // 坡1
  hammer(66, 128); hammer(66, 128);      // 坡2
  hammer(67, 128); hammer(67, 128); hammer(67, 128);   // 半砖
  await new Promise((r) => setTimeout(r, 700));
  report.hammer.push({
    step: 'matrix-row-fx(64-67)',
    fx: [64, 65, 66, 67].map((x) => st.frameX[st.idx(x, 128)]),
    slope: [64, 65, 66, 67].map((x) => st.slope[st.idx(x, 128)]),
    half: [64, 65, 66, 67].map((x) => (st.half[st.idx(x, 128)] ? 1 : 0)),
  });
  setPlayer(66, 132);
  await new Promise((r) => setTimeout(r, 1200));
  const [sx, sy] = cam.worldToScreen(58 * 16, 124 * 16);
  return { report, shot: { sx: Math.round(sx * zoom), sy: Math.round(sy * zoom), w: Math.round(14 * 16 * zoom), h: Math.round(6 * 16 * zoom) } };
});

const canvasB64 = await page.evaluate(() => window.__swGame.renderer.canvas.toDataURL('image/png'));
const { report, shot } = result;
const png = Buffer.from(canvasB64.split(',')[1], 'base64');
fs.writeFileSync(`${OUT}/bj10-full-canvas.png`, png);
console.log('BJ10 REPORT:', JSON.stringify(report, null, 1));
console.log('SHOT(crop box in canvas px):', JSON.stringify(shot));
console.log('PNG:', `${OUT}/bj10-full-canvas.png`, png.length, 'bytes');
await browser.close();
