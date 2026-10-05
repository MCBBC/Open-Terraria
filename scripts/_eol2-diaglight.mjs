import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5218';
const page = await openPage(await launchBrowser({ headless: true }), {});
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail'); process.exit(1); }
await createGame(page, { mode: 'direct', seed: 'eolbright', size: 'small', pinRandom: 20261005, log: () => {} });
const out = await page.evaluate(async () => {
  const g = window.__swGame; const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const py0 = Math.min(st.h - 90, Math.floor(g.world.groundLevel) + 400);
  for (let dy = -8; dy <= 4; dy++) for (let dx = -19; dx <= 19; dx++) { st.setTile(px0 + dx, py0 + dy, 0); st.liquid[st.idx(px0 + dx, py0 + dy)] = 0; }
  for (let dy = -11; dy <= 7; dy++) for (let dx = -23; dx <= 23; dx++) {
    if (Math.abs(dx) >= 20 || dy <= -10 || dy >= 5) { st.setTile(px0 + dx, py0 + dy, 1); st.liquid[st.idx(px0 + dx, py0 + dy)] = 0; }
  }
  g.player.x = (px0 - 14) * 16; g.player.y = (py0 - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.paused = false;
  const readC = () => g.lighting.lightAt(px0 + 10, py0 - 4);
  for (let i = 0; i < 80; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; }
  const before = readC();
  const day = g.world.clock.isDay;
  await window.__swFlow.spawnVanillaEnemy(636, (px0 + 10) * 16, (py0 - 4) * 16);
  const marks = [];
  for (let t = 0; t < 6; t++) {
    for (let i = 0; i < 20; i++) { g.fixedUpdate(1 / 60); g.player.hp = g.player.maxHp; }
    const e = (g.entities.enemies || []).find((x) => x.vanillaId === 636);
    marks.push({
      t: (t + 1) * 20,
      count: (g.entities.enemies || []).filter((x) => x.vanillaId === 636).length,
      alive: e ? !e.dead : null,
      hp: e ? e.hp : null, ai0: e ? e.ai0 : null, ai3: e ? e.ai3 : null,
      spawnAlpha: e ? e.spawnAlpha : null,
      lightRGB: e ? e.lightRGB : null,
      lightAt: readC(),
      clock: g.world.clock.timeOfDay.toFixed(4),
    });
  }
  g.paused = true;
  return { before, day, marks };
});
console.log(JSON.stringify(out, null, 1));
await page.browser().close();
