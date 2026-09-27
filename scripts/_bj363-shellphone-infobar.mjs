// BJ363 探针:贝壳电话(Shellphone 5358)信息栏时间行复现。
// 流程:入包 5358 → 门禁/行文本断言 → 右键换型循环(5358→5360→5361→5359) →
// 装备槽佩戴 → Dummy 5437 转正 → 每步 dump 行文本+右上截图。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.keyboard.type('BJ363');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('363363');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// dump 面数:门禁+ctx+live 行
const dump = (tag) => page.evaluate((t) => {
  const g = window.__swGame;
  const gates = g.player.equipStats.infoAccs ?? {};
  const ctx = g.renderer.infoAccCtx;
  const rows = (g.renderer.infoAccs?.state?.rows ?? []).map((r) => `${r.icon}:${r.text}`);
  const inv = g.player.inv.slots.slice(0, 10).map((s) => s ? s.id : 0).join(',');
  const held = g.player.inv.heldItem()?.id ?? -1;
  const heldVid = window.__swItems ? Object.entries(window.__swItems).find(([, id]) => id === held)?.[0] : null;
  return { tag: t, accWatch: gates.accWatch, anyGate: JSON.stringify(gates), rows, ctxTime: ctx ? Math.round(ctx.mainTime) : -1, ctxDay: ctx ? ctx.dayTime : null, inv0_9: inv, held, heldVid };
}, tag).then((d) => { console.log(`[${d.tag}] accWatch=${d.accWatch} ctxTime=${d.ctxTime} day=${d.ctxDay} held=${d.heldVid ?? d.held} inv[0..9]=${d.inv0_9}`); console.log('  rows: ' + (d.rows.join(' | ') || '(无)')); return d; });

const grant = (key, slot) => page.evaluate(([k, s]) => {
  const g = window.__swGame;
  g.player.inv.slots[s] = { id: window.__swItems[k], stack: 1 };
  g.cb?.onInventoryChanged?.();
}, [key, slot]);

// ---- 步骤 0:基线(无饰品) ----
const b0 = await dump('基线-无饰品');
check('基线 accWatch=0', b0.accWatch === 0);

// ---- 步骤 1:入包 5358(背包 40 号格) ----
await grant('vi_5358_shellphone', 40);
await new Promise((r) => setTimeout(r, 1200));
const s1 = await dump('入包5358');
check('5358 入包 accWatch=3', s1.accWatch === 3, `accWatch=${s1.accWatch}`);
check('5358 时间行存在且形如 时:分', s1.rows.some((t) => t.startsWith('0:') && /\d{1,2}:\d/.test(t)), s1.rows[0] ?? '');
await page.screenshot({ path: '/tmp/bj363-step1-inv.png', clip: { x: 900, y: 0, width: 380, height: 560 } });

// ---- 步骤 2:右键换型循环(held=5358 → 5360) ----
// 模拟右键:直接调 Game 内换型等价面——沿 swapShellphoneDestination 语义改 slot.id
for (const [from, to] of [['vi_5358_shellphone', 'vi_5360_shellphone_ocean'], ['vi_5360_shellphone_ocean', 'vi_5361_shellphone_hell'], ['vi_5361_shellphone_hell', 'vi_5359_shellphone_spawn']]) {
  await grant(to, 40);
  await new Promise((r) => setTimeout(r, 700));
  const d = await dump(`换型→${to}`);
  check(`${to} 后 accWatch=3`, d.accWatch === 3);
  check(`${to} 后时间行正常`, d.rows.some((t) => t.startsWith('0:') && /\d{1,2}:\d/.test(t)), d.rows[0] ?? '');
}

// ---- 步骤 3:装备槽佩戴(acc[0]) ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.slots[40] = null;   // 摘背包
  g.player.inv.armor[3] = { id: window.__swItems['vi_5358_shellphone'], stack: 1 };
  g.cb?.onInventoryChanged?.();
});
await new Promise((r) => setTimeout(r, 1200));
const s3 = await dump('佩戴acc0');
check('佩戴 accWatch=3', s3.accWatch === 3, `accWatch=${s3.accWatch}`);
check('佩戴 时间行正常', s3.rows.some((t) => t.startsWith('0:') && /\d{1,2}:\d/.test(t)), s3.rows[0] ?? '');

// ---- 步骤 4:Dummy 5437(未转正)——原版语义=无信息行 ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.armor[3] = { id: window.__swItems['vi_5437_shellphone'], stack: 1 };
  g.cb?.onInventoryChanged?.();
});
await new Promise((r) => setTimeout(r, 1200));
const s4 = await dump('Dummy5437');
console.log(`  (原版语义:5437 非全开门 → accWatch 期望 0,行集=其余件)`);
await page.screenshot({ path: '/tmp/bj363-step4-dummy.png', clip: { x: 900, y: 0, width: 380, height: 560 } });

// ---- 步骤 5:藏行门 hideInfo[0] 手动置真(原版=背包横排点击翻转) ----
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.armor[3] = { id: window.__swItems['vi_5358_shellphone'], stack: 1 };
  g.player.hideInfo[0] = true;
  g.cb?.onInventoryChanged?.();
});
await new Promise((r) => setTimeout(r, 1200));
const s5 = await dump('hideInfo[0]=true(时间行藏)');
check('藏行后时间行消失(首行≠icon0)', !s5.rows.some((t) => t.startsWith('0:')), s5.rows[0] ?? '');
await page.screenshot({ path: '/tmp/bj363-step5-hidden.png', clip: { x: 900, y: 0, width: 380, height: 560 } });
await page.evaluate(() => { window.__swGame.player.hideInfo[0] = false; });

// ---- 步骤 6:DOM 层对拍(?infodom 运行时翻面口) ----
await page.evaluate(() => { window.__swInfoDom?.set?.(true); });
await new Promise((r) => setTimeout(r, 1200));
const domRows = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.sw-infoaccs .sw-inf-row span')];
  return els.map((e) => e.textContent);
});
console.log('[DOM层] 行文本: ' + (domRows.join(' | ') || '(无)'));
check('DOM 层时间行同相', domRows.some((t) => /\d{1,2}:\d/.test(t)), domRows[0] ?? '');
await page.screenshot({ path: '/tmp/bj363-step6-dom.png', clip: { x: 900, y: 0, width: 380, height: 560 } });

console.log(`\n== ${pass} pass / ${fail} fail ==`);
if (errors.length) { console.log('页面错误:'); errors.slice(0, 6).forEach((e) => console.log('  ' + e.slice(0, 220))); }
await browser.close();
process.exit(fail ? 1 : 0);
