/**
 * SW-BJ61 探针（一次性）：智能光标可视面在暗处的语义定谳——
 * 用户实报「原版智能光标暗处保亮，本仓随光照淡出」。
 *
 * 金标（1457，1458 同域逐字同）：
 *   · 黄框 DrawSmartCursor（Main.cs:47385-47442）：色=Lighting.GetColor(scX,scY)
 *     ×buffColor(1,0.9,0.1,1)（:47406 buffColor 定义 :38728-38735 纯乘），
 *     填充×0.6、边框(1,0.95,0.3)×1——原版黄框也随光照衰减（光=0 时填 60% 黑 +
 *     全黑边框=近不可见）。
 *   · tile 高亮 GetTileOutlineInfo（TileDrawing.cs:4518-4529）：avg>10 门，
 *     色=GetSelectionGlowColor(selected,avg)——暗处(≤10)整支不画。
 *   · 光标图标本体 DrawCursor（Main.cs:48783-48810，DrawInterface_36 :46069-46075
 *     智能态 Cursors[1]）：UI 层 cursorColor=用户 mouseColor×脉动（CursorColor
 *     :53271-53294，A=255×(α×0.3+0.7) α∈[0.6,1]）——不吃世界光照=恒亮。
 *   · 方向锁箭头（Main.cs:47432-47437）：Color.White 恒亮（本仓 Renderer 曾乘光）。
 *   · 目标计算 SmartCursorHelper.cs 全文零光照门（暗处照常锁定）。
 *
 * 本探针取证：暗/暗-未按Ctrl/微光/亮四态，直读 g.lighting 光值 + 主画布黄框
 * 填充/边框/BJ54 高亮 patch 像素 + ui-canvas 光标图标本体亮度，对照原版公式
 * 预测带（lit 边框=不透明 (255,242,77) 可精确锚定；暗态=黑框黑填充近不可见）。
 *
 * 断言基准（★2026-09-11 定谳后翻转到【动刀后语义】）：
 *   预修取证（本探针前版断言,已留档 /tmp/probe-out/_bj61/bj61-states.json@预修）：
 *   仓库=反编译语义——黄框/高亮乘光（0/56/158 单调线性,蓝分量=light.b×0.3 精确）、
 *   光标图标恒亮。动刀=用户明令分歧（TileHighlight.smartHighlightSampleLight 注）：
 *   黄框/高亮恒全亮（暗态边框=(255,242,77) 不透明、填充黄签名）,环境光照不受扰
 *   （avg≤10=「不给环境发光」）,光标图标恒亮。箭头=Color.White（真实 1:1 修复）。
 *
 * 运行：node tools/probe.mjs run scripts/_bj61.mjs --seed=05162020 --size=small --vite=auto
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, giveItems, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
// ★场地整体下移（probe.mjs small=4200×1200,地表~y250——y114 在天上;+366 → y480-500
//  =封闭地下暗域,无环境光）
const DY = 366;
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj61';
mkdirSync(OUT, { recursive: true });

// ---- 页内取证装具：状态读面 + patch 像素 ----
const INSTALL = `
window.__bj61aim = (tx, ty) => {
  const g = window.__swGame, c = g.camera;
  g.input.mouseX = Math.round((tx * 16 + 8 - c.x) * c.zoom + c.viewW / 2);
  g.input.mouseY = Math.round((ty * 16 + 8 - c.y) * c.zoom + c.viewH / 2);
};
window.__bj61read = () => {
  const g = window.__swGame;
  const sc = g.smartCursor;
  const c = g.camera;
  const cv = window.__swGame.renderer.canvas;   // ★真主画布(#game-root 首个 canvas 是 32×20 杂项,曾致全部 patch 采样打偏)
  const ctx = cv.getContext('2d');
  const S = (wx, wy) => [Math.round((wx - c.x) * c.zoom + cv.width / 2),
                         Math.round((wy - c.y) * c.zoom + cv.height / 2)];
  const patch = (wx, wy, pw, ph) => {
    const [sx, sy] = S(wx, wy);
    const w = Math.max(1, Math.round(pw * c.zoom)), h = Math.max(1, Math.round(ph * c.zoom));
    const x0 = Math.max(0, Math.min(cv.width - w, sx - (w >> 1)));
    const y0 = Math.max(0, Math.min(cv.height - h, sy - (h >> 1)));
    const d = ctx.getImageData(x0, y0, w, h).data;
    let mx = -1, pr = -1, pg = -1, pb = -1, mn = 1e9;
    let ar = 0, ag = 0, ab = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const s = d[i] + d[i + 1] + d[i + 2];
      if (s > mx) { mx = s; pr = d[i]; pg = d[i + 1]; pb = d[i + 2]; }
      if (s < mn) mn = s;
      ar += d[i]; ag += d[i + 1]; ab += d[i + 2]; n++;
    }
    return { max: [pr, pg, pb], maxSum: mx, minSum: mn,
             avg: [Math.round(ar / n), Math.round(ag / n), Math.round(ab / n)] };
  };
  // 光照（g.lighting.lightAt = 原版 Lighting.GetColor 语义,×globalBrightness×255 截断）
  const lightAt = (tx, ty) => g.lighting.lightAt(tx, ty);
  const avgOf = (l) => Math.floor((l[0] + l[1] + l[2]) / 3);
  const lightTarget = sc.showing && sc.x >= 0 ? lightAt(sc.x, sc.y) : null;
  const lightChest = lightAt(58, 128 + ${DY});
  // 黄框 patch（sc 目标格）：填充=格内 (4,4) 6×6；左边框=格左缘外 2px 带 (−1,8)
  let boxFill = null, boxBorder = null;
  if (sc.showing && sc.x >= 0) {
    boxFill = patch(sc.x * 16 + 4, sc.y * 16 + 4, 6, 6);
    boxBorder = patch(sc.x * 16 - 1, sc.y * 16 + 8, 5, 8);
  }
  // BJ54 高亮 patch（宝箱格 58,128 中心 8×8——mask 叠画增量在 Ctrl 开/关差分里读）
  const chest = patch(58 * 16 + 8, (128 + ${DY}) * 16 + 8, 8, 8);
  // ★黄框隔离 patch：sc 目标格实测=(55,132+DY)（扫点实证）——持镐精灵恒在玩家手位,
  //   与目标格重叠；Ctrl 开/关【同格】差分 isolates 黄框贡献（精灵两态相同可相消）
  const boxTile = patch(55 * 16 + 8, (132 + ${DY}) * 16 + 8, 4, 4);
  // 光标图标本体（#ui-canvas 全画布最亮像素——唯一内容就是指针）
  const uic = (window.__swVUI && window.__swVUI.canvas) || document.getElementById('ui-canvas');
  let cursorMax = -1, cursorPix = null;
  if (uic) {
    const uctx = uic.getContext('2d');
    const d = uctx.getImageData(0, 0, uic.width, uic.height).data;
    for (let i = 0; i < d.length; i += 4) {
      const s = d[i] + d[i + 1] + d[i + 2];
      if (s > cursorMax) { cursorMax = s; cursorPix = [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
    }
  }
  // 智能交互 tile 帧（BJ54 高亮候选面）
  let frame = null;
  try {
    frame = { tileWon: window.__bj61Frame.tileWon, n: window.__bj61Frame.coords.length,
              sel: [...window.__bj61Frame.selected] };
  } catch (e) { frame = { err: String(e) }; }
  return {
    sc: { showing: !!sc.showing, x: sc.x, y: sc.y, wanted: !!sc.wanted },
    light: { target: lightTarget, targetAvg: lightTarget ? avgOf(lightTarget) : null,
             chest: lightChest, chestAvg: avgOf(lightChest) },
    boxFill, boxBorder, chest, boxTile,
    cursor: { maxSum: cursorMax, pix: cursorPix },
    frame,
    mouse: { mx: g.input.mouseX, my: g.input.mouseY },
  };
};
window.__bj61stage = () => {
  const g = window.__swGame;
  const st = g.world.store;
  for (let x = 44; x <= 82; x++) for (let y = 114 + ${DY}; y <= 134 + ${DY}; y++) {
    const i = st.idx(x, y);
    st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
    st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
  }
  for (let x = 46; x <= 80; x++) st.setTileSilent(x, 132 + ${DY}, 1, 0, 0);   // 石地板
  // ★SW-BJ61 域归一:store=内部 id——宝箱=sheet21 的内部 id(曾误写 21=高草,吃了
  //  sheet21 宝箱候选=「地面暗黄痕迹」物证)。真宝箱/高草/木块/平台各布一组
  st.setTileSilent(58, 128 + ${DY}, window.__chestTid, 0, 0);
  st.setTileSilent(59, 128 + ${DY}, window.__chestTid, 18, 0);
  st.setTileSilent(58, 129 + ${DY}, window.__chestTid, 0, 18);
  st.setTileSilent(59, 129 + ${DY}, window.__chestTid, 18, 18);
  st.setTileSilent(66, 132 + ${DY}, window.__grassTid, 0, 0);      // 草块(sheet2)
  st.setTileSilent(66, 131 + ${DY}, window.__tallgrassTid, 0, 0);  // 高草(sheet3→internal21)
  for (let j = 0; j < 2; j++) st.setTileSilent(70 + j, 131 + ${DY}, window.__woodTid, 0, 0);  // 木块(sheet30)
  for (let j = 0; j < 2; j++) st.setTileSilent(73 + j, 131 + ${DY}, window.__platTid, 0, 0);  // 平台(sheet19)
  g.chunks.markDirtyArea(44, 114 + ${DY}, 82, 134 + ${DY});
  g.world.spawnX = 54; g.world.spawnY = 130 + ${DY}; g.world.spawnX0 = 54; g.world.spawnY0 = 130 + ${DY};
  const pl = g.player;
  pl.maxHp = 999999; pl.hp = 999999; pl.dead = false; pl.deadTime = 0;
  pl.respawnTimer = 0; pl._deathHandled = false; pl.ghost = false; pl.fallStartY = null;
  pl.x = 54 * 16; pl.y = (132 + ${DY}) * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  g.world.chests.push({ x: 58, y: 128 + ${DY}, items: Array(40).fill(null), frame: 0 });
  return 'staged';
};
window.__bj61torch = (tx, on) => {
  const g = window.__swGame, st = g.world.store;
  // ★store type=内部 id≠vanilla sheet——sheet4(火把)的内部 id 运行时反查(直写 4 曾=别的
  //   tile 零发光)
  st.setTileSilent(tx, 131 + ${DY}, on ? window.__torchTid : 0, 0, 0);
  g.chunks.markDirtyArea(tx - 2, 129 + ${DY}, tx + 2, 133 + ${DY});
  return 'torch-' + tx + '=' + (on ? 'on' : 'off');
};
'ok';
`;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  // ★空手=镐步不启动(Step_Pickaxe_MineSolids 需持镐)→ 黄框永不显。铜镐 vid 3509 入 0 槽
  const pick = await giveItems(page, [{ vid: 3509, slot: 0 }], { select: 0 });
  L.chk('铜镐入槽', pick.ok, JSON.stringify(pick.failed));

  await page.evaluate(INSTALL);
  await page.evaluate(async () => {
    const m = await import('/src/data/tiles.ts');
    const bySheet = (sh) => m.TILE_DEFS.findIndex((d) => d && d.vanilla && d.vanilla.sheet === sh);
    window.__torchTid = bySheet(4);
    window.__chestTid = bySheet(21);     // sheet21 宝箱 → internal16
    window.__grassTid = bySheet(2);      // 草块
    window.__tallgrassTid = bySheet(3);  // 高草 → internal21
    window.__woodTid = bySheet(30);      // 木块 → internal10
    window.__platTid = bySheet(19);      // 平台 → internal11
  });
  await page.evaluate(() => window.__bj61stage());
  await pump(page, 60, { clearEnemies: true });

  // BJ54 帧面直接引用（每次读面现取——避免动态 import 时序）
  await page.evaluate(async () => {
    const m = await import('/src/core/SmartInteractTiles.ts');
    window.__bj61FrameRef = m.smartInteractTileFrame;
  });

  const read = async () => {
    await page.evaluate(() => { window.__bj61Frame = window.__bj61FrameRef; });
    await nextFrame(page);
    await nextFrame(page);
    return await page.evaluate(() => window.__bj61read());
  };

  // ═══ 态 1：暗·未按 Ctrl（基线——黄框/高亮都不该有）═══
  await page.evaluate((dy) => window.__bj61aim(56, 132 + dy), DY);
  await pump(page, 20, { clearEnemies: true });
  const idleDark = await read();
  L.chk('暗·基线 sc 不显', idleDark.sc.showing === false, JSON.stringify(idleDark.sc));

  // ═══ 态 2：暗·按住 Ctrl（智能光标激活,无光源）═══
  await page.evaluate(() => { window.__swGame.input.keys.add('ControlLeft'); });
  await pump(page, 20, { clearEnemies: true });
  const dark = await read();
  L.chk('暗·sc 锁定宝箱（原版目标计算零光照门 SmartCursorHelper.cs）',
    dark.sc.showing === true, JSON.stringify(dark.sc));
  L.chk('暗·目标格光照 avg≤10（无光源洞穴）',
    dark.light.targetAvg != null && dark.light.targetAvg <= 10,
    `targetAvg=${dark.light.targetAvg} rgb=${JSON.stringify(dark.light.target)}`);
  // ★SW-BJ61 动刀后：恒全亮——暗态黄框=原版公式在 light=255 的取值
  L.chk('暗·黄框填充亮黄签名（(255,229,26)×0.6 合成:r>g>b 且 r−b>50 且 r≥120）',
    dark.boxFill && dark.boxFill.max[0] > dark.boxFill.max[1]
      && dark.boxFill.max[1] > dark.boxFill.max[2]
      && dark.boxFill.max[0] - dark.boxFill.max[2] > 50 && dark.boxFill.max[0] >= 120,
    `max=${JSON.stringify(dark.boxFill?.max)} sum=${dark.boxFill?.maxSum}`);
  L.chk('暗·黄框边框=(255,242,77) 恒亮（不透明合成=精确值）',
    dark.boxBorder && Math.abs(dark.boxBorder.max[0] - 255) <= 8
      && Math.abs(dark.boxBorder.max[1] - 242) <= 12 && Math.abs(dark.boxBorder.max[2] - 77) <= 20,
    `max=${JSON.stringify(dark.boxBorder?.max)}`);
  L.chk('暗·光标图标本体恒亮（原版 CursorColor 不吃光照 Main.cs:53271-53294）',
    dark.cursor.maxSum >= 200, `maxSum=${dark.cursor.maxSum} pix=${JSON.stringify(dark.cursor.pix)}`);
  // 暗态截图（Ctrl 仍按住=黄框/高亮链在激活态）
  await page.screenshot({ path: `${OUT}/bj61-dark.png` });
  // ★Ctrl 一次性按住到底（delete→re-add 循环曾致 case3/4 wanted 断链）

  // ═══ 态 2b：域归一检查（★SW-BJ61）——高草/木块不再是候选;真宝箱 4 格候选 ═══
  await page.evaluate((dy) => window.__bj61aim(66, 131 + dy), DY);
  await pump(page, 10, { clearEnemies: true });
  const grass = await read();
  L.chk('域归一·高草零候选（旧 bug:internal21 吃 sheet21 宝箱候选=地面暗黄痕迹）',
    grass.frame && grass.frame.n === 0, JSON.stringify(grass.frame));
  await page.evaluate((dy) => window.__bj61aim(70, 131 + dy), DY);
  await pump(page, 10, { clearEnemies: true });
  const wood = await read();
  L.chk('域归一·木块零候选（旧 bug:internal10 吃 sheet10 门候选）',
    wood.frame && wood.frame.n === 0, JSON.stringify(wood.frame));
  await page.evaluate((dy) => window.__bj61aim(59, 129 + dy), DY);
  await pump(page, 10, { clearEnemies: true });
  const chestScan = await read();
  L.chk('域归一·真宝箱（internal16→sheet21）整件 4 格候选',
    chestScan.frame && chestScan.frame.tileWon && chestScan.frame.n === 4,
    JSON.stringify(chestScan.frame));

  // ═══ 态 3：亮·火把贴身（61,131——宝箱右 3 格）═══
  await page.evaluate(() => window.__bj61torch(61, true));
  await pump(page, 240, { clearEnemies: true });   // 光传播充分
  await pump(page, 20, { clearEnemies: true });
  const lit = await read();
  L.chk('亮·目标格光照 avg>100（火把贴身）',
    lit.light.targetAvg != null && lit.light.targetAvg > 100,
    `targetAvg=${lit.light.targetAvg} rgb=${JSON.stringify(lit.light.target)}`);
  // ★SW-BJ61 动刀后：边框恒 (255,242,77)（与暗态同值=光照无关性证明）
  L.chk('亮·黄框边框=(255,242,77) 恒亮（与暗态同值）',
    lit.boxBorder && Math.abs(lit.boxBorder.max[0] - 255) <= 8
      && Math.abs(lit.boxBorder.max[1] - 242) <= 12 && Math.abs(lit.boxBorder.max[2] - 77) <= 20,
    `max=${JSON.stringify(lit.boxBorder?.max)}`);
  L.chk('亮·黄框填充黄色签名（r>g>b 且 r−b>50）',
    lit.boxFill && lit.boxFill.max[0] > lit.boxFill.max[1]
      && lit.boxFill.max[1] > lit.boxFill.max[2]
      && lit.boxFill.max[0] - lit.boxFill.max[2] > 50,
    `max=${JSON.stringify(lit.boxFill?.max)}`);
  L.chk('亮·BJ54 tile 高亮候选非空（宝箱∈HasOutlines）',
    lit.frame && lit.frame.tileWon && lit.frame.n > 0, JSON.stringify(lit.frame));
  L.chk('亮·光标图标本体恒亮', lit.cursor.maxSum >= 300,
    `maxSum=${lit.cursor.maxSum}`);

  // ═══ 态 4：微光·火把远置（72,131——宝箱右 14 格）═══
  await page.evaluate(() => window.__bj61torch(72, true));
  await page.evaluate(() => window.__bj61torch(61, false));
  await pump(page, 300, { clearEnemies: true });
  const dim = await read();
  L.chk('微光·光照介于暗亮之间（10<avg≤100）',
    dim.light.targetAvg != null && dim.light.targetAvg > 10 && dim.light.targetAvg <= 100,
    `targetAvg=${dim.light.targetAvg}`);
  if (dark.boxBorder && lit.boxBorder && dim.boxBorder) {
    const indep = Math.abs(dim.boxBorder.max[0] - lit.boxBorder.max[0]) <= 8
               && Math.abs(dark.boxBorder.max[0] - lit.boxBorder.max[0]) <= 8;
    L.chk('三态·边框亮度光照无关（暗=微光=亮,★SW-BJ61 用户分歧核心语义）', indep,
      `dark=${dark.boxBorder.max[0]} dim=${dim.boxBorder.max[0]} lit=${lit.boxBorder.max[0]}`);
  }

  // ═══ 截图存档（暗/微光/亮三态,同一取景）═══
  for (const [name, st] of [['dark', dark], ['dim', dim], ['lit', lit]]) {
    void st;
    await page.evaluate((dy) => window.__bj61aim(56, 132 + dy), DY);
    await pump(page, 6, { clearEnemies: true });
    await page.evaluate((dy) => {
      const g = window.__swGame, c = g.camera;
      const cv = window.__swGame.renderer.canvas;
      const sx = Math.round((54 * 16 - c.x) * c.zoom + cv.width / 2);
      const sy = Math.round(((122 + dy) * 16 - c.y) * c.zoom + cv.height / 2);
      window.__bj61Clip = { x: Math.max(0, sx), y: Math.max(0, sy),
        width: Math.min(480, cv.width - sx), height: Math.min(300, cv.height - sy) };
    }, DY);
    const clip = await page.evaluate(() => window.__bj61Clip);
    await page.screenshot({ path: `${OUT}/bj61-${name}.png`, clip });
  }

  writeFileSync(`${OUT}/bj61-states.json`, JSON.stringify({ idleDark, dark, lit, dim }, null, 1));
  L.say(`states 落盘 ${OUT}/bj61-states.json`);
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
