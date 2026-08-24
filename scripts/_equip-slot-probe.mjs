// 探针：装备槽单件语义（2026-08-24 用户报 99 翅膀整叠入槽）。
//  原版 ItemSlot.LeftClick case1（:1004-1058）：
//   空槽+多叠 → 放 1 件余量留光标；空槽+单件 → 整件入；
//   占用槽+光标单件异型 → 交换；占用槽+同型/多叠 → 无动作。
//  方法：dev 全道具 → 背包找可装备物堆叠 99 → 模拟拾取+拖放到配饰槽 → 读槽/光标。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  g.setupDevMode();
  const inv = g.player.inv;
  // 找一件配饰（armor[3] 可接受的 accessory），造 99 叠
  const accIid = Object.keys(window.__swItems).length ? null : null; // 占位
  // 用 UI 的 armorAccepts 找：扫背包前 50 格找 accessory 定义
  let accSlot = -1, accName = '';
  for (let i = 0; i < 50; i++) {
    const it = inv.slots[i];
    if (!it) continue;
    if (inv.armorAccepts(3, it.id)) { accSlot = i; accName = it.def?.name ?? it.id; break; }
  }
  if (accSlot < 0) return { fail: '无可装备物' };
  inv.slots[accSlot].stack = 99;
  // 打开背包面板（装备槽仅在面板开时可见）——直接调 UI 内部不可行,经键盘 E
  return { accSlot, accName, stack: inv.slots[accSlot].stack };
});
console.log(JSON.stringify(out));

// 面板内 DOM 拖放模拟复杂——改为直接调 UI 逻辑等价验证：经 __swGame 不可达 UI 私有法。
// 改用 DOM：按 E 开背包 → 找到该物品槽元素 → mousedown 拾取 → mouseup 在配饰槽上。
const uiOut = await page.evaluate(async () => {
  const g = window.__swGame;
  const inv = g.player.inv;
  // E 开包
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const slots = [...document.querySelectorAll('.sw-slot[data-where="inv"]')];
  // 找 99 叠的槽（读 title/内容不可靠——直接扫 UI 源不可行；用数据槽：遍历前 50 找 stack 99）
  // DOM 槽无 stack 数据——改为：从 inv 找 accSlot（重扫），其 DOM 槽 = data-idx
  let accSlot = -1;
  for (let i = 0; i < 50; i++) {
    const it = inv.slots[i];
    if (it && inv.armorAccepts(3, it.id) && it.stack === 99) { accSlot = i; break; }
  }
  if (accSlot < 0) return { fail: '未找到 99 叠配饰' };
  inv.armor[3] = null;   // 清目标槽（dev 档可能预置配饰——语义验证需空槽）
  // DOM 槽序 ≠ inv 槽序（创建顺序差异）——按 data-idx 精确映射
  const srcEl = slots.find((s2) => s2.dataset.idx === String(accSlot));
  if (!srcEl) return { fail: '源槽 DOM 缺失' };
  const accEl = [...document.querySelectorAll('.sw-slot[data-where="armor"]')].find((s2) => s2.dataset.idx === '3');
  if (!accEl) return { fail: '配饰槽 DOM 缺失' };
  const r = srcEl.getBoundingClientRect();
  const ar = accEl.getBoundingClientRect();
  srcEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: r.x + 10, clientY: r.y + 10, bubbles: true }));
  // 拖拽轨迹：>4px 触发拾取 → 移到目标槽（resolveDrop 用 document mousemove 的
  // 最新坐标做 elementFromPoint）
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: r.x + 40, clientY: r.y + 40, bubbles: true }));
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: ar.x + 10, clientY: ar.y + 10, bubbles: true }));
  document.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: ar.x + 10, clientY: ar.y + 10, bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  // 余量守恒：光标 98 拖回源槽（普通背包格可整叠合并）→ 源槽应 98
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: r.x + 10, clientY: r.y + 10, bubbles: true }));
  srcEl.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: r.x + 10, clientY: r.y + 10, bubbles: true }));
  document.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: r.x + 10, clientY: r.y + 10, bubbles: true }));
  await new Promise((r2) => setTimeout(r2, 300));
  return {
    armor3: inv.armor[3] ? { stack: inv.armor[3].stack } : null,
    sourceLeft: inv.slots[accSlot]?.stack ?? 0,
  };
});
console.log(JSON.stringify({ uiOut, errs: errs.slice(0, 3) }, null, 1));
const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(uiOut.fail === undefined, `探针失败: ${uiOut.fail}`);
if (uiOut.fail === undefined) {
  A(uiOut.armor3?.stack === 1, `装备槽应恰 1 件: ${uiOut.armor3?.stack}`);
  A(uiOut.sourceLeft === 98, `余量应 98 回源格: ${uiOut.sourceLeft}`);
}
A(errs.length === 0, `页面异常: ${errs[0] ?? ''}`);
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
