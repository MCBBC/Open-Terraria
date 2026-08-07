// 背包系统验证：开局物品入背包格 + 装备栏铁三件 + 防御 + 拖拽/垃圾桶
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'inv-smoke');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, {timeout: 120000});
await new Promise(r => setTimeout(r, 1200));

// 打开背包
await page.keyboard.press('KeyE');
await new Promise(r => setTimeout(r, 400));
const state = await page.evaluate(() => {
  const g = window.__swGame, inv = g.player.inv;
  const key = (i) => { const s = inv.slots[i]; return s ? { i, id: s.id, stack: s.stack } : null; };
  return {
    hotbar: [0,1,2,3].map(key),
    bag: [10,11,12,13,14,15,16].map(key),
    armor: [45,46,47].map(key),
    vanity: [48,49,50].map(key),
    accessory: [40,41].map(key),
    defense: g.player.defense,
    slotEls: document.querySelectorAll('.sw-slot[data-idx]').length,
    trashEl: !!document.querySelector('.sw-trash'),
    invSize: inv.slots.length,
  };
});
console.log('STATE', JSON.stringify(state, null, 1));

// 拖拽：把背包第 0 格药水拖到背包第 5 格(15)
const drag = await page.evaluate(() => {
  const from = document.querySelector('.sw-slot[data-idx="10"]');
  const to = document.querySelector('.sw-slot[data-idx="15"]');
  const fr = from.getBoundingClientRect(), tr = to.getBoundingClientRect();
  const opts = (x, y) => ({ bubbles: true, clientX: x, clientY: y, button: 0, buttons: 1 });
  from.dispatchEvent(new MouseEvent('mousedown', opts(fr.x + 22, fr.y + 22)));
  document.dispatchEvent(new MouseEvent('mousemove', opts(fr.x + 40, fr.y + 40)));
  document.dispatchEvent(new MouseEvent('mousemove', opts(tr.x + 22, tr.y + 22)));
  document.dispatchEvent(new MouseEvent('mouseup', opts(tr.x + 22, tr.y + 22)));
  const inv = window.__swGame.player.inv;
  return { from: inv.slots[10], to: inv.slots[15] };
});
console.log('DRAG', JSON.stringify(drag));

// 再拖回原位 → 拖到垃圾桶删除
const trash = await page.evaluate(() => {
  const from = document.querySelector('.sw-slot[data-idx="15"]');
  const trashEl = document.querySelector('.sw-trash');
  const fr = from.getBoundingClientRect(), tr = trashEl.getBoundingClientRect();
  const opts = (x, y) => ({ bubbles: true, clientX: x, clientY: y, button: 0, buttons: 1 });
  from.dispatchEvent(new MouseEvent('mousedown', opts(fr.x + 22, fr.y + 22)));
  document.dispatchEvent(new MouseEvent('mousemove', opts(fr.x + 44, fr.y + 30)));
  document.dispatchEvent(new MouseEvent('mousemove', opts(tr.x + 22, tr.y + 22)));
  document.dispatchEvent(new MouseEvent('mouseup', opts(tr.x + 22, tr.y + 22)));
  const inv = window.__swGame.player.inv;
  return { slot15: inv.slots[15], uiHeld: window.__swGame.ui?.heldStack ?? null };
});
console.log('TRASH', JSON.stringify(trash));

// 存档往返：走游戏内 doSave 不可用，直接校验槽位长度一致性
const save = await page.evaluate(() => ({ invSize: window.__swGame.player.inv.slots.length }));
console.log('SAVE_API', JSON.stringify(save));
await page.screenshot({ path: '/tmp/inv-smoke.png' });
console.log('ERRS', JSON.stringify(errs.slice(0, 8)));
await browser.close();
