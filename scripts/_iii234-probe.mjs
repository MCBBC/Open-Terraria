// IIIII234 headless 探针:幸福宠物豁免 / 晶塔网络门 / 电路(门帧轴+感应器拆除终态信号)
// 运行:SW_ORIGIN=http://localhost:5290 node tools/run-diag.mjs scripts/_iii234-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const st = g.world.store;
  const T = (k) => tiles.TILE_BY_KEY[k];
  const res = { sections: {} };

  // ---- 场地:玩家脚旁找一块平地,清空 90×24 并铺地板 ----
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 8;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  const py = gy - 6;                       // 站立面(地板 py+1)
  for (let dy = -18; dy <= 4; dy++) for (let dx = -40; dx <= 40; dx++) {
    st.setTile(px + dx, py + dy, 0);
    st.wire[st.idx(px + dx, py + dy)] = 0;
    st.liquid[st.idx(px + dx, py + dy)] = 0;
  }
  for (let dx = -40; dx <= 40; dx++) st.setTile(px + dx, py + 1, 2);
  g.player.x = px * 16; g.player.y = (py - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.player.hurtTime = 0;

  const mkNpc = (key, tx, ty, homeX, homeY) => {
    const n = new TownNPC(key, tx * 16 + 8, ty * 16 + 8);
    n.x = tx * 16 + 8 - n.w / 2; n.y = ty * 16;
    n.home = { x: homeX, y: homeY };
    g.entities.add(n, 'npcs');
    return n;
  };
  const clearOurNpcs = () => {
    for (const n of [...g.entities.npcs]) {
      if (n.__iii234) { n.dead = true; }
    }
    g.entities.npcs = g.entities.npcs.filter((n) => !n.__iii234);
  };
  const tag = (n) => { n.__iii234 = true; return n; };

  // ================= A. 幸福:宠物 housingCategory 豁免 =================
  const A = {};
  {
    clearOurNpcs();
    const subject = tag(mkNpc('merchant', px, py, px, py));      // 商人 17 = 被评 NPC
    const scen = g.scene;
    A.scene = {
      corrupt: !!scen?.zoneCorrupt, crimson: !!scen?.zoneCrimson, hallow: !!scen?.zoneHallow,
      snow: !!scen?.zoneSnow, jungle: !!scen?.zoneJungle, desert: !!scen?.zoneDesert,
      glowshroom: !!scen?.zoneGlowshroom, beach: !!scen?.zoneBeach,
      dirt: !!scen?.zoneDirtLayerHeight, rock: !!scen?.zoneRockLayerHeight,
    };
    A.forest = !A.scene.corrupt && !A.scene.crimson && !A.scene.hallow && !A.scene.snow
      && !A.scene.jungle && !A.scene.desert && !A.scene.glowshroom && !A.scene.beach
      && !A.scene.dirt && !A.scene.rock;
    // A1: 4 个普通城镇 NPC 挤在旁 → 同屋 4 → DislikeCrowded ×1.05
    const crowd = [];
    for (let k = 0; k < 4; k++) crowd.push(tag(mkNpc('guide', px - 1 + k * 2, py, px - 1 + k * 2, py)));
    const r1 = g.computeShopHappiness(subject);
    A.crowded = {
      priceMul: r1.priceMul,
      hasDislikeCrowded: r1.report.some((l) => l.key.endsWith('.DislikeCrowded')),
    };
    // A2: 换成 4 只城镇宠物(637)同位置 → 不计入 → LoveSpace(×0.95)无拥挤
    for (const n of crowd) { n.dead = true; }
    g.entities.npcs = g.entities.npcs.filter((n) => !n.dead);
    const pets = [];
    for (let k = 0; k < 4; k++) pets.push(tag(mkNpc('town_cat', px - 1 + k * 2, py, px - 1 + k * 2, py)));
    const r2 = g.computeShopHappiness(subject);
    A.petsOnly = {
      priceMul: r2.priceMul,
      hasLoveSpace: r2.report.some((l) => l.key.endsWith('.LoveSpace')),
      hasCrowded: r2.report.some((l) => l.key.endsWith('Crowded')),
    };
    // A3: 被评 NPC 本身是宠物 → ProcessMood 提前 return(1.0/无报告)
    const r3 = g.computeShopHappiness(pets[0]);
    A.petSubject = { priceMul: r3.priceMul, reportLen: r3.report.length };
    // A4: 宠物在场不触发互相关系(商人在原版无关系条目命中——改用 Nurse(18) Love Merchant(19)?
    //  商人 17 关系:Like 588/18,Dislike 441,Hate 369。放一只宠物 + 放护士 →
    //  只有护士命中 LikeNPC;宠物不产生任何行)——护士在场对照
    for (const n of pets) { n.dead = true; }
    g.entities.npcs = g.entities.npcs.filter((n) => !n.dead);
    const nurse = tag(mkNpc('nurse', px + 2, py, px + 2, py));
    const r4 = g.computeShopHappiness(subject);
    A.relationNurse = {
      priceMul: r4.priceMul,   // 0.94(LikeNPC)×(森林 0.94)→ 0.8836→0.88;非森林 0.94
      lines: r4.report.map((l) => l.key.split('.').pop()),
    };
    const pet2 = tag(mkNpc('town_dog', px - 2, py, px - 2, py));
    const r5 = g.computeShopHappiness(subject);
    A.relationNursePlusPet = { priceMul: r5.priceMul, lines: r5.report.map((l) => l.key.split('.').pop()) };
    A.petNeutral = r5.priceMul === r4.priceMul;   // 宠物加入不改变价格
    void nurse; void pet2;
    clearOurNpcs();
  }
  res.sections.happiness = A;

  // ================= B. 晶塔:网络表 + 门禁 + 商店货架 =================
  const B = {};
  {
    // B1: 立一座胜利晶塔(样式 8,frameX=432) → refreshPylons 进表
    const bxp = px + 6, byp = py - 3;                       // 3×4 锚点(底行 py)
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 3; dx++) st.setTile(bxp + dx, byp + dy, 0);
    st.setTile(bxp, byp, T('v_597_pylons'), 8 * 54, 0);
    g.refreshPylons();
    B.pylonListed = g.pylons.some((p) => p.x === bxp && p.y === byp && p.type === 8);
    // B2: 门禁——胜利塔 0 NPC 门 + 恒接受;玩家就在塔旁(±60 格)
    const ptx = Math.floor(g.player.x / 16), pty = Math.floor(g.player.y / 16);
    const hit = { x: bxp, y: byp, type: 8 };
    const chk = g.pylonGateCheck(hit, ptx, pty);
    B.gateOk = chk.ok; B.gateFail = chk.fail;
    // B3: 拆塔 → 表空 → 门禁拒(不在任何塔旁)
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 3; dx++) st.setTile(bxp + dx, byp + dy, 0);
    g.refreshPylons();
    B.pylonsAfterBreak = g.pylons.length;
    const chk2 = g.pylonGateCheck(hit, ptx, pty);
    B.gateRejected = !chk2.ok;
    B.gateFailKey = chk2.fail;
    // B4: 商店晶塔货架——2 NPC 在玩家 169×124 窗内 + 玩家不在腐化/猩红
    const a = tag(mkNpc('guide', px + 2, py, px + 2, py));
    const b = tag(mkNpc('nurse', px - 2, py, px - 2, py));
    const merchant = tag(mkNpc('merchant', px, py, px, py));
    const stock = g.shopStockFor(merchant);
    B.shopHasPylon = stock.some((e) => e[0] === 4876);
    B.shopStockLen = stock.length;
    B.playerBelowSurface = (g.player.y / 16) > g.world.groundLevel;
    void a; void b;
    clearOurNpcs();
  }
  res.sections.pylons = B;

  // ================= C. 电路:门放置帧轴 + 感应器拆除终态信号 =================
  const C = {};
  {
    const defBySuffix = (vid, suffix) => {
      const k = Object.keys(items.ITEM_BY_KEY).find((key) => key.startsWith('vi_' + vid + '_') && key.endsWith(suffix));
      return k ? items.ITEM_DEFS[items.ITEM_BY_KEY[k]] : undefined;
    };
    const itemKeyOf = (vid) => Object.keys(items.ITEM_BY_KEY).find((k) => k.startsWith('vi_' + vid + '_'));
    // 每次 tryPlace 前:玩家贴到目标旁(放置射程 x5/y3 格) + 清 useTime 节流
    //  (C 前一击会写 useTime=14 → 下一击被 :23417 节流门吞;原版同门=点击节奏)
    const near = (tx, ty) => {
      g.player.x = (tx + 2) * 16; g.player.y = ty * 16;
      g.player.vx = 0; g.player.vy = 0;
      g.player.useTime = 0;
    };
    // C1: 逻辑门放置帧轴(PlaceLogicTiles else 支 frameX=0/frameY=18*style)
    const orGate = defBySuffix(3604, 'LogicGateOR');
    C.orGateDefFound = !!orGate;
    const gx = px - 3, gyp = py;
    C.placedGate = false; C.gateFrame = null;
    if (orGate && orGate.tile) {
      st.setTile(gx, gyp, 0);
      g.player.inv.slots[0] = { id: items.ITEM_BY_KEY[itemKeyOf(3604)], stack: 9 };
      g.player.inv.selected = 0;
      near(gx, gyp);
      try { g.tryPlace(gx, gyp, orGate); } catch (e) { C.tryPlaceErr = String(e); }
      const t = st.get(gx, gyp);
      C.placedGate = t === T('v_420_logicgate');
      C.gateFrame = { fx: st.frameX[st.idx(gx, gyp)], fy: st.frameY[st.idx(gx, gyp)] };
    }
    // C2: 门灯 419 支撑门——悬空拒 / 门顶放行(frameX=placeStyle*18)
    const lampOn = defBySuffix(3618, 'LogicGateLampOn');
    C.lampDefFound = !!lampOn;
    const lampKey = itemKeyOf(3618);
    const lx = gx, ly = gyp - 1;             // 门正上方
    st.setTile(lx, ly, 0);
    if (lampOn) {
      g.player.inv.slots[0] = { id: items.ITEM_BY_KEY[lampKey], stack: 9 };
      g.player.inv.selected = 0;
      near(lx, ly);
      try { g.tryPlace(lx, ly, lampOn); } catch (e) { C.lampErr = String(e); }
      C.lampOnGatePlaced = st.get(lx, ly) === T('v_419_logicgatelamp');
      C.lampFrame = C.lampOnGatePlaced
        ? { fx: st.frameX[st.idx(lx, ly)], fy: st.frameY[st.idx(lx, ly)] } : null;
      // 悬空位(无门/灯在下) → 拒(原版 CheckLogicTiles :45678 同门)
      const fx2 = px + 4, fy2 = py - 8;
      st.setTile(fx2, fy2, 0);
      g.player.inv.slots[0] = { id: items.ITEM_BY_KEY[lampKey], stack: 9 };
      near(fx2, fy2);
      try { g.tryPlace(fx2, fy2, lampOn); } catch (e) { C.lampFloatErr = String(e); }
      C.lampFloatingRejected = st.get(fx2, fy2) === 0;
    }
    // C3: 感应器拆除终态信号(TELogicSensor.Kill :283-315)——On 的水感应器
    //  接线到一盏灯(灯座在门上=合法组合,CheckLogicTiles 悬空灯会被杀):
    //  拆感应器 = 补发信号 → 灯翻亮
    const g3x = px + 1, g3y = py - 2;        // 419 灯的门座
    const lx2 = px + 1, ly2 = py - 3;        // 灯(在门上)
    const sx = px + 3, sy = py - 3;          // 感应器格(423 无支撑门,可悬空)
    st.setTile(g3x, g3y, T('v_420_logicgate'), 0, 0);
    st.setTile(lx2, ly2, T('v_419_logicgatelamp'), 0, 0);
    st.setTile(sx, sy, T('v_423_logicsensor'), 18, 54);   // frameY54=水档, frameX18=On
    st.wire[st.idx(lx2, ly2)] |= 1; st.wire[st.idx(lx2 + 1, ly2)] |= 1; st.wire[st.idx(sx, sy)] |= 1;
    g.scanTriggerTiles();
    g.breakTile(sx, sy);                     // 拆除(一切破坏路径同门)
    C.sensorKilledSignal = st.frameX[st.idx(lx2, ly2)] === 18;
    C.tpFlagReset = g.wiring.blockPlayerTeleportationForOneIteration === false;
    // C4: 对照——OFF(frameX=0) 的感应器拆除不发信号
    st.setTile(lx2, ly2, T('v_419_logicgatelamp'), 0, 0);
    const s3x = lx2 + 2, s3y = ly2;
    st.setTile(s3x, s3y, T('v_423_logicsensor'), 0, 54);
    st.wire[st.idx(s3x, s3y)] |= 1;
    g.scanTriggerTiles();
    g.breakTile(s3x, s3y);
    C.sensorOffNoSignal = st.frameX[st.idx(lx2, ly2)] === 0;
    // C5: 昼档(frameY0) On 感应器拆除不发(Kill :292-310 flag 链只含
    //  PlayerAbove/液体五档)
    st.setTile(lx2, ly2, T('v_419_logicgatelamp'), 0, 0);
    st.setTile(s3x, s3y, T('v_423_logicsensor'), 18, 0);
    st.wire[st.idx(s3x, s3y)] |= 1;
    g.scanTriggerTiles();
    g.breakTile(s3x, s3y);
    C.daySensorNoSignal = st.frameX[st.idx(lx2, ly2)] === 0;
  }
  res.sections.logic = C;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
