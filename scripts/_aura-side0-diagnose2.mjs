// side=0 二诊：失败塔位 (3301,307) 的搜索重放+carriedByBackpack+全错误栈
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const WLD = process.env.WLD_PATH || '/Users/vinlic/Downloads/十周年纪念种子(1).wld';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push((e && e.stack ? e.stack : String(e)).slice(0, 400)));
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
  return { gx, groundY, cxw, cyw };
});

const hold = await page.evaluate(({ cxw, cyw }) => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(3831);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
  const scr = g.camera.worldToScreen(cxw, cyw - 8);
  g.input.mouseX = Array.isArray(scr) ? scr[0] : scr.x;
  g.input.mouseY = Array.isArray(scr) ? scr[1] : scr.y;
  // 相机此刻实际位置（检查 camera lerp 是否会漂移 Aim）
  return { mx: g.input.mouseX, my: g.input.mouseY, cam: [g.camera.x, g.camera.y] };
}, spot);
console.log('hold:', JSON.stringify(hold));
await pump(page, 3, { step: 1 });
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });

await pump(page, 30, { step: 10 });
const diag = await page.evaluate(() => {
  const g = window.__swGame;
  const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690);
  if (!t) return { tower: null };
  const st = g.world.store;
  const tx = Math.floor(t.cx / 16), ty = Math.floor(t.cy / 16);
  const col = [];
  for (let y = ty - 2; y < ty + 12; y++) {
    col.push(st.inBounds(tx, y) ? `${y}:${st.type[st.idx(tx, y)]}${st.isSolid(tx, y) ? 'S' : 's'}` : `${y}:oob`);
  }
  // 500 格下搜
  let groundY = -1;
  for (let y = ty; y < Math.min(st.h, ty + 500); y++) {
    if (st.inBounds(tx, y) && st.isSolid(tx, y)) { groundY = y; break; }
  }
  return {
    tower: { cx: Math.round(t.cx), cy: Math.round(t.cy), x: Math.round(t.x), y: Math.round(t.y),
      w: t.w, h: t.h, sInit: t.sInit, auraSide: t.auraSide, dead: !!t.dead,
      carriedByBackpack: !!t.carriedByBackpack, sentry: !!t.sentry, projId: t.projId },
    tx, ty, groundY, column: col,
    playerAcc: (g.player.inv.armor ?? []).map((a) => a?.id ?? 0),
  };
});
console.log('diag:', JSON.stringify(diag));
console.log('errs:', JSON.stringify(errs.slice(0, 5), null, 1));
await browser.close();
