// 一次性:钱币满 100 自动转银浏览器实测（分批拾取模拟 + UI 刷新可见）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const copperKey = window.__swFlow.itemByKey ? null : null;
  void copperKey;
  // 游戏侧 id 空间:经 UI 桥不可达时用 inv 现有币反查——直接扫 ITEM_BY_KEY 不行(HMR fork),
  // 改用 world 掉落链同源:spawnDrop 用 key 字符串。这里走 __swFlow.itemByKey
  const cid = window.__swFlow.itemByKey('vi_71_CopperCoin');
  const sid = window.__swFlow.itemByKey('vi_72_SilverCoin');
  const inv = g.player.inv;
  // 分批拾取:30+30+30+10 = 100
  inv.add(cid, 30); inv.add(cid, 30); inv.add(cid, 30);
  const before = { copper: inv.countOf(cid), silver: inv.countOf(sid) };
  inv.add(cid, 10);   // 恰好满 100
  const after = { copper: inv.countOf(cid), silver: inv.countOf(sid) };
  // 再来 100 → 第二枚银
  inv.add(cid, 100);
  const after2 = { copper: inv.countOf(cid), silver: inv.countOf(sid) };
  // 面额守恒
  const total = after2.copper + after2.silver * 100;
  return { before, after, after2, totalConserved: total === 200 };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
