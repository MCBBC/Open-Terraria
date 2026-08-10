// 阶段 2 验证：saveParse 进 worker
// 1) worker 生成小世界 → saveGame 序列化 → client.loadSave({json}) worker 解析+沉降
//    → 断言 type/liquid 与原世界一致、player 字段回传
// 2) Roundtrip：主线程 loadSave(text) 与 worker loadSave({json}) 产出的世界逐格一致
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { saveGame } = await import('/src/save/SaveFile.ts');
  const { loadSave } = await import('/src/save/SaveFile.ts');
  const g = window.__swGame;
  // 用当前已进游戏的世界做存档（含玩家状态）
  const json = saveGame(g.world, g.player, 12345);
  // worker 读档（json 源）
  const client = new WorldGenClient();
  const probe = await client.probe();
  if (!probe) return { probe: false };
  const t0 = performance.now();
  const { world: wWorker, player: pWorker } = await client.loadSave({ json }, {});
  const loadMs = Math.round(performance.now() - t0);
  // 主线程读档对照
  const { world: wMain } = loadSave(json);
  const arraysEq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  return {
    probe: true, loadMs,
    typeEq: arraysEq(wWorker.store.type, wMain.store.type),
    liquidEq: arraysEq(wWorker.store.liquid, wMain.store.liquid),
    wallEq: arraysEq(wWorker.store.wall, wMain.store.wall),
    spawnEq: wWorker.spawnX === wMain.spawnX && wWorker.spawnY === wMain.spawnY,
    playerOk: !!pWorker && typeof pWorker.hp === 'number',
    hp: pWorker?.hp,
  };
});
console.log(JSON.stringify(out, null, 1));
check('worker 探测可用', out.probe !== false);
if (out.probe !== false) {
  check('worker 读档 type 逐格一致', out.typeEq);
  check('worker 读档 liquid 一致', out.liquidEq);
  check('worker 读档 wall 一致', out.wallEq);
  check('worker 读档 spawn 一致', out.spawnEq);
  check('player 字段回传', out.playerOk, `hp=${out.hp} ${out.loadMs}ms`);
}
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
