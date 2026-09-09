// SW-BJ43 实机 e2e 探针：魔法海螺(4263) 全使用链落点验证（物品→引导→fireRecallTeleport）。
// 用法:SW_ORIGIN=http://localhost:520x node tools/run-diag.mjs scripts/_bj43-e2e.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swFlow && window.__swFlow.newWorld, { timeout: 120000, polling: 500 });

const R = [];
for (const seed of ['bj43-e2e-a', 'bj43-e2e-b']) {
  await page.evaluate((s) => { window.__swFlow.newWorld(s, 4200, 1200); }, seed);
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 600000, polling: 1000 });
  await new Promise((r) => setTimeout(r, 1500));
  const row = await page.evaluate(async () => {
    const g = window.__swGame;
    const w = g.world;
    const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
    const internalOf = (vid) => window.__swItems[VANILLA_ITEM_KEY_BY_ID[vid]];
    // 玩家放到左半图地表（x=600 格），确保 leftHalf=true
    const st = w.store;
    const col = 600;
    let sy = 40;
    while (sy < st.h - 60 && !(st.flags[st.idx(col, sy)] && st.isSolid(col, sy))) sy++;
    g.player.x = col * 16 + 8 - g.player.w / 2;
    g.player.y = (sy - 4) * 16;
    g.player.vx = 0; g.player.vy = 0;
    // 给海螺并放 0 号快捷栏
    const iid = internalOf(4263);
    g.player.inv.add(iid, 1);
    const slots = g.player.inv.slots;
    const bi = slots.findIndex((it) => it && it.id === iid);
    if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    const pre = { x: g.player.x, y: g.player.y };
    // 引导使用：按住 1 帧即入引导（useTime 90 半程 45t 触发）
    g.input.mouseX = g.player.cx + 100; g.input.mouseY = g.player.cy;
    g.input.mouseDown = true;
    await new Promise((r) => setTimeout(r, 2600));
    g.input.mouseDown = false;
    await new Promise((r) => setTimeout(r, 800));
    const post = { x: g.player.x, y: g.player.y };
    // 落点环境：脚下格与所在洋带
    const px = Math.round((post.x + g.player.w / 2) / 16);
    const py = Math.round((post.y + g.player.h) / 16) - 1;
    const belowSafe = (() => {
      for (let k = 0; k < 6; k++) {
        const tx = px, ty = py + k;
        if (!st.inBounds(tx, ty)) return 'OOB';
        const i = st.idx(tx, ty);
        if (st.flags[i] && st.isSolid(tx, ty)) return `solid@+${k}`;
        if (st.liquid[i] > 0) return `liquid@+${k}`;
      }
      return 'none';
    })();
    const leftHalf = pre.x / 16 < st.w / 2;
    return {
      pre, post, moved: (post.x !== pre.x) || (post.y !== pre.y),
      tile: [px, py], belowSafe, leftHalf,
      distFromLeftEdge: px, distFromRightEdge: st.w - px,
      feetEmbedded: (() => {
        const ty = Math.floor((post.y + g.player.h - 1) / 16);
        const tx = Math.floor((post.x + g.player.w / 2) / 16);
        return st.inBounds(tx, ty) && st.flags[st.idx(tx, ty)] && st.isSolid(tx, ty);
      })(),
    };
  });
  R.push(`${seed}: ${JSON.stringify(row)}`);
  await page.evaluate(() => window.__swFlow.quitToMenu?.());
  await page.waitForFunction(() => !window.__swGame, { timeout: 120000, polling: 500 }).catch(() => {});
}
console.log(R.join('\n'));
if (errs.length) console.log('PAGE ERRORS:\n' + errs.slice(0, 6).join('\n'));
await browser.close();
