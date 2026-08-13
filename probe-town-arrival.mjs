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
  const { VI_KEY } = await import('/src/data/itemKeys.ts');
  const res = {};
  const list = () => g.entities.npcs.map((n) => ({ key: n.npcKey, home: n.home ? [n.home.x, n.home.y] : null }));

  // ① 初始：只有向导且无家
  res.initial = list();

  // ② 50 银入包 + 直接入驻轮：无房 → 商人不来
  g.player.inv.add(ITEM_BY_KEY[VI_KEY.COIN.SILVER], 50);
  g.updateTownNpcArrival();
  res.afterCoinsNoHouse = list();

  // ③ 造两间房（12×6 内部，木墙 93，木壳，门+火把+桌+椅）。
  // 2026-08-13 锚点窗对齐（QuickFindHome WorldGen.cs:5665-5727）：入驻锚点 =
  // 已安家 NPC 的 home 随机取一（冷启回退出生点），findFreeHouse 只搜锚点 ±10 窗——
  // 房必须构造在"锚点链"逐跳 ±10 内，不能再按全图扫描假设任意远放房
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
    return { doorX: x0 + 12, doorY: yTop + 2 };
  };
  const { checkRoom, findFreeHouse } = await import('/src/world/Housing.ts');
  // 第一间：门锚落在出生点 ±10 窗内（冷启锚点 = 出生点）→ 向导可发现
  const sy = g.world.spawnY;
  const r1 = buildHouse(g.world.spawnX - 6, sy - 10);
  res.room1 = !!checkRoom(st, r1.doorX, r1.doorY);
  // DEBUG
  const _d = findFreeHouse(st, [], g.world.spawnX, g.world.spawnY, 22);
  res.debug = { spawn: [g.world.spawnX, g.world.spawnY], door1: [r1.doorX, r1.doorY],
    room1raw: checkRoom(st, r1.doorX, r1.doorY), ffh: _d && { x: _d.standX, y: _d.standY } };

  // 入驻轮①：向导入住第一间房
  g.updateTownNpcArrival();
  res.afterGuideHomed = list();
  // 第二间：门锚挂在向导 home ±10 窗内（下一轮锚点 = 已安家 home 随机取一）
  const gh = res.afterGuideHomed.find((n) => n.key === 'guide');
  if (!gh || !gh.home) return res;   // 向导未入住：输出 debug/room1/afterGuideHomed 排查
  const r2 = buildHouse(gh.home[0] - 22, gh.home[1] - 12);
  res.room2 = !!checkRoom(st, r2.doorX, r2.doorY);
  res.guideHome = gh.home;

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
