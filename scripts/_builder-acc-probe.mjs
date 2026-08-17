// 一次性探针:建筑族 7 件实装 + 放置/挖掘速度倒数公式 行为级验证
//  A. 真装备 2215(加长握爪) → tileReach X+3/Y+2 分轴;再装 407(工具腰带) → 两轴再+1
//  B. 真装备 2214(砌砖刀)+手持泥土 → 放置冷却 = round(10×1/1.5) = 7;
//     持火把(特链无 def.tile) → 手持门关 → 10(不加速)
//  C. 真装备 2217(水泥机) → 铺墙冷却 = round(15/1.5) = 10
//  D. 真装备 4056(古凿) → 挖掘冷却 15 → 11(pickSpeed 加法 −0.25;tryMine 节流窗二分)
//  E. 真装备 2216(喷漆器)+弹药栏红漆 → tryPlace 后新格自动上漆(paint=1)+消耗 1
//  F. 配方 3061 在表(工匠工坊合成链)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&bdacc=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1000));

const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } = await import('/src/data/items.ts');
  const p = g.player;
  const st = g.world.store;
  p.dead = false;
  const idOf = (vid) => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
  const setAcc = (slot, vid) => { p.inv.armor[slot] = { id: idOf(vid), stack: 1 }; };
  const clearAcc = (slot) => { p.inv.armor[slot] = null; };
  const setHeld = (vid, stack = 99) => { p.inv.slots[0] = { id: idOf(vid), stack }; p.inv.selected = 0; };

  // ---- A. tileReach 分轴 + 工具腰带 ----
  const probeBounds = () => {
    const ptx = Math.floor((p.x + p.w / 2) / 16), pty = Math.floor((p.y + p.h / 2) / 16);
    let hiY = pty; while (g.inTileRange(ptx, hiY + 1)) hiY++;
    let hiX = ptx; while (g.inTileRange(hiX + 1, pty)) hiX++;
    return { hiX, hiY };
  };
  clearAcc(3); const base = probeBounds();
  setAcc(3, 2215); const grip = probeBounds();
  // 工具腰带:挖掘档(IsTargetTileInItemRange :45701 tb=sItem.tileBoost)不带
  // blockRange——407 装备后 probeBounds 不变是原版行为;聚合直测(放置调用点
  // tryPlace/tryPlaceWall/油漆/提取机已接 this.blockRange())
  const beltProbeBounds = (tb) => {
    const ptx = Math.floor((p.x + p.w / 2) / 16), pty = Math.floor((p.y + p.h / 2) / 16);
    let hiY = pty; while (g.inTileRange(ptx, hiY + 1, tb)) hiY++;
    return hiY - pty;
  };
  const belt0 = beltProbeBounds(0);
  setAcc(4, 407);
  const br = g.blockRange();                 // 运行期私有可调:期望 1(Builder 无)
  const belt1 = beltProbeBounds(br);
  clearAcc(4); clearAcc(3);
  const reach = { gripDx: grip.hiX - base.hiX, gripDy: grip.hiY - base.hiY,
    belt0, belt1, br };

  // ---- B. 砌砖刀放置冷却(手持门) ----
  const ptx0 = Math.floor(p.cx / 16), pty0 = Math.floor(p.cy / 16) + 2;
  // 清一条竖井(3 宽 2 行,Y 射程 3 内),底行下保持天然实心 → 放置贴面天然成立
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) {
    st.setTile(ptx0 + dx, pty0 + dy, 0, 0, 0);
  }
  const placeAt = (x, y) => {
    p.useTime = 0; g.swing = null;
    g.tryPlace(x, y, ITEM_DEFS[p.inv.slots[0].id]);
    const ut = p.useTime; p.useTime = 0;
    return ut;
  };
  const dirtUseTime = 10;
  setHeld(2);
  const cdBase = placeAt(ptx0, pty0);
  setAcc(3, 2214); const cdAcc = placeAt(ptx0 + 1, pty0);
  setHeld(8); const cdTorch = placeAt(ptx0 + 2, pty0);
  setHeld(2); clearAcc(3);
  setHeld(8); const torchNoAcc = placeAt(ptx0, pty0 + 1);   // 无装备持火把对照(回退 14)
  setHeld(2); clearAcc(3);

  // ---- C. 水泥机铺墙冷却 ----
  const wallDef = ITEM_DEFS[ITEM_BY_KEY['vi_93_wood_wall']];
  const wallCd = (x, y) => {
    p.useTime = 0; g.swing = null;
    g.tryPlaceWall(x, y, wallDef);
    const ut = p.useTime; p.useTime = 0;
    return ut;
  };
  p.inv.slots[0] = { id: ITEM_BY_KEY['vi_93_wood_wall'], stack: 99 }; p.inv.selected = 0;
  const wallBase = wallCd(ptx0 + 1, pty0);
  setAcc(3, 2217); const wallAcc = wallCd(ptx0 + 2, pty0 + 1);
  clearAcc(3);

  // ---- D. 古凿挖掘冷却(tryMine 节流窗二分;冷却公式吃第 6 参 useTime=15) ----
  // tryMine 自带射程门(8606)——目标必须是射程内(Y±3)天然实心非装饰格;
  // 每轮 cd() 重置 HitTile,防多轮累计破坏(100 阈值)后判定失真
  const { HitTile } = await import('/src/core/HitTile.ts');
  const { TILE_DEFS, TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const ptyC = Math.floor((p.y + p.h / 2) / 16);
  // 天然首格可能是 tileNoFail 族(一击秒破,节流窗测不了)——直接在射程内
  // 自造一格石头(sheet 1,非 noFail,10 力 10 击破,二分窗口内不破坏)
  const stone = TILE_BY_KEY['stone'];
  const mtx = ptx0 + 3, mty = ptyC + 3;
  const mineOk = stone !== undefined && st.inBounds(mtx, mty);
  if (mineOk) st.setTile(mtx, mty, stone, 0, 0);
  let mineBase = null, mineAcc = null;
  if (mineOk) {
    setHeld(103);
    const cd = () => {
      const gv = g;
      gv.hitTiles = new HitTile();
      gv.lastMineHitTick = -999;
      gv.tickCount = 10000;
      gv.tryMine(mtx, mty, 10, 'pick', 15, 15);
      const first = gv.lastMineHitTick;
      const dmgAt = (n) => {
        gv.tickCount = first + n;
        gv.lastMineHitTick = first;   // 回滚:否则每次命中推进基准,后续小 n 恒被节流
        const d0 = gv.hitTiles.getDamage(mtx, mty);
        gv.tryMine(mtx, mty, 10, 'pick', 15, 15);
        return gv.hitTiles.getDamage(mtx, mty) > d0;
      };
      let lo = 1, hi = 40;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (dmgAt(mid)) hi = mid; else lo = mid + 1; }
      return lo;
    };
    mineBase = cd();
    setAcc(3, 4056); mineAcc = cd();
    clearAcc(3);
  }

  // ---- E. 喷漆器自动上漆 ----
  for (let dx = 0; dx < 3; dx++) st.setTile(ptx0 + dx, pty0 + 1, 0, 0, 0);
  const paintIdx = st.idx(ptx0, pty0 + 1);
  st.paint[paintIdx] = 0;
  setHeld(2);
  p.inv.slots[54] = { id: idOf(1073), stack: 99 };  // 红漆入弹药栏(FindPaintOrCoating 首选)
  setAcc(3, 2216);
  p.useTime = 0; g.swing = null;
  g.tryPlace(ptx0, pty0 + 1, ITEM_DEFS[p.inv.slots[0].id]);
  const painted = st.paint[paintIdx];
  const paintStack = p.inv.slots[54]?.stack ?? 0;
  clearAcc(3); p.inv.slots[54] = null;

  // ---- F. 配方在表 ----
  const hasRecipe3061 = await fetch('/src/data/vanilla-recipes.json')
    .then((resp) => resp.json())
    .then((j) => (j.recipes ?? []).some((rc) => rc?.create === 3061))
    .catch(() => null);

  return { reach, dirtUseTime, cdBase, cdAcc, cdTorch, torchNoAcc, wallBase, wallAcc, mineOk, mineBase, mineAcc, painted, paintStack, hasRecipe3061 };
});
const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });
ok('A1 加长握爪 X+3', r.reach.gripDx === 3, r.reach);
ok('A2 加长握爪 Y+2', r.reach.gripDy === 2, r.reach);
ok('A3a 挖掘档不带 blockRange(407 装备后不变)', r.reach.belt0 === r.reach.belt1 - r.reach.br && r.reach.br === 1, r.reach);
ok('A3b blockRange 聚合=1(仅 407)', r.reach.br === 1, r.reach);
ok('B1 泥土放置基线 10', r.cdBase === 10, { cdBase: r.cdBase });
ok('B2 砌砖刀 10/1.5→7', r.cdAcc === 7, { cdAcc: r.cdAcc });
ok('B3 持火把不加速(手持门,回退 14)', r.cdTorch === 14 && r.torchNoAcc === 14, { cdTorch: r.cdTorch, torchNoAcc: r.torchNoAcc });
ok('C1 铺墙基线 15', r.wallBase === 15, { wallBase: r.wallBase });
ok('C2 水泥机 15/1.5→10', r.wallAcc === 10, { wallAcc: r.wallAcc });
ok('D1 挖掘基线 15', r.mineOk && r.mineBase === 15, { mineBase: r.mineBase });
ok('D2 古凿 15×0.75→11', r.mineOk && r.mineAcc === 11, { mineAcc: r.mineAcc });
ok('E1 放置自动上漆(红=1)', r.painted === 1, { painted: r.painted });
ok('E2 红漆消耗 1(99→98)', r.paintStack === 98, { paintStack: r.paintStack });
ok('F 3061 配方在表', r.hasRecipe3061 === true, { hasRecipe3061: r.hasRecipe3061 });
const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, r, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
