// ★清偿刀 R4 实机验证探针（Q3 登记收口）：4762 CritterShampoo（accessory+vanity 双旗）
// 经真实 UI 链路装备进功能配饰段 armor[3]——placeHeld→armorAcceptsDrag→armorAccepts
// （收刀面）。收刀前该链在 armorAccepts 类门 `acc!==1` 处被拒=Q3 登记偏差本体。
// 流程：sp 进世界 → 背包 grants 4762 → 开背包 → 左键拾取 → 左键放置功能槽 3 →
// 回读 inv.armor[3] vid + 截图留档 game/docs/evidence/acc0/。
// 判读：armor[3].vid===4762 且 armor[13] 空（不双占）→ R4 收刀实证。
import { writeFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const OUT_DIR = 'docs/evidence/acc0';
mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 160)));
console.log('STEP:goto');
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5570') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
{
  const cleared = await page.evaluate(async () => {
    try {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      return ks.length;
    } catch { return -1; }
  });
  if (cleared > 0) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 500));
  }
}
console.log('STEP:wait-sp');
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
try { await page.waitForSelector('.sw-vsel', { timeout: 15000 }); }
catch { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 45000 }); }
await new Promise((r) => setTimeout(r, 600));
console.log('STEP:char/world-create');
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('R4');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
console.log('STEP:world-boot');
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
{
  const ack = await page.$('#sw-welcome-announce button');
  if (ack) { await ack.click(); await new Promise((r) => setTimeout(r, 400)); }
}
console.log('STEP:grant-4762');
const grant = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_4762_/.test(k));
  if (!key) return { ok: false, reason: 'no vi_4762 key', keys: Object.keys(byKey).filter((k) => /4762/.test(k)) };
  const iid = byKey[key];
  const key2276 = Object.keys(byKey).find((k) => /^vi_2276_/.test(k));
  const iid2276 = key2276 ? byKey[key2276] : null;
  g.player.inv.slots[5] = { id: iid, stack: 1 };
  if (iid2276) g.player.inv.slots[6] = { id: iid2276, stack: 1 };   // 社交段对照=另一件双旗（同款跨段互斥 :1448——4762×2 不可共存,原版同相）
  ui.openInventory(true);
  if (typeof ui.refreshAll === 'function') ui.refreshAll();
  return { ok: true, key, iid, second: key2276 ?? 'NONE' };
});
console.log('GRANT:', JSON.stringify(grant));
if (!grant.ok) { await browser.close(); process.exit(2); }
await new Promise((r) => setTimeout(r, 700));

// 找背包格 5 与功能配饰槽 3 的真实 DOM 格中心
const cellCensus = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('[data-where]')]
    .filter((el) => { const rc = el.getBoundingClientRect(); return rc.width > 0 && rc.right > 0; })
    .map((el) => ({ w: el.dataset.where, i: el.dataset.idx, x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y) }));
  return { total: document.querySelectorAll('[data-where]').length, visible: cells.slice(0, 60) };
});
console.log('CELLS:', JSON.stringify(cellCensus));
const rects = await page.evaluate(() => {
  const center = (el) => {
    const rc = el.getBoundingClientRect();
    return Number.isFinite(rc.x) && rc.width > 0 ? { x: rc.x + rc.width / 2, y: rc.y + rc.height / 2 } : null;
  };
  const vis = (sel) => [...document.querySelectorAll(sel)].find((el) => {
    const rc = el.getBoundingClientRect();
    return rc.width > 0 && rc.height > 0 && rc.right > 0;
  }) ?? null;
  const invCell = vis('[data-where=inv][data-idx="5"]');
  const inv6Cell = vis('[data-where=inv][data-idx="6"]');
  const accCell = vis('[data-where=armor][data-idx="3"]');
  const vanCell = vis('[data-where=armor][data-idx="13"]');
  return {
    inv: invCell ? center(invCell) : null,
    inv6: inv6Cell ? center(inv6Cell) : null,
    acc: accCell ? center(accCell) : null,
    van: vanCell ? center(vanCell) : null,
  };
});
console.log('RECTS:', JSON.stringify(rects));
if (!rects.inv || !rects.acc) { console.log('FAIL: cells not visible'); await browser.close(); process.exit(3); }

console.log('STEP:pick-then-place (real UI click chain = placeHeld→armorAcceptsDrag→armorAccepts)');
await page.mouse.click(rects.inv.x, rects.inv.y);   // 左键拾取 4762 到光标
await new Promise((r) => setTimeout(r, 500));
await page.mouse.click(rects.acc.x, rects.acc.y);   // 左键放置到功能配饰槽 3
await new Promise((r) => setTimeout(r, 700));

const readback = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const vidOf = (it) => it ? (window.__swItems ? Object.entries(window.__swItems).find(([, v]) => v === it.id)?.[0] : null) : null;
  const a3 = g.player.inv.armor[3] ?? null;
  const a13 = g.player.inv.armor[13] ?? null;
  const s5 = g.player.inv.slots[5] ?? null;
  const s6 = g.player.inv.slots[6] ?? null;
  const held = ui.heldStack ?? null;
  return {
    armor3: a3 ? { id: a3.id, is4762: vidOf(a3)?.startsWith('vi_4762') ?? false } : null,
    armor13: a13 ? { id: a13.id } : null,
    slot5Left: s5 ? vidOf(s5) : null,
    slot6: s6 ? vidOf(s6) : null,
    heldAfter: held ? vidOf(held) : null,
    unlocked3: g.player.inv.isItemSlotUnlockedAndUsable(3),
  };
});
console.log('READBACK:', JSON.stringify(readback));

// 社交段对照（老路回归）：双旗 2276 Gravity Globe（背包格 6）放社交段 13
//  ——4762 已占功能段 3,同款第二件进社交段被 :1448 对段同款臂拒=原版同相（探针
//  READBACK2.armor13 恒 false 即该臂实证）,故对照物换异款双旗。
if (rects.van && rects.inv6) {
  await page.mouse.click(rects.inv6.x, rects.inv6.y);   // 拾取背包格 6 的 2276
  await new Promise((r) => setTimeout(r, 400));
  await page.mouse.click(rects.van.x, rects.van.y);
  await new Promise((r) => setTimeout(r, 500));
}
const readback2 = await page.evaluate(() => {
  const g = window.__swGame;
  const vid = (it) => it ? (window.__swItems ? (Object.entries(window.__swItems).find(([, v]) => v === it.id)?.[0] ?? '') : '') : null;
  return {
    armor3: g.player.inv.armor[3] ? (vid(g.player.inv.armor[3]) ?? '').startsWith('vi_4762') : false,
    armor13: g.player.inv.armor[13] ? (vid(g.player.inv.armor[13]) ?? '').startsWith('vi_2276') : false,
  };
});
console.log('READBACK2:', JSON.stringify(readback2));

await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: OUT_DIR + '/acc0-functional-equip.png' });
console.log('SCREENSHOT:' + OUT_DIR + '/acc0-functional-equip.png');

// 证据特写：悬停功能槽 3（tooltip 出字「CritterShampoo」）+ 装备面板区裁切
if (rects.acc) {
  await page.mouse.move(rects.acc.x, rects.acc.y);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: OUT_DIR + '/acc0-functional-equip-zoom.png', clip: { x: 940, y: 380, width: 340, height: 460 } });
  console.log('SCREENSHOT:' + OUT_DIR + '/acc0-functional-equip-zoom.png');
  await page.mouse.move(640, 300);   // 移开光标防残影
  await new Promise((r) => setTimeout(r, 400));
}

const verdict = {
  functionalEquip: readback.armor3?.is4762 === true || readback2.armor3 === true,
  socialStill: readback2.armor13 === true,
  noHeldResidue: !readback.heldAfter,
};
console.log('VERDICT:', JSON.stringify(verdict));
writeFileSync(OUT_DIR + '/acc0-live-readback.json', JSON.stringify({ grant, rects, readback, readback2, verdict }, null, 2));
await browser.close();
process.exit(verdict.functionalEquip && verdict.socialStill ? 0 : 4);
