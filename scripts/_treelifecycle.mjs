// 树生命周期端到端探针（2026-08-17"不允许遗漏"批）：
//   ① 橡实沙地种植 → tile20 苗 + 棕榈档帧（frameX/54 ∈ 6-9）
//   ② 露西斧砍树 → 台词弹字（dmgNumbers label）+ 表情 149
//   ③ 再生之斧砍树基 → 自动补种橡实苗
//   ④ 拦腰砍 → 切口以上清、树桩保留
// ★物品注入走 spawnDrop+自动拾取（全程游戏侧解析 key）——动态 import items.ts
//   在并行会话热编辑期会与游戏实例分叉（双 ITEM_DEFS → 假 id 炸 Player fixedUpdate）
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160), (e.stack || '').split('\n')[1] ?? ''));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1200);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
check('世界就绪', true);

// vanilla.json（public 产物）→ 键解析全走游戏侧
const keys = await page.evaluate(async () => {
  const v = await fetch('/sprites/vanilla.json').then((r) => r.json());
  const out = {};
  const scan = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, val] of Object.entries(o)) {
      const m = /^vi_(\d+)_/.exec(k);
      if (m && ['27', '5095', '5295'].includes(m[1]) && val && typeof val === 'object') out[+m[1]] = k;
      else if (typeof val === 'object') scan(val);
    }
  };
  scan(v);
  window.__keys = out;
  return out;
});
check('vanilla.json 键就绪', !!keys[27] && !!keys[5095] && !!keys[5295], JSON.stringify(keys));

/** 游戏侧给选中物品：spawnDrop 落在玩家身上 → 自动拾取 → 选中该槽 */
const give = async (vid) => {
  await page.evaluate(async (v) => {
    const g = window.__swGame;
    const key = window.__keys[v];
    g.spawnDrop(g.player.cx, g.player.y + 4, key, 5, 0, -1);
    g.player.useTime = 0;
    for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
    // 找到刚拾取的槽并选中
    const inv = g.player.inv;
    let sel = -1;
    for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i]) { sel = i; break; }
    if (sel >= 0) inv.selected = sel;
  }, vid);
  await sleep(200);
};

// ---- ① 橡实沙地种植 → 棕榈苗档帧 ----
const palmSap = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  return import('/src/data/tiles.ts').then((tm) => {
    const SAND = tm.TILE_BY_KEY['sand'];
    let found = null;
    for (let x = 60; x < st.w - 60 && !found; x++) {
      for (let y = 40; y < Math.floor(g.world.groundLevel) + 60; y++) {
        const i = st.idx(x, y);
        if (st.type[i] === SAND && !st.half[i] && st.slope[i] === 0
          && !st.flags[st.idx(x, y - 1)] && !st.flags[st.idx(x, y - 2)]
          && st.liquid[st.idx(x, y - 1)] === 0 && st.liquid[st.idx(x, y - 2)] === 0
          && st.type[st.idx(x + 1, y)] === SAND && st.type[st.idx(x - 1, y)] === SAND) {
          found = { x, y }; break;
        }
      }
    }
    if (!found) return { why: 'no dry flat sand' };
    g.player.x = (found.x - 2) * 16; g.player.y = (found.y - 3) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.player.useTime = 0;
    const held = g.player.inv.heldItem();
    if (!held) return { why: 'no held acorn', found };
    // 直接调放置：目标格 (found.x, found.y-1)；物品 def 经 held.id 从渲染侧不可得 →
    // 走真实右键链太重，改为直接验证 placeAcornSapling（tryPlace 的橡实专支内核）
    const r = g['placeAcornSapling'](found.x, found.y - 1);
    const i2 = st.idx(found.x, found.y - 1);
    return { found, r, t: st.type[i2], fx: st.frameX[i2], band: Math.floor(st.frameX[i2] / 54) };
  });
});
check('①沙地 placeAcornSapling → tile 苗', palmSap.t > 0, JSON.stringify(palmSap).slice(0, 140));
check('①苗帧 = 棕榈档 6-9', palmSap.band >= 6 && palmSap.band <= 9, `fx=${palmSap.fx} band=${palmSap.band}`);

// ---- ② 露西砍树 ----
await give(5095);
const lucy = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  return import('/src/data/tiles.ts').then((tm) => {
    const T = tm.T;
    let tree = null;
    for (let x = 100; x < st.w - 100 && !tree; x++) {
      for (let y = 30; y < st.h - 200; y++) {
        if (st.type[st.idx(x, y)] === T.TREE) {
          let bottom = y; while (st.type[st.idx(x, bottom + 1)] === T.TREE) bottom++;
          let top = y; while (top > 1 && st.type[st.idx(x, top - 1)] === T.TREE) top--;
          if (st.flags[st.idx(x, bottom + 1)]) { tree = { x, top, bottom }; break; }
        }
      }
    }
    if (!tree) return { why: 'no tree' };
    g.player.x = (tree.x - 2) * 16; g.player.y = (tree.bottom - 3) * 16;
    g.player.vx = 0; g.player.vy = 0;
    const labels0 = g.dmgNumbers.filter((d) => d.label).length;
    const em0 = window.__swEmotes.count();
    g['tryMine'](tree.x, tree.bottom, 100, 'axe', 16, 16);
    const labels = g.dmgNumbers.filter((d) => d.label).map((d) => d.label);
    return { tree, labels0, labels, em0, em1: window.__swEmotes.count(), cleared: st.type[st.idx(tree.x, tree.bottom)] === 0 };
  });
});
check('②露西砍树 → 树倒', lucy.cleared === true, JSON.stringify(lucy).slice(0, 100));
check('②台词弹字出现', (lucy.labels || []).length > 0, JSON.stringify((lucy.labels || []).slice(0, 1)).slice(0, 60));
check('②表情气泡', (lucy.em1 ?? 0) > (lucy.em0 ?? 0), `em ${lucy.em0}→${lucy.em1}`);

// ---- ③ 再生之斧：砍树基 → 自动补种 ----
await give(5295);
const regrow = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  return import('/src/data/tiles.ts').then((tm) => {
    const T = tm.T;
    let tree = null;
    for (let x = 100; x < st.w - 100 && !tree; x++) {
      for (let y = 30; y < st.h - 200; y++) {
        if (st.type[st.idx(x, y)] === T.TREE) {
          let bottom = y; while (st.type[st.idx(x, bottom + 1)] === T.TREE) bottom++;
          let top = y; while (top > 1 && st.type[st.idx(x, top - 1)] === T.TREE) top--;
          if (bottom - top >= 3 && st.flags[st.idx(x, bottom + 1)]) { tree = { x, top, bottom }; break; }
        }
      }
    }
    if (!tree) return { why: 'no tree' };
    g.player.x = (tree.x - 2) * 16; g.player.y = (tree.bottom - 3) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.tickCount += 60;                                   // 上次挥击冷却
    g['tryMine'](tree.x, tree.bottom, 100, 'axe', 16, 16);
    const bi = st.idx(tree.x, tree.bottom);
    const gi = st.idx(tree.x, tree.bottom + 1);
    return { tree, base: st.type[bi], ground: st.type[gi], groundSheet: tm.TILE_DEFS[st.type[gi]]?.vanilla?.sheet };
  });
});
check('③再生之斧砍树基 → 基座格补种苗', regrow.base > 0, JSON.stringify(regrow).slice(0, 120));

// ---- ④ 拦腰砍 → 树桩 ----
const stump = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  return import('/src/data/tiles.ts').then((tm) => {
    const T = tm.T;
    let tree = null;
    for (let x = 100; x < st.w - 100 && !tree; x++) {
      for (let y = 30; y < st.h - 200; y++) {
        if (st.type[st.idx(x, y)] === T.TREE) {
          let bottom = y; while (st.type[st.idx(x, bottom + 1)] === T.TREE) bottom++;
          let top = y; while (top > 1 && st.type[st.idx(x, top - 1)] === T.TREE) top--;
          if (bottom - top >= 5 && st.flags[st.idx(x, bottom + 1)]) { tree = { x, top, bottom }; break; }
        }
      }
    }
    if (!tree) return { why: 'no tree' };
    const midY = tree.top + 2;
    g.player.x = (tree.x - 2) * 16; g.player.y = (midY - 3) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.tickCount += 60;
    g['tryMine'](tree.x, midY, 100, 'axe', 16, 16);
    return { ok: true, aboveCleared: st.type[st.idx(tree.x, tree.top)] === 0, midCleared: st.type[st.idx(tree.x, midY)] === 0, belowStump: st.type[st.idx(tree.x, tree.bottom)] === T.TREE };
  });
});
check('④拦腰砍 → 切口及以上清除', stump.midCleared === true && stump.aboveCleared === true, JSON.stringify(stump).slice(0, 100));
check('④切口以下树桩保留', stump.belowStump === true);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
