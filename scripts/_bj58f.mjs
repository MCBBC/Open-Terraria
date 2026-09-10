/**
 * SW-BJ58 探针 F：烘焙通道定谳。
 * 行精灵不在任何逐帧 drawImage 调用中 → 假说=被烘进 chunk 页(atlas 1024² 页内
 * 256² cell),随 drawChunkGrid 的页源矩形 blit 每帧上屏。
 * ① 全量记录期间 markDirty 强制重烘行所在 chunk,抓烘焙期 drawImage 家族;
 * ② 直接读 chunk 页画布像素,查精灵图案是否在页上;
 * ③ A/B:摘除配件重烘 → 页上精灵是否消失(判"烘焙期玩家锚定可视面被误烘")。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, saveCanvasShot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj58Recs = [];
window.__bj58Install = () => {
  const recs = window.__bj58Recs;
  let cid = 0;
  const ids = new WeakMap();
  const cvId = (cv) => { let v = ids.get(cv); if (v === undefined) { v = ++cid; ids.set(cv, v); } return v; };
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__bj58p) return 'already';
  proto.__bj58p = true;
  const oi = proto.drawImage;
  proto.drawImage = function (...a) {
    try {
      if (a[0] && typeof a[0] === 'object' && recs.length < 240000) {
        const n = a.length;
        let dx = 0, dy = 0, dw = 0, dh = 0, sx = 0, sy = 0, sw = 0, sh = 0;
        if (n === 9) { [sx, sy, sw, sh, dx, dy, dw, dh] = a.slice(1); }
        else if (n === 5) { [dx, dy] = a.slice(1); }
        else if (n === 4) { [dx, dy, dw, dh] = a.slice(1); }
        const m = this.getTransform();
        const X = m.a * dx + m.c * dy + m.e, Y = m.b * dx + m.d * dy + m.f;
        const cv = this.canvas;
        const st = new Error().stack.split('\\n');
        recs.push([cvId(cv), cv.width, cv.height,
          +X.toFixed(1), +Y.toFixed(1), dx, dy,
          sx, sy, sw, sh, dw, dh, (a[0].width ?? -1), (a[0].height ?? -1),
          +this.globalAlpha.toFixed(2),
          (st[2] || '').trim().slice(30, 105), (st[3] || '').trim().slice(30, 95), (st[4] || '').trim().slice(30, 95)]);
      }
    } catch (e) {}
    return oi.apply(this, a);
  };
  return 'installed';
};
'ok';
`;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  await pump(page, 60, { clearEnemies: true });
  const iid5126 = await itemByVid(page, 5126);
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 60, { clearEnemies: true });   // 行稳定显形
  await page.evaluate(INSTALL);
  await page.evaluate('window.__bj58Install()');
  await page.evaluate('window.__bj58Recs.length = 0');

  // 强制重烘行区域 chunk(tile 盒 x[2100,2125] y[260,274] → chunk 16x16: cx 131..132, cy 16)
  const bake = await page.evaluate(() => {
    const g = window.__swGame;
    const cc = g.renderer ? g.renderer.chunks ?? g.renderer.chunkCache : null;
    const c = cc ?? g.world ? (g.world.chunks ?? null) : null;
    return { found: !!cc, keys: cc ? Object.keys(cc).slice(0, 20) : [] };
  });
  L.say(`chunkCache lookup: ${JSON.stringify(bake)}`);
  const mark = await page.evaluate(() => {
    const g = window.__swGame;
    const cc = (g.renderer && (g.renderer.chunks || g.renderer.chunkCache)) || (g.world && g.world.chunks) || null;
    if (!cc || !cc.markDirtyArea) return 'no-cache';
    cc.markDirtyArea(2100, 258, 2126, 276);
    return 'marked';
  });
  L.say(`markDirty: ${mark}`);
  for (let i = 0; i < 8; i++) await nextFrame(page);   // flushDirty 4 chunk/帧
  const recs = await page.evaluate(() => window.__bj58Recs);
  writeFileSync(`${OUT}/bake-recs.json`, JSON.stringify(recs));
  L.say(`records=${recs.length}`);
  // 烘焙画布 = 页(1024x1024)。找页上 6 连家族:同帧同画布,小精灵(sw<=24),dx 间距 25-60
  const onPages = recs.filter((r) => r[2] >= 512);   // 页画布 ≥512
  L.say(`pageCanvas records=${onPages.length}`);
  const fam = {};
  for (const r of onPages) {
    const k = `cv${r[0]}(${r[1]}x${r[2]}) ${r[15]}` + ' ' + String(r[16]).split('/').pop()?.slice(0, 30);
    fam[k] = (fam[k] ?? 0) + 1;
  }
  L.say('page families: ' + JSON.stringify(fam, null, 1).slice(0, 1500));
  // 行区域附近页上小精灵明细(找 sw<=24 且 X 递增的连)
  const small = onPages.filter((r) => r[9] <= 24 && r[10] <= 24);
  L.say(`page small sprites=${small.length}`);
  for (const r of small.slice(0, 40)) {
    L.say(`  cv${r[0]} dev=(${r[3]},${r[4]}) raw=(${r[5]},${r[6]}) srcRect=(${r[7]},${r[8]},${r[9]},${r[10]}) page=${r[13]}x${r[14]} ${String(r[16]).split('/').pop()}`);
  }
  await saveCanvasShot(page, `${OUT}/row-f.png`);

  process.exit(L.exitCode());
} finally {
  await browser.close();
}
