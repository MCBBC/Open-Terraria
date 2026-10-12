// 闪电光环 side=0 诊断：用户世界 base 位点塔 sInit 失败根因（地面搜索轨迹）
// 运行: SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=600000 scripts/_aura-side0-diagnose.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const WLD = process.env.WLD_PATH || '/Users/vinlic/Downloads/十周年纪念种子(1).wld';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
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
await pump(page, 20, { step: 10 });

// base 位点放塔（同前）+ 全程塔状态轨迹
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
  g.camera.x = cxw - 400; g.camera.y = cyw - 300;
  return { gx, groundY, cxw, cyw, w: st.w, h: st.h };
});
console.log('spot:', JSON.stringify(spot));

const hold = await page.evaluate(({ cxw, cyw }) => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(3831);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
  const scr = g.camera.worldToScreen(cxw, cyw - 8);
  g.input.mouseX = Array.isArray(scr) ? scr[0] : scr.x;
  g.input.mouseY = Array.isArray(scr) ? scr[1] : scr.y;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  return { mx: g.input.mouseX, my: g.input.mouseY };
}, spot);
console.log('hold:', JSON.stringify(hold));
await pump(page, 3, { step: 1 });
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });

// 塔逐拍轨迹 + 地面搜索重放
for (let i = 0; i < 6; i++) {
  await pump(page, 10, { step: 10 });
  const c = await page.evaluate((i) => {
    const g = window.__swGame;
    const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690);
    if (!t) return { i, tower: null };
    const st = g.world.store;
    const tx = Math.floor(t.cx / 16), ty = Math.floor(t.cy / 16);
    // 重放 sInit 的地面搜索（同式）
    let groundY = -1, scanned = 0, firstSolid = null;
    for (let y = ty; y < Math.min(st.h, ty + 500); y++) {
      scanned++;
      if (st.inBounds(tx, y) && st.isSolid(tx, y)) { groundY = y; firstSolid = st.type[st.idx(tx, y)]; break; }
    }
    let ceilY = -1;
    if (groundY >= 0) {
      for (let y = groundY - 1; y >= groundY - 14; y--) {
        if (y >= 0 && st.inBounds(tx, y) && st.isSolid(tx, y)) { ceilY = y; break; }
      }
    }
    return { i, tower: { x: Math.round(t.x), y: Math.round(t.y), cx: Math.round(t.cx), cy: Math.round(t.cy),
      w: t.w, h: t.h, sInit: t.sInit, auraSide: t.auraSide, auraCy: t.auraCy, dead: !!t.dead },
      tx, ty, groundSearch: { groundY, scanned, firstSolid, ceilY,
        tileAtTower: st.inBounds(tx, ty) ? st.type[st.idx(tx, ty)] : 'oob',
        solidAtTower: st.inBounds(tx, ty) ? st.isSolid(tx, ty) : 'oob' } };
  }, i);
  console.log('trace:', JSON.stringify(c));
}
await page.screenshot({ path: '/tmp/aura-side0.png' });
await browser.close();
