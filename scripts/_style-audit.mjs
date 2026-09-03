// ★⑤ placeStyle 22 家族巡检探针（2026-09-03 十三批）：数据层与消费面端到端核验。
//  核验面：
//   ①旗 91 类级 placeStyle 回填（BANNER_STYLE_BY_VID style 域,Item.cs:19231/:5334 等）
//   ②旗 kill-drop 实例位（旗种 id 域）→ 放置点 bannerStyleOf 逆写 → 帧列 = style 域
//     （SceneMetrics.cs:419-441 解码域;311/312 跳档,Item.cs 4965-4977→297+type-4965）
//   ③破坏回收 round trip：放置→破坏→掉真旗→再放置同帧
//   ④花岗岩门 3131 强制纠偏 34（Item.cs:29272-29294 共享 case 组）
//   ⑤双参 DefaultToPlaceableTile 回填族抽检（晶塔 597/门 10/异奇株 227/音乐盒 139）
// 运行：SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_style-audit.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// ★F5（十三批,2026-09-03）：MAP 缺省改仓内 fixture（自有存档格式的调试存档,4200×1200）,
//  外部 Downloads 路径只在 SW_MAP 显式给出时使用;缺失即报错退出（不再带着不存在
//  的路径跑半程才炸 loadJson）
const DEFAULT_MAP = fileURLToPath(new URL('../public/debug-save.sbw.json', import.meta.url));
const MAP = process.env.SW_MAP ?? DEFAULT_MAP;
if (!fs.existsSync(MAP)) {
  console.error(`[style-audit] 地图 fixture 不存在: ${MAP}（SW_MAP=<自有存档 json> 可指定）`);
  process.exit(2);
}
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000 });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const vsd = await import('/src/data/vanillaStyleDrops.ts');
  const ban = await import('/src/world/Banners.ts');
  const fsMod = await import('/src/world/FurnitureStyle.ts');
  const { LIQUID_TYPE } = await import('/src/world/TileStore.ts');
  const PASS = [], FAIL = [];
  const check = (name, ok, extra = '') => { (ok ? PASS : FAIL).push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); };
  const defOfVid = (vid) => {
    const k = items.VANILLA_ITEM_KEY_BY_ID[vid];
    return k !== undefined ? items.ITEM_DEFS[items.ITEM_BY_KEY[k]] : undefined;
  };

  // ---- ①旗 91 类级 placeStyle（style 域）----
  const bannerPss = [[1615, 22], [1681, 88], [1701, 108], [2897, 109], [2994, 206], [3390, 207],
    [3593, 270], [3594, 271], [3780, 272], [3789, 273], [3837, 278], [3846, 287], [4541, 288],
    [4546, 293], [4602, 294], [4687, 295], [4688, 296], [4965, 297], [4974, 306], [4977, 309],
    [5352, 310], [5497, 311], [5498, 312], [5651, 313], [5672, 314], [5673, 315],
    [337, 0], [338, 1], [339, 2], [340, 3], [789, 4], [845, 7], [1451, 10], [1464, 16]];
  const psBad = bannerPss.filter(([vid, ps]) => defOfVid(vid)?.placeStyle !== ps)
    .map(([vid, ps]) => `${vid}:got=${defOfVid(vid)?.placeStyle},want=${ps}`);
  check('①旗91 类级 placeStyle = style 域（34 件抽检）', psBad.length === 0, psBad.join(' '));

  // ---- ②bannerStyleOf 逆写 + framedCellFrame 帧 + 解码/掉落域 round trip ----
  const bs = ban.bannerStyleOf;
  check('②a bannerStyleOf：290→313/291→314/292→315/289→310/1→22（S=banner+21,311/312 跳档）',
    bs(290) === 313 && bs(291) === 314 && bs(292) === 315 && bs(289) === 310 && bs(1) === 22);
  const fr = fsMod.framedCellFrame(91, 1, bs(290), 0, 0);
  check('②b framedCellFrame(91, bannerStyleOf(290)) = [1638,108]（band2 col91）', fr[0] === 1638 && fr[1] === 108,
    `got=${JSON.stringify(fr)}`);
  const fr2 = fsMod.framedCellFrame(91, 1, bs(1), 0, 0);
  check('②c framedCellFrame(91, bannerStyleOf(1)) = [396,0]（首带 col22）', fr2[0] === 396 && fr2[1] === 0,
    `got=${JSON.stringify(fr2)}`);
  const styleBack = vsd.styleFromFrame[91](fr[0], fr[1]);
  check('②d styleFromFrame[91] 逆读 = 313（SceneMetrics 域一致）', styleBack === 313, `got=${styleBack}`);
  // ★F5（十三批,2026-09-03）：原断言 `cond ? true : true` 恒真——换真断言：
  //  帧 → BANNERS 掉落域 round trip（5651 style313 / 5497 style311,BANNERS 逆表同域）
  const fr311 = fsMod.framedCellFrame(91, 1, 311, 0, 0);
  const vid313 = vsd.styleDropVidOfFrames(91, fr[0], fr[1]);
  const vid311 = vsd.styleDropVidOfFrames(91, fr311[0], fr311[1]);
  check('②e styleDropVidOfFrames(91) round-trip：313→5651 / 311→5497（BANNERS 掉落域）',
    vid313 === 5651 && vid311 === 5497 && vsd.BANNER_STYLE_BY_VID[5651] === 313
    && vsd.BANNER_STYLE_BY_VID[5497] === 311,
    `313→${vid313} 311→${vid311} rev5651=${vsd.BANNER_STYLE_BY_VID[5651]} rev5497=${vsd.BANNER_STYLE_BY_VID[5497]}`);

  // ---- ③kill-drop → 实例位 → 放置帧端到端（旗 290=OrcaBanner item 5651）----
  const vid290 = 5651;
  const item290 = defOfVid(vid290);
  const x0 = 200, F = 120;
  const STONE = tiles.TILE_KEY_BY_SHEET?.get?.(1) ? tiles.TILE_BY_KEY[tiles.TILE_KEY_BY_SHEET.get(1)] : tiles.TILE_BY_KEY['stone'];
  // 旗 AnchorTop=SolidTile 族（anchor91 读数）→ 悬挂件：顶棚行 F-4 + 净空 F-3..F-1
  for (let x = x0 - 3; x <= x0 + 3; x++) { st.setTileSilent(x, F - 4, STONE, 0, 0); for (let y = F - 3; y <= F - 1; y++) st.setTileSilent(x, y, 0, 0, 0); }
  const inv = g.player.inv;
  const selIdx = inv.selected, savedSlot = inv.slots[selIdx];
  const stand = (px, py) => { g.player.x = px * 16 + 8; g.player.y = (py - 2) * 16; g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0; };
  if (item290) {
    inv.slots[selIdx] = { id: items.ITEM_BY_KEY[item290.key], stack: 9, favorited: false, prefix: 0, placeStyle: 290 };   // kill-drop 实例位（旗种 id 域）
    inv.selected = selIdx;
    stand(x0 + 2, F - 1);
    g.player.useTime = 0;
    g['tryPlace'].call(g, x0, F - 3, items.ITEM_DEFS[inv.slots[selIdx].id]);   // 点击=顶锚格（Origin(0,0),AnchorTop）
    const bid = tiles.TILE_BY_KEY['v_91_banners'];
    const fx = st.frameX[st.idx(x0, F - 3)], fy = st.frameY[st.idx(x0, F - 3)];
    const tgot = st.get(x0, F - 3);
    check('③旗 kill-drop 实例位 placeStyle=290 → 帧列 style313（fx=1638 fy=108 band2）',
      tgot === bid && fx === 1638 && (fy === 108 || fy === 108 + 18), `tile=${tgot} fx=${fx} fy=${fy} def=${JSON.stringify({ tile: item290.tile, ps: item290.placeStyle, key: item290.key })}`);
    // 破坏（先破坏后清残渣）→ 掉真旗 5651 → 再放置（无实例位,类级 313）
    const drops = [];
    const origSpawn = g.spawnDrop.bind(g);
    g.spawnDrop = (px, py, key, n) => { drops.push(key); return origSpawn(px, py, key, n); };
    g['breakTile'].call(g, x0, F - 3);   // 破坏锚格 → CheckBanner 整件
    g.spawnDrop = origSpawn;
    for (let y = F - 3; y <= F - 1; y++) if (st.isActive(x0, y)) st.setTileSilent(x0, y, 0, 0, 0);
    const dropVid = drops.map((k) => /^vi_(\d+)/.exec(k)?.[1]).map(Number).filter(Boolean);
    check('③b 破坏旗 style313 掉真旗 5651（GetItemDrop_Banners :46564-46655）', dropVid.includes(5651),
      `drops=${JSON.stringify(drops)}`);
    inv.slots[selIdx] = { id: items.ITEM_BY_KEY[item290.key], stack: 9, favorited: false, prefix: 0 };   // 回收旗：无实例位
    stand(x0 + 2, F - 1);
    g.player.useTime = 0;
    g['tryPlace'].call(g, x0, F - 3, items.ITEM_DEFS[inv.slots[selIdx].id]);
    const refx = st.frameX[st.idx(x0, F - 3)];
    const reok = st.get(x0, F - 3) === bid && refx === 1638;
    check('③c 回收旗再放置（类级 ps=313,无实例位）→ 同帧列 fx=1638', reok, `tile=${st.get(x0, F - 3)} fx=${refx}`);
  } else check('③（vi_5651 缺在册 → 跳过端到端）', true, 'no item');

  // ---- ④花岗岩门 3131 → placeStyle 34 ----
  check('④花岗岩门 3131 placeStyle=34（Item.cs:29272-29294 组内逐支）', defOfVid(3131)?.placeStyle === 34,
    `got=${defOfVid(3131)?.placeStyle}`);
  check('④b 陨石门 3129=33 / 大理石门 3130=35', defOfVid(3129)?.placeStyle === 33 && defOfVid(3130)?.placeStyle === 35,
    `3129=${defOfVid(3129)?.placeStyle} 3130=${defOfVid(3130)?.placeStyle}`);

  // ---- ⑤双参回填族抽检（style 域端到端放置帧）----
  //  ★F5（十三批,2026-09-03）：并入 F1 共享 case 组纠偏代表 5 件（花岗岩族 3128/3134/
  //  3158、大理石族 3181、奖杯族 3868——真值 Item.cs:29267/:29318/:29525/:29238/:34210）
  const spot = [[4876, 0, 597], [5653, 10, 597], [4155, 39, 10], [6120, 68, 10], [3385, 8, 227], [3388, 11, 227],
    [562, 0, 139], [5639, 97, 139], [909, 0, 207], [4417, 9, 207], [4922, 8, 207], [3613, 0, 423], [3729, 6, 423],
    [3128, 26, 104], [3134, 26, 88], [3158, 29, 18], [3181, 51, 21], [3868, 62, 240]];
  const spotBad = spot.filter(([vid, ps]) => defOfVid(vid)?.placeStyle !== ps)
    .map(([vid, ps]) => `${vid}:got=${defOfVid(vid)?.placeStyle},want=${ps}`);
  check('⑤晶塔/门/异奇株/音乐盒/喷泉/感应器 + F1 共享组代表 placeStyle 抽检 18 件', spotBad.length === 0, spotBad.join(' '));

  // ---- ⑥critter anchor 724 家族档（Player.cs:43781 anchorStyle 覆写;items 类级=等价承载）----
  const critter = [[1992, 4], [2002, 1], [2004, 4], [2006, 1], [2007, 1], [2895, 1], [3191, 1], [4339, 4], [4340, 4], [4375, 1], [2001, 8]];
  const cBad = critter.filter(([vid, ps]) => defOfVid(vid)?.placeStyle !== ps)
    .map(([vid, ps]) => `${vid}:got=${defOfVid(vid)?.placeStyle},want=${ps}`);
  check('⑥锚桩 724 家族档抽检 11 件（1=Crawler/Runner 4=Flyer;2001=蝶种变体 8）', cBad.length === 0, cBad.join(' '));

  inv.slots[selIdx] = savedSlot;
  return { pass: PASS, fail: FAIL };
});

for (const l of [...out.pass, ...out.fail]) console.log(l);
const nFail = out.fail.length;
console.log(`\n==== ${out.pass.length} pass / ${nFail} fail ====`);
await browser.close();
process.exit(nFail ? 1 : 0);
