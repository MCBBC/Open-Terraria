// 蓝队复核探针（F1-F4 十三批登记项复核，2026-09-03）：只读+临时世界搭建，不改生产代码。
//  ★红队修复批（2026-09-03）后断言已整体翻转（原探针钉 bug 态,现钉修复态）：
//  F1 花岗岩家具族 20 件 placeStyle 伪值 → 纠偏为原版真值（表驱动无条件赋值）+缺档 3 件
//  F2 异奇株 style8 岩浆格 → 非活性岩浆格拒置（臂位归位）+活性 tileCut 格放行对照
//  F3 药草 alchBloom 先杀后转 → 先转换后杀（83 浸>16 岩浆+坏基 → 掉种子;反向不掉）
//  F4 门双锚分支 tileCut 豁免 → 门洞内高草可放门（清格相清除）
// 运行：SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_blue-review-f1-f4.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const MAP = process.env.SW_MAP ?? needInput(join(DOWNLOADS, 'map-Starter_World (23).json'));
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
  const { LIQUID_TYPE } = await import('/src/world/TileStore.ts');
  const PASS = [], FAIL = [], INFO = [];
  const check = (name, ok, extra = '') => { (ok ? PASS : FAIL).push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); };
  const info = (s) => INFO.push('INFO: ' + s);
  const defOfVid = (vid) => {
    const k = items.VANILLA_ITEM_KEY_BY_ID[vid];
    return k !== undefined ? items.ITEM_DEFS[items.ITEM_BY_KEY[k]] : undefined;
  };
  const idOf = (def) => items.ITEM_BY_KEY[def.key];
  const TILE = 16;
  const stone = tiles.TILE_BY_KEY[tiles.TILE_KEY_BY_SHEET.get(1)];
  const stand = (px, py) => { g.player.x = px * TILE + 8; g.player.y = (py - 2) * TILE; g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0; };
  const inv = g.player.inv;
  const selIdx = inv.selected;
  const savedSlot = inv.slots[selIdx];
  const hold = (vid) => {
    const d = defOfVid(vid);
    if (!d || idOf(d) === undefined) return null;
    inv.slots[selIdx] = { id: idOf(d), stack: 9, favorited: false, prefix: 0 };
    inv.selected = selIdx;
    return d;
  };
  const drops = [];
  let origSpawn = g.spawnDrop.bind(g);
  const spyDrops = () => { drops.length = 0; g.spawnDrop = (px, py, key, n) => { drops.push(key); return origSpawn(px, py, key, n); }; };
  const unspyDrops = () => { g.spawnDrop = origSpawn; };
  const setWrites = [];
  let origSetTile = st.setTile.bind(st);
  const spySetTile = () => { setWrites.length = 0; st.setTile = (x, y, t, fx, fy) => { setWrites.push([x, y, t, fx, fy]); return origSetTile(x, y, t, fx, fy); }; };
  const unspySetTile = () => { st.setTile = origSetTile; };
  // 静音世界搭建（不触发级联）：显式 setTileSilent + setLiquid
  const clearArea = (x0, y0, x1, y1) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      st.setTileSilent(x, y, 0, 0, 0);
      st.setLiquid(x, y, 0, LIQUID_TYPE.NONE);
    }
  };
  const F = 120;   // 工作行

  // ================= F1 =================
  const FAM20 = [[3128, 25, 26], [3134, 25, 26], [3137, 28, 29], [3140, 34, 35], [3143, 27, 28], [3146, 27, 28],
    [3149, 29, 30], [3152, 30, 31], [3155, 32, 33], [3158, 28, 29], [3161, 28, 29], [3164, 28, 29], [3167, 29, 30],
    [3170, 28, 29], [3173, 27, 28], [3176, 33, 34], [3179, 34, 35], [3181, 49, 51], [2642, 31, 32], [3868, 60, 62]];
  const badData = FAM20.filter(([vid]) => !defOfVid(vid)).map(([vid]) => `${vid} 无 def`);
  const psBad = FAM20.filter(([vid, , truth]) => defOfVid(vid)?.placeStyle !== truth)
    .map(([vid, , truth]) => `${vid}:got=${defOfVid(vid)?.placeStyle},want=${truth}`);
  check('F1-a 20 件运行时 placeStyle = 原版真值（★十三批 F1 纠偏翻转,Item.cs 行号见 items.ts 表）',
    badData.length === 0 && psBad.length === 0, psBad.join(' ') || '20/20 全部命中真值');
  check('F1-a2 3131 已纠偏=34（doorPs3131 并入 SHARED_GROUP_PLACE_STYLE_1457 表）', defOfVid(3131)?.placeStyle === 34, `got=${defOfVid(3131)?.placeStyle}`);
  // ★F1-a3（十三批）：缺档 3 件补齐（提取器 if/else 覆写形态整组无条目）
  const MISS3 = [[2641, 31], [3866, 61], [3867, 60]];
  const missBad = MISS3.filter(([vid, truth]) => defOfVid(vid)?.placeStyle !== truth)
    .map(([vid, truth]) => `${vid}:got=${defOfVid(vid)?.placeStyle},want=${truth}`);
  check('F1-a3 缺档 3 件 placeStyle = 原版真值（2641=31/3866=61/3867=60）', missBad.length === 0, missBad.join(' '));

  // 端到端：Granite Dresser 3134（3×2,style*54）
  {
    const d = hold(3134);
    const x0 = 210;
    clearArea(x0 - 4, F - 5, x0 + 5, F + 1);
    for (let x = x0 - 4; x <= x0 + 5; x++) st.setTileSilent(x, F, stone, 0, 0);
    stand(x0 - 3, F - 1);
    g.player.useTime = 0;
    spyDrops();
    g['tryPlace'].call(g, x0, F - 1, d);   // 底行点击（Origin 左下）
    unspyDrops();
    const t88 = tiles.TILE_KEY_BY_SHEET.get(88);
    const fx = st.frameX[st.idx(x0, F - 1)];
    const tileDef = tiles.TILE_BY_KEY[t88] ? tiles.TILE_DEFS[tiles.TILE_BY_KEY[t88]] : undefined;
    const fw = tileDef?.vanilla?.fw ?? 3;
    const gotPs = Math.round(fx / (fw * 18));
    check('F1-b 放置 3134 → 帧 style = 真值 26（★翻转:伪值 25 已纠偏）', st.get(x0, F - 1) === tiles.TILE_BY_KEY[t88] && gotPs === 26,
      `tile=${st.get(x0, F - 1)}/want=${tiles.TILE_BY_KEY[t88]} fx=${fx} style=${gotPs} (fw=${fw})`);
    // 破坏 → 掉落按帧反推
    spyDrops();
    g['breakTile'].call(g, x0, F - 1);
    unspyDrops();
    const dropVids = drops.map((k) => Number(/^vi_(\d+)/.exec(k)?.[1] ?? 0)).filter(Boolean);
    check('F1-c 破坏 → 掉 3134 Granite Dresser 自身（★翻转:不再掉 3132 陨石档）', dropVids.includes(3134) && !dropVids.includes(3132),
      `drops=${JSON.stringify(drops)}`);
    clearArea(x0 - 4, F - 5, x0 + 5, F + 1);
  }

  // ================= F2 =================
  {
    const t227 = tiles.TILE_BY_KEY['v_227_dye_plants'];
    const x0 = 220;
    clearArea(x0 - 4, F - 5, x0 + 5, F + 1);
    for (let x = x0 - 4; x <= x0 + 5; x++) st.setTileSilent(x, F, stone, 0, 0);
    // 非活性岩浆格
    st.setLiquid(x0, F - 1, 255, LIQUID_TYPE.LAVA);
    stand(x0 - 3, F - 1);
    const d8 = hold(3385);   // 异奇株 style 8
    g.player.useTime = 0;
    g['tryPlace'].call(g, x0, F - 1, d8);
    check('F2-a 异奇株 style8 → 非活性岩浆格【拒置】（★翻转:岩浆门归位 !targetActive 第一臂,Player.cs:40058）',
      st.get(x0, F - 1) !== t227,
      `tile=${st.get(x0, F - 1)}/want≠${t227} liquid=${st.liquid[st.idx(x0, F - 1)]} type=${st.liquidType[st.idx(x0, F - 1)]}`);
    st.setTileSilent(x0, F - 1, 0, 0, 0);
    st.setLiquid(x0, F - 1, 255, LIQUID_TYPE.LAVA);
    // 对照：style0（1107 万寿菊）同岩浆格 → 拒（修后走头门岩浆支,修前走 dyePlaceOk default 支,同判）
    const d0 = hold(1107);
    g.player.useTime = 0;
    g['tryPlace'].call(g, x0, F - 1, d0);
    check('F2-b 对照 style0 万寿菊 → 岩浆格拒置（门在,仅 style0 面）', st.get(x0, F - 1) !== t227,
      `tile=${st.get(x0, F - 1)}`);
    // 反向臂：活性 tileCut 目标格 + 岩浆 → IsReplaceableBlock 臂放行（原版语义,★翻转）
    st.setTileSilent(x0, F - 1, tiles.TILE_BY_KEY['v_73_forest_tall_plants'], 0, 0);
    st.setLiquid(x0, F - 1, 255, LIQUID_TYPE.LAVA);
    g.player.useTime = 0;
    g['tryPlace'].call(g, x0, F - 1, d8);
    check('F2-c 活性 tileCut 格+岩浆 → 放行写入（★翻转:IsReplaceableBlock 臂不看液体,Player.cs:40068-40075）',
      st.get(x0, F - 1) === t227, `tile=${st.get(x0, F - 1)}/want=${t227}`);
    info('F2 判读：臂位归位（岩浆门在 !targetActive 支）→ 非活性岩浆格拒 + 活性 tileCut 格放');
    clearArea(x0 - 4, F - 5, x0 + 5, F + 1);
  }

  // ================= F3 =================
  {
    const m83 = tiles.TILE_BY_KEY['v_83_herbs_mature'];
    const b84 = tiles.TILE_BY_KEY['v_84_herbs_bloom'];
    g.world.clock.timeOfDay = 0.5;   // 正午：style5 火焰花不可收窗（>15.75 才可收）
    const x0 = 230;
    // ① 83 + 岩浆 30 + 坏地基（下=石,col5 地基={57,633,78,380}）
    //  ★夹具序（2026-09-03 修复批定谳）：岩浆【先】置、药草后置（同 _blue-review-f3b
    //  场景 A「液先置」序）——若先置药草再 setLiquid(30>16)，运行期 AddWater 尾
    //  （Liquid.cs:1196-1211 移植面,液体事件驱动的冲毁链,>16 量门槛）会先把药草
    //  冲掉 → checkDecorSupport 到场时格已空 = 原断言被 vacuous 满足。液体先落格
    //  后写 tile 不触发液体事件 → 药草存活至 CheckAlch 裁决,探针只测本面。
    clearArea(x0 - 4, F - 5, x0 + 5, F + 1);
    for (let x = x0 - 4; x <= x0 + 5; x++) st.setTileSilent(x, F, stone, 0, 0);
    st.setLiquid(x0, F - 1, 30, LIQUID_TYPE.LAVA);
    st.setTileSilent(x0, F - 1, m83, 90, 0);   // frameX=90 → col 5
    stand(x0 - 3, F - 1);
    const def83 = tiles.TILE_DEFS[m83];
    spySetTile(); spyDrops();
    g['checkDecorSupport'].call(g, x0, F - 1, def83, 83, 'alch');
    unspySetTile(); unspyDrops();
    const transformTo84 = setWrites.some(([, , t]) => t === b84);
    const seedVids = drops.map((k) => Number(/^vi_(\d+)/.exec(k)?.[1] ?? 0));
    check('F3-a 83+岩浆>16+坏地基 → 先转 84 再杀 = 恒掉种子 312（★翻转:case5 转换先于 kill,WorldGen.cs:46451-46473→:46487）',
      transformTo84 && seedVids.includes(312),
      `writes=${JSON.stringify(setWrites)} drops=${JSON.stringify(drops)} seedVids=${JSON.stringify(seedVids)}`);
    info('F3-a 语义：地基失配只置 flag（:46447-46450）,转换支照跑,统一 if(flag)KillTile（:46487-46490）按转换后 type 杀');
    // ② 反向：84 + 岩浆 10 + 坏地基 → 本仓按 84 杀 = 恒掉种子;原版转 83 再杀 = 无种子（正午）
    clearArea(x0 - 4, F - 5, x0 + 5, F + 1);
    for (let x = x0 - 4; x <= x0 + 5; x++) st.setTileSilent(x, F, stone, 0, 0);
    st.setTileSilent(x0, F - 1, b84, 90, 0);
    st.setLiquid(x0, F - 1, 10, LIQUID_TYPE.LAVA);
    spySetTile(); spyDrops();
    g['checkDecorSupport'].call(g, x0, F - 1, tiles.TILE_DEFS[b84], 84, 'alch');
    unspySetTile(); unspyDrops();
    const transformTo83 = setWrites.some(([, , t]) => t === m83);
    const seedVids2 = drops.map((k) => Number(/^vi_(\d+)/.exec(k)?.[1] ?? 0));
    check('F3-b 84+岩浆≤16+坏地基 → 先转 83 再杀 = 无种子（正午不可收窗;★翻转）',
      transformTo83 && !seedVids2.includes(312),
      `writes=${JSON.stringify(setWrites)} drops=${JSON.stringify(drops)} seedVids=${JSON.stringify(seedVids2)}`);
    clearArea(x0 - 4, F - 5, x0 + 5, F + 1);
  }

  // ================= F4 =================
  {
    const doorTile = tiles.TILE_KEY_BY_SHEET.get(10);
    const t73 = tiles.TILE_BY_KEY['v_73_forest_tall_plants'];
    const dDoor = hold(25);   // Wooden Door
    const x0 = 240;
    const buildDoorway = (withPlant) => {
      clearArea(x0 - 4, F - 6, x0 + 4, F + 1);
      // 3 宽 6 高实心块（F-6..F），中列 carve F-1..F-3
      for (let x = x0 - 1; x <= x0 + 1; x++) for (let y = F - 6; y <= F; y++) st.setTileSilent(x, y, stone, 0, 0);
      for (let y = F - 3; y <= F - 1; y++) st.setTileSilent(x0, y, 0, 0, 0);
      if (withPlant) st.setTileSilent(x0, F - 1, t73, 0, 0);
    };
    // 对照：干净门洞 → 门可放
    buildDoorway(false);
    stand(x0 - 3, F - 1);
    g.player.useTime = 0;
    g['tryPlace'].call(g, x0, F - 1, dDoor);
    const okCtrl = st.get(x0, F - 3) === tiles.TILE_BY_KEY[doorTile] && st.get(x0, F - 1) === tiles.TILE_BY_KEY[doorTile];
    check('F4-a 对照：无草门洞 → 门正常放置（双锚+净空通过）', okCtrl,
      `doorTile=${tiles.TILE_BY_KEY[doorTile]} bottom=${st.get(x0, F - 1)} top=${st.get(x0, F - 3)} def.tile=${dDoor?.tile}`);
    // bug 面：门洞底格高草（tileCut）→ 静默无动作
    buildDoorway(true);
    stand(x0 - 3, F - 1);
    g.player.useTime = 0;
    g['tryPlace'].call(g, x0, F - 1, dDoor);
    const placed = st.get(x0, F - 1) === tiles.TILE_BY_KEY[doorTile] && st.get(x0, F - 3) === tiles.TILE_BY_KEY[doorTile];
    check('F4-b 门洞底格高草（tileCut）→ 门可放+清格（★翻转:占用豁免同口径,CanPlace TileObject.cs:357+Place :84-86 清格）', placed,
      `bottom=${st.get(x0, F - 1)} top=${st.get(x0, F - 3)}`);
    clearArea(x0 - 4, F - 6, x0 + 4, F + 1);
  }

  inv.slots[selIdx] = savedSlot;
  return { pass: PASS, fail: FAIL, info: INFO };
});

for (const l of [...out.pass, ...out.fail, ...out.info]) console.log(l);
const nFail = out.fail.length;
console.log(`\n==== ${out.pass.length} pass / ${nFail} fail ====`);
await browser.close();
process.exit(nFail ? 1 : 0);
