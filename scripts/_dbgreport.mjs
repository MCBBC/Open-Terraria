// 一次性 E2E 探针：进世界 → F5 → 等 __swDebugReport → 断言全段（用后删，经 tools/run-diag.mjs 跑）
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 300)));

try {
  await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 1) 进世界：等 __swGame.player（世界生成最长 90s）
  const ready = await page.evaluate(() => new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.__swGame?.player) { clearInterval(iv); res(true); }
      else if (Date.now() - t0 > 90000) { clearInterval(iv); res(false); }
    }, 500);
  }), { timeout: 100000 });
  if (!ready) throw new Error('进世界超时：__swGame.player 未出现');
  console.log('world ready');

  // 等 main.ts 的 250ms 轮询置 inGame=true（keydown 门禁）+ FPS 攒 2 帧样本
  await new Promise((r) => setTimeout(r, 2000));

  // 2) 下载触发 stub：拦截 a[download] 点击计数
  await page.evaluate(() => {
    window.__dbgDownloads = 0;
    document.addEventListener('click', (e) => {
      const a = e.target;
      if (a && a.tagName === 'A' && a.download) window.__dbgDownloads++;
    }, true);
  });

  // 3) F5 触发
  await page.keyboard.press('F5');
  const got = await page.evaluate(() => new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.__swDebugReport) { clearInterval(iv); res(true); }
      else if (Date.now() - t0 > 15000) { clearInterval(iv); res(false); }
    }, 100);
  }), { timeout: 20000 });
  if (!got) throw new Error('F5 后 __swDebugReport 未出现');

  // 4) 断言全段
  const a = await page.evaluate(() => {
    const r = window.__swDebugReport;
    const nums = (x) => (typeof x === 'number' ? x : -1);
    return {
      schemaVersion: r.meta?.schemaVersion,
      fps: r.meta?.fps,
      generatedAt: r.meta?.generatedAt,
      errCount: (r.errors ?? []).length,
      mounts: r.instance?.gameMounts,
      worldName: r.world?.name,
      seed: r.world?.seed,
      wh: [r.world?.w, r.world?.h],
      clock: !!r.world?.clock,
      tilesTotal: r.tiles?.total,
      histTypeLen: (r.tiles?.histType ?? []).length,
      areaCam: r.tiles?.areaCamera ? [r.tiles.areaCamera.w, r.tiles.areaCamera.h] : null,
      areaPlayer: r.tiles?.areaPlayer ? [r.tiles.areaPlayer.w, r.tiles.areaPlayer.h] : null,
      cam: r.render?.camera ? [nums(r.render.camera.x), nums(r.render.camera.zoom)] : null,
      cc: r.render?.chunkCache ? [r.render.chunkCache.chunks, r.render.chunkCache.dirtyQueue, r.render.chunkCache.staleSentinels, r.render.chunkCache.maxChunks] : null,
      lighting: r.lighting ? [r.lighting.rx, r.lighting.rw, r.lighting.perFrameCount] : null,
      entCounts: r.entities?.counts,
      enemiesLen: (r.entities?.enemies ?? []).length,
      playerHp: r.player?.hp,
      systemsKeys: r.systems ? Object.keys(r.systems).sort() : [],
      hitTilesSize: r.systems?.hitTiles?.size,
      wiring: r.systems?.wiring ? [r.systems.wiring.mechActive, r.systems.wiring.teleportPairs.length] : null,
      perf: r.perf ? [r.perf.entitiesTotal, r.perf.hitTilesSize, r.perf.lightingPerFrame] : null,
      shotMain: r.shot ? (r.shot.main ? r.shot.main.length : null) : 'NO_SHOT',
      downloads: window.__dbgDownloads,
    };
  });
  console.log(JSON.stringify(a, null, 1));

  const fail = [];
  if (a.schemaVersion !== 1) fail.push('schemaVersion!=1');
  if (!(a.fps > 0)) fail.push('fps<=0 (got ' + a.fps + ')');
  if (!a.generatedAt) fail.push('no generatedAt');
  if (a.mounts < 1) fail.push('instance.gameMounts<1');
  if (!a.worldName || !a.seed) fail.push('world 段缺 name/seed');
  if (!a.clock) fail.push('world.clock 缺');
  if (!a.tilesTotal) fail.push('tiles.total 缺');
  if (a.histTypeLen < 1) fail.push('tiles.histType 空');
  if (!a.areaCam || !a.areaPlayer) fail.push('区域转储缺块');
  if (!a.cam) fail.push('render.camera 缺');
  if (!a.cc || a.cc[3] !== 384) fail.push('chunkCache 段异常 ' + JSON.stringify(a.cc));
  if (!a.lighting || a.lighting[1] <= 0) fail.push('lighting 段异常');
  if (!a.entCounts || a.entCounts.npcs < 1) fail.push('entities.counts.npcs<1（向导应在场）');
  if (!a.playerHp) fail.push('player.hp 缺');
  if (!a.systemsKeys.includes('mining') || !a.systemsKeys.includes('wiring')) fail.push('systems 段缺键');
  if (a.hitTilesSize === undefined) fail.push('hitTiles.size 缺');
  if (!a.wiring) fail.push('wiring 段缺');
  if (!a.perf) fail.push('perf 段缺');
  if (a.shotMain === 'NO_SHOT') fail.push('shot 段整体缺失');
  else if (a.shotMain === null) fail.push('shot.main=null（截图应可用）');
  if (a.downloads < 1) fail.push('下载未触发');

  if (fail.length) { console.log('ASSERT FAIL:', fail.join(' | ')); process.exit(3); }
  console.log('ALL ASSERTIONS PASSED');
} catch (e) {
  console.log('PROBE ERR:', String(e).slice(0, 300));
  process.exit(1);
} finally {
  await browser.close();
}
