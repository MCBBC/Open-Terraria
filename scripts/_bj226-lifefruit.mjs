// ★BJ226 实机探针（2026-09-21）——用户实报两症状定谳：
//   ①武器攻击可割碎生命果并掉落 = 原版同相（tileCut[236]=true, Main.cs:10388;1456:10158/1458:10388）
//   ②挖碎后 tile 残留无限复掉 = 本仓断环（breakTileBody 236/238 特支锚漏 mod2）——修后实证：
//     镐面/弹割面 → 掉 1 件 1291 + 2×2 全清 + 复挖零掉落（残留=0）。
// 运行：SW_PORT=5202 起私有静默实例后 SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj226-lifefruit.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const tiles = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const FRUIT = tiles.TILE_BY_KEY['v_236_life_fruit_plant'];
  const BULB = tiles.TILE_BY_KEY['v_238_plantera_s_bulb'];
  const GRASS = tiles.TILE_DEFS.findIndex((d) => d && d.vanilla && d.vanilla.sheet === 60);
  if (!(FRUIT > 0) || !(BULB > 0) || !(GRASS > 0)) return { fail: 'tile-ids' };

  // 掉落捕获（实例覆写,不改原型）
  const drops = [];
  const origDrop = g.spawnDrop.bind(g);
  g.spawnDrop = (x, y, key, n) => { drops.push(key); return origDrop(x, y, key, n); };

  // 试炼场：玩家旁清矩形 + 丛林草地坪（Altar-smash 习语）
  const px = Math.floor(g.player.cx / 16);
  const py = Math.floor(g.world.groundLevel) + 8;
  for (let dy = -14; dy <= 2; dy++) for (let dx = -20; dx <= 40; dx++) {
    st.setTile(px + dx, py + dy, 0);
    st.liquid[st.idx(px + dx, py + dy)] = 0;
  }
  for (let dx = -20; dx <= 40; dx++) st.setTileSilent(px + dx, py + 1, GRASS, 0, 0);

  const place2x2 = (t, ax, ay, styleX) => {
    const fx0 = 36 * styleX;
    st.setTileSilent(ax, ay, t, fx0, 0);
    st.setTileSilent(ax + 1, ay, t, fx0 + 18, 0);
    st.setTileSilent(ax, ay + 1, t, fx0, 18);
    st.setTileSilent(ax + 1, ay + 1, t, fx0 + 18, 18);
  };
  const fruitLeft = (ax, ay) => {
    let n = 0;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) if (st.get(ax + dx, ay + dy) === FRUIT) n++;
    return n;
  };
  const bulbLeft = (ax, ay) => {
    let n = 0;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) if (st.get(ax + dx, ay + dy) === BULB) n++;
    return n;
  };

  const R = {};
  // ① 症状②主断环：镐面挖 styleX=1 果（frameX 36/54——旧锚左漂档）→ 掉 1 + 全清
  {
    const ax = px + 2, ay = py - 2;
    place2x2(FRUIT, ax, ay, 1);
    drops.length = 0;
    g.breakTile(ax + 1, ay + 1, true, false, true);
    R.pickStyle1 = { drops: drops.slice(), left: fruitLeft(ax, ay) };
    // 复挖四格（无限刷断根）
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) g.breakTile(ax + dx, ay + dy, true, false, true);
    R.repickDrops = drops.length;
  }
  // ② styleX=2 档（frameX 72/90）
  {
    const ax = px + 6, ay = py - 2;
    place2x2(FRUIT, ax, ay, 2);
    drops.length = 0;
    g.breakTile(ax, ay, true, false, true);
    R.pickStyle2 = { drops: drops.slice(), left: fruitLeft(ax, ay) };
  }
  // ③ 弹割面（DelegateMethods.CutTiles 同相收口）割 styleX=1 果 → 掉 1 + 全清（症状①原版同相实证）
  {
    const ax = px + 10, ay = py - 2;
    place2x2(FRUIT, ax, ay, 1);
    drops.length = 0;
    g.cutTile(ax + 1, ay);
    R.cutFace = { drops: drops.slice(), left: fruitLeft(ax, ay) };
  }
  // ④ 同族对照：弹割面割花苞 238 → 不割不碎不掉（tileCut 表外）
  {
    const ax = px + 14, ay = py - 2;
    place2x2(BULB, ax, ay, 0);
    drops.length = 0;
    g.cutTile(ax, ay);
    g.cutTile(ax + 1, ay + 1);
    R.bulbCutFace = { drops: drops.slice(), left: bulbLeft(ax, ay) };
  }
  // ⑤ styleX=0 果（回归档:修前后同相）镐面
  {
    const ax = px + 18, ay = py - 2;
    place2x2(FRUIT, ax, ay, 0);
    drops.length = 0;
    g.breakTile(ax, ay, true, false, true);
    R.pickStyle0 = { drops: drops.slice(), left: fruitLeft(ax, ay) };
  }
  return R;
});

console.log('[probe] result', JSON.stringify(out, null, 1));
console.log('[probe] pageerrors', errs.length ? errs.slice(0, 3) : 'none');
const ok = out && !out.fail
  && out.pickStyle1 && out.pickStyle1.drops.join() === 'vi_1291_life_fruit' && out.pickStyle1.left === 0
  && out.repickDrops === 1
  && out.pickStyle2 && out.pickStyle2.drops.join() === 'vi_1291_life_fruit' && out.pickStyle2.left === 0
  && out.cutFace && out.cutFace.drops.join() === 'vi_1291_life_fruit' && out.cutFace.left === 0
  && out.bulbCutFace && out.bulbCutFace.drops.length === 0 && out.bulbCutFace.left === 4
  && out.pickStyle0 && out.pickStyle0.drops.join() === 'vi_1291_life_fruit' && out.pickStyle0.left === 0
  && errs.length === 0;
console.log(ok ? '[probe] PASS' : '[probe] FAIL');
await browser.close().catch(() => {});
process.exit(ok ? 0 : 1);
