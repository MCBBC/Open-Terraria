// BJ648 辅助:时钟钉住有效性 + 旗区/露天格 lightAt 对照
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, nextFrame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const WLD = needInput(join(DOWNLOADS, '十周年纪念种子(2).wld'));
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const b64 = readFileSync(WLD).toString('base64');
await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  await window.__swFlow.importWld(u8);
}, b64);
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!(window.__swGame?.world?.store?.type?.length > 1000000 && window.__swGame.entities?.npcs?.some((n) => n.npcKey === 'witch_doctor' && n.home))).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), 2500);
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const res = { npcHome: n?.home, tod0: g.world.clock.timeOfDay };
  g.world.clock.timeOfDay = 0.02;   // 深夜直设(v18 习语)
  await new Promise((r) => setTimeout(r, 1500));
  res.tod1 = g.world.clock.timeOfDay;
  const hx = n.home.x, cy = 276;
  res.lightBanner = g.renderer.lighting?.lightAt(hx, cy) ?? null;
  res.lightSky = g.renderer.lighting?.lightAt(hx, 40) ?? null;      // 高空露天
  res.lightSurface = g.renderer.lighting?.lightAt(hx, 200) ?? null; // 地表露天?
  // 找地表实心行
  let sy = null;
  for (let y = 60; y < 400; y++) { if (g.world.store.isSolid(hx, y)) { sy = y; break; } }
  res.surfaceSolidY = sy;
  if (sy !== null) res.lightAboveSurface = g.renderer.lighting?.lightAt(hx, sy - 3) ?? null;
  res.gameTime = g.world.clock.time;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
