import { launchBrowser, openPage, bootstrap, createGame, godMode,
  freezeClock, saveCanvasShot, spawnTownNPC } from '/Users/vinlic/Project/GLM/SandboxWorld/game/tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await godMode(page, true);
const scene = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS, WALL_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const s2 = new Map(), w2 = new Map();
  TILE_DEFS.forEach((d, i) => { if (d?.vanilla && !s2.has(d.vanilla.sheet)) s2.set(d.vanilla.sheet, i); });
  WALL_DEFS.forEach((d, i) => { if (d?.vanilla && !w2.has(d.vanilla.sheet)) w2.set(d.vanilla.sheet, i); });
  const sx = Math.floor(g.player.cx / 16), sy = Math.floor(g.player.cy / 16);
  const wood = s2.get(30), torch = s2.get(4);
  for (let x = sx - 11; x <= sx + 11; x++) {
    for (let y = sy - 9; y <= sy + 3; y++) { const i = st.idx(x, y); st.setTile(x, y, 0, 0, 0); st.liquid[i] = 0; st.setWall(x, y, w2.has(4) ? w2.get(4) : 4); }
    st.setTile(x, sy - 9, wood, 0, 0); st.setTile(x, sy + 3, wood, 0, 0);
  }
  for (let y = sy - 8; y <= sy + 2; y++) { st.setTile(sx - 11, y, wood, 0, 0); st.setTile(sx + 11, y, wood, 0, 0); }
  st.setTile(sx + 7, sy + 2, torch, 0, 0);
  g.player.x = sx * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = sx * 16; g.camera.y = sy * 16;
  return { sx, sy };
});
await spawnTownNPC(page, 'guide', { tx: scene.sx, ty: scene.sy + 2, home: { x: scene.sx, y: scene.sy + 2 } });
await page.evaluate((s) => {
  const g = window.__swGame;
  window.__keep = setInterval(() => {
    const n = g.entities.npcs.find((x) => x.npcKey === 'guide');
    if (n && !n.home) n.home = { x: s.sx, y: s.sy + 2 };
  }, 200);
}, scene);
for (const tod of [0.5, 0.6667, 0.8125, 0.0]) {
  await freezeClock(page, { tod });
  await new Promise((r) => setTimeout(r, 1300));
  const s = await page.evaluate(async (sceneIn) => {
    const g = window.__swGame, r = g.renderer;
    const { findBannerAnchorY, houseBannerLightRow } = await import(`/src/world/Housing.ts?t=${Date.now()}`);
    const n = g.entities.npcs.find((x) => x.npcKey === 'guide');
    if (n && !n.home) n.home = { x: sceneIn.sx, y: sceneIn.sy + 2 };
    const anchor = findBannerAnchorY(g.world.store, n.home.x, n.home.y);
    const ltSolid = r.lighting?.lightAt(n.home.x, anchor) ?? null;
    const ltAir = r.lighting?.lightAt(n.home.x, houseBannerLightRow(anchor)) ?? null;
    let px = null;
    const cam = g.camera;
    const [scx, scy] = cam.worldToScreen(n.home.x * 16 + 8, (anchor + 1) * 16 + 18);
    const cv = r.glCanvasEl ?? r.swPipe?.canvas ?? r.canvas;
    if (cv?.width) {
      const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
      const ctx = c2.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(cv, 0, 0);
      const im = ctx.getImageData(Math.max(0, Math.round(scx) - 16), Math.max(0, Math.round(scy) - 20), 33, 41);
      let rs = 0, gs = 0, bs = 0, cnt = 0, w = 0;
      for (let k = 0; k < im.data.length; k += 4) { rs += im.data[k]; gs += im.data[k + 1]; bs += im.data[k + 2]; cnt++;
        if (im.data[k] >= 225 && im.data[k + 1] >= 225 && im.data[k + 2] >= 225) w++; }
      px = { mean: [Math.round(rs / cnt), Math.round(gs / cnt), Math.round(bs / cnt)], white: +(w / cnt).toFixed(3) };
    }
    return { ltSolid, ltAir, px };
  }, scene);
  await saveCanvasShot(page, `/tmp/flagnight-fix-t${String(tod).replace('.', '_')}.png`);
  console.log('TOD', tod, JSON.stringify(s));
}
await page.evaluate(() => clearInterval(window.__keep));
await browser.close();
