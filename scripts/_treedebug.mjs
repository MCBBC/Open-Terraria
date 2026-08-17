// 树生命周期调试探针（分段打印）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 300), (e.stack || '').split('\n').slice(1, 3).join(' | ')));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1200);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
console.log('world ready');

await page.evaluate(() => import('/src/data/items.ts').then((m) => {
  window.__pi = {};
  for (const d of m.ITEM_DEFS) {
    const mm = /^vi_(\d+)_/.exec(d.key);
    if (mm && ['27', '5095', '5295'].includes(mm[1])) window.__pi[+mm[1]] = { id: d.id, key: d.key, def: d, tile: d.tile };
  }
}));

// ① 沙地干沙 + 详情
const r1 = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  return import('/src/data/tiles.ts').then((tm) => {
    const SAND = tm.TILE_BY_KEY['sand'];
    let found = null, tried = [];
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
    g.player.inv.slots[g.player.inv.selected] = { id: window.__pi[27].id, stack: 10 };
    const held = g.player.inv.heldItem();
    const r = g['tryPlace'](found.x, found.y - 1, window.__pi[27].def);
    const i2 = st.idx(found.x, found.y - 1);
    return { found, r, t: st.type[i2], fx: st.frameX[i2], heldKey: held ? window.__pi[27].key === undefined ? 'x' : 'ok' : 'null', itemDefTile: window.__pi[27].tile };
  });
});
console.log('① ', JSON.stringify(r1));

// ② Lucy：先直连 create 验 sinks，再走 tryMine 验钩
const r2 = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  return import('/src/data/tiles.ts').then(async (tm) => {
    const T = tm.T;
    let tree = null;
    for (let x = 100; x < st.w - 100 && !tree; x++) {
      for (let y = 30; y < st.h - 200; y++) {
        if (st.type[st.idx(x, y)] === T.TREE) {
          let bottom = y; while (st.type[st.idx(x, bottom + 1)] === T.TREE) bottom++;
          let top = y; while (st.type[st.idx(x, top - 1)] === T.TREE) top--;
          tree = { x, top, bottom }; break;
        }
      }
    }
    g.player.inv.slots[g.player.inv.selected] = { id: window.__pi[5095].id, stack: 1 };
    g.player.x = (tree.x - 2) * 16; g.player.y = (tree.bottom - 3) * 16;
    g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;
    const held = g.player.inv.heldItem();
    const labels0 = g.dmgNumbers.filter((d) => d.label).length;
    const em0 = window.__swEmotes.count();
    g['tryMine'](tree.x, tree.bottom, 100, 'axe', 16, 16);
    const labelsA = g.dmgNumbers.filter((d) => d.label).map((d) => d.label);
    const n0 = g.dmgNumbers.length;
    // 直连 LucyAxe.create 验 sinks 接线
    const direct = await import('/src/items/LucyAxe.ts').then((L) => {
      const emA = window.__swEmotes.count();
      L.create('choppedTree', 7, -7);
      return { emB: window.__swEmotes.count(), pushed: g.dmgNumbers.length - n0 };
    });
    const labels = g.dmgNumbers.filter((d) => d.label).map((d) => d.label);
    const slotDef = await import('/src/data/items.ts').then((m) => !!m.ITEM_DEFS[window.__pi[5095].id]);
    return { tree, heldId: held?.id, wantId: window.__pi[5095].id, slotDef, labels0, labelsA, labels, direct, em0, em1: window.__swEmotes.count(), cleared: st.type[st.idx(tree.x, tree.bottom)] === 0 };
  });
});
console.log('② ', JSON.stringify(r2).slice(0, 400));

// ③ 补种详情
const r3 = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  return import('/src/data/tiles.ts').then((tm) => {
    const T = tm.T;
    let tree = null;
    for (let x = 100; x < st.w - 100 && !tree; x++) {
      for (let y = 30; y < st.h - 200; y++) {
        if (st.type[st.idx(x, y)] === T.TREE) {
          let bottom = y; while (st.type[st.idx(x, bottom + 1)] === T.TREE) bottom++;
          let top = y; while (st.type[st.idx(x, top - 1)] === T.TREE) top--;
          if (bottom - top >= 3) { tree = { x, top, bottom }; break; }
        }
      }
    }
    g.player.inv.slots[g.player.inv.selected] = { id: window.__pi[5295].id, stack: 1 };
    g.player.x = (tree.x - 2) * 16; g.player.y = (tree.bottom - 3) * 16;
    g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;
    g.tickCount += 60;
    g['tryMine'](tree.x, tree.bottom, 100, 'axe', 16, 16);
    const bi = st.idx(tree.x, tree.bottom);
    const gi = st.idx(tree.x, tree.bottom + 1);
    const gt = st.type[gi];
    const gd = gt ? tm.TILE_DEFS[gt]?.vanilla?.sheet : null;
    return { tree, baseTile: st.type[bi], baseFx: st.frameX[bi], groundTile: gt, groundSheet: gd, half: st.half[gi], slope: st.slope[gi], flags: st.flags[gi], liq: st.liquid[bi] };
  });
});
console.log('③ ', JSON.stringify(r3));
await browser.close();
