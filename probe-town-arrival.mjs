// 城镇 NPC 入驻系统 E2E：
// ①新世界只有向导(无商人/护士) ②无房+50银 → 商人不来 ③造两间房 → 向导入住+商人入住房
// ④护士条件不满足(生命上限 100)不来
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_BY_KEY, T } = await import('/src/data/tiles.ts');
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const res = {};
  const list = () => g.entities.npcs.map((n) => ({ key: n.npcKey, home: n.home ? [n.home.x, n.home.y] : null }));

  // ① 初始：只有向导且无家
  res.initial = list();

  // ② 50 银入包 + 直接入驻轮：无房 → 商人不来
  g.player.inv.add(ITEM_BY_KEY['coin_silver'], 50);
  g.updateTownNpcArrival();
  res.afterCoinsNoHouse = list();

  // ③ 造两间房（12×6 内部，木墙 93，木壳，门+火把+桌+椅）
  const st = g.world.store;
  const DOOR = T.DOOR_CLOSED, TORCH = T.TORCH, WOOD = T.WOOD;
  const TABLE = TILE_BY_KEY['table'], CHAIR = TILE_BY_KEY['chair'];
  const buildHouse = (x0, yTop) => {
    for (let x = x0; x < x0 + 12; x++) {
      for (let y = yTop; y < yTop + 6; y++) {
        const i = st.idx(x, y);
        st.setTileSilent(x, y, 0);
        st.wall[i] = 93;
        st.liquid[i] = 0;
      }
    }
    for (let x = x0 - 1; x <= x0 + 12; x++) { st.setTileSilent(x, yTop - 1, WOOD); st.setTileSilent(x, yTop + 6, WOOD); }
    for (let y = yTop; y <= yTop + 5; y++) { st.setTileSilent(x0 - 1, y, WOOD); st.setTileSilent(x0 + 12, y, WOOD); }
    for (let dy = 0; dy < 3; dy++) st.setTileSilent(x0 + 12, yTop + 2 + dy, DOOR);
    st.setTileSilent(x0 + 2, yTop + 5, TORCH);
    st.setTileSilent(x0 + 4, yTop + 5, TABLE);
    st.setTileSilent(x0 + 6, yTop + 5, CHAIR);
  };
  const sy = g.world.spawnY;
  buildHouse(g.world.spawnX + 20, sy - 10);
  buildHouse(g.world.spawnX + 40, sy - 10);
  // 房屋判定单测：两间房都应有效
  const { checkRoom } = await import('/src/world/Housing.ts');
  res.room1 = !!checkRoom(st, g.world.spawnX + 20 + 12, sy - 10 + 2);
  res.room2 = !!checkRoom(st, g.world.spawnX + 40 + 12, sy - 10 + 2);

  // 入驻轮①：向导入住第一间房
  g.updateTownNpcArrival();
  res.afterGuideHomed = list();
  // 入驻轮②：商人入住第二间房
  g.updateTownNpcArrival();
  res.afterMerchant = list();
  // 入驻轮③：护士不应来（生命上限 100 → statLifeMax/20=5 不 >5）
  g.updateTownNpcArrival();
  res.afterThird = list();
  return res;
});
console.log(JSON.stringify(out));
await b.close();
