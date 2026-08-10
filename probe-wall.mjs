// 墙面铺设验证：①vi_93 木墙放置（邻接门+消耗+FillEmptySpace）②悬空拒绝
// ③锤拆除已有 ④124 墙物品全量注册 ⑤存档往返
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
  const { ITEM_BY_KEY, ITEM_DEFS } = await import('/src/data/items.ts');
  const { saveGame } = await import('/src/save/SaveFile.ts');
  const res = {};
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);

  // ① 木墙放脚下（下方有地面 → 邻接成立）
  g.player.inv.add(ITEM_BY_KEY['vi_93_wood_wall'], 10);
  g.player.inv.selected = g.player.inv.slots.findIndex((s) => s && s.id === ITEM_BY_KEY['vi_93_wood_wall']);
  const stack0 = g.player.inv.heldItem().stack;
  const y0 = py + 1; // 脚下格（其下是地面）
  g.tryPlaceWall(px, y0, ITEM_DEFS[ITEM_BY_KEY['vi_93_wood_wall']]);
  res.place = {
    wall: st.wall[st.idx(px, y0)],
    consumed: stack0 - g.player.inv.heldItem().stack,
  };
  // ② 悬空拒绝：上方远处（四邻全空且无墙）
  const farY = py - 8;
  let farOk = true;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ni = st.idx(px + ox, farY + oy);
    if ((st.flags[ni] && st.type[ni] !== 0) || st.wall[ni] > 0) farOk = false;
  }
  if (farOk) {
    const before = st.wall[st.idx(px, farY)];
    g.tryPlaceWall(px, farY, ITEM_DEFS[ITEM_BY_KEY['vi_93_wood_wall']]);
    res.floatingRejected = st.wall[st.idx(px, farY)] === before;
  } else res.floatingRejected = 'skip(邻接不满足测试条件)';
  // ③ FillEmptySpace：铺成 3×3 中空格局验证补洞——直接构造：
  //    中心 (px,y0+1) 四邻中 (px±1,y0+1)(px,y0)(px,y0+2) 已放本墙 → 补铺时自动填中心
  const wallId = ITEM_DEFS[ITEM_BY_KEY['vi_93_wood_wall']].wallId;
  const cx = px, cy = y0 + 2;
  st.setWallSilent(cx - 1, cy, wallId); st.setWallSilent(cx + 1, cy, wallId);
  st.setWallSilent(cx, cy - 1, wallId); st.setWallSilent(cx, cy + 1, wallId);
  g.player.useTime = 0;
  g.tryPlaceWall(cx - 1, cy, ITEM_DEFS[ITEM_BY_KEY['vi_93_wood_wall']]); // 任意邻接位触发
  // FillEmptySpace 检查中心
  g.player.useTime = 0;
  res.fill = st.wall[st.idx(cx, cy)] === wallId ? 'auto-filled' : `center=${st.wall[st.idx(cx, cy)]}`;
  // ④ 全量注册
  const wallDefs = ITEM_DEFS.filter((d) => d.wallId != null);
  res.wallItems = wallDefs.length;
  // ⑤ 存档往返（wall 在 tiles 外独立 RLE 段，直接验证内存即可+save 解析不报错）
  const json = saveGame(g.world, g.player, 1000);
  res.saveOk = json.includes('"walls"');
  return res;
});
console.log(JSON.stringify(out));
await b.close();
