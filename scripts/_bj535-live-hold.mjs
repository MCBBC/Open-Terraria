// BJ535 层2端到端:真实页面长按配方行+零 mousemove → 推进观察。
// ★headless 定谳面:修复前门=matches(':hover') 在 headless 恒 false(层1探针)→推进
// 恒停;修复后门=elementFromPoint 坐标 hit-test(几何,headless 恒正确)→推进恢复。
// 故 headless 下本探针通过=修复与 hover/事件流彻底解耦的最强实证(headless 连
// mac 触摸板微动的 hover 补流通道都不存在)。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
// ?invlayout=legacy=classic 列表站(用户报告形态:长按配方列表;vanilla 缺省布局的
// mcell/mdetail 站同 helper 同修复,本探针锚列表形态)
await page.goto(`${ORIGIN}/?invlayout=legacy`, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  const _s = document.querySelector('select');
  _s.selectedIndex = 0;
  _s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

// 塞木材+开背包+等配方列表
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.debugGod = true;
  const wood = g.itemId('vi_9_Wood');
  g.player.inv.slots[0] = { id: wood, stack: 500 };
  g.player.inv.slots[1] = null;
});
await page.evaluate(() => {
  // ★WelcomeAnnounce 覆层(全屏 z-60 pe:auto,BJ341 单例化)——真实用户先点掉才游玩,
  //  探针同相:移除后配方行才可命中(peek 探针定谳:它挡住 233,333 的全部 hit-test)
  document.getElementById('sw-welcome-announce')?.remove();
  window.__swUI.openInventory(true);
});
await new Promise((r) => setTimeout(r, 800));
const boot = await page.evaluate(() => {
  const g = window.__swGame;
  const u = window.__swUI;
  const rows = [...document.querySelectorAll('.sw-recipe')];
  const lists = [...document.querySelectorAll('.sw-craft-list')];
  return {
    rows: rows.length,
    first: rows[0]?.textContent?.slice(0, 60) ?? null,
    invDisplay: u?.invPanel?.style?.display ?? null,
    listCount: lists.length,
    listChildren: lists.map((l) => l.children.length),
    woodId: g.itemId('vi_9_Wood'),
    slot0: g.player.inv.slots[0],
    wood: g.player.inv.slots.filter?.((s) => s && s.id === g.itemId('vi_9_Wood')).length ?? -1,
  };
});
console.log('配方行:', JSON.stringify(boot));
if (!boot.rows) { console.log('NO-ROWS: 配方列表未渲染'); await browser.close(); process.exit(1); }

// 找木材基配方行(×count 大的),CDP 鼠标压上
const rowInfo = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.sw-recipe')];
  const r = rows[0];
  const b = r.getBoundingClientRect();
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), label: r.textContent };
});
console.log('行几何:', JSON.stringify(rowInfo));

const cdp = await page.createCDPSession();
// 事件计数器(capture 面)+label 读数(label span 文本=「名 ×createStack ×count」,取末段)
await page.evaluate(() => {
  const cl = document.querySelector('.sw-craft-list');
  window.__evCount = { rowDown: 0, listDown: 0, docDown: 0 };
  cl?.addEventListener('mousedown', () => window.__evCount.listDown++, true);
  document.addEventListener('mousedown', () => window.__evCount.docDown++, true);
  [...document.querySelectorAll('.sw-recipe')].forEach((r) => r.addEventListener('mousedown', () => window.__evCount.rowDown++, true));
});
const readCount = () => page.evaluate(() => {
  const label = document.querySelector('.sw-recipe span');
  const parts = (label?.textContent ?? '').trim().split(/×/);
  const n = +(parts[parts.length - 1] ?? -1);
  return Number.isFinite(n) ? n : -1;
});

// 首击聚焦(按下→抬起)——page.mouse=viewport 坐标,headed 真实光标链不参与
await page.mouse.move(rowInfo.x, rowInfo.y);
await new Promise((r) => setTimeout(r, 300));
await page.mouse.down();
await new Promise((r) => setTimeout(r, 120));
await page.mouse.up();
await new Promise((r) => setTimeout(r, 250));

// 二击按住不放(长按)——此后零 mousemove
await page.mouse.down();
const timeline = [];
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 300));   // 每段 300ms,共 3s,期间零 mousemove
  timeline.push(await readCount());
}
// 形态互证段:冻结期微动 mousemove(1px 抖动×20=mac 触摸板微动/Windows 晃动)——
// 修复前(matches 门)应恢复推进;修复后(hit-test 门)两段同速=事件无关
const wiggleTl = [];
for (let i = 0; i < 20; i++) {
  await page.mouse.move(rowInfo.x + (i % 2), rowInfo.y + ((i + 1) % 2));
  await new Promise((r) => setTimeout(r, 50));
}
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 300));
  wiggleTl.push(await readCount());
}
const holdState = await page.evaluate(() => {
  const u = window.__swUI;
  return {
    craftHold: !!u?.craftHold, btnLeft: u?.uiBtnLeft, focus: u?.craftFocus,
    mouseX: u?.mouseX, mouseY: u?.mouseY, ev: { ...window.__evCount },
    label: document.querySelector('.sw-recipe span')?.textContent,
  };
});
await page.mouse.up();
console.log('长按 3s 零 mousemove 的 count 时间线(300ms/采样):', JSON.stringify(timeline));
console.log('微动 1s+静置 1.8s 的 count 时间线:', JSON.stringify(wiggleTl));
console.log('按住态:', JSON.stringify(holdState));
const uniq = new Set(timeline);
const zeroDrop = timeline[0] - timeline[timeline.length - 1];   // count 递减,取正
const wiggleRate = wiggleTl[0] - wiggleTl[wiggleTl.length - 1];
console.log(`零事件段推进 ${zeroDrop} 件;微动后段推进 ${wiggleRate} 件`);
console.log(zeroDrop > 100 && wiggleRate > 100
  ? `推进连续且微动不改变速率=修复后事件流无关 ✓`
  : zeroDrop <= 100 && wiggleRate > zeroDrop * 2
    ? `零事件冻结/微动恢复=Windows 形态复现(修复前对照) ✓`
    : `形态不明:零事件 ${zeroDrop} / 微动后 ${wiggleRate}`);
await browser.close();
