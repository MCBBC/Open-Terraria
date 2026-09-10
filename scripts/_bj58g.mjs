/**
 * SW-BJ58 探针 G：通道三判实验(擦除-复现-烘焙依赖)。
 * ① 装备显形 → 主画布 clearRect 擦掉一个精灵 → 泵 3 帧:复活=每帧重画(未知通道),
 *    仍空=陈旧像素(一次性绘制);
 * ② markDirtyArea 强制重烘 → 复活=烘焙通道(精灵在 chunk 页上);
 * ③ 摘除配件 + 重烘 → 消失=烘焙期玩家锚定可视面被误烘进 chunk(定谳)。
 * 辅:页画布像素直读(找精灵所在页与 cell)。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

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

  const READ = `(() => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const c2 = document.createElement('canvas');
    c2.width = 280; c2.height = 50;
    const cx = c2.getContext('2d', { willReadFrequently: true });
    cx.drawImage(cv, 660, 370, 280, 50, 0, 0, 280, 50);
    const d = cx.getImageData(0, 0, 280, 50).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4) if ((d[i] > 200 && d[i+1] < 130) || (d[i] > 200 && d[i+1] > 190 && d[i+2] < 170)) hit++;
    return hit;
  })()`;

  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 60, { clearEnemies: true });
  const h0 = await page.evaluate(READ);
  L.say(`装备态 row 盒橙像素=${h0}`);

  // ① clearRect 擦掉精灵3 (797,387)-(807,397)
  await page.evaluate(() => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const cx = cv.getContext('2d');
    cx.clearRect(793, 383, 18, 18);
  });
  const h1 = await page.evaluate(READ);
  await nextFrame(page); await nextFrame(page); await nextFrame(page);
  const h2 = await page.evaluate(READ);
  L.say(`擦除后=${h1} → 3帧后=${h2} (${h2 > h1 ? '复活=每帧重画通道' : '仍空=一次性绘制/烘焙'})`);

  // ② 强制重烘行区域 chunk
  const mark = await page.evaluate(() => {
    const g = window.__swGame;
    const cc = (g.renderer && (g.renderer.chunks || g.renderer.chunkCache)) || (g.world && g.world.chunks) || null;
    if (!cc || !cc.markDirtyArea) return 'no-cache:' + Object.keys(g.renderer).filter((k) => /chunk/i.test(k)).join(',');
    cc.markDirtyArea(2100, 258, 2126, 276);
    return 'marked';
  });
  L.say(`markDirty: ${mark}`);
  for (let i = 0; i < 8; i++) await nextFrame(page);
  const h3 = await page.evaluate(READ);
  L.say(`重烘后=${h3} (${h3 > h2 + 5 ? '复活=烘焙通道' : '未复活'}`);

  // ③ 摘除配件 + 重烘
  await page.evaluate(() => { const g = window.__swGame; g.player.inv.armor[3] = null; });
  await pump(page, 30, { clearEnemies: true });
  await page.evaluate(() => {
    const g = window.__swGame;
    const cc = (g.renderer && (g.renderer.chunks || g.renderer.chunkCache)) || (g.world && g.world.chunks) || null;
    if (cc && cc.markDirtyArea) cc.markDirtyArea(2100, 258, 2126, 276);
  });
  for (let i = 0; i < 8; i++) await nextFrame(page);
  const h4 = await page.evaluate(READ);
  L.say(`摘除+重烘后=${h4} (${h4 < 50 ? '精灵消失=烘焙期误烘定谳' : '仍在'}`);

  // ④ 重装备 + 重烘(复活验证,闭环 A/B/A)
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; }, iid5126);
  await pump(page, 30, { clearEnemies: true });
  await page.evaluate(() => {
    const g = window.__swGame;
    const cc = (g.renderer && (g.renderer.chunks || g.renderer.chunkCache)) || (g.world && g.world.chunks) || null;
    if (cc && cc.markDirtyArea) cc.markDirtyArea(2100, 258, 2126, 276);
  });
  for (let i = 0; i < 8; i++) await nextFrame(page);
  const h5 = await page.evaluate(READ);
  L.say(`重装备+重烘后=${h5}`);

  process.exit(L.exitCode());
} finally {
  await browser.close();
}
