// ★翼染冻结·翼区隔离带 v2（2026-09-27）：全身矩形会被本体动画污染——本版只采
//  「翼外板带」(玩家背后侧 ±(28..88)px×翼锚上下 44px,本体 40px 宽不覆盖)+钉住
//  玩家 y;另挂 GLSpriteLayer.texFromRegion 上传计数(texId==翼槽画布)直接观测
//  shim 陈旧纹理。{翼染/素}×{缺省/noshim} 四腿。
//  运行: SW_ORIGIN=http://localhost:5228 node tools/run-diag.mjs --timeout=400000 scripts/_wing-dye-freeze2.mjs [leg]
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const ONLY = process.argv.slice(4).find((a) => !a.startsWith('--')) || '';
const LEGS = [
  { id: 'plain_default', mode: '', dye: false },
  { id: 'dye_default', mode: '', dye: true },
  { id: 'plain_noshim', mode: '?bglshim=0', dye: false },
  { id: 'dye_noshim', mode: '?bglshim=0', dye: true },
].filter((l) => !ONLY || l.id === ONLY);

const browser = await launchBrowser({});
const results = [];
for (const leg of LEGS) {
  const page = await openPage(browser, {});
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + String(e.message).slice(0, 140)));
  await bootstrap(page, ORIGIN + leg.mode);
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.player, { timeout: 120000 });
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; m.options.data.waveQuality = 0; m.options.data.renderScale = 1; }));

  const out = await page.evaluate(async (dyeOn) => {
    const g = window.__swGame;
    const p = g.player;
    const cam = g.camera;
    const r = g.renderer;
    const hash32 = (d) => { let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
    p.inv.armor[3] = { id: window.__swFlow.itemByVid(492), stack: 1 };
    if (dyeOn) p.inv.dye[3] = { id: window.__swFlow.itemByVid(1007), stack: 1 };
    let wingImg = null;
    for (let i = 0; i < 40 && !(wingImg && wingImg.width > 0); i++) {
      wingImg = r.atlas.ensureVImage('vanilla/Wings_1.png');
      if (!(wingImg && wingImg.width > 0)) await new Promise((res) => setTimeout(res, 50));
    }
    try {
      const w = g.world.weather;
      if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; }
    } catch { /* ignore */ }
    await new Promise((res) => setTimeout(res, 300));
    // shim 上传观测:包住 GLSpriteLayer.texFromRegion/texFromImage,凡源==翼槽画布记 upload
    const texIdMod = await import('/src/render/texId.ts');
    const scratch = r.wingTintScratch;
    const up = { regionCalls: 0, regionUploads: 0, hits: 0 };
    const wrap = (glw) => {
      if (!glw || glw.__wingWrapped) return;
      glw.__wingWrapped = true;
      const origR = glw.texFromRegion.bind(glw);
      glw.texFromRegion = function (key, img, sx, sy, sw, sh) {
        const isWing = img === scratch;
        if (isWing) up.regionCalls++;
        const e = origR(key, img, sx, sy, sw, sh);
        if (isWing && e) up.regionUploads++;
        return e;
      };
    };
    let glwSrc = r._accGlw;
    wrap(glwSrc);
    // _accGlw 帧级重建——每采样拍重试 wrap
    g.input.setVirtualAction('Jump', true);
    const lc = document.createElement('canvas');
    lc.width = 220; lc.height = 120;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    const samples = [];
    const t0 = performance.now();
    let holdY = null, holdX = null;
    while (performance.now() - t0 < 6000) {
      await new Promise((res) => requestAnimationFrame(res));
      if (!glwSrc || !glwSrc.__wingWrapped) { glwSrc = r._accGlw; wrap(glwSrc); }
      const flyingNow = !!p.inputJump && p.wingTime > 0 && p.jumpHold === 0 && p.vy !== 0;
      if (!flyingNow) continue;
      if (holdY === null) { holdY = p.y; holdX = p.x; }
      p.y = holdY; p.x = holdX; p.vy = -0.5;
      const z = cam.zoom || 1;
      // 翼外板带:背后侧水平 28..88px(局部),竖以脚底-21 为中心 44px——本体宽 ±20 不覆盖
      const feetY = p.y + p.h + (p.stepRenderY || 0);
      const cxW = p.cx - p.facing * 58;
      const [sx, sy] = cam.worldToScreen(cxW, feetY - 21);
      const w = Math.round(60 * z), h = Math.round(44 * z);
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.clearRect(0, 0, lc.width, lc.height);
      lx.drawImage(r.canvas, Math.round(sx - w / 2), Math.round(sy - h / 2), w, h, 0, 0, w, h);
      samples.push({ wf: p.wingFrame, hash: hash32(lx.getImageData(0, 0, w, h).data) });
    }
    g.input.setVirtualAction('Jump', false);
    let run = 1, best = 1;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].hash === samples[i - 1].hash) { run++; if (run > best) best = run; }
      else run = 1;
    }
    const entryIds = new Set();
    for (const cv of r.wingBakeCache.values()) {
      if (!cv.__id) cv.__id = Math.random().toString(36).slice(2, 8);
      entryIds.add(cv.__id);
    }
    return {
      samples: samples.length,
      wfDistinct: new Set(samples.map((s) => s.wf)).size,
      hashDistinct: new Set(samples.map((s) => s.hash)).size,
      maxSameHashRun: best,
      head: samples.slice(0, 10).map((s) => s.hash + ':' + s.wf),
      bakeCacheSize: r.wingBakeCache.size,
      entryDistinctCanvases: entryIds.size,
      scratchUploads: up,
      wrapped: !!(glwSrc && glwSrc.__wingWrapped),
    };
  }, leg.dye);
  results.push({ leg: leg.id, ...out, pageErrors: pageErrors.slice(0, 4) });
  console.error(`[done] ${leg.id}: hashDistinct=${out.hashDistinct} maxRun=${out.maxSameHashRun} uploads=${JSON.stringify(out.scratchUploads)} canvases=${out.entryDistinctCanvases}`);
  await page.close();
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
process.exit(0);
