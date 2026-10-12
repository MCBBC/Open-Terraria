// 闪电光环 base 位点终诊：强制有效落位（重试 aim 偏移）+ 光照采样 + 昼/夜两态
// 运行: SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=600000 scripts/_aura-base-final.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const WLD = process.env.WLD_PATH || '/Users/vinlic/Downloads/十周年纪念种子(1).wld';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push((e && e.stack ? e.stack : String(e)).slice(0, 200)));
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
  return { gx, groundY, cxw, cyw };
});
console.log('spot:', JSON.stringify(spot));
await pump(page, 10, { step: 10 });   // 相机收敛

// 放塔（多 aim 偏移重试至 side>0；每次先清旧塔）
const placeResult = await page.evaluate(async ({ cxw, cyw }) => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(3831);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
  const tries = [];
  for (const off of [0, -24, 24, -48, 48, -16, 16]) {
    for (const t of g.entities.projectiles) if (t.projId >= 688 && t.projId <= 690) t.dead = true;
    const scr = g.camera.worldToScreen(cxw + off, cyw - 8);
    g.input.mouseX = Array.isArray(scr) ? scr[0] : scr.x;
    g.input.mouseY = Array.isArray(scr) ? scr[1] : scr.y;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    await new Promise((r) => setTimeout(r, 120));   // 3-4 帧
    g.input.mouseDown = false; g.input.mouseHeld = false;
    await new Promise((r) => setTimeout(r, 400));   // 20+ 帧 init
    const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
    tries.push({ off, side: t?.auraSide ?? 'none', cx: t ? Math.round(t.cx) : null, cy: t ? Math.round(t.cy) : null });
    if (t && (t.auraSide ?? 0) > 0) break;
  }
  return tries;
}, spot);
console.log('placeTries:', JSON.stringify(placeResult));

const towerState = await page.evaluate(() => {
  const g = window.__swGame;
  const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
  if (!t) return null;
  const st = g.world.store;
  const ltx = Math.floor(t.cx / 16), lty = Math.floor(t.cy / 16);
  const light = (dx, dy) => g.lighting?.lightAt?.(ltx + dx, lty + dy) ?? null;
  return { side: t.auraSide, cx: Math.round(t.cx), cy: Math.round(t.cy), y: Math.round(t.y),
    lightCenter: light(0, 0), lightAbove: light(0, -3), lightRimL: light(-Math.round(t.auraSide / 32), 0),
    lightRimR: light(Math.round(t.auraSide / 32), 0),
    tod: g.world.clock?.timeOfDay };
});
console.log('towerState(day-ish):', JSON.stringify(towerState));

// 相机钉塔（防 lerp 漂移——每段 pump 前重钉）
const pinCam = async () => {
  await page.evaluate(() => {
    const g = window.__swGame;
    const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
    if (t) { g.camera.x = t.cx - 400; g.camera.y = t.cy - 300; }
  });
};
// 玩家挪到塔边（相机自然收敛到塔区——防 clip 漂移）
await page.evaluate(() => {
  const g = window.__swGame;
  const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
  if (t) { g.player.x = t.cx - 40; g.player.y = t.cy - 50; }
});
await pump(page, 40, { step: 20 });   // 相机收敛到塔区

// 敌夹具 + 尘普查（当前钟面）
await page.evaluate(({ cxw, cyw }) => {
  const g = window.__swGame;
  g.spawnEnemy('zombie', cxw, cyw - 40);
}, spot);
await pinCam();
await pump(page, 60, { step: 20 });
await pinCam();
const dayC = await page.evaluate(() => {
  const g = window.__swGame;
  const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
  let d226 = 0;
  for (const d of (g.vanillaDust?.pool ?? [])) if (d.active && d.type === 226) d226++;
  const foes = (g.enemies?.() ?? []).filter((e) => !e.dead && e.maxHp > 5);
  return { d226, foes: foes.length, foeHp: foes[0] ? Math.round(foes[0].hp) : null,
    tod: g.world.clock?.timeOfDay, side: t?.auraSide };
});
console.log('censusDay:', JSON.stringify(dayC));
await page.screenshot({ path: '/tmp/aura-base-day.png' });
{ const t = await page.evaluate(() => {
    const g = window.__swGame;
    const t2 = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
    if (!t2) return null;
    const p1 = g.camera.worldToScreen(t2.cx - 60, t2.cy - 80);
    return { x: Array.isArray(p1) ? p1[0] : p1.x, y: Array.isArray(p1) ? p1[1] : p1.y };
  });
  if (t) await page.screenshot({ path: '/tmp/aura-base-day-zoom.png', clip: { x: Math.max(0, t.x), y: Math.max(0, t.y), width: 120, height: 160 } });
}

// 夜态（钟面钉午夜）
await freezeClock(page, { tod: 0.0 });
await pinCam();
await pump(page, 60, { step: 20 });
await pinCam();
const nightC = await page.evaluate(() => {
  const g = window.__swGame;
  const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
  let d226 = 0;
  for (const d of (g.vanillaDust?.pool ?? [])) if (d.active && d.type === 226) d226++;
  const ltx = t ? Math.floor(t.cx / 16) : 0, lty = t ? Math.floor(t.cy / 16) : 0;
  const foes = (g.enemies?.() ?? []).filter((e) => !e.dead && e.maxHp > 5);
  return { d226, foes: foes.length, foeHp: foes[0] ? Math.round(foes[0].hp) : null,
    lightCenter: (t && g.lighting?.lightAt) ? g.lighting.lightAt(ltx, lty) : null,
    lightRim: (t && g.lighting?.lightAt) ? g.lighting.lightAt(ltx + Math.round((t.auraSide ?? 128) / 32), lty) : null };
});
console.log('censusNight:', JSON.stringify(nightC));
await page.screenshot({ path: '/tmp/aura-base-night.png' });
{ const t = await page.evaluate(() => {
    const g = window.__swGame;
    const t2 = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
    if (!t2) return null;
    const p1 = g.camera.worldToScreen(t2.cx - 60, t2.cy - 80);
    return { x: Array.isArray(p1) ? p1[0] : p1.x, y: Array.isArray(p1) ? p1[1] : p1.y };
  });
  if (t) await page.screenshot({ path: '/tmp/aura-base-night-zoom.png', clip: { x: Math.max(0, t.x), y: Math.max(0, t.y), width: 120, height: 160 } });
}
console.log('errs:', JSON.stringify(errs.slice(0, 4)));
await browser.close();
