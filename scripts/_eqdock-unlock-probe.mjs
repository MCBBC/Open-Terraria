// 一次性:右下角无框坞 + 背包解锁世界输入 验证(2026-09-02)
//  ① 背包开 → .sw-eqdock 右下角、无底框、装备/杂项/PvP 槽齐、不在 .sw-panel 内
//  ② 装备列全在坞内(.sw-panel 内 armor/misc 槽 = 0)
//  ③ 背包开着按住 D → 玩家位移 > 0(移动解锁)
//  ④ 背包开着点世界 → 铜短剑挥击(useTime>0) = 攻击解锁
//  ⑤ 背包开着点坞标签 → 不挥击(UI 命中不穿透)
//  ⑥ Esc 收背包 → 坞 display:none;E 再开 → display:flex
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 300)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// ①② 开背包 + 坞/面板普查
const open = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const dock = document.querySelector('.sw-eqdock');
  const info = () => {
    if (!dock) return { exists: false };
    const r = dock.getBoundingClientRect();
    const cs = getComputedStyle(dock);
    return {
      exists: true, display: cs.display, bg: cs.backgroundColor, bgImage: cs.backgroundImage === 'none' ? 'none' : 'SET',
      right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom),
      w: Math.round(r.width), h: Math.round(r.height),
      slots: dock.querySelectorAll('.sw-slot').length,
      armorInDock: dock.querySelectorAll('.sw-slot[data-where="armor"]').length,
      miscInDock: dock.querySelectorAll('.sw-slot[data-where="misc"]').length,
      loadoutBtns: dock.querySelectorAll('.sw-loadout-btn').length,
      pvpBtn: !!dock.querySelector('[style*="UI_PVP_0"]'),
      labels: [...dock.querySelectorAll('.sw-lbl')].map((e) => e.textContent).slice(0, 14),
      inPanel: !!dock.closest('.sw-panel'),
    };
  };
  ui.openInventory();
  const panel = document.querySelector('.sw-panel');
  return {
    dock: info(),
    panel: panel ? {
      armorInPanel: panel.querySelectorAll('.sw-slot[data-where="armor"]').length,
      miscInPanel: panel.querySelectorAll('.sw-slot[data-where="misc"]').length,
    } : null,
    blocking: g.input.uiBlocking,
  };
});

// ③ 移动解锁:按住 D 700ms(合成 keydown/keyup 走 Input window 监听)
const moveDx = await page.evaluate(async () => {
  const g = window.__swGame;
  const key = (t, c) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c, bubbles: true }));
  const x0 = g.player.x;
  key('keydown', 'KeyD');
  await new Promise((r) => setTimeout(r, 700));
  key('keyup', 'KeyD');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return Math.round(g.player.x - x0);
});

// ④ 攻击解锁:短剑入槽0 → 点世界(中心右侧空地)
const swordId = await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.slots[0] = { id: g.itemId('vi_3507_CopperShortsword'), stack: 1 };
  g.player.inv.selected = 0;
  window.__swUI.refreshAll();
  return true;
});
await page.mouse.move(900, 500);
await page.mouse.down(); await page.mouse.up();
const swing = await page.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const g = window.__swGame;
    res({ useTime: g.player.useTime, anim: g.player.itemAnimTicks, blocking: g.input.uiBlocking });
  }));
}));

// ⑤ 点坞标签 → 不穿透
const dockClick = await page.evaluate(() => {
  const g = window.__swGame;
  const lbl = [...document.querySelectorAll('.sw-eqdock .sw-lbl')].at(-1);
  const r = lbl.getBoundingClientRect();
  g.player.useTime = 0; g.player.itemAnimTicks = 0;
  window.__dockLabelPos = { x: r.left + 4, y: r.top + 4 };
  return window.__dockLabelPos;
});
await page.mouse.move(dockClick.x, dockClick.y);
await page.mouse.down(); await page.mouse.up();
const dockClickUse = await page.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const g = window.__swGame;
    res({ useTime: g.player.useTime, held: !!window.__swUI.heldStack });
  }));
}));

// ⑥ Esc 收 → E 开
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 200));
const afterEsc = await page.evaluate(() => ({
  panel: document.querySelector('.sw-panel')?.style.display,
  dock: document.querySelector('.sw-eqdock')?.style.display,
}));
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 300));
const afterE = await page.evaluate(() => ({
  panel: document.querySelector('.sw-panel')?.style.display,
  dock: document.querySelector('.sw-eqdock')?.style.display,
  blocking: window.__swGame.input.uiBlocking,
}));

console.log(JSON.stringify({ open, moveDx, swing, dockClick, dockClickUse, afterEsc, afterE }, null, 1));
console.log('PAGE_ERRORS:', JSON.stringify(errs.slice(0, 5), null, 1));
await page.screenshot({ path: 'shots/eqdock-open.png' });
await page.screenshot({ path: 'shots/eqdock-corner.png', clip: { x: 1150, y: 520, width: 450, height: 480 } });
await browser.close();
