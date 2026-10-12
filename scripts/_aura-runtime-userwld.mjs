// 闪电光环运行时复核③：用户 .wld 导入（无二次导航——同页 loadSaveData 换装）
// 运行: SW_ORIGIN=http://localhost:4173 node tools/run-diag.mjs --timeout=600000 scripts/_aura-runtime-userwld.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const WLD = process.env.WLD_PATH || '/Users/vinlic/Downloads/十周年纪念种子(1).wld';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e && e.stack ? e.stack.slice(0, 500) : String(e).slice(0, 200))));

await bootstrap(page, ORIGIN + '/?cloudcache=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
console.log('createGame:', !!gen?.ok);

const wldB64 = readFileSync(WLD).toString('base64');
console.log('wld KB:', (wldB64.length * 3 / 4 / 1024).toFixed(0));
const loadRes = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const t0 = Date.now();
  const { parseWldToSave } = await import('/src/wld/WldImport.ts?t=' + Date.now());
  const res = parseWldToSave(u8);
  const { loadSaveData } = await import('/src/save/SaveFile.ts?t=' + Date.now());
  const { world, player } = loadSaveData(res.save);
  const g = window.__swGame;
  g.world = world;
  Object.assign(g.player, player);
  world.explored?.fill?.(1); world.exploredVersion++;
  g.camera.x = g.player.cx - 400; g.camera.y = g.player.cy - 260;
  return { ok: true, ms: Date.now() - t0, warnings: res.warnings.slice(0, 3),
    px: Math.round(g.player.cx), py: Math.round(g.player.cy) };
}, wldB64);
console.log('loadB:', JSON.stringify(loadRes));
await pump(page, 30, { step: 10 });

// 用户世界内找平地（优先用户实报 camera 位点,debug report: 52782,4603 → tile 3298,287）
const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const ux = Math.floor(52782 / 16), uy = Math.floor(4603 / 16);
  const px = ux, py = uy;
  let gx = px, groundY = -1;
  for (let dx = 0; dx < 150 && groundY < 0; dx++) {
    for (const x of [px + dx, px - dx]) {
      for (let y = py - 20; y < py + 120; y++) {
        if (st.inBounds(x, y) && y >= 0 && st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2)
          && !st.isSolid(x, y - 3) && !st.isSolid(x + 3, y - 1) && !st.isSolid(x - 3, y - 1)) {
          gx = x; groundY = y; break;
        }
      }
      if (groundY >= 0) break;
    }
  }
  if (groundY < 0) return { why: 'no-ground', px, py };
  const cxw = gx * 16 + 8, cyw = groundY * 16;
  g.player.x = cxw - 90; g.player.y = cyw - 60;
  g.camera.x = cxw - 400; g.camera.y = cyw - 300;
  return { gx, groundY, cxw, cyw, tile: st.type[st.idx(gx, groundY)] };
});
console.log('spotB:', JSON.stringify(spot));
if (spot?.why) { await browser.close(); process.exit(2); }

// 放塔（真物品 3831）+ 装针
const holdB = await page.evaluate(({ cxw, cyw }) => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(3831);
  if (iid == null || iid < 0) return { why: 'no-item' };
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
  const scr = g.camera.worldToScreen(cxw, cyw - 8);
  g.input.mouseX = Array.isArray(scr) ? scr[0] : scr.x;
  g.input.mouseY = Array.isArray(scr) ? scr[1] : scr.y;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  return { vid: 3831, iid };
}, spot);
console.log('holdB:', JSON.stringify(holdB));
await pump(page, 6, { step: 2 });
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = 5; g.input.mouseY = 5;
  window.__probe = { dust8: 0 };
  const proto = CanvasRenderingContext2D.prototype;
  if (!window.__origDrawImage) {
    window.__origDrawImage = proto.drawImage;
    proto.drawImage = function (...a) {
      if ((a.length >= 5 && a[3] === 8 && a[4] === 8) || (a.length === 3 && a[1] === -4 && a[2] === -4)) window.__probe.dust8++;
      return window.__origDrawImage.apply(this, a);
    };
  }
});

for (let i = 0; i < 6; i++) {
  await page.evaluate(({ cxw, cyw, i }) => {
    const g = window.__swGame;
    g.spawnEnemy('zombie', cxw + (i % 2 ? 30 : -30), cyw - 40);
  }, { ...spot, i });
  await pump(page, 45, { step: 15 });
  const c = await page.evaluate((i) => {
    const g = window.__swGame;
    const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
    const pool = g.vanillaDust?.pool ?? [];
    let arc = 0, col = 0;
    if (t) {
      const cx = t.cx, cy = t.cy, arcR = (t.auraSide - 40) / 2;
      for (const d of pool) {
        if (!d.active || d.type !== 226) continue;
        const dist = Math.hypot(d.x - cx, d.y - cy);
        if (Math.abs(dist - arcR) < 30) arc++;
        else if (d.y > t.y + 30 && d.y < cy && Math.abs(d.x - cx) < 16) col++;
      }
    }
    const foes = (g.enemies?.() ?? []).filter((e) => !e.dead && e.maxHp > 5);
    return { i, towerAlive: !!t, side: t?.auraSide ?? 0, arc, col, dust8: window.__probe.dust8,
      towerXY: t ? [Math.round(t.cx), Math.round(t.cy), t.sInit, Math.round(t.y)] : null,
      foesAlive: foes.length, foeHp: foes[0] ? Math.round(foes[0].hp) : null };
  }, i);
  console.log('censusB:', JSON.stringify(c));
}

// 塔区域特写
const zc = await page.evaluate(() => {
  const g = window.__swGame;
  const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
  if (!t) return null;
  const side = Math.max(t.auraSide, 140);
  const p1 = g.camera.worldToScreen(t.cx - side / 2 - 10, t.cy - side / 2 - 10);
  const p2 = g.camera.worldToScreen(t.cx + side / 2 + 10, t.cy + side / 2 + 10);
  return { x1: Array.isArray(p1) ? p1[0] : p1.x, y1: Array.isArray(p1) ? p1[1] : p1.y,
    x2: Array.isArray(p2) ? p2[0] : p2.x, y2: Array.isArray(p2) ? p2[1] : p2.y };
});
if (zc) {
  const clip = { x: Math.max(0, zc.x1), y: Math.max(0, zc.y1),
    width: Math.min(1280, zc.x2 - zc.x1), height: Math.min(800, zc.y2 - zc.y1) };
  await page.screenshot({ path: '/tmp/aura-B-zoom.png', clip });
  await page.screenshot({ path: '/tmp/aura-B-full.png' });
}
console.log('errs:', JSON.stringify(errs.slice(0, 6)));
await browser.close();
