// 反馈轮7取证:开包态热键栏(网格0行)气泡定位修复——vanilla 显式 anchor;classic 回归
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

async function probeLayout(layout) {
  const page = await browser.newPage();
  await page.goto(`${ORIGIN}/?play=small&invlayout=${layout}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 540000, polling: 1000 }, layout === 'vanilla' ? '.sw-vinv' : '.sw-inv');
  await sleep(700);
  // 槽0 放物品
  await page.evaluate(() => {
    const g = window.__swGame;
    const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = window.__swTest || {};
    return null;
  });
  const r = { layout };
  // ---- vanilla 开包:网格 0 行槽 0 悬停 ----
  const v1 = await page.evaluate(async () => {
    const ui = window.__swUI;
    const g = window.__swGame;
    document.getElementById('sw-welcome-announce')?.remove();
    const mod = await import('/src/data/items.ts');
    const iidOf = (vid) => { const k = mod.VANILLA_ITEM_KEY_BY_ID[vid]; return k !== undefined ? mod.ITEM_BY_KEY[k] : undefined; };
    const it = iidOf(9);   // wood
    if (it && !g.player.inv.slots[0]) { g.player.inv.slots[0] = { id: it, stack: 5 }; }
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await new Promise((r2) => setTimeout(r2, 150));
    return null;
  });
  const v2 = await page.evaluate(() => {
    const ui = window.__swUI;
    const scope = document.querySelector('.sw-vinv');
    // vanilla 开包:网格 0 行槽 0 = .sw-vinv 内首个 [data-idx="0"]
    const slot = scope.querySelector('.sw-slot[data-idx="0"][data-where="inv"]');
    const hidden = document.querySelector('.sw-hotbar .sw-slot[data-idx="0"][data-where="inv"], [data-sw-hotbar] .sw-slot[data-idx="0"]');
    return {
      slotRect: slot ? slot.getBoundingClientRect().toJSON() : null,
      hotbarVisible: hidden ? hidden.offsetParent !== null : 'no-hotbar-el',
      slotContent: window.__swGame.player.inv.slots[0],
    };
  });
  if (v2.slotRect) {
    await page.mouse.move(v2.slotRect.x + v2.slotRect.width / 2, v2.slotRect.y + v2.slotRect.height / 2);
    await sleep(150);
    const tip = await page.evaluate(() => {
      const ui = window.__swUI;
      const t = ui.tooltip.getBoundingClientRect();
      return { left: t.left, top: t.top, display: ui.tooltip.style.display, text: ui.tooltip.textContent.slice(0, 16) };
    });
    r.openHotbar = { slot: { x: v2.slotRect.x, y: v2.slotRect.y, w: v2.slotRect.width }, tip, hotbarVisible: v2.hotbarVisible };
  }
  // ---- vanilla 关包:独立热键栏槽 0 悬停 ----
  await page.evaluate(() => { window.__swUI.closeInventory(); });
  await sleep(150);
  const v3 = await page.evaluate(() => {
    const els = [...document.querySelectorAll('.sw-slot[data-idx="0"][data-where="inv"]')];
    const vis = els.find((e) => e.offsetParent !== null);
    return vis ? vis.getBoundingClientRect().toJSON() : null;
  });
  if (v3) {
    await page.mouse.move(v3.x + v3.width / 2, v3.y + v3.height / 2);
    await sleep(150);
    r.closedHotbar = await page.evaluate(() => {
      const t = window.__swUI.tooltip.getBoundingClientRect();
      return { left: t.left, top: t.top, display: window.__swUI.tooltip.style.display };
    });
    r.closedSlot = v3;
  }
  await page.close();
  return r;
}

const van = await probeLayout('vanilla');
console.log('vanilla:', JSON.stringify(van, null, 1));
if (van.openHotbar) {
  const dx = van.openHotbar.tip.left - (van.openHotbar.slot.x + van.openHotbar.slot.w + 8);
  ok(van.openHotbar.tip.display === 'block', 'P1 vanilla 开包槽0悬停气泡显');
  ok(Math.abs(dx) < 4 && Math.abs(van.openHotbar.tip.top - van.openHotbar.slot.y) < 4,
    `P2 开包槽0气泡锚在槽右侧(Δleft=${dx.toFixed(1)},Δtop=${(van.openHotbar.tip.top - van.openHotbar.slot.y).toFixed(1)})——非左上角`);
}
if (van.closedHotbar && van.closedSlot) {
  const dx2 = van.closedHotbar.left - (van.closedSlot.x + van.closedSlot.width + 8);
  ok(van.closedHotbar.display === 'block' && Math.abs(dx2) < 4, `P3 vanilla 关包热栏气泡锚正确(Δleft=${dx2.toFixed(1)})`);
}

// ---- classic 回归(零变化:开包悬停面板槽0 → 老路径 slotEl=热栏格锚) ----
{
  const page = await browser.newPage();
  await page.goto(`${ORIGIN}/?play=small&invlayout=classic`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  await page.evaluate(async () => {
    const ui = window.__swUI;
    const g = window.__swGame;
    document.getElementById('sw-welcome-announce')?.remove();
    const mod = await import('/src/data/items.ts');
    const it = mod.VANILLA_ITEM_KEY_BY_ID[9] !== undefined ? mod.ITEM_BY_KEY[mod.VANILLA_ITEM_KEY_BY_ID[9]] : undefined;
    if (it && !g.player.inv.slots[0]) g.player.inv.slots[0] = { id: it, stack: 5 };
    ui.openInventory(true);
    await ui.refreshAllAsync();
  });
  await sleep(150);
  const c1 = await page.evaluate(() => {
    // classic 老语义:全局 slotEl(0,'inv') 首匹配元素=锚
    const first = document.querySelector('.sw-slot[data-idx="0"][data-where="inv"]');
    return first ? first.getBoundingClientRect().toJSON() : null;
  });
  if (c1) {
    await page.mouse.move(c1.x + c1.width / 2, c1.y + c1.height / 2);
    await sleep(150);
    const c2 = await page.evaluate(() => {
      const ui = window.__swUI;
      const first = document.querySelector('.sw-slot[data-idx="0"][data-where="inv"]');
      const r = first.getBoundingClientRect();
      return { tipLeft: ui.tooltip.getBoundingClientRect().left, slotRight: r.right, display: ui.tooltip.style.display };
    });
    ok(c2.display === 'block', 'P4 classic 开包槽0气泡显');
    ok(Math.abs(c2.tipLeft - (c2.slotRight + 8)) < 4, `P5 classic 行为零变化(老路径锚=全局首匹配 Δ=${(c2.tipLeft - c2.slotRight - 8).toFixed(1)})`);
  }
  await page.close();
}
await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
