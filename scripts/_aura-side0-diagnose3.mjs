// side=0 三诊：复现失败放置 + 逐语句重放 sInit 成功路径（找出抛点/分歧点）
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const WLD = process.env.WLD_PATH || needInput(join(DOWNLOADS, '十周年纪念种子(1).wld'));
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push((e && e.stack ? e.stack : String(e)).slice(0, 300)));
await bootstrap(page, ORIGIN + '/?cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });

const wldB64 = readFileSync(WLD).toString('base64');
await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const { parseWldToSave } = await import('/src/wld/WldImport.ts?t=' + Date.now());
  const res = parseWldToSave(u8);
  const { loadSaveData } = await import('/src/save/SaveFile.ts?t=' + Date.now());
  const { world, player } = loadSaveData(res.save);
  const g = window.__swGame;
  g.world = world;
  Object.assign(g.player, player);
  world.explored?.fill?.(1); world.exploredVersion++;
}, wldB64);
await pump(page, 30, { step: 10 });

// 锁相机到目标（先停掉 lerp 漂移：放置前反复钉相机）
const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const ux = Math.floor(52782 / 16), uy = Math.floor(4603 / 16);
  let gx = ux, groundY = -1;
  for (let dx = 0; dx < 150 && groundY < 0; dx++) {
    for (const x of [ux + dx, ux - dx]) {
      for (let y = uy - 20; y < uy + 120; y++) {
        if (st.inBounds(x, y) && y >= 0 && st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2)
          && !st.isSolid(x, y - 3) && !st.isSolid(x + 3, y - 1) && !st.isSolid(x - 3, y - 1)) {
          gx = x; groundY = y; break;
        }
      }
      if (groundY >= 0) break;
    }
  }
  const cxw = gx * 16 + 8, cyw = groundY * 16;
  g.player.x = cxw - 90; g.player.y = cyw - 60;
  for (let i = 0; i < 5; i++) { g.camera.x = cxw - 400; g.camera.y = cyw - 300; }
  return { gx, groundY, cxw, cyw };
});
await pump(page, 10, { step: 10 });   // 让相机 lerp 收敛

// 放置（aim 重算于收敛后相机）
const hold = await page.evaluate(({ cxw, cyw }) => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(3831);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
  const scr = g.camera.worldToScreen(cxw, cyw - 8);
  g.input.mouseX = Array.isArray(scr) ? scr[0] : scr.x;
  g.input.mouseY = Array.isArray(scr) ? scr[1] : scr.y;
  return { mx: g.input.mouseX, my: g.input.mouseY, cam: [Math.round(g.camera.x), Math.round(g.camera.y)] };
}, spot);
console.log('hold:', JSON.stringify(hold));
await pump(page, 3, { step: 1 });
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });

await pump(page, 20, { step: 10 });
// 逐语句重放
const replay = await page.evaluate(async () => {
  const g = window.__swGame;
  const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690);
  if (!t) return { tower: null };
  const st = g.world.store;
  const TILE = 16;
  const tx = Math.floor(t.cx / TILE), ty = Math.floor(t.cy / TILE);
  const steps = {};
  try {
    let groundY = -1;
    for (let y = ty; y < Math.min(st.h, ty + 500); y++) {
      if (st.inBounds(tx, y) && st.isSolid(tx, y)) { groundY = y; break; }
    }
    steps.groundY = groundY;
    if (groundY < 0) return { steps, verdict: 'failure-path(y+=16)——但 y 未变?' };
    const { dd2SetFlags } = await import('/src/entities/MinionProj.ts?t=' + Date.now());
    const flags = dd2SetFlags(g.player);
    steps.monkT3 = !!flags.monkT3; steps.monkT2 = !!flags.monkT2;
    const fieldNum = flags.monkT3 ? 14 : 10, fieldNum5 = flags.monkT3 ? 8 : 4;
    let ceilY = -1;
    for (let y = groundY - 1; y >= groundY - fieldNum; y--) {
      if (y >= 0 && st.inBounds(tx, y) && st.isSolid(tx, y)) { ceilY = y; break; }
    }
    steps.ceilY = ceilY;
    const centerY = groundY * TILE, topY = ceilY * TILE;
    let side = centerY - topY;
    steps.rawSide = side;
    side = Math.max(fieldNum5 * 16, Math.min(fieldNum * 16, side));
    side *= 2;
    steps.finalSide = Math.min(999, side);
    steps.actual = { sInit: t.sInit, auraSide: t.auraSide, w: t.w, h: t.h, y: Math.round(t.y) };
    return { steps, verdict: steps.finalSide !== t.auraSide ? 'DIVERGED——重放与实体终态不一致' : 'match' };
  } catch (e) {
    steps.throw = String(e && e.stack ? e.stack : e).slice(0, 300);
    return { steps, verdict: 'THREW' };
  }
});
console.log('replay:', JSON.stringify(replay, null, 1));
console.log('errs:', JSON.stringify(errs.slice(0, 4)));
await browser.close();
