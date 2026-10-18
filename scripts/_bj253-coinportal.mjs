// ★BJ253 钱币传送门（proj 518 CoinPortal）实机全流程探针。
// 流程：newWorld 固定种子 → 出生点旁整平+放罐(tile 内部 id=vanilla sheet 28) →
//   stub Math.random=()=>0（rollLuck 零掷 → nextInt(500)=0 大奖必中）→ 真实破罐链
//   smashPot → 断言①projectiles 桶出现 projId 518、中心=罐格中心 → 主循环实跑 5s
//   （entities update+renderer draw 真链路）→ 断言②弹消亡(240t Kill)、③GoldCoin
//   掉落 ∈[5,15] 枚（ai1 三档）、④无 pageerror、⑤弹在期截图留档。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const MAP = process.env.SW_MAP ?? needInput(join(DOWNLOADS, 'map-Starter_World (12).json'));
const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* noop */ } });
// 菜单 → 单人 → __swLoadJson 直载真实地图（_bj223 习语）——__swGame 在 enterGame 才注入
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp menu failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const loaded = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'loader missing' };
  void window.__swLoadJson(t).catch(() => {});
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
  return { ok: !!window.__swGame?.world };
}, mapText);
if (!loaded.ok) { console.log('[probe] FAIL load', JSON.stringify(loaded)); await browser.close().catch(() => {}); process.exit(1); }
for (let i = 0; i < 900 && !(await page.evaluate(() => !!window.__swGame?.world?.store)); i++) {
  await new Promise((r) => setTimeout(r, 200));
}
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
console.log('[probe] world ready');

const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const POT = tiles.TILE_DEFS.findIndex((d) => d.vanilla && d.vanilla.sheet === 28);
  const DIRT = tiles.TILE_DEFS.findIndex((d) => d.vanilla && d.vanilla.sheet === 0);
  if (POT < 0) return { fail: 'pot-tile-not-found' };
  const sx = g.world.spawnX, sy = g.world.spawnY;
  let ground = sy;
  for (let d = 0; d < 80; d++) {
    if (st.type[st.idx(sx, sy + d)] !== 0) { ground = sy + d; break; }
  }
  // ★罐放 60 格外（磁吸拾取域之外——旁置时 15 枚金币全被玩家吸走,金币计数面
  //   会被拾取支吞掉）。人工平台 9×4,底行铺土承载罐 2×2。
  const px = sx + 60, py = ground - 1;
  for (let y = ground - 5; y <= ground - 1; y++) {
    for (let x = px - 4; x <= px + 5; x++) {
      if (st.inBounds(x, y)) st.setTileSilent(x, y, 0, 0, 0);
    }
  }
  for (let x = px - 4; x <= px + 5; x++) {
    if (st.inBounds(x, ground)) st.setTileSilent(x, ground, DIRT, 0, 0);
  }
  st.setTileSilent(px, py, POT, 0, 0);
  st.setTileSilent(px + 1, py, POT, 18, 0);
  st.setTileSilent(px, py - 1, POT, 0, 18);
  st.setTileSilent(px + 1, py - 1, POT, 18, 18);
  return { pot: [px, py], ground, POT, before: g.entities.projectiles.length };
});
if (setup.fail) { console.log('[probe] setup fail', JSON.stringify(setup)); process.exit(1); }
console.log('[probe] pot placed', JSON.stringify(setup));

// stub Math.random=()=>0 → potLoot rollLuck(luck,500) 基线掷 nextInt(500)=0 → 大奖必中
// （同 stub 窗内罐瓦砾 gr 全取低端，无碍）。真实破罐链：smashPot（帧解码 2×2 整罐清
// +瓦砾+potLoot）。
const smash2 = await page.evaluate((pot) => {
  const g = window.__swGame;
  const origRandom = Math.random;
  Math.random = () => 0;
  try {
    g.smashPot(pot[0], pot[1]);
  } finally {
    Math.random = origRandom;
  }
  const portal = g.entities.projectiles.find((e) => e.projId === 518);
  return portal
    ? { ok: true, cx: portal.x + portal.w / 2, cy: portal.y + portal.h / 2, n: g.entities.projectiles.length }
    : { ok: false, projs: g.entities.projectiles.length };
}, [setup.pot[0], setup.pot[1]]);
console.log('[probe] smash →', JSON.stringify(smash2));
if (!smash2.ok) { console.log('[probe] FAIL: portal not spawned'); await browser.close().catch(() => {}); process.exit(1); }
const expectCx = setup.pot[0] * 16 + 16, expectCy = setup.pot[1] * 16 + 16;
if (Math.abs(smash2.cx - expectCx) > 0.01 || Math.abs(smash2.cy - expectCy) > 0.01) {
  console.log('[probe] FAIL center', smash2.cx, smash2.cy, 'expected', expectCx, expectCy);
  await browser.close().catch(() => {});
  process.exit(1);
}
console.log('[probe] center ok (i*16+16)');

// 弹在期查询（+视觉留档）：alive?金币已喷几枚?
await new Promise((r) => setTimeout(r, 2500));
const mid = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.entities.projectiles.find((e) => e.projId === 518);
  // __swITEMS = ITEM_DEFS(数组,id→def);vid 73 判别 = def.key 前缀 vi_73_
  const isGold = (id) => /^vi_73_/.test(window.__swITEMS?.[id]?.key ?? '');
  return {
    alive: !!p,
    ai0: p ? p['ai0'] : -1,
    scale: p ? p['scale'] : -1,
    dropsGold: g.entities.drops.filter((d) => isGold(d.itemId)).length,
    dropsAllIds: [...new Set(g.entities.drops.map((d) => d.itemId))].slice(0, 8),
    dropsN: g.entities.drops.length,
  };
});
console.log('[probe] mid(2.5s)', JSON.stringify(mid));
const canvas = await page.evaluate(() => {
  try { return window.__swGame.renderer.canvas.toDataURL('image/png'); } catch { return null; }
});
if (canvas) {
  const fs = await import('node:fs');
  fs.writeFileSync('/tmp/bj253-portal-mid.png', Buffer.from(canvas.split(',')[1], 'base64'));
  console.log('[probe] screenshot /tmp/bj253-portal-mid.png');
}

// 主循环实跑至消亡（240 tick ≈ 4s @60fps；多等 2s 缓冲），数金币
// ★金币落点在罐位=玩家身旁 2 格——磁吸拾取半径内,大概率直接进背包（inv）。
//   判别覆盖两支:drops 桶在场的 vid=73 + 玩家背包 vid=73 stack（ItemDrop 无
//   .key 字段,itemId=内部 id,vid 经 vanillaIdOfItem 反查;探针用 __swITEMS 反查键）
await new Promise((r) => setTimeout(r, 5500));
const final = await page.evaluate(() => {
  const g = window.__swGame;
  const portalGone = !g.entities.projectiles.some((e) => e.projId === 518);
  const isGold = (id) => /^vi_73_/.test(window.__swITEMS?.[id]?.key ?? '');
  const dropsGold = g.entities.drops.filter((d) => isGold(d.itemId));
  let invGold = 0;
  const inv = g.player?.inv;
  if (inv?.slots) {
    for (const s of inv.slots) {
      if (s && isGold(s.id)) invGold += s.stack;
    }
  }
  return {
    portalGone,
    dropsGold: dropsGold.length,
    invGold,
    goldTotal: dropsGold.reduce((a, d) => a + (d.stack ?? d.n ?? 1), 0) + invGold,
    sample: dropsGold.slice(0, 3).map((d) => ({ vid: 73, n: d.stack })),
  };
});
console.log('[probe] final', JSON.stringify(final));
// 在场掉落 5..15（ai1 三档 5/10/15;invGold 含玩家既有钱币不进断言,仅记录）
const pass = final.portalGone && final.dropsGold >= 5 && final.dropsGold <= 15 && errs.length === 0;
console.log('[probe] pageerrors', errs.length ? errs.slice(0, 3) : 'none');
console.log(pass ? '[probe] PASS' : '[probe] FAIL');
await browser.close().catch(() => {});
process.exit(pass ? 0 : 1);
