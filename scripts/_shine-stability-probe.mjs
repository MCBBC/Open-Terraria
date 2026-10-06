// ★digest 通道稳定性判别探针——装载即冻结+预热+digest(零挖掘),两跑对拍。
// 【用途】隔离「烘焙产物逐位复现」的环境输入:若零挖掘两跑 digest 不等,差异来自
//   装载期环境(atlas 晚到/帧计数依赖),与挖掘/池化/carry 无关。
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import {
  launchBrowser, openPage, bootstrap, waitForBridge, waitForGame,
  installPinnedRandom, front,
} from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5214';
const WORLD_JSON = process.env.SW_WORLD_JSON || '/Users/vinlic/Downloads/map-天真的钴最高点 (4).json';
const OUT = '/tmp/shine-debt';
const TAG = process.env.SW_TAG || 'stab';
mkdirSync(OUT, { recursive: true });
const worldText = readFileSync(WORLD_JSON, 'utf8');

const browser = await launchBrowser({ headed: true, viewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const errs = [];
try {
  const page = await openPage(browser, { errors: errs, maxErrors: 40 });
  installPinnedRandom(page, 118606602);
  await page.evaluateOnNewDocument(() => {
    let frozen = null;
    Object.defineProperty(window, '__swGame', {
      configurable: true,
      get() { return frozen; },
      set(v) { frozen = v; try { v.__simFrozen = true; v.fixedUpdate = () => {}; } catch { /* */ } },
    });
  });
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) process.exit(1);
  await front(page);
  await page.evaluate((text) => { void window.__swFlow.loadJson(text); }, worldText);
  const okGame = await waitForGame(page, { timeout: 240_000, log: (m) => console.log('  ' + m) });
  if (!okGame) process.exit(1);

  // 钉位到腐化带 + 预热 120 帧
  const setup = await page.evaluate(async () => {
    const g = window.__swGame;
    const m = await import('/src/render/TileShine.ts');
    g.player.debugGod = true;
    g.player.x = 1592 * 16 + 8;
    g.player.y = 744 * 16;
    g.player.vx = 0; g.player.vy = 0;
    if (g.camera) { g.camera.x = g.player.cx; g.camera.y = g.player.cy; }
    const tdefs = (await import('/src/data/tiles.ts')).TILE_DEFS;
    // 盒内动画格普查(TILE_ANIM_RATE 成员)——帧计数依赖候选
    const anim = await import('/src/render/TileAnim.ts');
    const st = g.world.store;
    const found = {};
    for (let y = 720; y < 768; y++) {
      for (let x = 1568; x < 1648; x++) {
        if (!st.hasTile(x, y)) continue;
        const sh = tdefs[st.type[st.idx(x, y)]]?.vanilla?.sheet;
        if (sh != null && anim.isDynamicAnimSheet(sh)) found[sh] = (found[sh] ?? 0) + 1;
      }
    }
    return { animCells: found, tick: anim.tileAnim.tick };
  });
  console.log('setup:', JSON.stringify(setup));
  await page.evaluate(() => new Promise((res) => {
    let k = 0;
    function tick() { if (++k >= 120) { res(null); return; } requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
  const out = await page.evaluate(async () => {
    const g = window.__swGame;
    const m = await import('/src/render/TileShine.ts');
    const anim = await import('/src/render/TileAnim.ts');
    // 相机 chunk ±2 环(与 _shine-debt-ab 盒同域)
    const bx = Math.floor(g.camera.x / 256), by = Math.floor(g.camera.y / 256);
    const digests = m.shineDebugChunkDigests(g.chunks, bx - 2, bx + 2, by - 2, by + 2);
    // 内容指纹快照(盒内容是否跨跑恒等)
    const fps = [];
    for (let cy = by - 2; cy <= by + 2; cy++) {
      for (let cx = bx - 2; cx <= bx + 2; cx++) {
        fps.push(m.shineFpPrefix(g.world, cx, cy, 16, 0, 0));
      }
    }
    return { digests, fps, tick: anim.tileAnim.tick, frames: m.shineStats.frames };
  });
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ setup, ...out }));
  console.log('digest rows:', out.digests.length, 'tick:', out.tick, 'frames:', out.frames);
  console.log('digest sums:', out.digests.map((d) => d.sum).join(','));
} finally {
  await browser.close().catch(() => {});
}
