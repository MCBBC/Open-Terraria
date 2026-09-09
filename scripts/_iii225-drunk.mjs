// IIII225 探针 B（drunk 运行时机制）：
//   ①地牢 Zone 深度下限（SceneMetrics.cs:688-691）——drunk 世界 num=max(worldSurface,
//     dungeonY+40)：同格砖墙条件在下限之上不判地牢、之下判地牢；非 drunk 世界无此抬升。
//   ②world.dungeonY/worldSurface 读数 + drunk 旗在位。
//   ③黑史莱姆光/其它=已收面不重复。菜单音乐 60/70/72/75/86 覆写=mainFlow 闭包内
//     latch+selector（Audio 'sel' 事件流探针不可达）——以代码审阅+单测逻辑覆盖登记。
// 用法:SW_ORIGIN=http://localhost:5281 node tools/run-diag.mjs scripts/_iii225-drunk.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('05162020', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const R = [];
  const chk = (name, ok, extra = '') => { R.push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); return ok; };
  const { scanScene } = await import('/src/world/SceneMetrics.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');

  const sf = w.seedFlags ?? {};
  chk('B0 drunk 世界旗在位（05162020）', sf.drunkWorld === true, `crimson=${w.crimson}`);
  chk('B0 dungeonY 读数合理（0<dungeonY<h）', w.dungeonY > 0 && w.dungeonY < w.store.h, `dungeonY=${w.dungeonY} h=${w.store.h}`);

  // 判别带 = (worldSurface, dungeonY+40)：drunk 抬升把该带挤出 ZoneDungeon；
  // 非 drunk（floor=worldSurface）该带照判。带内铺 30×20 蓝砖+墙 7。
  const floor = Math.max(w.groundLevel, w.dungeonY + 40);
  const bandY = Math.floor((w.groundLevel + floor) / 2);
  const brick = TILE_BY_KEY['v_41_blue_brick'];
  for (let y = bandY - 10; y < bandY + 10; y++) {
    for (let x = 40; x < 70; x++) { w.store.setTileSilent(x, y, brick, 0, 0); w.store.setWallSilent(x, y, 7); }
  }
  const bandDrunk = scanScene(w, 55 * 16, bandY * 16, 0);
  chk('B1 drunk：判别带（worldSurface<Y<dungeonY+40）不判 zoneDungeon（抬升生效）',
    bandDrunk.zoneDungeon === false,
    `bandY=${bandY} worldSurface=${w.groundLevel} dungeonY+40=${w.dungeonY + 40}`);
  // 非 drunk 对照：临时闭旗 → 同点位照判 true（旗驱确认）
  sf.drunkWorld = false;
  const bandVanilla = scanScene(w, 55 * 16, bandY * 16, 0);
  sf.drunkWorld = true;
  chk('B2 闭 drunk 旗：同带内点位 zoneDungeon=true（深度门回到 worldSurface）',
    bandVanilla.zoneDungeon === true);
  // 深层：dungeonY+40 之下两旗照判 true（drunk 只抬上限不下探）
  const deepY = floor + 15;
  for (let y = deepY - 10; y < deepY + 10; y++) {
    for (let x = 40; x < 70; x++) { w.store.setTileSilent(x, y, brick, 0, 0); w.store.setWallSilent(x, y, 7); }
  }
  const deepDrunk = scanScene(w, 55 * 16, deepY * 16, 0);
  chk('B3 drunk 下限之下：zoneDungeon=true', deepDrunk.zoneDungeon === true,
    `deepY=${deepY} floor=${floor}`);
  return R;
});

console.log(out.join('\n'));
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 6).join('\n'));
const fails = out.filter((l) => l.startsWith('FAIL'));
console.log(fails.length ? `RESULT: ${fails.length} FAIL` : 'RESULT: ALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
