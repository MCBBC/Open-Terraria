// BJ648 辅助:巫医房火把普查+深夜档光矩阵——定位 [253,240,202] 恒光的贡献源
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, nextFrame, clockSet } from '../tools/probe/lib/index.mjs';
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
  const st = g.world.store;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  const hx = n.home.x, hy = n.home.y;
  const torches = [];
  for (let y = hy - 30; y <= hy + 30; y++) for (let x = hx - 30; x <= hx + 30; x++) {
    const i = st.idx(x, y);
    if (st.type[i] === 4) torches.push([x, y]);
  }
  // 深夜档读光矩阵(hx±6 × 270..286)
  g.world.clock.timeOfDay = 0.02;
  await new Promise((r) => setTimeout(r, 2500));
  const lt = g.renderer.lighting;
  const mat = [];
  for (let y = 270; y <= 286; y++) {
    const row = [];
    for (let x = hx - 5; x <= hx + 5; x++) {
      const c = lt?.lightAt(x, y) ?? null;
      row.push(c ? c[0] : -1);
    }
    mat.push({ y, r: row.join(','), types: Array.from({ length: 11 }, (_, k) => st.type[st.idx(hx - 5 + k, y)]).join(',') });
  }
  // 昼档对照
  g.world.clock.timeOfDay = 0.5;
  await new Promise((r) => setTimeout(r, 2500));
  const matDay = [];
  for (let y = 270; y <= 286; y++) {
    const row = [];
    for (let x = hx - 5; x <= hx + 5; x++) {
      const c = lt?.lightAt(x, y) ?? null;
      row.push(c ? c[0] : -1);
    }
    matDay.push({ y, r: row.join(',') });
  }
  return { hx, hy, torches, mat, matDay };
});
console.log('torches:', JSON.stringify(out.torches));
console.log('midnight R matrix (hx-5..hx+5):');
for (const m of out.mat) console.log(`y=${m.y} types[${m.types}] light[${m.r}]`);
console.log('noon R matrix:');
for (const m of out.matDay) console.log(`y=${m.y} light[${m.r}]`);
await browser.close();
