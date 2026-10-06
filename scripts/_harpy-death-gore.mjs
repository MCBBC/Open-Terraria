// ★鸟妖死亡演出目击：逐杀 3 只,死亡瞬拍 3 连帧——验证 gore 碎块可见性
//   运行:SW_ORIGIN=http://localhost:5221 node tools/run-diag.mjs --timeout=200000 scripts/_harpy-death-gore.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5221';
const OUT = '/tmp/harpy-vanish';
fs.mkdirSync(OUT, { recursive: true });

const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: console.log });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'harpygun', size: 'small', pinRandom: 20261006, log: console.log });
console.log('createGame:', made?.ok);

await page.evaluate(() => {
  const g = window.__swGame;
  const gl = (g.world?.groundLevel ?? 300);
  const px = g.player.cx;
  g.player.x = px; g.player.y = (gl - 70) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = px; g.camera.y = (gl - 70) * 16;
});
await sleep(600);

// 生成 3 只,钉在屏中开阔天空(打掉 AI 追击:ai 清零+速度清零,静止悬停便于目击)
await page.evaluate(async () => {
  const g = window.__swGame;
  const px = g.player.cx, py = g.player.cy;
  for (let i = 0; i < 3; i++) {
    const e = await window.__swFlow.spawnVanillaEnemy(48, px - 120 + i * 120, py - 60);
    if (e?.id != null) {
      const en = (g.entities.enemies ?? []).find((x) => x.id === e.id);
      if (en) { en.ai0 = 0; en.ai1 = 0; en.vx = 0; en.vy = 0; }
    }
  }
});
await sleep(800);

// 静止钉帧(每 tick 清速度防飞走)
await page.evaluate(() => {
  globalThis.__pin = setInterval(() => {
    const g = window.__swGame;
    for (const e of (g.entities?.enemies ?? [])) {
      if (e?.vanillaId === 48 && !e.dead) { e.vx = 0; e.vy = 0; e.ai0 = 0; e.ai1 = 0; }
    }
  }, 30);
});

const { mouseHold } = await import('../tools/probe/lib/world.mjs');

for (let k = 0; k < 3; k++) {
  const info = await page.evaluate(() => {
    const g = window.__swGame;
    const e = (g.entities?.enemies ?? []).filter((x) => x?.vanillaId === 48 && !x.dead)[0];
    if (!e) return null;
    const scr = g.camera.worldToScreen(e.cx, e.cy).map(Math.round);
    return { id: e.id, scr, life: e.hp };
  });
  if (!info) { console.log('no harpy left'); break; }
  // 死亡前一帧
  const before = await page.screenshot({ type: 'png', clip: { x: Math.max(0, info.scr[0] - 80), y: Math.max(0, info.scr[1] - 80), width: 160, height: 160 } });
  fs.writeFileSync(`${OUT}/death-${k}-before.png`, before);
  // 击杀
  await page.evaluate(({ id }) => {
    const g = window.__swGame;
    const e = (g.entities?.enemies ?? []).find((x) => x?.id === id);
    if (e) e.hurt(99999, 2, -1, g, 0, false, 0, true);
  }, { id: info.id });
  // 死亡后 100ms/300ms/700ms 三连拍
  await sleep(100);
  const d1 = await page.screenshot({ type: 'png', clip: { x: Math.max(0, info.scr[0] - 80), y: Math.max(0, info.scr[1] - 80), width: 160, height: 160 } });
  fs.writeFileSync(`${OUT}/death-${k}-100ms.png`, d1);
  await sleep(200);
  const d2 = await page.screenshot({ type: 'png', clip: { x: Math.max(0, info.scr[0] - 80), y: Math.max(0, info.scr[1] - 80), width: 160, height: 160 } });
  fs.writeFileSync(`${OUT}/death-${k}-300ms.png`, d2);
  await sleep(400);
  const d3 = await page.screenshot({ type: 'png', clip: { x: Math.max(0, info.scr[0] - 80), y: Math.max(0, info.scr[1] - 80), width: 160, height: 160 } });
  fs.writeFileSync(`${OUT}/death-${k}-700ms.png`, d3);
  console.log(`kill ${k}: id=${info.id} scr=[${info.scr}] shots saved`);
  await sleep(500);
}
await page.evaluate(() => { if (globalThis.__pin) clearInterval(globalThis.__pin); });
console.log('done:', OUT);
await page.browser().close();
