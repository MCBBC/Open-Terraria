// ★BJ465 蜂蜜中跑动出绿叶尘——BJ457 销案翻案重查探针。
//   BJ457 盲区定谳（亲读 _bj457-honey-grass-dust.mjs）:
//     · 其场1蜂蜜池底=蜂蜜块(225)、池内无草丛/植被——用户实况「蜂蜜池+草块底+草丛在场」
//       从未被组合测试;其草块+草丛场在干地。
//     · 其 wrap 只记 vanillaDust.spawn——本仓自定义粒子口 game.spawnParticles 未记录。
//   本探针矩阵（双粒子口 wrap+液体裁切取证钩）:
//     A1 浅蜜池(腰深)+草块底+草丛在场 跑动   ← 用户场景
//     A2 深蜜池(全淹)+草块底+草丛在场 跑动
//     D  浅蜜池+草块底+草丛 静止 2.5s
//     B  干地草块+草丛 跑动（用户自述零尘对照）
//     W  水池(非蜜)+草块底+草丛 跑动（液体通用性对照——原版 tileCut 裁切门=非水才裁）
//     F  浅蜜池+草块底+草丛+OnFire 着火 跑动（用户截图状态）
//     G  浅蜜池扰动档：跑动中途重排池内液体量（模拟液体流动,裁切面激活窗）
//   判读:绿叶尘(dust 2/3/31 或绿色自定义粒子)出现在哪些档;栈回溯定位挂接位。
// 用法: SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj465-honey-grass-reopen.mjs
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

// ---- 双粒子口 wrap（vanillaDust.spawn + game.spawnParticles;含裁切/killTile 取证钩） ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.__bj465 = { dust: [], parts: [], cuts: [], ktiles: [] };
  if (!g.__bj465wrap) {
    const orig = g.vanillaDust.spawn.bind(g.vanillaDust);
    g.vanillaDust.spawn = function (x, y, w, h, type, sx, sy, alpha, color, scale) {
      const e = { type, x: Math.round(x / 16 * 10) / 10, y: Math.round(y / 16 * 10) / 10 };
      if (type === 2 || type === 3 || type === 31 || type === 0) {
        e.stack = (new Error().stack || '').split('\n').slice(1, 8)
          .map((s) => s.trim().replace(/^at /, '').split(' (')[0]).filter((s) => /src\//.test(s));
      }
      g.__bj465.dust.push(e);
      return orig(x, y, w, h, type, sx, sy, alpha, color, scale);
    };
    const origParts = g.spawnParticles.bind(g);
    g.spawnParticles = function (x, y, color, n, size, opt) {
      g.__bj465.parts.push({ color: String(color), n, x: Math.round(x / 16 * 10) / 10, y: Math.round(y / 16 * 10) / 10 });
      return origParts(x, y, color, n, size, opt);
    };
    g.__bj465wrap = true;
  }
  (globalThis).__swCutProbe = (x, y, t) => g.__bj465.cuts.push({ x, y, t });
  (globalThis).__sw118Kt = (tag, x, y) => { if (tag === 'killTileAt') g.__bj465.ktiles.push({ x, y }); };
});
const clearLog = () => page.evaluate(() => {
  const g = window.__swGame;
  g.__bj465.dust.length = 0; g.__bj465.parts.length = 0;
  g.__bj465.cuts.length = 0; g.__bj465.ktiles.length = 0;
});
const readLog = () => page.evaluate(() => {
  const L = window.__swGame.__bj465;
  const snap = {
    dust: L.dust.slice(), parts: L.parts.slice(), cuts: L.cuts.slice(), ktiles: L.ktiles.slice(),
  };
  L.dust.length = 0; L.parts.length = 0; L.cuts.length = 0; L.ktiles.length = 0;
  const hist = {};
  for (const d of snap.dust) hist[d.type] = (hist[d.type] || 0) + 1;
  const stacks = {};
  for (const d of snap.dust) {
    if (d.stack) {
      const k = `t=${d.type} @` + d.stack.slice(0, 3).join(' <- ');
      stacks[k] = (stacks[k] || 0) + 1;
    }
  }
  const partHist = {};
  for (const p of snap.parts) partHist[p.color] = (partHist[p.color] || 0) + p.n;
  return { total: snap.dust.length, hist, stacks, parts: snap.parts.slice(0, 12), partHist, cuts: snap.cuts.slice(0, 8), ktiles: snap.ktiles.slice(0, 8) };
});

// ---- 布景 helper ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const { TILE_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const idBySheet = (sheet) => {
    const id = (TILE_DEFS ?? []).findIndex((d) => d?.vanilla?.sheet === sheet);
    if (id < 0) throw new Error('no-sheet:' + sheet);
    return id;
  };
  g.__bj465.ids = {
    DIRT: idBySheet(0), STONE: idBySheet(1), GRASS: idBySheet(2),
    TALLGRASS: idBySheet(3), PLATFORM: idBySheet(19),
  };
  let gy = 8; for (; gy < 400 && !g.world.store.isSolid(520, gy); gy++) {}
  g.__bj465.gy = gy;
});

/** 布置一个实验场（x0..x1 池域）。mode: honey-shallow/honey-deep/water/dry */
const buildField = (x0, x1, mode) => page.evaluate(({ x0, x1, mode }) => {
  const g = window.__swGame, st = g.world.store, p = g.player;
  const ids = g.__bj465.ids, gy = g.__bj465.gy;
  const T_DIRT = ids.DIRT, T_STONE = ids.STONE, T_GRASS = ids.GRASS, T_TALLGRASS = ids.TALLGRASS;
  const cx = Math.floor((x0 + x1) / 2);
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = gy - 10; y <= gy + 4; y++) {
    st.setTileSilent(x, y, 0); st.setLiquid(x, y, 0, 0);
  }
  for (let x = x0 - 1; x <= x1 + 1; x++) for (let y = gy; y <= gy + 3; y++) st.setTileSilent(x, y, T_DIRT);
  for (let x = x0; x <= x1; x++) st.setTileSilent(x, gy, T_GRASS);
  for (let x = x0 + 2; x <= x1 - 2; x += 2) st.setTileSilent(x, gy - 1, T_TALLGRASS, (x % 3) * 18, 0);
  if (mode !== 'dry') {
    for (let y = gy - 7; y <= gy; y++) { st.setTileSilent(x0 - 1, y, T_STONE); st.setTileSilent(x1 + 1, y, T_STONE); }
    const depth = mode === 'honey-deep' ? 5 : 2;
    const lt = mode === 'water' ? 0 : 3;
    for (let x = x0; x <= x1; x++) for (let y = gy - depth; y <= gy - 1; y++) st.setLiquid(x, y, 255, lt);
  }
  p.x = cx * 16; p.y = (gy - 4) * 16; p.vx = 0; p.vy = 0; p.velocityReset?.();
  return { cx, gy };
}, { x0, x1, mode });

const runBackForth = async (msTotal, stepMs = 700) => {
  const t0 = Date.now();
  let dir = 'a';
  while (Date.now() - t0 < msTotal) {
    await page.keyboard.down(dir);
    await new Promise((r) => setTimeout(r, Math.min(stepMs, msTotal - (Date.now() - t0))));
    await page.keyboard.up(dir);
    dir = dir === 'a' ? 'd' : 'a';
  }
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// 场位错开：A1/D 共用 490..511（先 A1 后 D）;A2 464..486;B 522..536;W 545..563;F 566..586
// A1 浅蜜+草块+草丛 跑动（用户场景）
await buildField(490, 511, 'honey-shallow');
await settle(1400);
const a1wet = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { inHoney: !!p.inHoney, wetSticky: !!p.wetSticky, x: Math.round(p.x / 16), y: Math.round(p.y / 16) };
});
await clearLog();
await runBackForth(4000);
const A1 = await readLog();
check('A1 浅蜜+草块+草丛跑动 4s（用户场景）', true,
  `wet=${JSON.stringify(a1wet)} dust=${A1.total} hist=${JSON.stringify(A1.hist)} parts=${JSON.stringify(A1.partHist)}`);

// D 同场静止对照
await clearLog();
await settle(2500);
const D = await readLog();
check('D 浅蜜+草块+草丛静止 2.5s', true, `dust=${D.total} hist=${JSON.stringify(D.hist)} parts=${JSON.stringify(D.partHist)}`);

// A2 深蜜
await buildField(464, 486, 'honey-deep');
await settle(1400);
await clearLog();
await runBackForth(4000);
const A2 = await readLog();
check('A2 深蜜+草块+草丛跑动 4s', true, `dust=${A2.total} hist=${JSON.stringify(A2.hist)} parts=${JSON.stringify(A2.partHist)}`);

// B 干地草块+草丛（用户自述零尘）
await buildField(522, 536, 'dry');
await settle(1000);
await clearLog();
await runBackForth(4000);
const B = await readLog();
check('B 干地草块+草丛跑动 4s', true, `dust=${B.total} hist=${JSON.stringify(B.hist)} parts=${JSON.stringify(B.partHist)}`);

// W 水池+草块+草丛
await buildField(545, 563, 'water');
await settle(1400);
await clearLog();
await runBackForth(4000);
const W = await readLog();
check('W 水池+草块+草丛跑动 4s', true, `dust=${W.total} hist=${JSON.stringify(W.hist)} parts=${JSON.stringify(W.partHist)}`);

// F 浅蜜+着火（OnFire buff 5s）
await buildField(490, 511, 'honey-shallow');
const ffire = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const { BuffType } = await import(`/src/stats/Buffs.ts?t=${Date.now()}`);
  p.buffs.apply(BuffType.OnFire, 5);
  return p.buffs.has(BuffType.OnFire);
});
await settle(600);
await clearLog();
await runBackForth(4000);
const F = await readLog();
check('F 浅蜜+着火+草块+草丛跑动 4s', true, `fireApplied=${ffire} dust=${F.total} hist=${JSON.stringify(F.hist)} parts=${JSON.stringify(F.partHist)}`);

// G 扰动档：浅蜜场+跑动中途把池内液体重排（流动窗）
await buildField(490, 511, 'honey-shallow');
await settle(1200);
await clearLog();
const gp = (async () => {
  await runBackForth(4000);
})();
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store, gy = g.__bj465.gy;
  // 200ms 后扰动：抽走池左半液体→右侧（触发流动/裁切窗）
  setTimeout(() => {
    for (let x = 495; x <= 510; x++) for (let y = gy - 2; y <= gy - 1; y++) {
      st.setLiquid(x, y, Math.floor(255 * Math.random()), 3);
    }
  }, 300);
});
await gp;
const G = await readLog();
check('G 浅蜜+扰动跑动 4s', true, `dust=${G.total} hist=${JSON.stringify(G.hist)} parts=${JSON.stringify(G.partHist)} cuts=${JSON.stringify(G.cuts)} ktiles=${G.ktiles.length}`);

console.log('\n===== 栈回溯（草族尘） =====');
console.log(JSON.stringify({
  A1: A1.stacks, A2: A2.stacks, B: B.stacks, W: W.stacks, F: F.stacks, G: G.stacks,
}, null, 1));
console.log('===== 自定义粒子样本 =====');
console.log(JSON.stringify({ A1: A1.parts, G: G.parts }, null, 1));
console.log(`\npageerrors=${errors.length}`);
for (const e of errors.slice(0, 5)) console.log('  ERR:', e);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
