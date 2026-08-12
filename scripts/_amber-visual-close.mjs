// 一次性闭环验证:琥珀簇(178 style6)与琥珀树(589)的实际渲染(ASCII 色相图)
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=500000 scripts/_amber-visual-close.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 150 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}

// 找琥珀簇(178 frameX=108..125)和琥珀树(589)各一个
const targets = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const idx = st.idx.bind(st);
  const tiles = { gem: TILE_DEFS_GEM(), tree: TILE_DEFS_TREE() };
  function TILE_DEFS_GEM() { return window.__swTiles ? window.__swTiles['v_178_gems'] : -1; }
  function TILE_DEFS_TREE() { return window.__swTiles ? window.__swTiles['v_589_amber_tree'] : -1; }
  const out = { gem: null, tree: null };
  for (let y = 300; y < 900 && (!out.gem || !out.tree); y++) {
    for (let x = 0; x < st.w && (!out.gem || !out.tree); x++) {
      const i = idx(x, y);
      if (st.flags[i]) {
        if (!out.gem && st.type[i] === tiles.gem && st.frameX[i] >= 108 && st.frameX[i] <= 125) out.gem = { x, y };
        if (!out.tree && st.type[i] === tiles.tree) out.tree = { x, y };
      }
    }
  }
  return out;
});
console.log('targets:', JSON.stringify(targets));
if (!targets.gem && !targets.tree) { console.log('无目标,跳过渲染'); await browser.close(); process.exit(0); }

async function asciiAt(tx, ty, label) {
  await page.evaluate(([x, y]) => {
    const g = window.__swGame;
    g.player.x = x * 16; g.player.y = (y - 6) * 16;
    g.camera.x = g.player.x; g.camera.y = g.player.y;
  }, [tx, ty]);
  await new Promise((r) => setTimeout(r, 4000));
  const rows = await page.evaluate(([cx, cy]) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas ?? document.querySelector('canvas');
    const ctx2 = cv.getContext('2d');
    const cam = g.camera; const z = cam.zoom ?? 1;
    const toS = (wx, wy) => [(wx - (cam.x - cv.width / 2 / z)) * z, (wy - (cam.y - cv.height / 2 / z)) * z];
    const letter = (r, gg, b) => {
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      if (mx < 45) return '.';
      if (mx - mn < 24) return mx > 190 ? '#' : ':';
      if (b > r && b > gg) return 'B';
      if (r > 195 && gg > 105 && gg < 195 && b < 105) return 'A'; // 琥珀橙
      if (gg > r && gg > b) return 'G';
      if (r > gg && r > b) return r > 140 ? 'R' : 'r';
      if (r > 90 && b > 90 && gg < Math.min(r, b)) return 'P';
      if (gg > 170 && b > 170 && r < 140) return 'C';
      return '?';
    };
    const out = [];
    for (let ty2 = cy - 7; ty2 <= cy + 7; ty2++) {
      let row = '';
      for (let tx2 = cx - 6; tx2 <= cx + 6; tx2++) {
        const votes = {};
        for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
          const [px, py] = toS(tx2 * 16 + 2 + sx * 4, ty2 * 16 + 2 + sy * 4);
          if (px < 0 || py < 0 || px >= cv.width || py >= cv.height) { votes[' '] = (votes[' '] || 0) + 1; continue; }
          const d = ctx2.getImageData(Math.floor(px), Math.floor(py), 1, 1).data;
          if (d[3] < 40) { votes[' '] = (votes[' '] || 0) + 1; continue; }
          const L = letter(d[0], d[1], d[2]); votes[L] = (votes[L] || 0) + 1;
        }
        row += Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
      }
      out.push(row);
    }
    return out;
  }, [tx, ty]);
  console.log(`=== ${label} @(${tx},${ty}) ===`);
  for (const r of rows) console.log(r);
}

if (targets.gem) await asciiAt(targets.gem.x, targets.gem.y, '琥珀簇 178 style6');
if (targets.tree) await asciiAt(targets.tree.x, targets.tree.y, '琥珀树 589');
console.log('图例: A=琥珀橙 B=蓝 G=绿 R/r=红 P=紫 C=青 #=白 :=灰 .=黑 空格=透明');
console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
