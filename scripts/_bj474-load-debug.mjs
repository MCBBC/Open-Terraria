// BJ474 载入诊断：注入存档→?quickload 或手动 flow.quickLoad() 抓错
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const SAVE_PATH = process.env.SAVE || '/Users/vinlic/Downloads/map-天真的钴最高点 (3).json';
const saveJson = readFileSync(SAVE_PATH, 'utf8');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PE: ' + e.message.slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type()[0] + ': ' + m.text().slice(0, 300)); });

await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
const inject = await page.evaluate(async (text) => {
  const m = await import('/src/save/KvStore.ts');
  await m.kvDelete('sandboxworld.worlds.index');
  for (let i = 1; i <= 8; i++) await m.kvDelete(`sandboxworld.world.${i}`);
  const r = await m.kvSet('sandboxworld.quicksave', text);
  const has = await m.kvHas('sandboxworld.quicksave');
  return { r, has };
}, saveJson);
console.log('inject:', JSON.stringify(inject), 'errs:', errs.splice(0).join('|').slice(0, 400));

// 手动走 quickLoad 并 await 抓异常
await page.goto(ORIGIN + '/?quickload=1&diag=1&t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 15000));
const st1 = await page.evaluate(() => ({
  hasFlow: typeof (window).__swFlow, hasGame: !!(window).__swGame,
  body: document.body.innerText.slice(0, 200).replace(/\n/g, '|'),
  btns: Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.slice(0, 30)).slice(0, 12),
})).catch((e) => ({ evalErr: String(e).slice(0, 200) }));
console.log('st1:', JSON.stringify(st1));
console.log('errs so far:', errs.splice(0).join(' || ').slice(0, 1200));

const tryLoad = await page.evaluate(async () => {
  const w = window;
  const flow = w.__swFlow;
  if (!flow) return { noFlow: true };
  try {
    await flow.quickLoad();
    return { ok: true, game: !!w.__swGame, world: !!w.__swGame?.world };
  } catch (e) {
    return { err: String(e?.stack || e).slice(0, 900) };
  }
});
console.log('tryLoad:', JSON.stringify(tryLoad, null, 1));
await new Promise((r) => setTimeout(r, 30000));
const st2 = await page.evaluate(() => ({
  game: !!(window).__swGame, world: !!(window).__swGame?.world, store: !!(window).__swGame?.world?.store,
  body: document.body.innerText.slice(0, 160).replace(/\n/g, '|'),
})).catch((e) => ({ evalErr: String(e).slice(0, 200) }));
console.log('st2:', JSON.stringify(st2));
console.log('errs final:', errs.splice(0).join(' || ').slice(0, 1200));
await page.screenshot({ path: '/tmp/bj474-load-debug.png' });
await browser.close();
