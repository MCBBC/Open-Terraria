// BJ620 件6 探针 A（UNVERIFIED F9 量级实测）：大世界（8400×2400 档）doSave 主线程
// JSON.parse(json).player 毫秒数 trace——判定 save.worker player 切片回传落不落（阈值 10ms）。
// 运行：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=600000 scripts/_bj620-f9-parse-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5202');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: { width: 1280, height: 800 } });
const page = (await browser.pages())[0] ?? await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 200)));
await page.goto(URL + '/?seedkv=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000, polling: 300 });

console.log('开始创建 8400×2400 世界（worker 生成,数分钟级）…');
await page.evaluate(() => { void window.__swFlow.createWorldProbe({ name: 'F9量级探针', w: 8400, h: 2400, size: 2, seed: 'f9mag' }); });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.world?.store?.w > 0; }, { timeout: 560000, polling: 1000 });
await new Promise((r) => setTimeout(r, 3000));
console.log('=== 已进入世界 ===', await page.evaluate(() => {
  const g = window.__swGame;
  return JSON.stringify({ w: g.world.store.w, h: g.world.store.h });
}));

// 主线程 JSON.parse 探针：>2MB 入参全记录（时长+结果形状）。production 面的
// JSON.parse(json).player（mainFlow doSave charState 同步支）在此现形。
await page.evaluate(() => {
  const orig = JSON.parse;
  window.__bigParses = [];
  JSON.parse = function (text, reviver) {
    if (typeof text === 'string' && text.length > 2_000_000) {
      const t0 = performance.now();
      const r = orig.call(this, text, reviver);
      const ms = performance.now() - t0;
      window.__bigParses.push({
        len: text.length, ms: Math.round(ms * 100) / 100,
        isSaveData: !!r && typeof r === 'object' && 'player' in r && 'header' in r,
        playerKeys: r && typeof r === 'object' && r.player ? Object.keys(r.player).length : -1,
        at: Math.round(performance.now()),
      });
      return r;
    }
    return orig.call(this, text, reviver);
  };
});
// charContextId() 需要 LS lastCharId——置位确保 doSave 的 charState 同步支（JSON.parse(json).player）真实执行
await page.evaluate(() => { try { localStorage.setItem('sbw.lastCharId', '1'); } catch { /* ignore */ } });

const results = [];
for (let round = 1; round <= 2; round++) {
  await page.evaluate(() => { window.__bigParses.length = 0; });
  const t0 = await page.evaluate(() => performance.now());
  await page.evaluate(() => window.__swFlow.doSave(true));
  const t1 = await page.evaluate(() => performance.now());
  const parses = await page.evaluate(() => window.__bigParses.slice());
  const playerParse = parses.find((p) => p.isSaveData);
  results.push({ round, doSaveWallMs: Math.round(t1 - t0), playerParse });
  console.log(`round${round}: doSave 全链 ${Math.round(t1 - t0)}ms;主线程 JSON.parse(json).player =`, playerParse ? `${playerParse.ms}ms (json ${(playerParse.len / 1e6).toFixed(1)}MB, player ${playerParse.playerKeys} 键)` : '未捕获（charState 支未走?）');
  await new Promise((r) => setTimeout(r, 800));
}
const m = results.map((r) => r.playerParse?.ms ?? -1);
const max = Math.max(...m);
console.log(`==== F9 定谳：主线程 JSON.parse(json).player 最大 ${max}ms → ${max > 10 ? '超阈(>10ms)=落 save.worker player 切片回传' : '≤10ms=登记维持'} ====`);
await browser.close();
console.log('==== 探针 A 完 ====');
