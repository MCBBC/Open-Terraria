// SW-FX38b 实机探针：①火把神解锁旗 .plr 全链（world.flags → saveGame 快照 → exportPlr
//   字节位 → parsePlr 读回真）②各群系摆普通营火逐位转换（BiomeCampfirePlaceStyle 值域
//   + 帧截图）。运行：
//   SW_ORIGIN=http://localhost:5241 node tools/run-diag.mjs scripts/_fx38b-campfire-plr-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
const r = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!(window.__swGame?.player && window.__swGame.world && window.__swTiles && window.__swItems && window.__swVANILLA_ITEM_KEY_BY_ID)) {
    if (Date.now() - t0 > 120000) return { fatal: 'timeout waiting handles' };
    await new Promise((res) => setTimeout(res, 300));
  }
  const g = window.__swGame;
  const { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { saveGame } = await import('/src/save/SaveFile.ts');
  const Plr = await import('/src/save/PlrImport.ts');
  const st = g.world.store;
  const camp = window.__swTiles['v_215_campfires'];
  const dirt = window.__swTiles['dirt'] ?? 1;
  const gy = Math.floor(g.world.groundLevel) + 12;
  const bx = Math.max(40, Math.floor(g.player.x / 16) - 6);
  const out = {};

  // ---------- ① 旗全链：解锁 → saveGame 快照 → exportPlr → parsePlr ----------
  g.world.flags.unlockedBiomeTorches = true;
  let json;
  try {
    json = saveGame(g.world, g.player, 0, g.townNpcsForSave(), g.eventsForSave(),
      g.pillarNpcsForSave(), g.pressurePlatesForSave());
  } catch (e) { return { fatal: 'saveGame: ' + String(e).slice(0, 200) }; }
  const snap = JSON.parse(json).player;
  out.snapshotFlag = snap.unlockedBiomeTorches;                       // 快照面（曾整缺）
  // ?play=small 诊断启动无角色上下文 → player.appearance 未挂;合成最小外观供导出链
  const appearance = g.player.appearance ?? {
    name: 'fx38b', hair: 0, skinVariant: 0, difficulty: 0, voiceVariant: 1, voicePitchOffset: 0,
    hairColor: { r: 1, g: 2, b: 3 }, skinColor: { r: 4, g: 5, b: 6 }, eyeColor: { r: 7, g: 8, b: 9 },
    shirtColor: { r: 10, g: 11, b: 12 }, undershirtColor: { r: 13, g: 14, b: 15 },
    pantsColor: { r: 16, g: 17, b: 18 }, shoeColor: { r: 19, g: 20, b: 21 },
  };
  let bytes;
  try {
    bytes = Plr.exportPlr(appearance, snap);
  } catch (e) {
    return { fatal: 'exportPlr: ' + String(e).slice(0, 160),
      dbg: { aType: typeof appearance, snapType: typeof snap, snapKeys: snap ? Object.keys(snap).length : -1,
        fnSrc: String(Plr.exportPlr).slice(0, 90) } };
  }
  const parsed = Plr.parsePlr(bytes);
  out.roundTripFlag = parsed.playerState.unlockedBiomeTorches;        // 导出→导入读回
  // 字节位复核（导出密文解开,旗=extraAccessory 后一字节;Serialize :55429-55433 序）
  const plain = Plr.aes128EcbDecrypt(bytes);
  const nameBytes = new TextEncoder().encode(appearance.name || 'Terraria Player').length;
  const off = 4 + 20 + 1 + nameBytes + 1 + 8 + 4 + 1 + 1 + 2 + 1 + 1 + 16 + 1;
  out.flagByte = plain[off];
  out.afterFlagBytes = Array.from(plain.slice(off + 1, off + 5));
  // 旗关世界不回退：导入无旗档 → world flag 保持 true（单调置位面由 mainFlow.applyPlayer
  //  在真实读档链承担,此处只验解析侧 false 语义）
  out.parseFalseStaysFalse = Plr.parsePlr(Plr.exportPlr(appearance, { ...snap, unlockedBiomeTorches: false })).playerState.unlockedBiomeTorches === false;

  // ---------- ② 各群系摆普通营火（解锁态）----------
  // 清场 + 铺长地板
  const zones = [
    ['zoneShimmer', 15], ['zoneGlowshroom', 14], ['zoneTemple', 13], ['zoneDungeon', 7],
    ['zoneUnderworldHeight', 2], ['zoneHallow', 12], ['zoneCorrupt', 10],
    ['zoneCrimson', 11], ['zoneSnow', 3], ['zoneJungle', 13], ['zoneDesert', 8],
  ];
  const x0 = bx - 4, x1 = bx + zones.length * 6 + 26;   // 11 群系列 + 门控两态 + 显式件列
  for (let x = x0; x <= x1; x++) for (let y = gy - 12; y < gy + 3; y++) {
    if (st.inBounds(x, y)) st.setTileSilent(x, y, 0);
  }
  for (let x = x0; x <= x1; x++) { st.setTileSilent(x, gy, dirt, 0, 0); st.setTileSilent(x, gy + 1, dirt, 0, 0); }
  const campKey = VANILLA_ITEM_KEY_BY_ID[966];
  const campDef = ITEM_DEFS[ITEM_BY_KEY[campKey]];
  const frozenDef = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3048]]];
  const slotsBackup = g.player.inv.slots[g.player.inv.selected];
  const cases = [];
  const placeOne = (tx, def) => {
    g.player.x = (tx - 2) * 16; g.player.y = (gy - 6) * 16;
    g.player.useTime = 0;
    g.player.inv.slots[g.player.inv.selected] = { id: ITEM_DEFS.indexOf(def), stack: 99 };
    // 点击 (tx, gy-1)=底中格（Origin(1,1) → 锚左上 (tx-1, gy-2),底锚行=gy 地板）
    try { g.tryPlace(tx, gy - 1, def); } catch (e) { return String(e).slice(0, 120); }
    const i = st.idx(tx - 1, gy - 2);
    if (st.type[i] !== camp) return 'not-placed';
    return st.frameX[i];                     // = style*54
  };
  let col = 0;
  for (const [flag, wantStyle] of zones) {
    for (const k of Object.keys(g.scene)) if (k.startsWith('zone')) g.scene[k] = false;
    g.scene.belowSurface = false;
    g.scene[flag] = true;
    const tx = bx + col * 6 + 2;
    const got = placeOne(tx, campDef);
    cases.push({ flag, wantStyle, gotFrameX: got, ok: got === wantStyle * 54 });
    col++;
  }
  // 门控两态（关开关 → 普通帧）+ 显式群系营火不转 + 未解锁面
  for (const k of Object.keys(g.scene)) if (k.startsWith('zone')) g.scene[k] = false;
  g.scene.zoneSnow = true;
  g.player.builderAccStatus[11] = 1;          // 背包左群系炬图标 OFF
  const gateOff = placeOne(bx + col * 6 + 2, campDef);
  cases.push({ flag: 'toggleOff(snow)', wantStyle: 0, gotFrameX: gateOff, ok: gateOff === 0 });
  g.player.builderAccStatus[11] = 0;
  g.world.flags.unlockedBiomeTorches = false; // 未解锁
  const locked = placeOne(bx + (col + 1) * 6 + 2, campDef);
  cases.push({ flag: 'unlocked=false(snow)', wantStyle: 0, gotFrameX: locked, ok: locked === 0 });
  g.world.flags.unlockedBiomeTorches = true;
  g.scene.zoneSnow = true;
  const explicit = placeOne(bx + (col + 2) * 6 + 2, frozenDef);   // 显式雪原营火 placeStyle3
  cases.push({ flag: 'explicit 3048(snow→hallow off)', wantStyle: 3, gotFrameX: explicit, ok: explicit === 3 * 54 });
  g.player.inv.slots[g.player.inv.selected] = slotsBackup;
  out.cases = cases;
  out.allOk = cases.every((c) => c.ok);

  // ---------- ③ 截图取景（相机对准营火排）----------
  g.player.x = (bx + (zones.length * 6) / 2) * 16;
  g.player.y = (gy - 4) * 16;
  if (g.freezeClock) g.freezeClock(true);
  if (g.world.clock) { g.world.clock.timeOfDay = 27000; }   // 白昼
  return out;
});
console.log(JSON.stringify(r, null, 1));
// 关欢迎弹窗 + 等两帧渲染后截图
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
});
await new Promise((res) => setTimeout(res, 1500));
await page.screenshot({ path: '/tmp/fx38b-campfire.png' });
console.log('screenshot saved: /tmp/fx38b-campfire.png');
await browser.close();
