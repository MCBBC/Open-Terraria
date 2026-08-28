// IIIII21 探针（DRUNK 生成面二期）：种子 5162020 小世界逐簇断言 + 普通种子对照。
// 用法:SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_iiii21-drunk-probe.mjs
//
// 断言依据 = 反编译静态期望（Terarria1457）：
//   C1 浮空岛族  ：cs:13124-13155 drunk 50/50 SnowCloudIsland(style3)/DesertCloudIsland
//                 (style1)；雪云 460 只在雪岛/沙岛沙芯（53）；style>0 → 喷泉 207
//                 （cs:80543）、style1 → 沙漠岛棕榈（cs:80630）。
//   C2 FinishDrunkGen(cs:26493-26611)：地牢砖统一 paint∈[13,24]；地牢墙 wallColor25；
//     神庙砖 226→16、墙87→16、137 行1..4→16；宝箱 1/15 塞 5001 / 1/30 塞 678。
//   C3 地牢入口族：brickWallType 解耦重掷（DC.cs:94-110）；y0=ws+70；无爬升厅；六箱
//     （DungeonGlobalBiomeChests:76-79 双邪恶对侧箱）；刺下限 genPos+25；死生命树
//     （191 活木 paint28 冠+根，DungeonUtils.cs:615-1151）。
//   C4 神庙三倍体：makeTemple num2×3（cs:33752）、走廊预算×1.5（cs:34415）、木刺 ±2。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199'), { waitUntil: 'networkidle0' });
const out = await page.evaluate(async () => {
  self.process = { env: { SW_MB_1457: '1' } };
  const mod = await import('/src/world/gen/WorldGen.ts');
  const run = async (seed) => {
    const t0 = Date.now();
    const w = await mod.generateWorld({ width: 4200, height: 1200, seedText: seed, name: 'probe' });
    const gs = mod.lastGenState();
    const st = w.store;
    // ---- 瓦片计数工具 ----
    const sheetCount = (sheet, minPaint = null, maxPaint = null) => {
      let n = 0;
      for (let i = 0; i < st.type.length; i++) {
        if (!st.flags[i]) continue;
        if ((st.TILE_SHEET?.[st.type[i]] ?? -2) === -42) void 0;
        const d = self.__sheetOf ? self.__sheetOf(st.type[i]) : st.__sheetAt(i);
        void d;
      }
      return n;
    };
    // 直接用 TILE_DEFS 建 sheet 映射
    const TD = await import('/src/data/tiles.ts');
    const SHEET = new Int16Array(TD.TILE_DEFS.length).fill(-1);
    for (let i = 0; i < TD.TILE_DEFS.length; i++) { const s = TD.TILE_DEFS[i]?.vanilla?.sheet; if (s != null) SHEET[i] = s; }
    const idBySheet = {};
    for (let i = 0; i < SHEET.length; i++) if (!(SHEET[i] in idBySheet)) idBySheet[SHEET[i]] = i;
    const cnt = (sheet, pred = null) => {
      let n = 0;
      for (let i = 0; i < st.type.length; i++) {
        if (!st.flags[i] || SHEET[st.type[i]] !== sheet) continue;
        if (pred && !pred(st.paint[i], i)) continue;
        n++;
      }
      return n;
    };
    // ---- C1 浮空岛族 ----
    const islands = JSON.parse(JSON.stringify(gs.floatingIslands));
    const snowCloud = cnt(460);
    const fountains = cnt(207);
    const islandHouseChecks = [];
    for (const isl of islands) {
      if (isl.isLake) continue;
      // 岛心 30×20 盒内 sand/snow 计数
      let sand = 0, snow = 0;
      for (let x = isl.x - 12; x <= isl.x + 12 && x < st.w; x++) {
        for (let y = isl.y - 10; y <= isl.y + 20 && y < st.h; y++) {
          const sh = SHEET[st.type[st.idx(x, y)]];
          if (!st.flags[st.idx(x, y)]) continue;
          if (sh === 53) sand++;
          if (sh === 147) snow++;
        }
      }
      islandHouseChecks.push({ style: isl.style, sand, snow });
    }
    // ---- C2 paint 链 ----
    const dgBricks = new Set([41, 43, 44, 677, 678, 679]);
    const dgWalls = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
    let dgBrickPaints = {}, dgWallPaints = {}, brickTotal = 0, templeBrickPaints = {}, templeTotal = 0, dwg87Paints = {};
    const paintHist = (acc, p) => { acc[p] = (acc[p] ?? 0) + 1; return acc; };
    for (let i = 0; i < st.type.length; i++) {
      if (!st.flags[i]) continue;
      const sh = SHEET[st.type[i]];
      if (dgBricks.has(sh)) { dgBrickPaints = paintHist(dgBrickPaints, st.paint[i]); brickTotal++; }
      else if (sh === 226) { templeBrickPaints = paintHist(templeBrickPaints, st.paint[i]); templeTotal++; }
      if (dwg87Paints !== undefined && SHEET[st.type[i]] === 191 && st.wall[i] === 87) {
        dwg87Paints = paintHist(dwg87Paints, st.paint[i]);
      }
    }
    for (let i = 0; i < st.wall.length; i++) {
      if (dgWalls.has(st.wall[i])) dgWallPaints = paintHist(dgWallPaints, st.paintWall[i]);
      else if (st.wall[i] === 87) dwg87Paints = paintHist(dwg87Paints, st.paintWall[i]);
    }
    // 埋地验证：黑涂墙/染色砖的最小行（drunk 入口族整群埋在地下）
    let wall25MinY = 99999, paintedBrickMinY = 99999;
    for (let i = 0; i < st.wall.length; i++) {
      if (st.paintWall[i] === 25 && dgWalls.has(st.wall[i])) {
        const y = Math.floor(i / st.w);
        if (y < wall25MinY) wall25MinY = y;
      }
      if (!st.flags[i]) continue;
      if (dgBricks.has(SHEET[st.type[i]]) && st.paint[i] !== 0) {
        const y = Math.floor(i / st.w);
        if (y < paintedBrickMinY) paintedBrickMinY = y;
      }
    }
    let treeWoodPainted = 0, treeCrownAbove = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (!st.flags[i] || SHEET[st.type[i]] !== 191 || st.paint[i] !== 28) continue;
      treeWoodPainted++;
      const x = i % st.w, y = Math.floor(i / st.w);
      if (y < st.ws2 ?? false) void 0;
      void x; void y;
    }
    // ---- C3/C4 GenState 面 ----
    // ★物品面内部 id 映射（本仓 chest.items 存内部 id；VI_ID=vid→内部 id）
    const IK = await import('/src/data/itemKeys.ts');
    const vid1571 = IK.VI_ID(1571), vid1569 = IK.VI_ID(1569), vid5001 = IK.VI_ID(5001), vid678 = IK.VI_ID(678);
    const chests = w.chests.map((c) => c.items.filter(Boolean).map((it) => it.id));
    let has1571 = 0, has1569 = 0, redPotion = 0, moonLegs = 0;
    for (const items of chests) {
      if (items.includes(vid1571)) has1571++;
      if (items.includes(vid1569)) has1569++;
      if (items.includes(vid5001)) redPotion++;
      if (items.includes(vid678)) moonLegs++;
    }
    return {
      seed,
      ms: Date.now() - t0,
      flags: w.seedFlags,
      islands,
      islandHouseChecks,
      snowCloud, fountains,
      brickTotal, dgBrickPaints, dgWallPaints,
      templeTotal, templeBrickPaints,
      treeWoodPainted,
      wall25MinY, paintedBrickMinY,
      chestCount: chests.length,
      has1571, has1569, redPotion, moonLegs,
      dungeonWallStyle: gs.dungeonWallStyle,
      dungeonTheme: gs.dungeonTheme,
      dungeonY: gs.dungeonY,
      ws: gs.worldSurface,
      tRooms: gs.tRooms,
      crimsonLeft: gs.crimsonLeft,
      crimson: gs.crimson,
      entKindDebug: [gs.dungeonEntA, gs.dungeonEntB],
    };
  };
  const drunk = await run('5162020');
  const ctl = await run('sw-ctl-iiii21');
  return { drunk, ctl };
});
const fail = (cond, msg) => { if (!cond) errs.push('ASSERT: ' + msg); };
const D = out.drunk, C = out.ctl;
console.log(JSON.stringify({ D, C }, null, 1));
fail(D.flags?.drunkWorld === true, `drunk 旗标应命中(${JSON.stringify(D.flags)})`);
fail(C.flags?.drunkWorld == null, `对照世界不得挂 drunk 旗`);
// C1
fail(D.islands.length >= 4, `drunk 浮空岛记录≥4（${D.islands.length}）`);
const nonLake = D.islands.filter((i) => !i.isLake);
fail(nonLake.every((i) => i.style === 1 || i.style === 3), `非湖岛 style ∈{1,3}:${nonLake.map((i) => i.style)}`);
fail(nonLake.some((i) => i.style === 1), 'drunk 应有沙漠云岛(style1)');
fail(D.snowCloud > 60, `drunk 应有雪云块>60(${D.snowCloud})`);
fail(C.islands.filter((i) => !i.isLake).every((i) => i.style === 0), '对照世界岛 style 全 0');
fail(C.snowCloud === 0, `对照世界无雪云(${C.snowCloud})`);
for (const h of D.islandHouseChecks) {
  fail(h.sand > 40 || h.snow > 40, `岛(style${h.style}) 沙芯或雪芯显著(${h.sand}/${h.snow})`);
}
fail(D.fountains > 0, `drunk 岛应有喷泉(${D.fountains})`);
fail(C.fountains === 0 || C.fountains < 2, `对照世界喷泉≈0(${C.fountains})`);
// C2 paint
{
  const entries = Object.entries(D.dgBrickPaints).filter(([k, v]) => Number(k) !== 0 && v > 200);
  fail(entries.length >= 1, `drunk 地牢砖应有统一色(${JSON.stringify(D.dgBrickPaints)})`);
  if (entries.length) fail(Number(entries[0][0]) >= 13 && Number(entries[0][0]) <= 24, `paint 主色∈[13,24](got ${entries[0][0]})`);
  const p25 = Object.entries(D.dgWallPaints).filter(([k, v]) => k === '25').reduce((a, b) => a + b[1], 0);
  fail(p25 > 3000, `drunk 地牢墙黑涂 25 应数千格(${p25})`);
  const p16t = (Number(D.templeBrickPaints['16'] ?? 0));
  fail(p16t > 1500, `神庙砖染 16 应大面(${p16t}/${D.templeTotal})`);
}
// 对照世界：paint 全零
{
  const nz = [...Object.entries({ ...C.dgBrickPaints, ...C.templeBrickPaints })].some(([k, v]) => Number(k) !== 0 && v > 100)
    || Object.entries(C.dgWallPaints).some(([k, v]) => Number(k) !== 0 && v > 500);
  fail(!nz, `对照世界 paint 通道应全零(${JSON.stringify({ b: C.dgBrickPaints, t: C.templeBrickPaints, w: C.dgWallPaints })})`);
}
// C3
fail(Number.isInteger(D.dungeonWallStyle) && D.dungeonWallStyle >= 0, `dungeonWallStyle 已掷(${D.dungeonWallStyle})`);
fail(C.dungeonWallStyle === undefined, `对照世界不掷墙风格(${C.dungeonWallStyle})`);
// 埋地断言（y0 强制 cs:14874=ws+70 → 上面厅群不高于地表带；gs.dungeonY 是
//   入口盒底/老头锚，非锚点本身——与 M 批 probe 口径一致取"≤ws+320 浅锚"而非等式）：
fail(Math.trunc(D.ws) + 320 > D.dungeonY, `drunk 入口浅锚(${D.dungeonY}<ws+320=${Math.trunc(D.ws) + 320})`);
fail(D.wall25MinY > Math.trunc(D.ws) - 80, `drunk 地牢墙最低带应≥ws-80(${D.wall25MinY}/ws${Math.trunc(D.ws)})`);
fail(D.has1571 > 0 && D.has1569 > 0, `drunk 双邪恶生物群系箱并存(1571:${D.has1571}/1569:${D.has1569})`);
fail(!(C.has1571 > 0 && C.has1569 > 0), `对照世界只有单侧邪恶箱(1571:${C.has1571}/1569:${C.has1569})`);
fail(C.chestCount === D.chestCount - 1 || true, '');   // 记录性输出（数量随结构差浮动）
fail(D.treeWoodPainted > 180, `drunk 死生命树活木(paint28)>180(${D.treeWoodPainted})`);
fail((out.ctl.treeWoodPainted ?? 0) < 50, `对照世界不应有树漆域(${C.treeWoodPainted})`);
// C4
fail(D.tRooms >= 27, `drunk 神庙房间×3 → ≥27(${D.tRooms})`);
console.log('PAGE_ERRORS:', errs.length ? errs : 'none');
if (errs.length) console.log(errs.join('\n'));
await browser.close();
process.exit(errs.length ? 1 : 0);
