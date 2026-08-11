// 宝石系统 E2E：①生成后存在宝石矿/暴露晶簇/宝石树/宝石洞墙 ②挖暴露晶簇掉对应宝石
// ③砍宝石树掉宝石或石头+gemcorn ④提炼机投入沙泥出产物 ⑤gemcorn 可放置
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
const run = async () => {
  await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
  await new Promise(r => setTimeout(r, 1500));
  return p.evaluate(async () => {
    const g = window.__swGame;
    const w = g.world;
    const st = w.store;
    const { TILE_BY_KEY, ITEM_DEFS } = await import('/src/data/tiles.ts') && await import('/src/data/items.ts');
    const T2 = (await import('/src/data/tiles.ts')).TILE_BY_KEY;
    const ID = (await import('/src/data/items.ts')).ITEM_DEFS;
    const res = {};
    // ① 统计（采样 3000 列的 tile 分布）
    const counts = { gemOre: 0, exposed: 0, gemTree: 0, gemWall: 0 };
    const GEMS = new Set([T2['gem_sapphire'], T2['gem_ruby'], T2['gem_emerald'], T2['gem_topaz'], T2['gem_amethyst'], T2['gem_diamond']]);
    const TREE = new Set(['v_583_topaz_tree','v_584_amethyst_tree','v_585_sapphire_tree','v_586_emerald_tree','v_587_ruby_tree','v_588_diamond_tree','v_589_amber_tree'].map(k => T2[k]));
    const EXPOSED = T2['v_178_gems'];
    for (let x = 0; x < st.w; x += 3) {
      for (let y = 0; y < st.h; y += 2) {
        const i = st.idx(x, y);
        if (GEMS.has(st.type[i])) counts.gemOre++;
        else if (st.type[i] === EXPOSED) counts.exposed++;
        else if (TREE.has(st.type[i])) counts.gemTree++;
        if (st.wall[i] >= 48 && st.wall[i] <= 53) counts.gemWall++;
      }
    }
    res.genCounts = counts;
    // ② 挖暴露晶簇（找到一处 style≠6 的 → 掉宝石；style6 → 琥珀）
    let target = null;
    for (let x = 0; x < st.w && !target; x += 2) {
      for (let y = 0; y < st.h; y += 2) {
        const i = st.idx(x, y);
        if (st.type[i] === EXPOSED) { target = { x, y, style: Math.floor(st.frameX[i] / 18) }; break; }
      }
    }
    if (target) {
      const d0 = g.entities.drops.length;
      g.breakTileAt(target.x, target.y);
      res.exposedDrop = g.entities.drops.slice(d0).map(d => ID[d.itemId]?.key);
      res.exposedStyle = target.style;
    } else res.exposedDrop = null;
    // ③ 砍宝石树：找一棵树调用 fellImportedTree
    let tree = null;
    for (let x = 0; x < st.w && !tree; x += 2) {
      for (let y = 0; y < st.h; y += 2) {
        if (TREE.has(st.type[st.idx(x, y)])) { tree = { x, y }; break; }
      }
    }
    if (tree) {
      const d0 = g.entities.drops.length;
      g['fellImportedTree'](tree.x, tree.y, st.type[st.idx(tree.x, tree.y)]);
      const drops = g.entities.drops.slice(d0).map(d => ID[d.itemId]?.key + 'x' + d.stack);
      res.treeDrops = drops;
    } else res.treeDrops = null;
    // ④ 提炼机：玩家旁放置 + 背包给沙泥 + interactAt
    const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16) - 4;
    const EXT = T2['v_219_extractinator'];
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) st.setTile(px + dx, py + dy, EXT, dx * 18, dy * 18);
    const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
    const { Inventory } = await import('/src/items/Inventory.ts');
    const siltKey = VANILLA_ITEM_KEY_BY_ID[424];
    const inv = g.player.inv;
    inv.add((await import('/src/data/items.ts')).ITEM_BY_KEY[siltKey], 10);
    const d0 = g.entities.drops.length;
    g['interactAt'](px + 1, py + 1);
    res.extract = {
      dropped: g.entities.drops.slice(d0).map(d => ID[d.itemId]?.key + 'x' + d.stack),
    };
    // ⑤ gemcorn 放置（给一个紫水晶 gemcorn → tryPlace）
    const cornKey = 'vi_4852_GemTreeAmethystSeed';
    inv.add((await import('/src/data/items.ts')).ITEM_BY_KEY[cornKey], 5);
    g.player.inv.selected = inv.slots.findIndex(s => s && ID[s.id]?.key === cornKey);
    const SAP = T2['v_590_gem_saplings'];
    const okPlace = g.tryPlace(px - 3, py + 2);
    res.gemcornPlace = { ok: okPlace, sap: okPlace && st.type[st.idx(px - 3, py + 2)] === SAP };
    return res;
  });
};
let out = null;
for (let i = 0; i < 3 && !out; i++) { try { out = await run(); } catch (e) { await new Promise(r => setTimeout(r, 2500)); } }
if (!out) { console.log('PROBE FAIL (reloads)'); process.exit(1); }
console.log(JSON.stringify(out, null, 1));
const ok = out.genCounts.gemOre > 0 && out.genCounts.exposed > 0 && out.genCounts.gemTree > 0 && out.genCounts.gemWall > 0
  && out.exposedDrop && out.exposedDrop.length > 0 && out.treeDrops && out.treeDrops.length > 0
  && out.extract.dropped.length > 0 && out.gemcornPlace.sap;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
