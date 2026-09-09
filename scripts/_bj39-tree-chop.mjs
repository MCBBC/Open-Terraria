// SW-BJ39 砍树四向取证探针（v2）：底砍/中砍/枝砍/顶砍 账目 + 残桩重帧证据。
// 原版锚：Player.cs:46120 单格 KillTile → WorldGen.cs:64432 SquareTileFrame →
// TileFrame case 5（:85637）→ CheckTree（:55045）逐格上行级联+重帧。
// v2：掉落捕获改为安装/卸载对称（v1 双层包裹把账翻倍=探针伪影）；store 不出页面。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });

const ids = await page.evaluate(async () => {
  const mod = await import('/src/data/tiles.ts');
  return { TREE: mod.TILE_BY_KEY['tree'], GRASS: mod.TILE_BY_KEY['grass'], DIRT: mod.TILE_BY_KEY['dirt'] };
});

const base = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  const gy = Math.floor((g.player.y + g.player.h) / 16);
  for (let x = px - 45; x <= px + 45; x++) {
    for (let y = gy - 14; y <= gy + 2; y++) st.setTileSilent(x, y, 0, 0, 0);
    st.setTileSilent(x, gy + 1, 1, 0, 0);
  }
  return { px, gy };
});

// 一体化页面侧实验器：建树→砍→拍快照→账目（store 不出页面）
const runCase = (cfg) => page.evaluate((cfg, TREE, GRASS) => {
  const g = window.__swGame;
  const st = g.world.store;
  const { cx, h, cutDy, branch, topChop } = cfg;
  const gy = cfg.gy;
  st.setTileSilent(cx, gy, GRASS, 0, 0);
  for (let i = 0; i < h; i++) {
    const y = gy - 1 - i;
    if (i === h - 1) st.setTileSilent(cx, y, TREE, 22, 198);
    else st.setTileSilent(cx, y, TREE, 0, (i % 5) * 22);
  }
  if (branch) st.setTileSilent(cx - 1, gy - 1 - branch.row, TREE, 44, 198);
  const snap = () => {
    const rows = [];
    for (let i = 0; i <= h; i++) {
      const y = gy - i;
      const t = st.get(cx, y);
      rows.push(t === 0 ? 0 : `${st.frameX[st.idx(cx, y)]},${st.frameY[st.idx(cx, y)]}`);
    }
    return rows;
  };
  const before = snap();
  const beforeBranch = branch ? (st.get(cx - 1, gy - 1 - branch.row) === TREE) : null;
  const drops = [];
  const orig = g.spawnDrop.bind(g);
  g.spawnDrop = (x, y, key, n, vx, vy) => { drops.push({ key, n, y }); return orig(x, y, key, n, vx, vy); };
  const cutY = topChop ? gy - h : (branch ? gy - 1 - branch.row : gy - cutDy);
  const cutX = branch ? cx - 1 : cx;
  g.breakTile(cutX, cutY, true);
  g.spawnDrop = orig;
  const after = snap();
  const afterBranch = branch ? (st.get(cx - 1, gy - 1 - branch.row) === TREE) : null;
  const afterTrunkAtCut = st.get(cx, cutY) === TREE;
  const wood = drops.filter(d => d.key === 'vi_9_Wood').reduce((a, d) => a + d.n, 0);
  const acorns = drops.filter(d => d.key.startsWith('vi_27_')).reduce((a, d) => a + d.n, 0);
  return { before, after, beforeBranch, afterBranch, afterTrunkAtCut, wood, acorns, drops, cutY, stumpTopRow: gy - cutDy - 1 };
}, cfg, ids.TREE, ids.GRASS);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const GY = base.gy;

// ① 底砍（原版语义对照组）
{
  const r = await runCase({ cx: base.px - 30, gy: GY, h: 5, cutDy: 1 });
  console.log('①', JSON.stringify(r));
  check('①底砍: 整树清除', r.after.slice(1).every(v => v === 0), JSON.stringify(r.after));
  check('①底砍: 逐格掉木 5-10（每格 1-2 bonus）', r.wood >= 5 && r.wood <= 10, `wood=${r.wood}`);
  check('①底砍: 冠格橡实 ≤1（50%掷）', r.acorns <= 1, `acorns=${r.acorns}`);
}

// ② 中砍（用户主诉面）
{
  const r = await runCase({ cx: base.px - 10, gy: GY, h: 7, cutDy: 4 });
  console.log('②', JSON.stringify(r));
  const topGone = [4, 5, 6, 7].every(i => r.after[i] === 0);
  const stumpKept = [1, 2, 3].every(i => r.after[i] !== 0);
  check('②中砍: 切口以上整段倒下', topGone, JSON.stringify(r.after));
  check('②中砍: 残桩保留', stumpKept);
  check('②中砍: 只掉倒下段 4 格木（4-8）', r.wood >= 4 && r.wood <= 8, `wood=${r.wood}`);
  const ft = String(r.after[3]).split(',');
  // 原版重帧 = (110, fy%66)（臂5d :55193-55236 num7=fy%66）;建树残桩顶帧 (0,44) → (110,44)
  check('②中砍: 残桩顶格重帧为切口风格 (110, fy%66)（vanilla CheckTree 臂3/5d :55125/:55193）', ft[0] === '110' && Number(ft[1]) === 44, `got (${ft})`);
}

// ③ 枝砍（用户主诉面：不砍根、砍侧枝）
{
  const r = await runCase({ cx: base.px + 10, gy: GY, h: 6, branch: { row: 3 } });
  console.log('③', JSON.stringify(r));
  check('③枝砍: 枝格消失', r.beforeBranch === true && r.afterBranch === false);
  check('③枝砍: 干格在切口行保留（原版只掉枝）', r.afterTrunkAtCut, `trunk@${r.cutY}=${r.afterTrunkAtCut}`);
  const treeIntact = r.after.slice(1).every(v => v !== 0);
  check('③枝砍: 整树其余全保留（旧实现会腰斩成悬空树）', treeIntact, JSON.stringify(r.after));
  check('③枝砍: 只掉 1 格枝木（1-2 = bonusWood 斧骰 :66762-66768;手持非斧→~1/3 概率 ×2）', r.wood >= 1 && r.wood <= 2, `wood=${r.wood}`);
}

// ④ 顶砍（树冠格）
{
  const r = await runCase({ cx: base.px + 30, gy: GY, h: 5, topChop: true });
  console.log('④', JSON.stringify(r));
  check('④顶砍: 冠格消失、其余保留', r.after[5] === 0 && [1, 2, 3, 4].every(i => r.after[i] !== 0), JSON.stringify(r.after));
  check('④顶砍: 只掉 1 格木（1-2 = bonusWood 斧骰 :66762-66768）', r.wood >= 1 && r.wood <= 2, `wood=${r.wood}`);
}

console.log(`\n${pass} pass / ${fail} fail`);

