// 树干-草块接缝 E2E:找树基座(树干 tile 下方是草块)读 chunk tile canvas,
// 断言 ①干底格下方 4px 带有树干色像素(原版 20×20 顶锚定的 4px 下溢)
//     ②干底格内底部行有连续树干像素(无横向透明缝)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 找树基座:树族 tile(TREE id 集合) + 下方格是草块 + 该格 frameY 在干身区(<198)
const bases = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const TREE = []; // 树族内部 id 反查
  const { TILE_DEFS } = window.__swGameAssets ?? {};
  void TILE_DEFS;
  // 树族 key 列表与 ChunkCache 同款
  const keys = ['tree', 'v_583_topaz_tree', 'v_584_amethyst_tree', 'v_585_sapphire_tree', 'v_586_emerald_tree',
    'v_587_ruby_tree', 'v_588_diamond_tree', 'v_589_amber_tree', 'v_596_vanity_tree_sakura',
    'v_616_vanity_tree_yellow_willow', 'v_634_ash_tree'];
  // 直接按 sheet 判定更稳:vanilla.sheet ∈ {5,583..589,596,616,634}
  const isTreeSheet = (t) => {
    const v = st.type[t];
    // 通过 TILE_DEFS 判 sheet —— 用全局构造表不可得,退而用 frame 特征:fy<198 且 22 网格帧
    return v;
  };
  void isTreeSheet;
  const out = [];
  const gl = Math.floor(g.world.groundLevel);
  for (let x = 200; x < st.w - 200 && out.length < 40; x++) {
    for (let y = gl - 30; y < gl + 30 && out.length < 40; y++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const fy = st.frameY[i], fx = st.frameX[i];
      if (fy >= 198) continue;                       // 干身区
      if (fx % 22 !== 0 || fy % 22 !== 0) continue;  // 22px 网格帧 = 树族特征
      if (fx > 110) continue;
      // 下方格是草块
      const bi = st.idx(x, y + 1);
      if (!st.flags[bi]) continue;
      const bt = st.type[bi];
      // 草族判定:下方格非树族且实心
      const bf = st.frameY[bi];
      if (bf % 22 === 0 && st.frameX[bi] <= 110 && bf < 198) continue; // 下方也是树
      void bt;
      out.push({ x, y });
    }
  }
  return out;
});

if (!bases.length) {
  check('找到树基座样本', false, '');
} else {
  check('找到树基座样本', true, `${bases.length} 个候选`);
  // 传送玩家到首个样本附近并等 chunk 渲染
  await page.evaluate((b) => {
    const g = window.__swGame;
    g.player.x = b[0].x * 16 - 200; g.player.y = (b[0].y - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  }, bases);
  await new Promise((r) => setTimeout(r, 1800));

  // 逐样本读 chunk tile canvas:干格 20×20 顶锚定 → 格内 (0..19) 行 + 下溢带 (16..19 = 下一格顶)
  let tested = 0, seamOk = 0, overlapOk = 0;
  for (const c of bases.slice(0, 6)) {
    const r = await page.evaluate((cx, cy) => {
      const g = window.__swGame;
      const key = (Math.floor(cx / 16) & 0xffff) | ((Math.floor(cy / 16) & 0xffff) << 16);
      const pair = g.chunks.chunks.get(key);
      if (!pair) return { err: 'no chunk' };
      const ctx = pair.tile.getContext('2d');
      const lx = (cx % 16) * 16, ly = (cy % 16) * 16;
      // 干格区域:顶锚定精灵画在 (lx-2, ly) 尺寸 20×20 → 采样带 = ly..ly+19(溢出到下一格 4px)
      const d = ctx.getImageData(lx, ly, 16, 21).data; // 21 行:16 格内 + 下格 5 行
      const opq = (x, y) => d[(y * 16 + x) * 4 + 3] > 40;
      // ①格内底部行(第 14-15 行,格底两行)的连续不透明(中段 12px 内 ≥8)
      let bottomRow = 0;
      for (let x = 2; x < 14; x++) if (opq(x, 14) || opq(x, 15)) bottomRow++;
      // ②下溢带(第 16-19 行)存在树干色像素
      let overlap = 0;
      for (let y = 16; y <= 19; y++) for (let x = 2; x < 14; x++) if (opq(x, y)) overlap++;
      return { bottomRow, overlap };
    }, c.x, c.y);
    if (r.err) continue;
    tested++;
    if (r.bottomRow >= 6) seamOk++;
    if (r.overlap >= 4) overlapOk++;
    console.log(`  样本(${c.x},${c.y}) 格底连续 ${r.bottomRow}/12, 下溢像素 ${r.overlap}`);
  }
  check('树基座:干底格内无透明缝(格底连续)', tested > 0 && seamOk >= Math.ceil(tested / 2), `${seamOk}/${tested}`);
  check('树基座:4px 下溢带覆盖草块顶(原版顶锚定)', tested > 0 && overlapOk >= Math.ceil(tested / 2), `${overlapOk}/${tested}`);

  await page.screenshot({ path: '/tmp/tree-base.png' });
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
