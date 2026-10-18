import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { readFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const WLD = process.env.WLD_PATH || needInput(join(DOWNLOADS, '十周年纪念种子(1).wld'));
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
const wldB64 = readFileSync(WLD).toString('base64');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const { parseWldToSave } = await import('/src/wld/WldImport.ts?t=' + Date.now());
  const res = parseWldToSave(u8);
  const { loadSaveData } = await import('/src/save/SaveFile.ts?t=' + Date.now());
  const { world, player } = loadSaveData(res.save);
  const g = window.__swGame;
  g.world = world; Object.assign(g.player, player);
  world.explored?.fill?.(1); world.exploredVersion++;
}, wldB64);
await pump(page, 20, { step: 10 });
const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 放塔（直接构造,规避相机漂移——诊断用）
  const { MinionProj } = await import('/src/entities/MinionProj.ts?t=' + Date.now());
  const m = new MinionProj(51928, 4848, 690, 20, 0, true, 0, false, () => g.player);
  m.auraSide = 128; m.auraCy = 4912; m.w = 128; m.h = 128;
  m.x = 51928 - 64; m.y = 4912 - 64;
  g.entities.add(m, 'projectiles');
  g.player.x = 51928 - 40; g.player.y = 4860;
  await new Promise((r2) => setTimeout(r2, 1200));
  const t = g.entities.projectiles.find((e) => e.projId === 690);
  const band = t?.lightBand;
  const tx = Math.floor(t.cx / 16), ty = Math.floor(t.cy / 16);
  return {
    band, tx, ty,
    lightCenter: g.lighting?.lightAt?.(tx, ty),
    solidAtCenter: st.isSolid(tx, ty),
    tileAtCenter: st.type[st.idx(tx, ty)],
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
