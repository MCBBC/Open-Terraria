// ★BJ457 蜂蜜里跑动出绿色叶状尘——实机探针定谳（判别 A 原版同相 / B 本仓过度触发 / C 尘源错）。
//   原版事实链（先验）:
//     · Collision.HitTiles（Collision.cs:3076）全调用面 grep=仅 Projectile.cs（Player.cs/NPC.cs 零调用）
//       → 原版玩家跑动/落地/游泳蹭墙【不】触发 KillTile(fail:true,effectOnly:true) 尘。
//     · 原版玩家液体移动粒子=仅出入液溅花（水 50×dustWater/蜜 20×152/岩浆 20×35,翻转拍一次性）
//       + 水中呼吸气泡 dust 34（:23469 门 lavaWet||honeyWet——蜂蜜里不出气泡）。
//     · 尘形态: tile 2 草块打碎尘=50% 掷 dust 2(Grass 绿叶)/dust 0(Dirt 棕)（WorldGen.cs:68885）,
//       tile 3/73 草丛=dust 3(GrassBlades 绿叶)（:69125）, tile 225 蜂蜜块=dust 147(蜂蜜滴)（:69217）。
//       GetTileDustAmount default: fail 档 3 粒/破坏档 10 粒。
//   本仓实验矩阵（vanillaDust.spawn wrap 全量记录 type/x/y）:
//     A 蜂蜜池内跑动（封闭池,按 A/D 折返蹭壁——用户场景）
//     B 干地草块+草丛上跑动（对照）
//     C 木平台上跑动（对照）
//     D 蜂蜜里静止站立（对照）
//     E 参照: g.mowCutTiles 割草丛（期望 dust 3 绿叶——割草面真值形态）
//     F 参照: g.hitTilesFx 打草块（期望 dust 2/0 混合——弹幕碰撞面真值形态）
//   判别: A/B/C/D 全零尘 → 玩家移动面同原版（结论 A 倾向,尘源=用户武器/弹幕面,补 G 场景复现）;
//         任一实验出草族尘（type 0/2/3）→ 本仓过度触发（结论 B/C,再按 type/坐标定挂接位）。
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj457-honey-grass-dust.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small',
  { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1500));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 800));

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// ---- 尘记录 wrap（全收敛口 vanillaDust.spawn;只记跑动场地附近 480..560 tile 段) ----
await page.evaluate(() => {
  const g = window.__swGame;
  const FIELD = { x0: 480, x1: 560, y0: 0, y1: 400 };   // tile 域（场地 x 490..550）
  g.__bj457 = { log: [], field: FIELD };
  if (!g.__bj457wrap) {
    const orig = g.vanillaDust.spawn.bind(g.vanillaDust);
    g.vanillaDust.spawn = function (x, y, w, h, type, sx, sy, alpha, color, scale) {
      const tx = x / 16, ty = y / 16;
      if (tx >= FIELD.x0 && tx <= FIELD.x1 && ty >= FIELD.y0 && ty <= FIELD.y1) {
        g.__bj457.log.push({ type, x: Math.round(tx * 10) / 10, y: Math.round(ty * 10) / 10,
          stack: (type === 40 || type === 0) ? (new Error().stack || '').split('\n').slice(1, 7).map((s) => s.trim().replace(/^at /, '').split(' (')[0]) : null });
      }
      return orig(x, y, w, h, type, sx, sy, alpha, color, scale);
    };
    g.__bj457wrap = true;
  }
});
const clearLog = () => page.evaluate(() => { window.__swGame.__bj457.log.length = 0; });
const readLog = () => page.evaluate(() => {
  const log = window.__swGame.__bj457.log.slice();
  window.__swGame.__bj457.log.length = 0;
  const hist = {};
  for (const d of log) hist[d.type] = (hist[d.type] || 0) + 1;
  const stacks = {};
  for (const d of log) {
    if (d.stack) {
      const k = `type=${d.type} @` + d.stack.filter((s) => /src\//.test(s)).join(' <- ');
      stacks[k] = (stacks[k] || 0) + 1;
    }
  }
  return { total: log.length, hist, stacks, sample: log.slice(0, 8) };
});

// ---- 场地布景:清空→三个实验场（蜂蜜池/草地+草丛/木平台）----
// ★内部 tile id ≠ vanilla sheet——布景一律 TILE_DEFS 查表换算（entities.mjs tileIdBySheet 同源谓词）
await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store, p = g.player;
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const idBySheet = (sheet) => {
    const id = (TILE_DEFS ?? []).findIndex((d) => d?.vanilla?.sheet === sheet);
    if (id < 0) throw new Error('no-sheet:' + sheet);
    return id;
  };
  const T_DIRT = idBySheet(0), T_STONE = idBySheet(1), T_GRASS = idBySheet(2),
    T_TALLGRASS = idBySheet(3), T_PLATFORM = idBySheet(19), T_HONEYBLOCK = idBySheet(225);
  g.__bj457.ids = { T_DIRT, T_STONE, T_GRASS, T_TALLGRASS, T_PLATFORM, T_HONEYBLOCK };
  // 找一块平静地表锚（x=520 列向下第一个实心）
  let gy = 8; for (; gy < 400 && !st.isSolid(520, gy); gy++) {}
  g.__bj457.gy = gy;
  // 大清场（x 486..554, gy-10..gy+4）
  for (let x = 486; x <= 554; x++) for (let y = gy - 10; y <= gy + 4; y++) {
    st.setTileSilent(x, y, 0); st.setLiquid(x, y, 0, 0);
  }
  // 底板整段:土（gy..gy+3）+ 表面按场分段
  for (let x = 488; x <= 552; x++) for (let y = gy; y <= gy + 3; y++) st.setTileSilent(x, y, T_DIRT);
  // 场1 蜂蜜池:x 490..511（池内 491..510,壁 490/511 石）,池底=蜂蜜块,池深 gy-5..gy-1 填蜜
  for (let y = gy - 5; y <= gy; y++) { st.setTileSilent(490, y, T_STONE); st.setTileSilent(511, y, T_STONE); }
  for (let y = gy - 5; y <= gy + 3; y++) { st.setTileSilent(488, y, T_STONE); st.setTileSilent(489, y, T_STONE); st.setTileSilent(512, y, T_STONE); st.setTileSilent(513, y, T_STONE); }
  for (let x = 491; x <= 510; x++) { st.setTileSilent(x, gy, T_HONEYBLOCK); for (let y = gy - 5; y <= gy - 1; y++) st.setLiquid(x, y, 255, 3); }
  // 场2 草地:x 520..530 表面草块 + 草丛（隔 2 格,原版 frameX 变体三列 ×18）
  for (let x = 520; x <= 530; x++) { st.setTileSilent(x, gy, T_GRASS); st.setTileSilent(x, gy - 1, 0); }
  for (let x = 521; x <= 529; x += 2) st.setTileSilent(x, gy - 1, T_TALLGRASS, (x % 3) * 18, 0);
  // 场3 木平台:x 540..550,gy-4 行 tile 19（木样式 frame 0）,两端壁挡
  for (let x = 540; x <= 550; x++) { st.setTileSilent(x, gy - 4, T_PLATFORM, 0, 0); for (let y = gy - 3; y <= gy + 3; y++) st.setTileSilent(x, y, 0); }
  st.setTileSilent(539, gy - 4, T_STONE); st.setTileSilent(551, gy - 4, T_STONE);
  st.setTileSilent(539, gy - 3, T_STONE); st.setTileSilent(551, gy - 3, T_STONE);
  return gy;
});
await new Promise((r) => setTimeout(r, 1200));   // 液体沉降/相机
const gy = await page.evaluate(() => window.__swGame.__bj457.gy);

// 折返跑 helper:交替按 a/d msTotal 时长
async function runBackForth(msTotal, stepMs = 700) {
  const t0 = Date.now();
  let dir = 'a';
  while (Date.now() - t0 < msTotal) {
    await page.keyboard.down(dir);
    await new Promise((r) => setTimeout(r, Math.min(stepMs, msTotal - (Date.now() - t0))));
    await page.keyboard.up(dir);
    dir = dir === 'a' ? 'd' : 'a';
  }
}

// ---- A 蜂蜜池内跑动 ----
await page.evaluate((gy) => {
  const p = window.__swGame.player;
  p.x = 500 * 16; p.y = (gy - 4) * 16; p.vx = 0; p.vy = 0; p.velocityReset?.();
}, gy);
await new Promise((r) => setTimeout(r, 900));
const honeyWet = await page.evaluate(() => ({ inHoney: !!window.__swGame.player.inHoney, wet: !!window.__swGame.player.wetSticky }));
await clearLog();
await runBackForth(4000);
const A = await readLog();
check('A 蜂蜜池内跑动 4s:尘谱（用户场景）', true, `wet=${JSON.stringify(honeyWet)} total=${A.total} hist=${JSON.stringify(A.hist)}`);

// ---- D 蜂蜜里静止对照 ----
await clearLog();
await new Promise((r) => setTimeout(r, 2500));
const D = await readLog();
check('D 蜂蜜里静止 2.5s', true, `total=${D.total} hist=${JSON.stringify(D.hist)}`);

// ---- B 干地草块+草丛跑动 ----
await page.evaluate((gy) => {
  const p = window.__swGame.player;
  p.x = 524 * 16; p.y = (gy - 4) * 16; p.vx = 0; p.vy = 0;
}, gy);
await new Promise((r) => setTimeout(r, 900));
await clearLog();
await runBackForth(4000);
const B = await readLog();
check('B 干地草块+草丛跑动 4s', true, `total=${B.total} hist=${JSON.stringify(B.hist)}`);

// ---- C 木平台跑动 ----
await page.evaluate((gy) => {
  const p = window.__swGame.player;
  p.x = 545 * 16; p.y = (gy - 6) * 16; p.vx = 0; p.vy = 0;
}, gy);
await new Promise((r) => setTimeout(r, 900));
await clearLog();
await runBackForth(4000, 500);
const C = await readLog();
check('C 木平台跑动 4s', true, `total=${C.total} hist=${JSON.stringify(C.hist)}`);

// ---- E 参照:割草 mowCutTiles 扫草丛行 ----
const E = await page.evaluate((gy) => {
  const g = window.__swGame, st = g.world.store;
  const before = g.__bj457.log.length;
  const grassAt = [];
  for (let x = 521; x <= 529; x += 2) grassAt.push({ x, alive: st.hasTile(x, gy - 1), type: st.get(x, gy - 1), ids: g.__bj457.ids });
  g.mowCutTiles(521 * 16, (gy - 1) * 16, 9 * 16, 16, -1);
  const after = grassAt.map((r) => ({ x: r.x, alive: st.hasTile(r.x, gy - 1) }));
  return { grassAt, after, spawned: g.__bj457.log.length - before, hist: (() => { const h = {}; for (const d of g.__bj457.log.slice(before)) h[d.type] = (h[d.type] || 0) + 1; return h; })() };
}, gy);
const eCut = E.after.filter((r) => !r.alive).length;
check('E 参照 mowCutTiles 割草丛（割到>0 且尘>0）', eCut > 0 && E.spawned > 0, `cut=${eCut}/5 total=${E.spawned} hist=${JSON.stringify(E.hist)} pre=${JSON.stringify(E.grassAt[0])}`);

// ---- F 参照:hitTilesFx 打草块行 ----
const F = await page.evaluate((gy) => {
  const g = window.__swGame;
  const before = g.__bj457.log.length;
  g.hitTilesFx(524 * 16, (gy - 1) * 16, 20, 42, 0, 3);
  return { spawned: g.__bj457.log.length - before, hist: (() => { const h = {}; for (const d of g.__bj457.log.slice(before)) h[d.type] = (h[d.type] || 0) + 1; return h; })() };
}, gy);
check('F 参照 hitTilesFx 打草块（期望尘>0 且含 2=Grass/0=Dirt）', F.spawned > 0, `total=${F.spawned} hist=${JSON.stringify(F.hist)}`);

// ---- F2 参照:hitTilesFx 打池底蜂蜜块（期望 147=t_Honey 橙滴） ----
const F2 = await page.evaluate((gy) => {
  const g = window.__swGame;
  const before = g.__bj457.log.length;
  g.hitTilesFx(500 * 16, (gy - 1) * 16, 20, 42, 0, 3);
  return { spawned: g.__bj457.log.length - before, hist: (() => { const h = {}; for (const d of g.__bj457.log.slice(before)) h[d.type] = (h[d.type] || 0) + 1; return h; })() };
}, gy);
check('F2 参照 hitTilesFx 打蜂蜜块（期望含 147=t_Honey）', F2.spawned > 0, `total=${F2.spawned} hist=${JSON.stringify(F2.hist)}`);

console.log(`\n场地 gy=${gy}  pageerrors=${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  ERR:', e);
console.log(`\n判定: A(total=${A.total}, hist=${JSON.stringify(A.hist)}) D(total=${D.total}) B(total=${B.total}) C(total=${C.total})`);
console.log('A stacks:', JSON.stringify(A.stacks, null, 1));
console.log('C stacks:', JSON.stringify(C.stacks, null, 1));
await browser.close();
process.exit(fail > 0 ? 1 : 0);
