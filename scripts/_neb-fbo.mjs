// 星璇柱黑屏·屏栈 FBO 逐层 α 取证:读默认帧缓冲+屏栈每层 FBO 天空区像素 RGBA
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
  if (!pipe || !pipe.gl) return { err: 'no pipe' };
  const gl = pipe.gl;
  const W = pipe.canvas.width, H = pipe.canvas.height;
  // 采样点:天空区(0.5,0.08H)、山带(0.75,0.42H)、屏中心(0.5,0.5H)
  const pts = [[0.5, 0.08], [0.75, 0.42], [0.5, 0.5]];
  const readAt = (fb, xf, yf) => {
    const x = Math.round(W * xf), yDev = Math.round(H * (1 - yf));   // GL 设备坐标 y 向上
    const px = new Uint8Array(4);
    if (fb) { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.readPixels(x, yDev, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [px[0], px[1], px[2], px[3]];
  };
  const out = { W, H, stack: pipe.screenStack.map((f) => f.name), layers: {} };
  // 默认帧缓冲(呈现面)
  out.default = pts.map(([xf, yf]) => `${xf},${yf}:rgba(${readAt(null, xf, yf).join(',')})`);
  // 每层栈 FBO
  for (const f of pipe.screenStack) {
    try {
      const fb = gl.getFramebuffer ? null : null;
      // PipelineFbo 结构探查
      const fbo = f;
      let handle = null;
      for (const k of ['fbo', 'fb', 'framebuffer', 'handle']) if (fbo[k] instanceof WebGLFramebuffer) handle = fbo[k];
      out.layers[f.name] = {
        keys: Object.keys(fbo),
        size: fbo.w + 'x' + fbo.h,
        px: handle ? pts.map(([xf, yf]) => `${xf},${yf}:rgba(${readAt(handle, xf, yf).join(',')})`) : 'no-fbo-handle',
      };
    } catch (e) { out.layers[f.name] = 'ERR ' + e.message.slice(0, 80); }
  }
  // 恢复默认绑定
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  out.state = { f: !!r._c10eFrame, op: !!r.opresentUsed, merge: r.cloudMergeUsed, sfx: r.sfxPathUsed, cp: r._c10eComposited };
  return out;
});
console.log(JSON.stringify(rep, null, 1));
process.exit(0);
