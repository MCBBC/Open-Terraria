// SW-FX21 右键开袋实机探针：debug 桥 newWorld → 注入 BossBag 3318 → 开包态右键
// [data-idx="0"][data-where="inv"] → 断言袋消耗+产出入包（ItemSlot.cs:1636-1645
// → TryOpenContainer :1764-1782 实机链）。附关包热栏右键可达性取证（登记债用）。
// 用法：SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_fx21-bag-rightclick.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(ORIGIN, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async () => {
  await window.__swFlow.newWorld('424242', 4200, 1200);
});
await page.waitForFunction(() => !!window.__swGame, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const res = { cases: [] };
  const iidOf = (vid) => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
  const snap = () => g.player.inv.slots.map((s) => (s ? { id: s.id, stack: s.stack } : null));
  const rightClick = (idx) => {
    const el = document.querySelector(`[data-idx="${idx}"][data-where="inv"]`);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: false, cancelable: true }));
    return true;
  };
  const wait = () => new Promise((r) => setTimeout(r, 300));

  // ---- C1 开包态右键热栏格（原版 context 0,ItemSlot.cs:1638）:史王袋 3318 ----
  for (let i = 0; i < g.player.inv.slots.length; i++) g.player.inv.slots[i] = null;
  g.player.inv.slots[0] = { id: iidOf(3318), stack: 1 };
  ui.openInventory(true);
  await wait();
  const pre = snap();
  const clicked = rightClick(0);
  await wait();
  const post = snap();
  const loot = post.map((s, i) => ({ i, ...s })).filter((s) => s.id !== undefined && s.id !== null);
  res.cases.push({
    name: 'C1 开包态右键 3318（槽 0=热栏首格,context 0）',
    clicked,
    preBag: pre[0],
    consumed: post[0] === null,
    lootCount: loot.length,
    lootIds: loot.slice(0, 14).map((s) => s.id),
    invOpen: ui.inventoryOpen,
    pass: clicked && post[0] === null && loot.length >= 5,
  });

  // ---- C2 关包态右键热栏格（原版 context 13=仅 Draw/hover,Main.cs:44353-44374
  //      无 RightClick 面 → 预期不开=登记债取证;若 consumed=true = 关包可达偏差）----
  for (let i = 0; i < g.player.inv.slots.length; i++) g.player.inv.slots[i] = null;
  g.player.inv.slots[0] = { id: iidOf(3319), stack: 1 };
  g.closeInventory();
  await wait();
  const pre2 = snap();
  rightClick(0);
  await wait();
  const post2 = snap();
  res.cases.push({
    name: 'C2 关包态右键热栏 3319（context 13 无右键面=债取证:main.cs:44353-44374 仅 Draw/hover/左选;偏差=共享槽 handler 关包可达,SW-FX21 登记不动刀）',
    preBag: pre2[0],
    consumedDespiteClosed: post2[0] === null,
    deviationConfirmed: post2[0] === null,   // true = 偏差复现（债在案）
    pass: true,                              // C2 是取证臂,不作门;债断言见报告
  });

  // ---- C3 开包态右键非热栏背包格（idx 12,原版 context 0 主背包）:5111 之袋 ----
  for (let i = 0; i < g.player.inv.slots.length; i++) g.player.inv.slots[i] = null;
  g.player.inv.slots[12] = { id: iidOf(3093), stack: 1 };   // 草药袋（非 BossBag 族对照）
  ui.openInventory(true);
  await wait();
  rightClick(12);
  await wait();
  const post3 = snap();
  const loot3 = post3.filter((s) => s !== null).length;
  res.cases.push({
    name: 'C3 开包态右键主背包格 3093 草药袋（非 BossBag 回归对照）',
    consumed: post3[12] === null,
    lootCount: loot3,
    pass: post3[12] === null && loot3 >= 1,
  });

  res.invSlotCount = g.player.inv.slots.length;
  return res;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
const bad = out.cases.filter((c) => !c.pass);
process.exit(bad.length ? 1 : 0);
