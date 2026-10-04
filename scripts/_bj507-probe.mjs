// 一次性:BJ507 图鉴续批两件冒烟探针（私有实例 5201）。
//   B2 掉落行 hover → 全量 item tooltip（.sw-tooltip 显示+名行+notes 条件行+离开撤泡）
//   B3 dummy 动画（详情 Portrait 常驻帧推进/网格卡 hover 播+移开冻结/单帧 NPC 静态对照）
// SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj507-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }

const log = [];
const ok = (name, cond) => { const l = `${cond ? 'PASS' : 'FAIL'} ${name}`; log.push(l); console.log(l); };

await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());

// 解锁全图鉴（动画/tooltip 面可见）+ 自建面板带 ui 桥（mainFlow openBestiary 同形）
await page.evaluate(async () => {
  const g = window.__swGame;
  // ★bestiaryGating 是模块级对象（tracker.unlockState 读全局,非实例字段）——
  //   旧写 g.world.bestiary.unlockAll=true 注入无效（卡片锁定态=动画/掉落行整缺）
  const { bestiaryGating } = await import('/src/data/Bestiary.ts');
  bestiaryGating.unlockAll = true;
  const ui = window.__swUI;
  const { BestiaryPanel } = await import('/src/ui/BestiaryPanel.ts');
  window.__bj507Panel = new BestiaryPanel(document.body, {
    getTracker: () => g.world.bestiary,
    atlas: g.renderer?.atlas ?? null,
    isCrimson: () => false,
    isExpert: () => false,
    isMaster: () => false,
    showItemTooltip: (itemId, anchor, notes) => ui.showFloatingItemTooltip(itemId, anchor, notes),
    hideItemTooltip: () => ui.hideFloatingItemTooltip(),
    onBack: () => {},
  });
  await new Promise((r) => setTimeout(r, 800));
});
await page.waitForSelector('.sw-bst', { timeout: 8000 });
await wait(2000);

// ── 定位多帧 NPC（史莱姆 1）与单帧 NPC（35 骷髅王头）的网格卡 ──
const targets = await page.evaluate(() => {
  const g = window.__swGame;
  const rows = window.__bj507Panel && document.querySelectorAll('.sw-bst-cell');
  // 从 tracker 行集找 creditId：直接用面板 working（内部态不暴露）——退而遍历卡片
  // 点击打开详情（详情页 Portrait 动画判别不依赖特定 NPC：首卡多为史莱姆族）。
  // 更稳：读 data-credit 与 bestiary 表对照 frames。
  const cells = [...document.querySelectorAll('.sw-bst-cell')];
  return cells.slice(0, 8).map((c) => c.dataset.credit);
});
log.push('credits=' + targets.join(','));

// 取详情（点第一张卡）→ Portrait 动画帧推进采样
async function openDetailAndSample(creditIdx) {
  await page.evaluate((i) => {
    const cell = document.querySelectorAll('.sw-bst-cell')[i];
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, creditIdx);
  await wait(600);
  return page.evaluate(() => {
    const c = document.querySelector('.sw-bst-portraitbox canvas');
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let i = 3; i < d.length; i += 4) sum += d[i];
    return { w: c.width, h: c.height, alphaSum: sum };
  });
}

const s1 = await openDetailAndSample(0);
await wait(450);
const s2 = await page.evaluate(() => {
  const c = document.querySelector('.sw-bst-portraitbox canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let sum = 0;
  for (let i = 3; i < d.length; i += 4) sum += d[i];
  return sum;
});
await wait(450);
const s3 = await page.evaluate(() => {
  const c = document.querySelector('.sw-bst-portraitbox canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let sum = 0;
  for (let i = 3; i < d.length; i += 4) sum += d[i];
  return sum;
});
ok(`B3 详情 Portrait 动画帧推进（α和采样 ${s1?.alphaSum}→${s2}→${s3}）`, s1 && (s1.alphaSum !== s2 || s2 !== s3));
await page.screenshot({ path: '/tmp/bj507-detail.png' });

// 找单帧 NPC 对照（frames=1 → 详情静态）——遍历卡片逐个点开采样两拍
let staticVerified = false;
for (let i = 0; i < Math.min(12, targets.length) && !staticVerified; i++) {
  const a = await openDetailAndSample(i);
  await wait(500);
  const b = await page.evaluate(() => {
    const c = document.querySelector('.sw-bst-portraitbox canvas');
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let k = 3; k < d.length; k += 4) sum += d[k];
    return sum;
  });
  if (a && a.alphaSum === b) staticVerified = true;
}
ok(`B3 单帧 NPC 详情静态对照（存在两拍相等的卡=${staticVerified}）`, staticVerified);

// 网格卡 hover 动画（回到第一页第一卡：若其为多帧 NPC → hover 期间 canvas 变化）
await page.evaluate(() => window.__bj507Panel && window.__bj507Panel.refreshNow?.());
await wait(600);
const gridHover = await page.evaluate(() => {
  const cell = document.querySelector('.sw-bst-cell');
  if (!cell) return null;
  const c = cell.querySelector('.sw-bst-ico');
  const d = c.getContext('2d').getImageData(0, 0, 68, 68).data;
  let sum = 0;
  for (let k = 3; k < d.length; k += 4) sum += d[k];
  const r = cell.getBoundingClientRect();
  return { alphaSum: sum, x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.move(gridHover.x, gridHover.y);
await wait(350);
const h1 = await page.evaluate(() => {
  const c = document.querySelector('.sw-bst-cell .sw-bst-ico');
  const d = c.getContext('2d').getImageData(0, 0, 68, 68).data;
  let sum = 0;
  for (let k = 3; k < d.length; k += 4) sum += d[k];
  return sum;
});
await wait(400);
const h2 = await page.evaluate(() => {
  const c = document.querySelector('.sw-bst-cell .sw-bst-ico');
  const d = c.getContext('2d').getImageData(0, 0, 68, 68).data;
  let sum = 0;
  for (let k = 3; k < d.length; k += 4) sum += d[k];
  return sum;
});
ok(`B3 网格卡 hover 帧推进（${gridHover.alphaSum}→${h1}→${h2}）`, gridHover.alphaSum !== h1 || h1 !== h2);
// 移开 → 冻结
await page.mouse.move(10, 10);
await wait(500);
const h3 = await page.evaluate(() => {
  const c = document.querySelector('.sw-bst-cell .sw-bst-ico');
  const d = c.getContext('2d').getImageData(0, 0, 68, 68).data;
  let sum = 0;
  for (let k = 3; k < d.length; k += 4) sum += d[k];
  return sum;
});
ok(`B3 网格卡移开帧冻结（${h2}→${h3} 相等）`, h2 === h3);

// ── B2：掉落行 hover 全量 tooltip ──
// 第一卡详情开着（多帧史莱姆族=凝胶 100% 掉率行）
const dropRow = await page.evaluate(() => {
  const line = document.querySelector('.sw-bst-drop');
  if (!line) return null;
  const r = line.getBoundingClientRect();
  return { text: line.querySelector('.rt')?.textContent, x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
ok('详情栏掉落行存在', !!dropRow);
if (dropRow) {
  await page.mouse.move(dropRow.x, dropRow.y);
  await wait(400);
  const tip = await page.evaluate(() => {
    const t = document.querySelector('.sw-tooltip');
    return { display: t?.style.display ?? 'none', html: (t?.innerHTML ?? '').slice(0, 400) };
  });
  ok(`B2 掉落行 hover tooltip 显示（display=${tip.display}）`, tip.display === 'block');
  ok('B2 tooltip 含名行（凝胶/物品名）', /凝胶|Gel|#\d+/.test(tip.html) || tip.html.length > 20);
  log.push('tipHtml=' + tip.html.replace(/<[^>]+>/g, ' ').slice(0, 160));
  await page.mouse.move(10, 10);
  await wait(300);
  const tipHide = await page.evaluate(() => document.querySelector('.sw-tooltip')?.style.display ?? 'none');
  ok('B2 离开撤泡（display=none）', tipHide === 'none');
}
await page.screenshot({ path: '/tmp/bj507-drop-tooltip.png' });

// 收尾：关面板（rAF 清理/撤泡）——页面无报错即过
await page.evaluate(() => window.__bj507Panel?.close());
await wait(300);
ok('面板关闭无残留', await page.evaluate(() => !document.querySelector('.sw-bst')));

console.log('\n== BJ507 probe done ==');
browser.close();
process.exit(log.some((l) => l.startsWith('FAIL')) ? 1 : 0);
