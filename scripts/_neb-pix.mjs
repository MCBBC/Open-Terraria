// 星璇柱黑屏·像素取证:三画布多点采样 RGBA+α 覆盖率,判定「黑」宿主画布
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const FLAGS = process.env.SW_FLAGS || '';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/' + (FLAGS ? '?' + FLAGS + '&' : ''));
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await clockSet(page, 0.85);
await page.evaluate(() => { const b = window.__swGame.beat; if (b && !b.__capPin) { b.__capPin = 1; const o = b.observeVsync.bind(b); b.observeVsync = (n, c) => o(n, 120); } });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = g.world.spawnX * 16 + 400;
  g.player.y = ((g.world.store.surfaceY ?? 300) - 6) * 16;
  g.player.vy = 0;
  void g.__swFlow;
});
await page.evaluate(() => {
  const g = window.__swGame;
  const px = g.player.x, py = g.player.y;
  g.player.debugGod = true;
  g.player.statLife = g.player.statLifeMax2;
  window.__swFlow.spawnVanillaEnemy(507, px + 300, py - 100);
  for (const vid of [420, 421, 423]) window.__swFlow.spawnVanillaEnemy(vid, px + 150, py - 60);
  const iid = window.__swFlow.itemByVid(4956);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
});
await page.mouse.move(900, 300);
await page.mouse.down();
await page.keyboard.down('KeyW');

// 等 12s 进入稳定态(柱滤镜斜坡拉满/战斗展开)
await new Promise((r) => setTimeout(r, 12000));

const rep = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const gl = document.getElementById('sw-c10e-glcanvas');
  const cans = { sky: r.skyCanvas, gl, hud: r.canvas };
  const out = { state: {}, pixels: {}, coverage: {} };
  out.state = {
    f: !!r._c10eFrame, ih: !!r._c10eWorldToHud, cp: !!r._c10eComposited, fp: !!r._c10eFilterPending,
    merge: r.cloudMergeUsed, sfx: r.sfxPathUsed, op: !!r.opresentUsed, shown: !!r._glCanvasShown,
    lowK: r._worldLowK, k1: r.constructor.c10eK1, towOp: r._towerFilterOpacity,
    towFilters: (r.monoFilters.visibleFilters?.() ?? []).map((f) => f.def?.kind ?? f.kind),
    stack: r.swPipe ? r.swPipe.screenStack.map((x) => x.name).join('|') : '-',
    camY: window.__swGame.camera.y, viewH: r.canvas.height, viewW: r.canvas.width,
  };
  // 多点像素采样
  const pts = [[0.25, 0.08], [0.5, 0.08], [0.75, 0.08], [0.25, 0.35], [0.5, 0.42], [0.75, 0.42], [0.25, 0.55], [0.5, 0.65], [0.75, 0.80]];
  const scratch = document.createElement('canvas');
  scratch.width = 1; scratch.height = 1;
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  for (const [k, c] of Object.entries(cans)) {
    if (!c) { out.pixels[k] = null; continue; }
    out.pixels[k] = pts.map(([xf, yf]) => {
      try {
        const x = Math.round(c.width * xf), y = Math.round(c.height * yf);
        sctx.clearRect(0, 0, 1, 1);
        sctx.drawImage(c, x, y, 1, 1, 0, 0, 1, 1);
        const d = sctx.getImageData(0, 0, 1, 1).data;
        return `${xf},${yf}:rgb(${d[0]},${d[1]},${d[2]},a${d[3]})`;
      } catch (e) { return `${xf},${yf}:ERR`; }
    });
  }
  // 全幅覆盖率:不透明(α>250)占比 + 全黑不透明占比(HUD 是否黑盖)
  for (const [k, c] of Object.entries(cans)) {
    if (!c) { out.coverage[k] = null; continue; }
    try {
      const w = c.width, h = c.height;
      const step = 4;   // 1/16 采样
      const t = document.createElement('canvas'); t.width = w / step; t.height = h / step;
      const tc = t.getContext('2d', { willReadFrequently: true });
      tc.drawImage(c, 0, 0, w, h, 0, 0, w / step, h / step);
      const d = tc.getImageData(0, 0, w / step, h / step).data;
      let op = 0, blackOp = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        n++;
        if (d[i + 3] > 250) { op++; if (d[i] < 8 && d[i + 1] < 8 && d[i + 2] < 8) blackOp++; }
      }
      out.coverage[k] = `opaque${Math.round(op * 100 / n)}% blackOp${Math.round(blackOp * 100 / n)}%`;
    } catch (e) { out.coverage[k] = 'ERR ' + e.message.slice(0, 60); }
  }
  return out;
});
console.log(JSON.stringify(rep, null, 1));
await page.screenshot({ path: 'shots/c10e-trail/npx-ref.png' }).catch(() => {});
process.exit(0);
