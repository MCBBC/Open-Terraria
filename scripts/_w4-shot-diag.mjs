#!/usr/bin/env node
// ★W4 截帧路径判别:A 静置对照帧 vs 滑行帧——区分「捕获路径伪黑」与「渲染真实黑」。
import {
  launchBrowser, openPage, bootstrap, createGame, pumpInline, camSnapTo,
  resolveShotPath, freezeClock, front,
} from '../tools/probe/lib/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = process.env.W4_OUT || 'docs/evidence/w4';
function saveDataURL(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));
  return path;
}

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
await freezeClock(page, { tod: 0.5 });
await pumpInline(page, 12);
const spawn = await page.evaluate(() => [window.__swGame.player.cx, window.__swGame.player.cy]);
await camSnapTo(page, spawn[0], spawn[1]);
await pumpInline(page, 10);

// ① 对照帧:A 静置(正常游玩态)——预期亮
const ctrl = await page.evaluate(() => {
  const g = window.__swGame;
  g.render();
  const cv = g.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  const li = g.lighting;
  return {
    data: cv.toDataURL('image/png'),
    region: [li.rx, li.ry, li.rw, li.rh],
    sample: li.lightAt(Math.floor(g.camera.x / 16), Math.floor(g.camera.y / 16)),
    baked: (() => { let n = 0; const c = g.chunks; const hw = g.camera.viewW / 2 / 16 / g.camera.zoom + 2; const cx0 = Math.floor(g.camera.x / 16 / 32) - 2, cx1 = cx0 + 5, cy0 = Math.floor(g.camera.y / 16 / 32) - 2, cy1 = cy0 + 5; for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const ch = c.chunks.get(cy * 100000 + cx) ?? c.chunks.get(cx + ',' + cy); if (ch && (ch.canvas || ch.bmp)) n++; } return n; })(),
  };
});
saveDataURL(resolveShotPath(OUT + '/w4-diag-control', OUT), ctrl.data);
console.log('[diag] 对照帧:', JSON.stringify({ ...ctrl, data: ctrl.data.length }));

// ② 滑行帧:瞬移+第 2 拍捕获
const lerp = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const oldX = p.cx, oldY = p.cy;
  p.x += 800; p.vx = 0; p.vy = 0;
  g.startCameraTransitionForPlayerTeleport(oldX, oldY);
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
  g.render();
  const cv = g.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  const li = g.lighting;
  return {
    data: cv.toDataURL('image/png'),
    region: [li.rx, li.ry, li.rw, li.rh],
    sampleCenter: li.lightAt(Math.floor(g.camera.x / 16), Math.floor(g.camera.y / 16)),
    sampleEast: li.lightAt(Math.floor(g.camera.x / 16) + 40, Math.floor(g.camera.y / 16)),
    cam: [Math.round(g.camera.x), Math.round(g.camera.y)],
  };
});
saveDataURL(resolveShotPath(OUT + '/w4-diag-lerp', OUT), lerp.data);
console.log('[diag] 滑行帧:', JSON.stringify({ ...lerp, data: lerp.data.length }));

// ③ 渲染后异步 settle 再捕获(烘焙回应到达):再 render ×3 跨 2 个 evaluate
await page.evaluate(() => { const g = window.__swGame; for (let i = 0; i < 3; i++) g.render(); });
const late = await page.evaluate(() => {
  const g = window.__swGame;
  g.render();
  const cv = g.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
  return { data: cv.toDataURL('image/png'), cam: [Math.round(g.camera.x), Math.round(g.camera.y)] };
});
saveDataURL(resolveShotPath(OUT + '/w4-diag-lerp-late', OUT), late.data);
console.log('[diag] 滑行后期帧:', JSON.stringify({ ...late, data: late.data.length }));

await browser.close();
process.exit(0);
