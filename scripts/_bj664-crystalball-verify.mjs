// ★BJ664 终验探针②：修复后真机路径（右键→音名/坐标/buff/UI 面）。
// 单点序贯（铺→点→拆）规避 BJ664 探针①射程伪影（dx=9/15 超 tileRange 5）。
// SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=300000 scripts/_bj664-crystalball-verify.mjs
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
await page.evaluate(() => {
  void window.__swFlow.createWorldProbe({ seed: 'celebrationmk10', size: 0, name: 'bj664v', difficulty: 0, evil: 0 })?.catch?.(() => {});
});
await page.waitForFunction(() => !!globalThis.__swGame?.world, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1000));

const report = await page.evaluate(async () => {
  const g = globalThis.__swGame;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const Cases = [
    ['crystal_ball', 'v_125_crystal_ball', 'Item_4'],
    ['war_table', 'v_464_war_table', 'Item_4'],
    ['slice_of_cake', 'v_621_slice_of_cake', 'Item_2'],
    ['bewitching_table', 'v_354_bewitching_table', 'Item_4'],
  ];
  const results = {};
  const px = Math.floor(g.player.x / 16) + 3;      // 单点：玩家右 3 格（tileRange 5 内）
  const py = Math.floor(g.player.y / 16) - 2;
  for (const [label, key, wantWav] of Cases) {
    const tid = TILE_BY_KEY[key];
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) st.setTile(px + dx, py + dy, tid, dx ? 18 : 0, dy ? 18 : 0);
    const log = [];
    const sp = g.sfx.play.bind(g.sfx);
    g.sfx.play = (n, ...a) => { log.push({ kind: 'named', name: n }); return sp(n, ...a); };
    const pf = g.playSfxFile.bind(g);
    g.playSfxFile = (n, v, x, y) => { log.push({ kind: 'file', name: n, x, y }); return pf(n, v, x, y); };
    const buffsBefore = new Map(g.player.buffs.active);
    g.tileInteractHappened = false;
    g.input.rightDown = true;
    g['rightClickTileNpcDispatch'](px, py, null);
    g.input.rightDown = false;
    await new Promise((r) => setTimeout(r, 60));
    const buffsAfter = [...g.player.buffs.active.keys()];
    results[label] = {
      wantWav,
      log: [...log],
      playerPos: { cx: g.player.cx, cy: g.player.cy },
      buffsAdded: buffsAfter.filter((b) => !buffsBefore.has(b)),
      rightDownConsumed: !g.input.rightDown,
    };
    // 拆点防邻臂互扰
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) st.setTile(px + dx, py + dy, 0, 0, 0);
  }
  return results;
});

writeFileSync(`${OUT}/verify.json`, JSON.stringify({ report, errors }, null, 2));
console.log('BJ664_VERIFY', JSON.stringify(report));
console.log('PAGE_ERRORS', JSON.stringify(errors));
await browser.close();
