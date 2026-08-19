// 迷雾入场探针（用户报"刚进世界视野未开,要走动才更新"）——绕开被并行会话
// 挂死的 worldgen:页内合成小世界存档(buildSaveParts+serializeSave)走 loadJson
// 进世界。全程零输入静止 1.5s 采样,再程序移动采样对比。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (t.includes('fog') || t.includes('迷雾')) console.log('[console]', t.slice(0, 160)); });
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
console.log('[probe] synthesizing save (bypass worldgen)');
const r = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const W = 240, H = 160;
  const world = new World(W, H, 777, 'fog-entry-probe');
  world.spawnX = 120; world.spawnY = 80;
  world.groundLevel = 60; world.rockLevel = 100; world.lavaLine = 140;
  for (let x = 0; x < W; x++) for (let y = 85; y < H; y++) world.store.setTile(x, y, 1);
  const parts = sf.buildSaveParts(world);
  const json = sf.serializeSave(parts.view, parts.meta, parts.player, 0);
  await window.__swFlow.loadJson(json);
  const g = window.__swGame;
  if (!g) return { why: 'no game' };
  const sample = (tag) => {
    const rr = g.renderer, st = g.world.store;
    const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
    const fogP32 = rr.fogP32, fogW = rr.fogW;
    return {
      tag, tick: g.tickCount,
      ptx, pty, playerPx: [Math.round(g.player.x), Math.round(g.player.y)],
      exploredAtPlayer: g.world.explored[pty * st.w + ptx] ?? -1,
      fogPix: fogP32 ? fogP32[(pty >> 1) * fogW + (ptx >> 1)] : -1,
      fogVersion: rr.fogVersion, worldV: g.world.exploredVersion,
      rebuildRow: rr.fogRebuildRow, full: rr.fogFullRebuilds, incr: rr.fogIncrUpdates,
      mmPix: rr.minimap && rr.minimap.pix ? rr.minimap.pix.length : -1,
    };
  };
  // 静止等 1.6s（游戏自动 rAF+fixedUpdate，无任何输入）
  await new Promise((r2) => setTimeout(r2, 1600));
  const idle = sample('idle1.6s');
  // 再静止 1s（排除 15tick 未到的可能——早过了）
  await new Promise((r2) => setTimeout(r2, 1000));
  const idle2 = sample('idle2.6s');
  // 程序移动（模拟走动）
  g.player.x += 240;
  await new Promise((r2) => setTimeout(r2, 800));
  const moved = sample('moved0.8s');
  return { idle, idle2, moved };
});
console.log(JSON.stringify(r, null, 1));
console.log('判读: fogPix 0=已清雾/0xff080505=雾/-1=无缓冲; exploredAtPlayer 1=已标记');
await browser.close();
