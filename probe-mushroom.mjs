// 蘑菇掉落验证：放 sheet3 帧格(=蘑菇) → breakTile → 断言掉落 mushroom_item
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_BY_KEY, T } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const px = g.player.cx, py = g.player.cy;
  // 找玩家脚下一个可放格：正下方+1 的地面
  const bx = Math.floor(px / 16), by = Math.floor(py / 16) + 2;
  const mk = TILE_BY_KEY['v_3_forest_short_plants'];
  // 蘑菇帧 fx=144（原版 KillTile_GetItemDrops :65041）
  st.setTile(bx, by - 1, mk, 144, 0);
  const before = g.entities.drops.length;
  g.breakTile(bx, by - 1);
  const drops = g.entities.drops.slice(before).map((d) => d.itemId);
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  // 邪恶蘑菇帧也验一下（sheet 24 fx=144 → item 60）
  const ek = TILE_BY_KEY['v_24_corruption_short_plants'];
  if (ek) {
    st.setTile(bx, by - 1, ek, 144, 0);
    const b2 = g.entities.drops.length;
    g.breakTile(bx, by - 1);
    drops.push(...g.entities.drops.slice(b2).map((d) => d.itemId));
  }
  return { drops, dropKeys: drops.map((id) => ITEM_DEFS[id]?.key) };
});
console.log(JSON.stringify(out));
await b.close();
