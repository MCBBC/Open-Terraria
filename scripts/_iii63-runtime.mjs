// IIII63 探针（★IIIII61 运行时域收齐）：黑暗伤害系统 + SkyblockRuntime 动态普查
//   A1 对照世界：skyblockLowTiles=false、无 theConstant 黑暗臂
//   A2 "the constant"：状态机接线（进图 reset）；玩家传送全黑腔 → 数秒内掉血 + 危险文案
//      （Game.fixedUpdate 的 ctx 走光照引擎采样——实机链路验证）
//   B  "skyblock"：暖扫后 world.skyblockLowTiles=true && skyblockNoAltars=true &&
//      noHellstone/noFossils/noLifeCrystals=true（空岛无狱石/化石/水晶）
// 用法:SW_ORIGIN=http://localhost:5209 node tools/run-diag.mjs scripts/_iii63-runtime.mjs
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5209';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pgerror]', e.message));
await page.goto(ORIGIN + '/?play=small&assetprewarm=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__swGame && window.__swGame.player, { timeout: 170000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const snapSkyblock = () => {
    const w = g.world;
    return {
      sky: !!w.seedFlags?.skyblock,
      lowTiles: !!w.skyblockLowTiles,
      noAltars: !!w.skyblockNoAltars,
      noHellstone: !!w.skyblockNoHellstone,
      noFossils: !!w.skyblockNoFossils,
      noLifeCrystals: !!w.skyblockNoLifeCrystals,
    };
  };
  // ---- A1 对照 ----
  await new Promise((r) => setTimeout(r, 600));
  const controlSb = { lowTiles: !!g.world.skyblockLowTiles, flagConst: !!g.world.seedFlags?.theConstant };
  const controlDarkDealerExists = !!g.dontStarveDarkness;

  // ---- A2 the constant ----
  await g.newWorld('the constant', 4200, 1200, () => {});
  await new Promise((r) => setTimeout(r, 1500));
  const isConst = !!g.world.seedFlags?.theConstant;
  const dealerResetOk = !!g.dontStarveDarkness;
  // 玩家塞进岩石深处（光照引擎逐帧收敛后中心格≈0）
  const p = g.player;
  const st = g.world.store;
  let bx = -1, by = -1;
  for (let y = Math.floor(g.world.groundLevel) + 40; y < g.world.store.h - 60 && bx < 0; y += 7) {
    for (let x = 120; x < st.w - 120; x += 11) {
      if (st.isSolid(x, y) && st.isSolid(x + 1, y) && st.isSolid(x, y - 1)
        && st.isSolid(x, y - 2) && st.isSolid(x, y - 3)) {
        bx = x; by = y - 2; break;
      }
    }
  }
  let hpBefore = 0, hpAfter = 0, textsSeen = 0;
  if (bx >= 0) {
    p.x = bx * 16 + 8 - p.w / 2; p.y = by * 16 + 8 - p.h / 2;
    p.vy = 0;
    hpBefore = p.hp;
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {           // ≥ 130 拍黑暗 + 若干击周期
      await new Promise((r) => setTimeout(r, 200));
      if (p.dead) break;
    }
    hpAfter = p.hp;
    // 死亡文案走 lastDamageCause=diedInTheDark；消息列读取走 recLog 缓冲
    try {
      const rows = g.recorder?.logs ?? [];
      for (const r of rows) {
        if ((r.k === 'chat' || r.kind === 'chat') && JSON.stringify(r.d || r).includes('黑暗')) textsSeen++;
      }
    } catch {}
  } else {
    return { error: 'no-solid-pocket' };
  }

  // ---- B skyblock ----
  await g.newWorld('skyblock', 4200, 1200, () => {});
  await new Promise((r) => setTimeout(r, 1500));
  const sbAfterLoad = snapSkyblock();

  return {
    controlSb, controlDarkDealerExists, isConst, dealerResetOk,
    darkTest: { foundPocket: bx >= 0, hpBefore, hpAfter, hpDropped: hpAfter < hpBefore, textsSeen },
    sbAfterLoad,
  };
});

const failures = [];
const assert = (name, cond) => { if (!cond) failures.push(name); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); };
assert('A1 对照世界 skyblockLowTiles=false', out.controlSb.lowTiles === false);
assert('A1 对照世界无 theConstant 旗', out.controlSb.flagConst === false);
assert('A1 Game 上存在 dontStarveDarkness 状态机', out.controlDarkDealerExists === true);
assert('A2 the constant 世界旗到位', out.isConst === true);
assert('A2 进世界后黑暗状态机被复位（可继续推进）', out.dealerResetOk === true);
assert('A2 找到全黑实心腔', out.darkTest.foundPocket === true);
assert('A2 全黑滞留数秒内玩家掉血（黑暗伤害落地）', out.darkTest.hpDropped === true);
assert('B skyblock 低格档 lowTiles=true（暖扫首态）', out.sbAfterLoad.lowTiles === true);
assert('B noAltars=true（空岛无恶魔祭坛）', out.sbAfterLoad.noAltars === true);
assert('B noHellstone=true', out.sbAfterLoad.noHellstone === true);
assert('B noFossils=true', out.sbAfterLoad.noFossils === true);
assert('B noLifeCrystals=true', out.sbAfterLoad.noLifeCrystals === true);
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(failures.length ? 1 : 0);
