// 微光湖分解链端到端探针（_ 一次性，tools/run-diag.mjs 运行）：
//   按对齐后的抛出公式（4×朝向+玩家速度 / vy=-2）把 1 把木剑(vid 24,配方=木材×7
//   →createStack 1)抛进自建微光湖 → 断言：
//   ① 木剑入湖浸没(shimmerTime 爬升) ② ~90t 触发 GetShimmered 走 decraft
//   ③ 木材×7 shimmered 上浮出现在湖面 ④ 玩家站到湖边后自动拾取入包
//   附加：金币(vid 73)入湖 → coinLuck 累加、币消散（分支序钱币最前的回归）。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5199'}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  // id→key 反查（__swItems 是 key→id）
  g.__itemKeyOf = (id) => {
    if (!g.__rev) g.__rev = Object.fromEntries(Object.entries(window.__swItems).map(([k, v]) => [v, k]));
    return g.__rev[id];
  };
  const st = g.world.store;
  const T = 16;
  const S = Math.floor(g.world.groundLevel) + 40;          // 湖面基准行
  const X0 = Math.floor(g.player.cx / T) + 6;              // 玩家右侧开湖
  // ---- 自建微光湖：X0..X0+39 列；S-2..S 挖空（投掷弧通道）+ S+1..S+3 满液(type 4)。
  //      ★S+4..S+5 铺实心底 + 两侧壁封死——地下 40 格常挨天然洞穴,不封底会被
  //      LiquidSim 全部漏干（探针实测：120t 液面 255→漏空）----
  const stone = st.type[st.idx(X0, S + 10)] || 1;
  for (let x = X0 - 1; x <= X0 + 40; x++) {
    st.setTile(x, S + 4, stone); st.setTile(x, S + 5, stone);
    const fl = st.idx(x, S + 4); st.liquid[fl] = 0; st.liquidType[fl] = 0;
    if (x === X0 - 1 || x === X0 + 40) {
      for (let y = S + 1; y <= S + 3; y++) { st.setTile(x, y, stone); st.liquid[st.idx(x, y)] = 0; st.liquidType[st.idx(x, y)] = 0; }
    }
  }
  for (let x = X0; x <= X0 + 39; x++) {
    for (let y = S - 2; y <= S; y++) {
      const i = st.idx(x, y);
      st.setTile(x, y, 0);
      st.liquid[i] = 0; st.liquidType[i] = 0;
    }
    for (let y = S + 1; y <= S + 3; y++) {
      const i = st.idx(x, y);
      st.setTile(x, y, 0);
      st.liquid[i] = 255; st.liquidType[i] = 4;
    }
  }
  // 玩家站湖左岸（与湖隔 1 列,防 shimmerWet 误染）,清空水平速度
  g.player.x = (X0 - 2) * T; g.player.y = (S - 3) * T;
  g.player.vx = 0; g.player.vy = 0; g.player.facing = 1;
  // ---- 抛出：对齐公式（DropSelectedItem Player.cs:4993-4997）----
  // 清掉世界残留掉落物（排除 place_v_ 干扰）；vid 36 木墙无转化、decraft = 木材×30。
  // 速度断言后把掉落物**直放湖心**（S+1 行）——抛物落点随弧线/弹跳随机，回归探针
  // 需确定性浸泡起点（抛物入湖的物理链此前多轮已实证）
  g.entities.drops.length = 0;
  const itemKey = Object.keys(window.__swItems).find((k) => /^vi_24_/.test(k));
  const drop = g.spawnDrop(g.player.cx + g.player.facing * 18, g.player.y + 6, itemKey, 1,    g.player.facing * 4 + g.player.vx, -2);
  const tossVx = drop.vx, tossVy = drop.vy;   // 移位前取值（抛速断言用）
  drop.x = (X0 + 8) * T; drop.y = (S + 1) * T; drop.vx = 0; drop.vy = 0;
  return {
    tossVx, tossVy, itemKey, X0, S,
    liquidOk: st.liquidType[st.idx(X0 + 5, S + 2)] === 4,
  };
});
check('微光湖注入（type=4 满液）', out.liquidOk);
check('抛出速度 = 4×朝向+玩家速度 / vy=-2', out.tossVx === 4 && out.tossVy === -2, `vx=${out.tossVx} vy=${out.tossVy}`);

// ---- 阶段①②：玩家挪远防自拾 → 入湖浸没 + 转化（~120t）----
const dec = await page.evaluate((X0) => {
  const g = window.__swGame;
  g.__itemKeyOf = (id) => {
    if (!g.__rev) g.__rev = Object.fromEntries(Object.entries(window.__swItems).map(([k, v]) => [v, k]));
    return g.__rev[id];
  };
  const st = g.world.store;
  const T = 16;
  const S = Math.floor(g.world.groundLevel) + 40;
  const item0 = g.entities.drops.find((d) => !d.dead);
  let maxShimmer = 0;
  // 玩家钉在湖左 9 格（>拾取范围 2.6 格防自拾,<模拟冻结距离）——地面挖空后悬空钉位
  for (let x = X0 - 10; x < X0; x++) for (let y = S - 2; y <= S + 3; y++) {
    const i = st.idx(x, y); st.setTile(x, y, 0); st.liquid[i] = 0; st.liquidType[i] = 0;
  }
  for (let i = 0; i < 200; i++) {
    g.player.x = (X0 - 9) * T; g.player.y = (S - 3) * T;
    g.player.vx = 0; g.player.vy = 0;
    g.fixedUpdate(1 / 60);
    if (item0 && !item0.dead) maxShimmer = Math.max(maxShimmer, item0.shimmerTime);
  }
  const drops = g.entities.drops.filter((d) => !d.dead);
  const wood = drops.find((d) => (g.__itemKeyOf(d.itemId) ?? '').startsWith('vi_9_'));
  return {
    maxShimmer: +maxShimmer.toFixed(2),
    itemAlive: drops.some((d) => (g.__itemKeyOf(d.itemId) ?? '').startsWith('vi_24_')),
    matDrops: drops.filter((d) => d.shimmered === true).length,
    woodStack: wood ? wood.stack : 0,
    matKeys: drops.map((d) => g.__itemKeyOf(d.itemId)),
    total: drops.length,
  };
}, out.X0);
check('木剑入湖浸没（shimmerTime 爬升 >0.5）', dec.maxShimmer > 0.5, `maxShimmer=${dec.maxShimmer}`);
check('木剑已分解转化（原垛消失）', dec.itemAlive === false, `itemAlive=${dec.itemAlive}`);
check('分解产物上浮（木材×7 shimmered）', dec.matDrops >= 1 && dec.woodStack === 7,
  `shimmered=${dec.matDrops} wood=${dec.woodStack} drops=[${dec.matKeys.join(',')}]`);

// ---- 阶段③④：玩家走到湖边 → 产物浮出减速 → 自动拾取入包 ----
const pick = await page.evaluate((X0) => {
  const g = window.__swGame;
  g.__itemKeyOf = (id) => {
    if (!g.__rev) g.__rev = Object.fromEntries(Object.entries(window.__swItems).map(([k, v]) => [v, k]));
    return g.__rev[id];
  };
  const T = 16;
  // 玩家钉在产物列旁（首次定位后【固定】——跟随重钉会让间隙恒定永不相触）
  let picked = false;
  let standX = null;
  for (let i = 0; i < 600 && !picked; i++) {
    if (standX === null) {
      const wood0 = g.entities.drops.find((d) => !d.dead && /^vi_9_/.test(g.__itemKeyOf(d.itemId) ?? ''));
      if (wood0) standX = wood0.x - 24;
    }
    g.player.x = standX ?? (X0 + 5) * T;
    g.player.y = (Math.floor(g.world.groundLevel) + 37) * T;
    g.player.vx = 0; g.player.vy = 0;
    g.fixedUpdate(1 / 60);
    picked = g.player.inv.slots.some((s) => {
      if (!s) return false;
      const k = g.__itemKeyOf?.(s.id);
      return k && /^vi_9_/.test(k);
    });
  }
  const invKeys = g.player.inv.slots.filter(Boolean).map((s) => g.__itemKeyOf?.(s.id)).filter(Boolean);
  return {
    picked,
    hasWood: invKeys.some((k) => /^vi_9_/.test(k)),
    invKeys,
  };
}, out.X0);
check('分解产物（木材）自动拾取入包', pick.picked && pick.hasWood,
  `picked=${pick.picked} wood=${pick.hasWood} inv=[${pick.invKeys.join(',')}]`);

// ---- 附加：金币(73)入湖 → coinLuck（分支序钱币最前,decraft 抢不走）----
const coin = await page.evaluate((X0) => {
  const g = window.__swGame;
  const T = 16;
  const S = Math.floor(g.world.groundLevel) + 40;
  const coinKey = Object.keys(window.__swItems).find((k) => /^vi_73_/.test(k));
  const luck0 = g.player.luckState.coinLuck;
  const d = g.spawnDrop((X0 + 20) * T, (S + 1) * T, coinKey, 1, 0, 0);
  // 玩家钉币列 6 格外（>42px 拾取范围防币被直接捡走、<模拟冻结距离）；300t 余量
  for (let i = 0; i < 300 && !d.dead; i++) {
    g.player.x = (X0 + 14) * T; g.player.y = (S - 3) * T;
    g.player.vx = 0; g.player.vy = 0;
    g.fixedUpdate(1 / 60);
  }
  return { dead: d.dead, luck: g.player.luckState.coinLuck, luck0 };
}, out.X0);
check('金币入湖 → coinLuck 累加 + 币消散', coin.dead && coin.luck > coin.luck0,
  `dead=${coin.dead} luck=${coin.luck0}→${coin.luck}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
