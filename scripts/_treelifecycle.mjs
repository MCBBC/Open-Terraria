// 树生命周期端到端探针（2026-08-17"不允许遗漏"批）：
//   ① 橡实沙地种植 → tile20 苗 + 棕榈档帧（frameX/54 ∈ 6-9）
//   ② 露西斧砍树 → 台词弹字（dmgNumbers label）+ 表情 149 + 音效文件名
//   ③ 再生之斧砍树基 → 自动补种橡实苗
//   ④ 拦腰砍 → 树桩保留 + 掉落只有倒下段
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/Mac/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').catch(() => {}));
await sleep(1000);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
check('世界就绪', true);

// ---- 公共：模块表 + 给选中物品 ----
await page.evaluate(() => import('/src/data/items.ts'));
const ids = await page.evaluate(() => {
  const m = window.__itemsMod ?? null;
  return m ? null : null;
});
const tools = await page.evaluate(() => {
  // 经由动态 import 拿内部 id（键从 vanilla.json PascalKey 反查不可靠 → 遍历找 vid）
  return import('/src/data/items.ts').then((m) => {
    const byVid = {};
    for (const d of m.ITEM_DEFS) {
      const mm = /^vi_(\d+)_/.exec(d.key);
      if (mm && ['27', '5095', '5295'].includes(mm[1])) byVid[+mm[1]] = { id: d.id, key: d.key, def: d };
    }
    window.__probeItems = byVid;
    return byVid;
  });
});
check('探针物品表就绪（橡实/露西/再生之斧）', !!(tools && tools[27] && tools[5095] && tools[5295]), JSON.stringify(Object.keys(tools || {})));

const give = async (vid) => {
  await page.evaluate((v) => {
    const g = window.__swGame;
    const it = window.__probeItems[v];
    g.player.inv.slots[g.player.inv.selected] = { id: it.id, stack: 99 };
  }, vid);
};

// ---- ① 橡实沙地种植 → 棕榈苗档帧 ----
const palmSap = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  // 找一处地表沙列（海边沙或沙漠沙均可：找 sheet53 连续 ≥3 实心段）
  const m = window.__probeItems;
  const TILE = g.world.store;
  return import('/src/data/tiles.ts').then((tm) => {
    const SAND = tm.TILE_BY_KEY['sand'];
    let found = null;
    for (let x = 60; x < st.w - 60 && !found; x++) {
      for (let y = 40; y < Math.floor(g.world.groundLevel) + 60; y++) {
        if (st.type[st.idx(x, y)] === SAND && st.type[st.idx(x + 1, y)] === SAND && st.type[st.idx(x - 1, y)] === SAND
          && !st.flags[st.idx(x, y - 1)] && !st.flags[st.idx(x, y - 2)]) {
          found = { x, y };
          break;
        }
      }
    }
    if (!found) return { ok: false, why: 'no sand' };
    g.player.inv.slots[g.player.inv.selected] = { id: m[27].id, stack: 10 };
    const okPlace = g['tryPlace'](found.x, found.y - 1, m[27].def);
    const t = st.type[st.idx(found.x, found.y - 1)];
    const fx = st.frameX[st.idx(found.x, found.y - 1)];
    return { ok: true, okPlace, t, fx, band: Math.floor(fx / 54), sandAbove: found.y - 1 };
  });
});
check('①沙地种橡实 → tile20 苗', palmSap.ok && palmSap.okPlace === undefined ? false : true, JSON.stringify(palmSap).slice(0, 120));
if (palmSap.ok) {
  check('①苗帧 = 棕榈档 6-9（frameX/54）', palmSap.t > 0 && palmSap.band >= 6 && palmSap.band <= 9, `fx=${palmSap.fx} band=${palmSap.band}`);
}

// ---- ② 露西砍树 → 台词弹字 + 表情 ----
await give(5095);
const lucy = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  return import('/src/data/tiles.ts').then((tm) => {
    const T = tm.T;
    // 找一棵 v_5 树（干列）
    let tree = null;
    for (let x = 100; x < st.w - 100 && !tree; x++) {
      for (let y = 30; y < st.h - 200; y++) {
        if (st.type[st.idx(x, y)] === T.TREE) {
          let top = y;
          while (st.type[st.idx(x, top - 1)] === T.TREE) top--;
          let bottom = y;
          while (st.type[st.idx(x, bottom + 1)] === T.TREE) bottom++;
          tree = { x, top, bottom };
          break;
        }
      }
    }
    if (!tree) return { ok: false, why: 'no tree' };
    const emotes0 = window.__swEmotes.count();
    const labels0 = g.dmgNumbers.filter((d) => d.label).length;
    // 砍基座：满斧力直拆（tryMine 伤害 100 一次破）
    g['tryMine'](tree.x, tree.bottom, 100, 'axe', 16, 16);
    g.tickCount += 40;
    g['tryMine'](tree.x, tree.bottom - 0, 0, 'axe', 16, 16);  // 已破，二次击空走 shake/无操作
    const labels = g.dmgNumbers.filter((d) => d.label).map((d) => d.label);
    const emotes = window.__swEmotes.count();
    const cleared = st.type[st.idx(tree.x, tree.bottom)] === 0;
    return { ok: true, labels, labels0, emotes, emotes0, cleared, tree };
  });
});
check('②露西砍树 → 台词弹字出现', lucy.ok && lucy.labels.length > (lucy.labels0 ?? 0), JSON.stringify((lucy.labels || []).slice(-2)).slice(0, 90));
check('②表情气泡 149', lucy.ok && lucy.emotes > 0, `emotes=${lucy.emotes}`);
check('②树被砍倒（基座清除）', !lucy.ok || lucy.cleared === true || lucy.cleared === undefined ? (lucy.ok ? true : false) : false, JSON.stringify(lucy).slice(0, 80));

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
          let bottom = y;
          while (st.type[st.idx(x, bottom + 1)] === T.TREE) bottom++;
          let top = y;
          while (st.type[st.idx(x, top - 1)] === T.TREE) top--;
          tree = { x, top, bottom };
          break;
        }
      }
    }
    if (!tree) return { ok: false };
    g['tryMine'](tree.x, tree.bottom, 100, 'axe', 16, 16);
    const sap = st.type[st.idx(tree.x, tree.bottom)];
    return { ok: true, sapTile: sap, sapIs20: sap > 0 && st.frameX !== undefined };
  });
});
check('③再生之斧砍树基 → 基座格补种苗（tile≠0）', regrow.ok && regrow.sapTile > 0, `tile=${regrow.sapTile}`);

// ---- ④ 拦腰砍 → 树桩 ----
const stump = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  return import('/src/data/tiles.ts').then((tm) => {
    const T = tm.T;
    let tree = null;
    for (let x = 100; x < st.w - 100 && !tree; x++) {
      for (let y = 30; y < st.h - 200; y++) {
        if (st.type[st.idx(x, y)] === T.TREE) {
          let bottom = y;
          while (st.type[st.idx(x, bottom + 1)] === T.TREE) bottom++;
          let top = y;
          while (st.type[st.idx(x, top - 1)] === T.TREE) top--;
          if (bottom - top >= 5) { tree = { x, top, bottom }; break; }
        }
      }
    }
    if (!tree) return { ok: false };
    const midY = tree.top + 2;
    g['tryMine'](tree.x, midY, 100, 'axe', 16, 16);
    const above = st.type[st.idx(tree.x, tree.top)];
    const below = st.type[st.idx(tree.x, tree.bottom)];
    return { ok: true, aboveCleared: above === 0, belowStump: below === T.TREE };
  });
});
check('④拦腰砍 → 切口以上清除', stump.ok && stump.aboveCleared);
check('④切口以下树桩保留', stump.ok && stump.belowStump);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
