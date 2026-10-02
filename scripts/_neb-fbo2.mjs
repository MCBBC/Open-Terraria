// 星璇柱黑屏·世界链逐级 α 取证:worldCanvas(2D)→FBO(world/lit/warped/opresent)→默认帧缓冲
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
await new Promise((r) => setTimeout(r, 12000));

const rep = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const pipe = r.swPipe;
  const gl = pipe?.gl;
  if (!gl) return { err: 'no pipe gl' };
  const W = pipe.canvas.width, H = pipe.canvas.height;
  const pts = [[0.5, 0.08], [0.75, 0.42], [0.5, 0.5], [0.5, 0.75]];
  const readGL = (fb, xf, yf) => {
    const x = Math.round(W * xf), yDev = Math.round(H * (1 - yf));
    const p = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.readPixels(x, yDev, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
    return [p[0], p[1], p[2], p[3]];
  };
  const out = { stack: pipe.screenStack.map((f) => f.name), gl: {}, ctx2d: {} };
  out.gl.default = pts.map(([xf, yf]) => `${xf},${yf}:rgba(${readGL(null, xf, yf).join(',')})`);
  // 管线全部 FBO 逐个读
  for (const [name, fbo] of pipe.fbos) {
    try { out.gl[name] = pts.map(([xf, yf]) => `${xf},${yf}:rgba(${readGL(fbo.fbo, xf, yf).join(',')})`); }
    catch (e) { out.gl[name] = 'ERR ' + e.message.slice(0, 60); }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // 2D 画布:worldCanvas/lightCanvas/skyCanvas
  const pts2d = (c) => pts.map(([xf, yf]) => {
    try {
      const t = document.createElement('canvas'); t.width = 1; t.height = 1;
      const tc = t.getContext('2d', { willReadFrequently: true });
      tc.drawImage(c, Math.round(c.width * xf), Math.round(c.height * yf), 1, 1, 0, 0, 1, 1);
      const d = tc.getImageData(0, 0, 1, 1).data;
      return `${xf},${yf}:rgba(${d[0]},${d[1]},${d[2]},${d[3]})`;
    } catch (e) { return 'ERR'; }
  });
  const wc = r.worldCanvas || r.getWorldCanvas?.();
  out.ctx2d.worldCanvas = wc ? { size: wc.width + 'x' + wc.height, px: pts2d(wc) } : 'no-worldCanvas-field';
  out.ctx2d.lightCanvas = pts2d(r.lightCanvas);
  out.ctx2d.skyCanvas = pts2d(r.skyCanvas);
  out.state = { f: r._c10eFrame, op: r.opresentUsed, merge: r.cloudMergeUsed, sfx: r.sfxPathUsed, lowK: r._worldLowK, shim: r.monoFilters.shimmerAlpha };
  return out;
});
console.log(JSON.stringify(rep, null, 1));
process.exit(0);
