// 砍树掉雕像排查探针：真实砍树链（tryMine+挥砍+摇树）连续砍树，
// 拦截全部 spawnDrop，统计 createTile=105（雕像族）泄漏。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
check('世界就绪', true);

// spawnDrop 全拦截
await page.evaluate(() => {
  const g = window.__swGame;
  window.__drops = [];
  const orig = g.spawnDrop.bind(g);
  g.spawnDrop = (...args) => {
    window.__drops.push(args);
    return orig(...args);
  };
});

// 砍 N 棵树（真实 tryMine + tick 推进）
const res = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  return import('/src/data/tiles.ts').then((tm) => {
    const T = tm.T;
    const trees = [];
    for (let x = 100; x < st.w - 100 && trees.length < 40; x++) {
      for (let y = 30; y < st.h - 200; y++) {
        if (st.type[st.idx(x, y)] === T.TREE) {
          let bottom = y; while (st.type[st.idx(x, bottom + 1)] === T.TREE) bottom++;
          trees.push({ x, y: bottom });
          break;
        }
      }
    }
    let chops = 0;
    for (const t of trees) {
      g.player.x = (t.x - 2) * 16; g.player.y = (t.y - 3) * 16;
      g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;
      for (let k = 0; k < 40; k++) {
        g.tickCount += 60;
        g.player.useTime = 0;
        g['tryMine'](t.x, t.y, 100, 'axe', 16, 16);
        chops++;
        if (st.type[st.idx(t.x, t.y)] === 0) break;
      }
    }
    return { trees: trees.length, chops };
  });
});
check('砍树执行', res.trees > 0, JSON.stringify(res));

await sleep(400);
const drops = await page.evaluate(async () => {
  const v = await fetch('/sprites/vanilla.json').then((r) => r.json());
  return window.__drops.map(([x, y, key, stack]) => {
    const m = /^vi_(\d+)_/.exec(key);
    const vid = m ? +m[1] : -1;
    const item = v.items[String(vid)];
    return { key, vid, stack, name: item?.name ?? '?', createTile: item?.createTile ?? null };
  });
});
const statue = drops.filter((d) => d.createTile === 105 || /statue/i.test(d.name));
console.log(`总掉落 ${drops.length} 件；雕像族 ${statue.length} 件`);
for (const s of statue.slice(0, 10)) console.log('  ★雕像:', JSON.stringify(s));
const summary = {};
for (const d of drops) summary[d.name] = (summary[d.name] ?? 0) + 1;
console.log('掉落分布:', JSON.stringify(summary).slice(0, 600));
check('无雕像泄漏', statue.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
