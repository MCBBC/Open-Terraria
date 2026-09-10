// ★SW-BJ55 一次性探针：spawnDrop 心/星节日替代接线验证（Item.cs:49670-49720）。
//   运行：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_sw-bj55-seasonal-probe.mjs
//   覆盖：①万圣窗 心58→糖苹果1734（pickup 标记保留语义由 Enemy/pot 调用方维持）
//         ②圣诞窗 心58→拐杖糖1867 ③无季 → 恒58 ④星184 圣诞→糖梅1868
//         ⑤强制位传导（forceHalloweenForToday 经 checkSeasonal → clock.halloween）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log(JSON.stringify({ ok: false, why: 'game boot timeout' })); await browser.close(); process.exit(1); }

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const KEY = window.__swVANILLA_ITEM_KEY_BY_ID;      // vid → key
  const ITEM_IDS = window.__swItems;                  // key → internalId
  const IID = (vid) => ITEM_IDS[KEY[vid]];            // vid → internalId
  // 用游戏内同一 vid 查表（items.ts 生成的 ITEM_DEFS 经 window 暴露面可能不在——
  // 兜底走 drops 实体上的 vanillaId 字段）
  const trial = (clockPatch, keyVid) => {
    Object.assign(g.world.clock, { halloween: false, xMas: false });
    if (clockPatch.tenth) g.world.seedFlags = { ...g.world.seedFlags, tenthAnniversary: true };
    else g.world.seedFlags = { ...g.world.seedFlags, tenthAnniversary: false };
    g.world.clock.halloween = !!clockPatch.halloween;
    g.world.clock.xMas = !!clockPatch.xMas;
    const before = g.entities.drops.length;
    const drop = g.spawnDrop(g.player.cx, g.player.cy, KEY[keyVid], 1, 0, 0);
    if (!drop) return { keyVid, fail: 'no drop' };
    const r = { keyVid, dropItemId: drop.itemId, vidOfDrop: Object.entries({58:1,184:1,1734:1,1735:1,1867:1,1868:1}).map(([v])=>Number(v)).find((v)=>IID(v)===drop.itemId) ?? null, pickup: drop.pickup ?? null };
    drop.dead = true;   // 清场,不污染后续帧
    void before;
    return r;
  };
  const results = [
    trial({}, 58),                                  // 无季：58 恒 58
    trial({ halloween: true }, 58),                 // 万圣：58→1734
    trial({ halloween: true }, 184),                // 万圣：184→1735
    trial({ xMas: true }, 58),                      // 圣诞：58→1867
    trial({ xMas: true }, 184),                     // 圣诞：184→1868
    trial({ tenth: true }, 58),                     // 十周年：58∈{58,1734,1867}
  ];
  // 强制位传导：forceHalloweenForToday 置位 → checkSeasonal → clock.halloween
  g.world.seedFlags = { ...g.world.seedFlags, tenthAnniversary: false };   // 试⑥遗留旗复位
  g.world.clock.halloween = false; g.world.clock.xMas = false;
  g.forceHalloweenForToday = true;                  // private 字段,探针直写（等月事件胜利臂）
  g.checkSeasonal();
  const forced = { halloween: g.world.clock.halloween, xMas: g.world.clock.xMas };
  const forcedDropVid = (() => {
    const d = g.spawnDrop(g.player.cx, g.player.cy, KEY[58], 1, 0, 0);
    const v = d ? (Object.entries({58:1,184:1,1734:1,1735:1,1867:1,1868:1}).map(([v2])=>Number(v2)).find((v2)=>IID(v2)===d.itemId) ?? null) : null; if (d) d.dead = true; return v;
  })();
  g.forceHalloweenForToday = false;
  g.checkSeasonal();
  return { results, forced, forcedDropVid, booted: true };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
