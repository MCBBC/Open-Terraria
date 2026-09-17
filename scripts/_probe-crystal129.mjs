// 魔晶碎块(tile 129 Crystal Shards)形态探针——用户实报"原版是一长串,我们是发散两个方块出来"。
// 布景:珍珠石台面 + 四向附着的水晶碎块(小簇 style 0/5/9/13/17 + 大簇 18..23),
// 逐动画相位(idx=0..5)截图 + 复现取帧走位(ofy 步进)+ 读 tileFrameCapture 被动聚合。
// 预期(原版):任意相位源矩形恒在 (style*18, dirRow) 不动(动画只走横向 addFrX,且仅大簇)。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/crystal129';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 300)));
page.on('console', (m) => { const t = m.text(); if (/VanillaTiler|sheet 129/.test(t)) console.log('CONSOLE:', t.slice(0, 300)); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5216', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('晶探');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.keyboard.type('129');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
for (const b of await page.$$('button')) { const t = await b.evaluate((el) => el.textContent || ''); if (/我知道了/.test(t)) { await b.click(); break; } }

// ---- 布景 ----
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILES = window.__swTiles;
  const PEARL = TILES['v_117_pearlstone_block'];
  const SHARD = TILES['v_129_crystal_shard'];
  if (!PEARL || !SHARD) return { fail: `tiles missing PEARL=${!!PEARL} SHARD=${!!SHARD}` };
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const gy = py + 6;
  const x0 = px - 22, x1 = px + 28;
  for (let x = x0; x <= x1; x++) {
    for (let y = gy - 9; y < gy; y++) st.setTile(x, y, 0);
    st.setTile(x, gy, PEARL, 0, 0);
    st.setTile(x, gy + 1, PEARL, 0, 0);
  }
  // A 组:地面附着(frameY=0),小簇 0/5/9/13/17 + 大簇 18..23,隔 3 列(px-12 起)
  const styles = [0, 5, 9, 13, 17, 18, 19, 20, 21, 22, 23];
  const aCells = [];
  styles.forEach((s, k) => {
    const x = px - 12 + k * 3;
    st.setTile(x, gy - 1, SHARD, s * 18, 0);
    aCells.push({ x, y: gy - 1, style: s, fx: s * 18, fy: 0 });
  });
  // B 组:吊顶附着(frameY=18):顶板 gy-6,碎块挂 gy-5
  const bCells = [];
  [0, 9, 17, 18, 21, 23].forEach((s, k) => {
    const x = px - 12 + k * 3;
    st.setTile(x, gy - 6, PEARL, 0, 0);
    st.setTile(x, gy - 5, SHARD, s * 18, 18);
    bCells.push({ x, y: gy - 5, style: s, fx: s * 18, fy: 18 });
  });
  // C 组:侧墙附着 frameY=54(锚左)/36(锚右),两行
  const cCells = [];
  [9, 20].forEach((s, k) => {
    const y = gy - 1 - k * 3;
    st.setTile(px + 21, y, PEARL, 0, 0);
    st.setTile(px + 22, y, SHARD, s * 18, 54);
    cCells.push({ x: px + 22, y, style: s, fx: s * 18, fy: 54 });
    st.setTile(px + 26, y, PEARL, 0, 0);
    st.setTile(px + 25, y, SHARD, s * 18, 36);
    cCells.push({ x: px + 25, y, style: s, fx: s * 18, fy: 36 });
  });
  g.fullbright = true;
  try { g.renderer.fullbright = true; } catch { /* 可能不在 renderer 上 */ }
  return { ok: true, px, py, gy, aCells, bCells, cCells };
});
console.log('setup:', JSON.stringify({ ok: setup.ok, px: setup.px, gy: setup.gy }));
if (setup.fail) { console.log('FAIL', setup.fail); await browser.close(); process.exit(1); }

// 玩家挪到布景左侧空带(px-18),站地板上,镜头自然跟随
await page.evaluate(({ gy }) => {
  const g = window.__swGame;
  g.player.x = (Math.floor(g.player.cx / 16) - 18) * 16;
  g.player.y = (gy - 4) * 16;
  g.player.vx = 0; g.player.vy = 0; g.player.onGround = false;
}, setup);
await new Promise((r) => setTimeout(r, 1200));

// 关欢迎弹窗(真实鼠标事件点击;按钮文本="我已知晓")
for (let att = 0; att < 5; att++) {
  const box = await page.evaluate(() => {
    for (const el of document.querySelectorAll('button, div, span, a')) {
      if (/我已知晓|我知道了/.test((el.textContent || '').trim()) && (el.textContent || '').trim().length < 8) {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });
  if (!box) break;
  await page.mouse.click(box.x, box.y);
  await new Promise((r) => setTimeout(r, 500));
}
// 钉正午 + fullbright(排除昼夜光照)
await page.evaluate(() => {
  const g = window.__swGame;
  try { g.world.clock.timeOfDay = 0.5; } catch { /* ignore */ }
  g.fullbright = true;
  try { g.renderer.fullbright = true; } catch { /* ignore */ }
});
await new Promise((r) => setTimeout(r, 600));

// 计算布景区在屏幕上的裁剪框(世界→屏幕: (w - cam)*z + canvas/2)
const clip = await page.evaluate(({ aCells }) => {
  const g = window.__swGame;
  const cv = document.querySelector('canvas');
  const cam = g.camera ?? g.renderer?.camera;
  const cx = cam?.x ?? g.player.cx, cy = cam?.y ?? g.player.cy;
  const z = cam?.zoom ?? g.renderer?.zoom ?? 1;
  const wx0 = (aCells[0].x - 2) * 16, wx1 = (aCells[aCells.length - 1].x + 6) * 16;
  const wy0 = (aCells[0].y - 8) * 16, wy1 = (aCells[0].y + 3) * 16;
  const sx = (wx) => (wx - cx) * z + cv.width / 2;
  const sy = (wy) => (wy - cy) * z + cv.height / 2;
  return { x: Math.max(0, sx(wx0)), y: Math.max(0, sy(wy0)), width: Math.min(cv.width, sx(wx1) - sx(wx0)), height: Math.min(cv.height, sy(wy1) - sy(wy0)) };
}, setup);
console.log('clip:', JSON.stringify(clip));

// 逐相位截图 idx=0..5(冻结 advanceAnim=动画钟唯一推进点 → 钉 tick → 等 2 帧渲染)
await page.evaluate(() => {
  const g = window.__swGame;
  g.__origAdvanceAnim = g.chunks.advanceAnim;
  g.chunks.advanceAnim = () => {};
});
for (let idx = 0; idx < 6; idx++) {
  await page.evaluate(async ({ idx }) => {
    const m = await import('/src/render/TileAnim.ts');
    m.tileAnim.tick = idx * 8 + 4;
  }, { idx });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${OUT}/idx${idx}.png` });
}
console.log('screenshots 0..5 saved (phase-locked)');
await page.evaluate(() => {
  const g = window.__swGame;
  if (g.__origAdvanceAnim) { g.chunks.advanceAnim = g.__origAdvanceAnim; delete g.__origAdvanceAnim; }
});

// 复现取帧走位:recon 路径 ofy = fy + animYOffset(129, rows*18),逐相位记录 (sx,sy)/回退
const walk = await page.evaluate(async ({ aCells, bCells, cCells }) => {
  const g = window.__swGame;
  const atlas = g.renderer.atlas;
  const sheet = 129;   // __swTiles 值为 tile type id,vanilla sheet 固定 129
  const meta = atlas.vmeta(sheet);
  const ta = await import('/src/render/TileAnim.ts');
  const cells = [...aCells.slice(0, 6), ...aCells.slice(6), ...bCells.slice(0, 2), ...cCells.slice(0, 2)];
  const out = [];
  for (let idx = 0; idx < 6; idx++) {
    ta.tileAnim.tick = idx * 8 + 4;
    const extra = ta.animYOffset(sheet, (meta.rows ?? 0) * 18);
    const row = [];
    for (const c of cells) {
      const ofy = c.fy + extra;
      let r = atlas.vframeAt(sheet, c.fx, ofy);
      let fb = false;
      if (!r) { fb = true; r = atlas.vframeAt(sheet, 0, 0); }
      row.push(`s${c.style}/fy${c.fy}: sy=${r?.sy}${fb ? '(FALLBACK(0,0))' : ''}`);
    }
    out.push({ idx, extra, row });
  }
  return { meta: { cols: meta.cols, rows: meta.rows, grid: meta.grid, stride: meta.stride }, out };
}, setup);
console.log('walk meta:', JSON.stringify(walk.meta));
for (const p of walk.out) console.log(`idx${p.idx} extra=${p.extra}`, p.row.join(' | '));

// tileFrameCapture 被动聚合(sheet 129)
const cap = await page.evaluate(() => {
  const capApi = window.__swTileCap;
  if (!capApi) return { hasCap: false };
  try {
    const exp = capApi.exportLight ? capApi.exportLight() : capApi.export?.();
    return { hasCap: true, s129: exp?.sheets?.['129'] ?? null };
  } catch (e) { return { hasCap: true, err: String(e).slice(0, 120) }; }
});
console.log('capture:', JSON.stringify(cap).slice(0, 600));

await browser.close();
console.log('DONE →', OUT);
