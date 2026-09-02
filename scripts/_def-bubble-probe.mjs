// 终验：防御计数器悬停气泡（DrawDefenseCounter Main.cs:42877-42890 三行结构 + 锚定定位）
// 用户报"气泡不太对"：曾硬编码中文+难度并括号+漏 tooltip 定位（停在共享元素旧位置）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = g.ui || window.__swUI;
  if (!ui) return { err: 'no ui' };
  const M = await import('/src/data/items.ts');
  const idOf = (vid) => M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[vid]];
  // 穿铁甲三件（防御>0）+ 大师世界（mainDifficulty 读 world.difficulty===2）,开背包
  g.player.inv.armor[0] = { id: idOf(90), stack: 1 };
  g.player.inv.armor[1] = { id: idOf(81), stack: 1 };
  g.player.inv.armor[2] = { id: idOf(77), stack: 1 };
  g.player.inv.gateMaster = true;
  g.player.inv.extraAccessory = true;
  g.world.difficulty = 2;   // GDL.MASTER（isMaster 是 getter,勿 shadow 赋值）
  ui.openInventory();
  ui.refreshAllNow?.() ?? ui.refreshAll();
  await new Promise((r) => setTimeout(r, 300));
  const defRow = document.querySelector('[data-role="defense"]');
  if (!defRow) return { err: 'no defRow' };
  const defWrap = defRow.firstElementChild;   // 40px 盾锚（showBuffTooltip 的 anchor）
  // 先把共享 tooltip 丢到旧位置（模拟"停在旧处"基线）
  ui.tooltip.style.left = '1px'; ui.tooltip.style.top = '1px';
  const shieldAtHover = defWrap.getBoundingClientRect().right;
  defRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  const gapAtHover = ui.tooltip.getBoundingClientRect().left - shieldAtHover;   // 同帧对账
  await new Promise((r) => setTimeout(r, 300));
  const t = ui.tooltip;
  const lines = (t.innerHTML ?? '').split(/<br\s*\/?>/).map((s) => s.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
  const shieldRect = defWrap.getBoundingClientRect();
  const ttLeft = parseFloat(t.style.left), ttTop = parseFloat(t.style.top);
  return {
    lines,
    // DR 值随装备变化（铁甲套=9,用户截图档=17）,断言只钉结构不钉值
    threeLinesVanillaShape: lines.length === 3 && lines[0].endsWith('防御')
      && /^受到的伤害降低\d+$/.test(lines[1]) && lines[2] === '大师',
    noHardcodedMerge: !/（大师）/.test(t.textContent ?? ''),
    noRawPlaceholder: !/\{[^\}]+\}/.test(t.textContent ?? ''),
    // 锚定 = 视觉矩形（缩放无关）紧贴盾右侧（showBuffTooltip 左=right+8,视口钳制
    // 是正确行为）且整体在视口内。★style.left 是本地坐标,容器有 --cc-fit 缩放时
    // 与视口矩形量纲不同——对比一律用 getBoundingClientRect
    dbgRects: (() => {
      const vr = t.getBoundingClientRect();
      return { vrLeft: Math.round(vr.left), vrRight: Math.round(vr.right), vrTop: Math.round(vr.top),
        shieldRight: Math.round(shieldRect.right), shieldTop: Math.round(shieldRect.top),
        gap: Math.round(vr.left - shieldRect.right), ttLeft, ttTop, innerW: window.innerWidth };
    })(),
    anchoredNearShield: (() => {
      const vr = t.getBoundingClientRect();
      const unclamped = Math.abs((vr.left - shieldRect.right) - 8) <= 2;   // 贴盾右侧 8px
      const clamped = vr.right <= window.innerWidth && vr.left >= 0
        && vr.top >= 0 && vr.bottom <= window.innerHeight;                 // 钳后全在视口内
      return (unclamped || clamped) && ttLeft > 50;
    })(),
    gapAtHover,
    movedFromStalePos: ttLeft > 50,
    display: t.style.display,
  };
});
console.log(JSON.stringify(res, null, 2));
if (errs.length) console.log('PAGEERRORS:', errs.slice(0, 3));
await browser.close();
