// 491 渲染缺失取证(2026-09-28):实体在否/atlas 可载否/相机锚口径/全画布留档。
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = join(process.env.SW_PROBE_OUT ?? '/tmp/probe-out', 'dutchman-frames');
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
await freezeClock(page, { tod: 0.5 });
await pump(page, 30);
const ppos = await page.evaluate(() => { const p = window.__swGame.player; return { x: p.cx, y: p.cy }; });
const sp = await spawnEnemy(page, 491, ppos.x - 430, ppos.y + 20);
await pump(page, 8);

const dbg = await page.evaluate(() => {
  const g = window.__swGame;
  const ship = (g.entities.enemies ?? []).find((e) => e.vanillaId === 491);
  const cannons = (g.entities.enemies ?? []).filter((e) => e.vanillaId === 492);
  const cam = g.camera, c = g.renderer.canvas;
  let atlasNpc491 = null, atlasNpc492 = null, atlasEx40 = null;
  try { const im = g.renderer.atlas.ensureVImage('vanilla/NPC_491.png'); atlasNpc491 = im ? { w: im.width, h: im.height } : null; } catch (e) { atlasNpc491 = 'ERR:' + e.message; }
  try { const im = g.renderer.atlas.ensureVImage('vanilla/NPC_492.png'); atlasNpc492 = im ? { w: im.width, h: im.height } : null; } catch (e) { atlasNpc492 = 'ERR:' + e.message; }
  try { const im = g.renderer.atlas.ensureVImage('vanilla/Extra_40.png'); atlasEx40 = im ? { w: im.width, h: im.height } : null; } catch (e) { atlasEx40 = 'ERR:' + e.message; }
  const shipState = ship ? {
    id: ship.id, dead: ship.dead, hp: ship.hp, spawnAlpha: ship.spawnAlpha,
    cx: ship.cx, cy: ship.cy, w: ship.w, h: ship.h, facing: ship.facing,
    hidden: ship.hidden, despawnTimer: ship.despawnTimer, vanilla: ship.vanilla ? { hide: ship.vanilla.hide, frames: ship.vanilla.frames } : null,
    bInit: ship.bInit, ai0: ship.ai0,
  } : null;
  // 相机锚口径:玩家屏幕坐标两算
  const kx = c.width / cam.viewW;
  const playerCenterCalc = { x: (g.player.cx - cam.x) * cam.zoom * kx + c.width / 2, y: (g.player.cy - cam.y) * cam.zoom * (c.height / cam.viewH) + c.height / 2 };
  const playerTLCalc = { x: (g.player.cx - cam.x) * cam.zoom * kx, y: (g.player.cy - cam.y) * cam.zoom * (c.height / cam.viewH) };
  return {
    enemies: (g.entities.enemies ?? []).length, shipState, cannons: cannons.length,
    canvas: { w: c.width, h: c.height }, cam: { x: cam.x, y: cam.y, zoom: cam.zoom, viewW: cam.viewW, viewH: cam.viewH },
    player: { cx: g.player.cx, cy: g.player.cy },
    atlasNpc491, atlasNpc492, atlasEx40,
    playerCenterCalc, playerTLCalc,
    drawCalls491: window.__ddDebugCalls ?? null,
  };
});
console.log(JSON.stringify(dbg, null, 1));

// 全画布截帧(找船)
const shot = await page.evaluate(() => {
  const c = window.__swGame.renderer.canvas;
  const s = document.createElement('canvas');
  s.width = c.width; s.height = c.height;
  s.getContext('2d').drawImage(c, 0, 0);
  return s.toDataURL('image/png');
});
writeFileSync(join(OUT, 'full-canvas.png'), Buffer.from(shot.split(',')[1], 'base64'));
console.log('full-canvas.png saved');
await browser.close();
process.exit(0);
