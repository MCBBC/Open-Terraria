// SW-BJ61-d（2026-09-12）空手「地面暗黄痕迹」四矩阵实机探针（一次性）。
// 矩阵：光照 {0, 中, 亮} × 智能光标 {关, 开} × 场景 {宝箱, 纯地面}——
//   · 宝箱场景：智能开→tileWon+4格候选+像素亮增（亮>中>0）；智能关→零；
//     L0（avg≤10）→ 像素零增（TileDrawing.cs:4523-4525 门）。
//   · 纯地面场景（泥土/草/高草/木块/平台 canary——BJ61 域归一前 internal 10/11/21
//     曾吃 sheet 10 门/11 开门/21 宝箱候选=用户实报暗黄痕迹）：任何光照任何光标态
//     → coords=0 + 像素零增（≥基线噪声）。
//   · 空手全矩阵 g.smartCursor.showing=false（SmartCursorHelper.cs:2239-2272 三支
//     工具力门 → 空手无黄框目标）。
// 指标：smartInteractTileFrame 帧态（引擎级,确定性）+ 截图像素和（对照闪烁基线）。
// 运行：node tools/probe.mjs run scripts/_bj61d.mjs --vite=auto
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj61d';
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const ledger = {};
const check = (cond, name, detail) => {
  ledger[name] = { pass: !!cond, ...(detail !== undefined ? { detail } : {}) };
  if (!cond) fails.push(`${name}: ${JSON.stringify(detail)}`);
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail) ?? ''}`);
};

const browser = await puppeteer.launch({
  executablePath: process.env.SW_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1200, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5199'}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj61d-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj61d', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, .btn, [role=button]')];
  const ok = btns.find((b) => (b.textContent || '').includes('我已知晓'));
  if (ok) ok.click();
  for (const id of ['sw-welcome-announce', 'sw-boot-prime', 'sw-splash']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await new Promise((r) => setTimeout(r, 400));

// ---- 场地与钩子 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  const BY_SHEET = (s) => {
    const i = (tilesMod.TILE_DEFS ?? []).findIndex((d) => d?.vanilla?.sheet === s);
    return i >= 0 ? i : -1;
  };
  const chestId = (tilesMod.TILE_BY_KEY ?? {})['chest'] ?? BY_SHEET(21);
  const torchId = (tilesMod.TILE_BY_KEY ?? {})['torch'] ?? BY_SHEET(4);   // ★internal 12（字面量 4=铜矿）
  // canary 内部 id（由 sheet 反查——探针自身不引入第二套域假设）
  const canary = {
    dirt: BY_SHEET(0), grass: BY_SHEET(2), tallgrass: BY_SHEET(3),
    wood: BY_SHEET(30), platform: BY_SHEET(19),
  };
  // ---- 清场 44..86 × 114..136（含拆墙/液/坡/半砖）+ 顶盖 y=112..113（石,
  //   封死天空光竖列——无盖时天空光直灌 avg~91,暗档无法成立）----
  for (let x = 44; x <= 86; x++) for (let y = 114; y <= 136; y++) {
    const i = st.idx(x, y);
    st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
    st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
  }
  for (let x = 44; x <= 86; x++) { st.setTileSilent(x, 112, 1, 0, 0); st.setTileSilent(x, 113, 1, 0, 0); }
  // 石地板行 y=132（x 46..84）
  for (let x = 46; x <= 84; x++) st.setTileSilent(x, 132, 1, 0, 0);
  // 宝箱 2×2 @ (58,128)（锚 58,128；frameX/Y 件内 0/18）
  const placeChest = () => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) st.setTileSilent(58 + i, 128 + j, chestId, i * 18, j * 18);
    if (!g.world.chests.some((c) => c.x === 58 && c.y === 128)) {
      g.world.chests.push({ x: 58, y: 128, items: Array(40).fill(null), frame: 0 });
    }
  };
  const removeChest = () => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) st.setTileSilent(58 + i, 128 + j, 0, 0, 0);
    g.world.chests = g.world.chests.filter((c) => !(c.x === 58 && c.y === 128));
  };
  placeChest();
  // 地面 canary 带（x 62..82）：
  //   草地块 66..69@132（替换石）+ 高草 66..67@131 + 泥土 70..72@132（替换石）
  //   木块 74..75@128（悬空行）+ 平台 78..79@128（悬空行）
  for (let x = 66; x <= 69; x++) st.setTileSilent(x, 132, canary.grass, 0, 0);
  for (let x = 66; x <= 67; x++) st.setTileSilent(x, 131, canary.tallgrass, 0, 0);
  for (let x = 70; x <= 72; x++) st.setTileSilent(x, 132, canary.dirt, 0, 0);
  for (let x = 74; x <= 75; x++) st.setTileSilent(x, 128, canary.wood, 0, 0);
  for (let x = 78; x <= 79; x++) st.setTileSilent(x, 128, canary.platform, 0, 0);
  g.chunks.markDirtyArea(44, 110, 86, 136);
  // ★世界光照参数修正：探针桩掉 worldgen（generate 返回裸 World）→
  //   groundLevel=0/lavaLine=0 → `ty>lavaLine` 恒真=全图 air 播地狱环境光
  //   （TileLightScanner.ts:816,实测恒定 (188,113,37)）——BJ54 探针的「点亮」
  //   实为地狱光。补真实深度带：天空带 ≤80、地狱带 >200，房间 112..136 落
  //   两带之间=纯暗（引擎活读 World 字段,Game.ts:6490 new LightingEngine(w)）。
  g.world.groundLevel = 80; g.world.rockLevel = 60; g.world.lavaLine = 200;
  g.lighting.dirty = true;
  // 玩家落位（空手=新角色无持物）+ 无敌。x=54：tileReach(0)=5 → 扫描域 HX=60
  //   覆盖宝箱 58-59（旧 x=50 → HX=56 够不着=BJ54 探针当年特意选 54 的原因）
  g.world.spawnX = 54; g.world.spawnY = 130; g.world.spawnX0 = 54; g.world.spawnY0 = 130;
  const pl = g.player;
  pl.maxHp = 999999; pl.hp = 999999; pl.dead = false; pl.deadTime = 0;
  pl.respawnTimer = 0; pl._deathHandled = false; pl.ghost = false; pl.fallStartY = null;
  pl.x = 54 * 16; pl.y = 132 * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  g.lighting.dirty = true;   // ★silent 写族必须标脏（Game.ts:10026 陨石坑同款陷阱）

  window.__bj61 = {
    chestId, canary,
    placeChest, removeChest,
    aim(tx, ty) {
      const c = g.camera;
      g.input.mouseX = Math.round((tx * 16 + 8 - c.x) * c.zoom + c.viewW / 2);
      g.input.mouseY = Math.round((ty * 16 + 8 - c.y) * c.zoom + c.viewH / 2);
    },
    async settle(frames = 30) {
      for (let i = 0; i < frames; i++) await new Promise((r) => requestAnimationFrame(() => r()));
    },
    state() {
      const f = window.__swMod.smartInteractTileFrame;
      const lv = (x, y) => g.lighting.lightAt(x, y);
      const avg = (x, y) => { const [r, gg, b] = lv(x, y); return Math.floor((r + gg + b) / 3); };
      return {
        tileWon: f.tileWon,
        coords: f.coords.map((c) => `${c.x},${c.y}`),
        selected: [...f.selected],
        wanted: g.smartCursor.wanted,
        showing: g.smartCursor.showing,
        heldKey: g.player.inv?.slots?.[g.player.selectedItem]?.key ?? null,
        avgChest: avg(58, 128), avgChestCorner: avg(59, 129),
        avgGrass: avg(67, 131), avgWood: avg(74, 128), avgPlatform: avg(78, 128),
      };
    },
    pixelSum(wx, wy, ww, wh) {
      // 主画布甄选 = 项目同款（main.ts initTileFrameCapture：width×height 最大者）
      //   ∧ 排除 credits 覆盖层（sw-credits 类 1200×800 亦在 DOM）——
      //   querySelector('canvas') 命中首张隐藏 32×20 小画布=全零读数（首跑教训）
      let cv = window.__bj61cv;
      if (!cv) {
        let area = 0;
        for (const c of document.querySelectorAll('canvas')) {
          if (c.classList.contains('sw-credits')) continue;
          const a2 = c.width * c.height;
          if (a2 > area) { area = a2; cv = c; }
        }
        window.__bj61cv = cv;
      }
      const ctx = cv.getContext('2d');
      const c = g.camera;
      const sx = Math.round((wx * 16 - c.x) * c.zoom + cv.width / 2);
      const sy = Math.round((wy * 16 - c.y) * c.zoom + cv.height / 2);
      const w = Math.round(ww * 16 * c.zoom), h = Math.round(wh * 16 * c.zoom);
      const d = ctx.getImageData(sx, sy, w, h).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      return sum;
    },
  };
  // torch 控制：x 距 chest 锚 58 的距离 d → 置于 (58-d,131)（地板上,宝箱【左侧】,
  //   避开右侧 canary 带 66-67@131 高草——清轨带也全在左场 x≤56）。
  //   ★internal id 用 TILE_BY_KEY['torch']=12——字面量 4 是铜矿（BJ61 域归一笔记
  //   「internal 12=火把(4)」;BJ54 探针字面量 4=同病,其高亮实为地狱环境光）
  window.__bj61torch = (d) => {
    const st2 = g.world.store;
    for (let dd = 2; dd <= 20; dd++) st2.setTileSilent(58 - dd, 131, 0, 0, 0);   // 清旧火把带（左侧）
    if (d > 0) st2.setTileSilent(58 - d, 131, torchId, 0, 0);
    g.chunks.markDirtyArea(40, 126, 82, 134);
    g.lighting.dirty = true;
  };
  window.__bj61smart = (on) => {
    g.smartCursor.wanted = on;
  };
  window.__bj61scene = (which) => {
    if (which === 'chest') window.__bj61.placeChest();
    else window.__bj61.removeChest();
    g.lighting.dirty = true;
  };
});
await page.waitForFunction(() => !!window.__bj61, { timeout: 30000 });
// 暴露帧态模块引用（import 一次存 __swMod）
await page.evaluate(async () => {
  window.__swMod = await import('/src/core/SmartInteractTiles.ts');
});

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

// ---- 光标/视角归位：瞄准 chest（58..59,128..129）与地面带中心 ----
await page.evaluate(() => { window.__bj61.aim(67, 130); });
await page.evaluate(() => window.__bj61.settle(20));

// ---- 自适应选「中」档火把距离：avg∈(10, 0.7×bright] ----
await page.evaluate(() => { window.__bj61torch(0); });
await page.evaluate(() => window.__bj61.settle(40));
const avgDark = await page.evaluate(() => window.__bj61.state().avgChest);
await page.evaluate(() => { window.__bj61torch(3); });
await page.evaluate(() => window.__bj61.settle(40));
const avgBright = await page.evaluate(() => window.__bj61.state().avgChest);
let midD = -1, avgMid = -1;
for (const d of [5, 6, 7, 8, 9, 10, 12]) {
  await page.evaluate((dd) => { window.__bj61torch(dd); }, d);
  await page.evaluate(() => window.__bj61.settle(40));
  const a = await page.evaluate(() => window.__bj61.state().avgChest);
  if (a > 10 && a < avgBright * 0.7) { midD = d; avgMid = a; break; }
}
check(avgDark <= 10, 'L0_dark_avg_le_10', { avgDark });
check(avgBright > 10, 'Lbright_avg_gt_10', { avgBright });
check(midD > 0, 'Lmid_found', { midD, avgMid });
ledger.lightStates = { avgDark, avgMid, avgBright, midD };

// ---- 矩阵跑批 ----
// 闪烁基线：同态两帧像素和漂移（torch flicker / 尘噪声）
async function baselineNoise(scene, wx, wy, ww, wh) {
  await page.evaluate((s) => window.__bj61scene(s), scene);
  await page.evaluate(() => { window.__bj61smart(false); });
  await page.evaluate(() => window.__bj61.settle(30));
  const a = await page.evaluate((r) => window.__bj61.pixelSum(...r), [wx, wy, ww, wh]);
  await page.evaluate(() => window.__bj61.settle(30));
  const b = await page.evaluate((r) => window.__bj61.pixelSum(...r), [wx, wy, ww, wh]);
  return Math.abs(a - b);
}
// 通用：设场景/光照/光标 → settle → {state, pxChest, pxGround}
async function cell(scene, lightD, smartOn, aim) {
  await page.evaluate((s) => window.__bj61scene(s), scene);
  await page.evaluate((d) => window.__bj61torch(d), lightD);
  await page.evaluate((on) => window.__bj61smart(on), smartOn);
  await page.evaluate((a) => window.__bj61.aim(a[0], a[1]), aim);
  await page.evaluate(() => window.__bj61.settle(40));
  const state = await page.evaluate(() => window.__bj61.state());
  const px = await page.evaluate(() => ({
    chest: window.__bj61.pixelSum(57, 127, 4, 4),      // 宝箱 2×2 外扩 1 格
    ground: window.__bj61.pixelSum(64, 126, 18, 8),    // canary 全带
  }));
  return { state, px };
}

const CHEST_AIM = [59, 129];
const GROUND_AIM = [67, 131];
const results = {};
const lights = [[0, 'L0'], [midD, 'Lmid'], [3, 'Lbright']];

// —— 闪烁基线（两场景、chest/ground 两矩形、Lbright 最噪）——
const noiseChest = await baselineNoise('chest', 57, 127, 4, 4);
const noiseGround = await baselineNoise('ground', 64, 126, 18, 8);
ledger.noise = { noiseChest, noiseGround };

for (const scene of ['chest', 'ground']) {
  for (const [d, ln] of lights) {
    for (const on of [false, true]) {
      const aim = scene === 'chest' ? CHEST_AIM : GROUND_AIM;
      const key = `${scene}/${ln}/${on ? 'on' : 'off'}`;
      results[key] = await cell(scene, d, on, aim);
      await shot(key.replaceAll('/', '_'));
    }
  }
}

// ---- 断言 ----
const N = Math.max(noiseChest, noiseGround, 1);
// S0 前置：全程空手（用户报「未持有镐/斧等工具时」——新角色无持物）
{
  const held = Object.values(results).map((v) => v.state.heldKey);
  check(held.every((k) => k === null), 'S0_empty_hand_precondition', held.filter((k) => k !== null));
}
const noHi = (a, b) => Math.abs(a - b) <= Math.max(3 * N, 1500);          // 零高亮容差
const hi = (a, b) => Math.abs(a - b) > Math.max(6 * N, 12000);            // 高亮可见

// S3 智能关（全光照全场景）：tileWon=false/coords=0 + 像素零增
for (const scene of ['chest', 'ground']) {
  for (const [d, ln] of lights) {
    const r = results[`${scene}/${ln}/off`];
    check(r.state.tileWon === false && r.state.coords.length === 0, `S3_off_noFrame_${scene}_${ln}`,
      { tileWon: r.state.tileWon, n: r.state.coords.length });
  }
}
// S5 空手：全矩阵 showing=false（无黄框目标）
const showingAll = Object.entries(results).map(([k, v]) => [k, v.state.showing]);
check(showingAll.every(([, s]) => s === false), 'S5_empty_hand_no_smart_frame',
  showingAll.filter(([, s]) => s !== false));
// S1 宝箱 L0 智能开：候选在但 avg≤10 门 → 像素零增（门=TileDrawing.cs:4523-4525）
{
  const r = results['chest/L0/on'];
  check(r.state.tileWon === true && r.state.coords.length === 4, 'S1_L0_candidates_present',
    { tileWon: r.state.tileWon, n: r.state.coords.length, coords: r.state.coords });
  const off = results['chest/L0/off'];
  check(noHi(r.px.chest, off.px.chest), 'S1_L0_gate_no_highlight_pixels',
    { on: r.px.chest, off: off.px.chest, N });
}
// S2 宝箱 中/亮 智能开：高亮可见 + 亮>中（光衰减）
{
  const mid = results['chest/Lmid/on'], midOff = results['chest/Lmid/off'];
  const bri = results['chest/Lbright/on'], briOff = results['chest/Lbright/off'];
  check(mid.state.tileWon === true && mid.state.coords.length === 4, 'S2_mid_candidates',
    { n: mid.state.coords.length });
  check(hi(mid.px.chest, midOff.px.chest), 'S2_mid_highlight_visible',
    { on: mid.px.chest, off: midOff.px.chest, N });
  check(hi(bri.px.chest, briOff.px.chest), 'S2_bright_highlight_visible',
    { on: bri.px.chest, off: briOff.px.chest, N });
  check(Math.abs(bri.px.chest - briOff.px.chest) > Math.abs(mid.px.chest - midOff.px.chest),
    'S2_bright_gt_mid_attenuation',
    { dBright: Math.abs(bri.px.chest - briOff.px.chest), dMid: Math.abs(mid.px.chest - midOff.px.chest) });
  // 选中档（黄调）面：aim 在箱上 → 4 格全 selected
  check(mid.state.selected.length === 4, 'S2_selected_tier_all4', { sel: mid.state.selected });
}
// S4 纯地面（修复核心回归面）：智能开 全光照 → coords=0 + canary 带像素零增
for (const [d, ln] of lights) {
  const r = results[`ground/${ln}/on`];
  check(r.state.tileWon === false && r.state.coords.length === 0, `S4_ground_no_candidates_${ln}`,
    { tileWon: r.state.tileWon, n: r.state.coords.length, coords: r.state.coords.slice(0, 8) });
  const off = results[`ground/${ln}/off`];
  check(noHi(r.px.ground, off.px.ground), `S4_ground_no_marks_pixels_${ln}`,
    { on: r.px.ground, off: off.px.ground, N });
}

console.log('RESULT', JSON.stringify({ OUT, lightStates: ledger.lightStates, noise: ledger.noise, fails }, null, 1));
fs.writeFileSync(`${OUT}/ledger.json`, JSON.stringify(ledger, null, 1));
await browser.close();
process.exit(fails.length ? 2 : 0);
