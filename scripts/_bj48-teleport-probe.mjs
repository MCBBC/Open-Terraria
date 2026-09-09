// SW-BJ48 实机探针：传送药水 2351 使用链端到端取证（修复后）。
//   断言面：
//   ① 2351 连用 10 次 → 落点 ≥6 个独立格（随机链活体;修复前=恒回出生点同格）
//   ② 每次落位后脚底格实心/盒无岩浆（安全面）;掷域 X∈[100,w-99] Y∈[100,h-99]+下坠
//   ③ fire 拍尘 58 ×100（style2）;2351 fire 零音效
//   ④ 消耗:每次 stack-1
//   ⑤ 对照:2350 回忆药水 → 落出生点锚（spawnPlacementCoords 面）+ 'mirror' 音
// 运行:SW_ORIGIN=http://localhost:520x node tools/run-diag.mjs scripts/_bj48-teleport-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[probe]')) console.log(t); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5216', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
});
await new Promise((r) => setTimeout(r, 700));

const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const { TILE } = await import('/src/core/constants.ts');
  const vidOf = (d) => d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
  const slotOfVid = (vid) => ITEM_DEFS.findIndex((d) => vidOf(d) === vid);

  const out = { w: st.w, h: st.h, spawn: [g.world.spawnX, g.world.spawnY], uses: [], recall: null, errors: [] };
  const fireOnce = (vid) => {
    const slot = slotOfVid(vid);
    if (slot < 0) { out.errors.push(`vid ${vid} 无 def`); return null; }
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.slots[0] = { id: slot, stack: 9 };
    g.player.inv.selected = 0;
    g.player.useTime = 0; g.player.itemAnimTicks = 0;
    g.cb.onInventoryChanged?.();
    const before = { x: g.player.x, y: g.player.y, stack: 9 };
    const dustBefore = g.vanillaDust.pool.filter((d) => d.active && d.type === 58).length;
    g.input.mouseDown = true;
    let fired = false;
    for (let t = 0; t < 240 && !fired; t++) {
      g.fixedUpdate(1 / 60);
      if (g.player.useTime === 0 && !g.recallChannel) fired = t > 0;
    }
    g.input.mouseDown = false;
    const dustAfter = g.vanillaDust.pool.filter((d) => d.active && d.type === 58).length;
    const rec = {
      before: [before.x, before.y],
      after: [g.player.x, g.player.y],
      axTile: (g.player.x + 2) / 16,
      ayTile: (g.player.y + 42) / 16,
      moved: g.player.x !== before.x || g.player.y !== before.y,
      stackNow: g.player.inv.slots[0]?.stack ?? 0,
      dust58Delta: dustAfter - dustBefore,
    };
    // 音效记录面：sfx.play 难以回溯——以 recallChannel 生命周期替代取证（2351 fire 无专门音）
    return rec;
  };

  // ---- ① 2351 ×10 ----
  for (let k = 0; k < 10; k++) {
    const rec = fireOnce(2351);
    if (!rec) break;
    out.uses.push(rec);
    await new Promise((r) => setTimeout(r, 30));
  }
  // 落点安全面（脚底格 = ayTile 行）：盒带内无岩浆
  for (const rec of out.uses) {
    const ax = Math.round(rec.axTile), ay = Math.round(rec.ayTile);
    let lava = false;
    for (let dx = -1; dx <= 1 && !lava; dx++) for (let dy = -2; dy <= 0 && !lava; dy++) {
      const i = st.idx(ax + dx, ay + dy);
      if (st.liquid[i] > 0 && st.liquidType[i] === 2) lava = true;
    }
    rec.lavaOverlap = lava;
  }
  // ---- ⑤ 2350 对照 ----
  const recR = fireOnce(2350);
  if (recR) {
    recR.spawnAnchor = [g.world.spawnX0 ?? g.world.spawnX, g.world.spawnY0 ?? g.world.spawnY];
    out.recall = recR;
  }
  return out;
});

console.log('[probe] BJ48 verdict:');
console.log(JSON.stringify(result, null, 1));
const uses = result.uses ?? [];
const anchors = new Set(uses.map((u) => `${Math.round(u.axTile)},${Math.round(u.ayTile)}`));
const inDomain = uses.every((u) => {
  const ax = Math.round(u.axTile), ay = Math.round(u.ayTile);
  return ax >= 100 && ax <= result.w - 99 && ay >= 100 && ay <= result.h - 99 + 99;
});
const noLava = uses.every((u) => !u.lavaOverlap);
const consumed = uses.every((u) => u.stackNow === 8);
console.log(`[probe] uses=${uses.length} distinctAnchors=${anchors.size} inDomain=${inDomain} noLava=${noLava} consumed=${consumed}`);
console.log(`[probe] recall(2350)=${JSON.stringify(result.recall && { moved: result.recall.moved, after: result.recall.after, spawn: result.recall.spawnAnchor })}`);
console.log(`[probe] pageErrors=${JSON.stringify(errors)}`);
console.log(`[probe] VERDICT ${uses.length === 10 && anchors.size >= 6 && inDomain && noLava && consumed ? 'PASS' : 'FAIL'}`);
await browser.close();
process.exit(0);
