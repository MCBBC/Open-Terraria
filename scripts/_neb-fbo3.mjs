// 星璇柱黑屏·FBO 全幅快照:world/lit/warped/bg 落 PNG 目检
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';
import fs from 'node:fs';

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

const b64s = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const pipe = r.swPipe;
  const gl = pipe?.gl;
  if (!gl) return { err: 'no pipe' };
  const W = pipe.canvas.width, H = pipe.canvas.height;
  const names = ['world', 'lit', 'warped', 'bg', 'sstarn'];
  const out = { camY: window.__swGame.camera.y, camX: window.__swGame.camera.x, py: window.__swGame.player.y, surf: window.__swGame.world.store.surfaceY, stack: pipe.screenStack.map((f) => f.name) };
  for (const name of names) {
    const fbo = pipe.fbos.get(name);
    if (!fbo) { out[name] = null; continue; }
    const w = fbo.w, h = fbo.h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // GL 行序(底→顶)翻转为图像行序(顶→底),落 2D canvas
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const rowBytes = w * 4;
    for (let y = 0; y < h; y++) {
      img.data.set(px.subarray((h - 1 - y) * rowBytes, (h - y) * rowBytes), y * rowBytes);
    }
    ctx.putImageData(img, 0, 0);
    // 半尺寸导出
    const t = document.createElement('canvas'); t.width = w / 2; t.height = h / 2;
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    out[name] = t.toDataURL('image/png');
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return out;
});
fs.mkdirSync('shots/c10e-trail', { recursive: true });
for (const k of ['world', 'lit', 'warped', 'bg', 'sstarn']) {
  const v = b64s[k];
  if (typeof v === 'string' && v.startsWith('data:image')) {
    fs.writeFileSync(`shots/c10e-trail/fbo-${k}.png`, Buffer.from(v.slice('data:image/png;base64,'.length), 'base64'));
  }
}
console.log('meta:', JSON.stringify({ camX: b64s.camX, camY: b64s.camY, py: b64s.py, surf: b64s.surf, stack: b64s.stack, err: b64s.err }));
console.log('saved');
process.exit(0);
