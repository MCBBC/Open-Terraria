// ★BJ664 定谳探针：水晶球 125/战争桌 464/蛋糕 621/附魔台 354 右键音效实证。
// 铺 tile → hook Sfx 三播口 → rightClickTileNpcDispatch 实拍 → 记录音效/旗/buff。
// SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=300000 scripts/_bj664-crystalball-sfx.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5202';
const OUT = '/tmp/bj664-out';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.mouse.click(640, 400).catch(() => {});
await new Promise((r) => setTimeout(r, 800));

const t0 = Date.now();
await page.evaluate(() => {
  void window.__swFlow.createWorldProbe({ seed: 'celebrationmk10', size: 0, name: 'bj664', difficulty: 0, evil: 0 })?.catch?.(() => {});
});
await page.waitForFunction(() => !!globalThis.__swGame?.world, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1000));

const report = await page.evaluate(async () => {
  const g = globalThis.__swGame;
  const log = [];
  // hook 三播口 + buff 面板
  const sp = g.sfx.play.bind(g.sfx);
  g.sfx.play = (n, ...a) => { log.push({ kind: 'play', name: n, vol: a[0] }); return sp(n, ...a); };
  const pf = g.playSfxFile.bind(g);
  g.playSfxFile = (n, ...a) => { log.push({ kind: 'file', name: n }); return pf(n, ...a); };
  const pfs = g.playSfxFiles.bind(g);
  g.playSfxFiles = (n, ...a) => { log.push({ kind: 'files', name: JSON.stringify(n) }); return pfs(n, ...a); };
  const origOpen = g.cb.onCraftingStationOpen;
  let craftOpened = 0;
  g.cb.onCraftingStationOpen = (...a) => { craftOpened++; log.push({ kind: 'craft', filter: JSON.stringify(a[0]) }); return origOpen?.(...a); };

  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const Cases = [
    ['crystal_ball', 'v_125_crystal_ball'],
    ['war_table', 'v_464_war_table'],
    ['slice_of_cake', 'v_621_slice_of_cake'],
    ['bewitching_table', 'v_354_bewitching_table'],
    ['sharpening_station', 'v_377_sharpening_station'],
  ];
  const results = {};
  const baseX = Math.floor(g.player.x / 16);
  const baseY = Math.floor(g.player.y / 16);
  let slot = 0;
  for (const [label, key] of Cases) {
    const tid = TILE_BY_KEY[key];
    if (tid === undefined) { results[label] = { error: `TILE_BY_KEY missing ${key}` }; continue; }
    // 每案独立列（间隔 6 格防邻臂互扰）；水晶球 2×2 frameX 0/18
    const px = baseX + 3 + slot * 6;
    const py = baseY - 2;
    slot++;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      st.setTile(px + dx, py + dy, tid, dx ? 18 : 0, dy ? 18 : 0);
    }
    const before = { suppress: g.sfx.suppress, buffs: g.player.buffs.active.size };
    log.length = 0;
    g.tileInteractHappened = false;
    g.input.rightDown = true;
    g['rightClickTileNpcDispatch'](px, py, null);
    g.input.rightDown = false;
    await new Promise((r) => setTimeout(r, 120));
    results[label] = {
      tileId: tid, placed: st.get(px, py) === tid,
      before, after: { buffs: g.player.buffs.active.size, flags: [...g.player.buffs.active] },
      log: [...log], craftOpened,
      rightDownConsumed: !g.input.rightDown,
      tileInteractHappened: g.tileInteractHappened,
    };
  }
  // 音频门状态
  results._audio = { suppress: g.sfx.suppress, ctx: g.sfx.ensure?.()?.state ?? 'n/a' };
  return results;
});

writeFileSync(`${OUT}/report.json`, JSON.stringify({ report, errors }, null, 2));
console.log('BJ664_REPORT', JSON.stringify(report, null, 1).slice(0, 4000));
console.log('PAGE_ERRORS', JSON.stringify(errors));
await browser.close();
