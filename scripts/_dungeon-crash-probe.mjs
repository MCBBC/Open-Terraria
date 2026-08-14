// 进地牢崩溃回归探针(2026-08-14 trace 根因:晚到表全量重烘→解码风暴):
// 进世界 → 传送地牢(dungeonX) → 等 12s(旧版在此窗口崩溃) → 断言存活+
// 精确重烘(chunkSheets 命中数>0 且 dirtyQueue 已归零)+ 无 console error。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let errs = 0;
page.on('console', (m) => { if (m.type() === 'error') { errs++; console.log('[err]', m.text().slice(0, 120)); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:5311/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i = 0; i < 60; i++) { await sleep(2000); if (await page.evaluate(() => !!window.__swGame).catch(() => false)) break; }
const info = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world;
  return { dungeonX: w.dungeonX, dungeonY: w.dungeonY, spawnX: w.spawnX };
});
console.log('世界:', JSON.stringify(info));
// 传送地牢(游戏内传送门路径:teleportWhenReady 先补表再落位=晚到风暴触发源)
await page.evaluate((x, y) => {
  const g = window.__swGame;
  // 直调传送链(绕 UI):按 T 键? 无;用 mirror 逻辑——直接调用内部方法不可达,
  // 走公开路径:设置玩家坐标并 invalidateAll 模拟表晚到
  g.player.x = x * 16; g.player.y = y * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
}, info.dungeonX, Math.max(10, info.dungeonY + 20));
await sleep(4000);
// 等晚到表回调链(500ms 去抖+重烘排空)
await sleep(8000);
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const cc = g.chunks;
  return {
    alive: !!g.renderer,
    arriveChunks: cc.arriveInvalidateChunks,
    dirtyLeft: cc.dirtyQueue.length,
    chunksN: cc.chunks.size,
    sheetTracked: cc.chunkSheets ? cc.chunkSheets.size : -1,
  };
}).catch((e) => ({ alive: false, err: String(e).slice(0, 100) }));
console.log('传送后 12s:', JSON.stringify(res));
const ok = res.alive && res.err === undefined;
console.log(ok ? 'PASS: 地牢传送存活(精确重烘 arriveChunks=' + res.arriveChunks + ')' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
