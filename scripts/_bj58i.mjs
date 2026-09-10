/**
 * SW-BJ58 探针 I：像素归宿三角定位。
 * 在行显形帧:对所有可达画布(可见画布/worldCanvas/全部 DOM canvas/光照掩码)
 * 读 row 盒像素,判精灵像素落在哪张画布 → 收窄注入通道。
 * 辅:页 cell (129,19) 像素导出(判橙斑=铜矿红鲱鱼 or 真精灵)。
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
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 60, { clearEnemies: true });
  await nextFrame(page);

  const dump = await page.evaluate(() => {
    const g = window.__swGame;
    const read = (cv, x, y, w, h) => {
      try {
        const c2 = document.createElement('canvas');
        c2.width = w; c2.height = h;
        const cx = c2.getContext('2d', { willReadFrequently: true });
        cx.drawImage(cv, x, y, w, h, 0, 0, w, h);
        const d = cx.getImageData(0, 0, w, h).data;
        let hit = 0, nonBg = 0;
        for (let i = 0; i < d.length; i += 4) {
          if ((d[i] > 200 && d[i + 1] < 130) || (d[i] > 200 && d[i + 1] > 190 && d[i + 2] < 170)) hit++;
          if (d[i + 3] > 0) nonBg++;
        }
        return { hit, nonBg };
      } catch (e) { return { err: String(e).slice(0, 60) }; }
    };
    const out = { canvases: [], reads: [] };
    const seen = new Set();
    const consider = (cv, tag) => {
      if (!cv || seen.has(cv)) return;
      seen.add(cv);
      out.canvases.push({ tag, w: cv.width, h: cv.height, id: cv.id ?? '' });
      out.reads.push({ tag, ...read(cv, 660, 370, 320, 60) });
      // 精灵逐点(精灵1 @screen(705,403))
      out.reads[out.reads.length - 1].px = read(cv, 700, 398, 14, 12);
    };
    consider(g.renderer.canvas, 'renderer.canvas(可见)');
    consider(g.renderer.worldCanvas, 'renderer.worldCanvas');
    consider(g.renderer.lightMaskCanvas, 'renderer.lightMaskCanvas');
    document.querySelectorAll('canvas').forEach((cv, i) => consider(cv, `dom[${i}]`));
    // 私有字段兜底
    for (const k of Object.keys(g.renderer)) {
      const v = g.renderer[k];
      if (v && typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement) consider(v, `renderer.${k}`);
    }
    // chunk 页 (129,19) cell 导出
    try {
      const pair = g.chunks.chunks.get(g.chunks.constructor.key ? g.chunks.constructor.key(129, 19) : 1245313);
      if (pair) {
        const c2 = document.createElement('canvas');
        c2.width = 256; c2.height = 256;
        const cx = c2.getContext('2d', { willReadFrequently: true });
        cx.drawImage(pair.tile, pair.sx, pair.sy, 256, 256, 0, 0, 256, 256);
        out.cell129_19 = c2.toDataURL('image/png');
        const cx2 = pair.wall ? document.createElement('canvas') : null;
      }
    } catch (e) { out.cellErr = String(e).slice(0, 80); }
    return out;
  });
  writeFileSync(`${OUT}/pixtri.json`, JSON.stringify(dump, null, 1));
  for (const r of dump.reads) L.say(`${r.tag}: rowBox=${JSON.stringify(r.hit ?? r.err)} spritePx=${JSON.stringify(r.px ?? '')}`);
  if (dump.cell129_19) {
    writeFileSync(`${OUT}/cell-129-19.png`, Buffer.from(String(dump.cell129_19).split(',')[1], 'base64'));
    L.say('cell(129,19) 导出 cell-129-19.png');
  }
  process.exit(L.exitCode());
} finally {
  await browser.close();
}
