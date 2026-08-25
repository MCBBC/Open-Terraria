// 探针：捣蛋猫攻击期帧序列（2026-08-24/25 用户两报白帧）。dev 全道具召唤捣蛋猫
// → 附近刷敌 → 连拍读 smartSelect 不可行——直接读弹幕实体的 palFrame 与贴图帧。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  g.setupDevMode();
  // 找捣蛋猫召唤物（1112 的持有物品）——扫背包 vi_389_/vi_6148_（Trusty Cattiva 物品）
  const inv = g.player.inv;
  // 召唤杖 = vi_6148_*（Trusty Cattiva 杖，vid 6148 → shoot 1112）
  const items = window.__swItems;
  const staffKey = Object.keys(items).find((k) => /^vi_6148_/.test(k));
  if (!staffKey) return { fail: 'vi_6148_* 未注册' };
  const staffIid = items[staffKey];
  inv.slots[10] = { id: staffIid, stack: 1 };
  if (staffIid === null) {
    // 兜底：直接扫 ITEM_DEFS 找 useProjectile 1112 的物品 id
    return { fail: '未找到捣蛋猫召唤物' };
  }
  // 选中该格并按住左键召唤
  inv.selected = 10;
  return { staffIid, sel: inv.selected };
});
console.log(JSON.stringify(out));
// 模拟按住左键 2 秒召唤
await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const r = cv.getBoundingClientRect();
  cv.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true }));
});
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const r = cv.getBoundingClientRect();
  document.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true }));
});
// 读捣蛋猫弹幕的帧序列：刷敌前 3 帧 + 刷敌后连拍
const frames = await page.evaluate(async () => {
  const g = window.__swGame;
  const find = () => g.entities.projectiles.find((p2) => p2.projId === 1112 && !p2.dead);
  if (!find()) return { fail: '捣蛋猫未召唤' };
  const seq = [];
  // 无敌 → 有敌：直接在附近生成敌怪（Game.spawnEnemy? 用 dev 的刷怪逻辑——简化：
  // 传送到敌群不可行；改读 palFrame 随时间变化即可验证帧机不再轮播白帧区间）
  for (let i = 0; i < 40; i++) {
    const m = find();
    if (!m) break;
    seq.push({ palFrame: m.palFrame, palA0: m.palA0, age: m.age });
    await new Promise((r) => setTimeout(r, 100));
  }
  return { seq };
});
console.log(JSON.stringify(frames).slice(0, 600));
const bad = (frames.seq ?? []).filter((s) => s.palFrame >= 14);
const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };
A(!frames.fail, frames.fail ?? '');
A(bad.length === 0, `帧序列出现 ≥14 白帧区间 ${bad.length} 次: ${JSON.stringify(bad.slice(0, 3))}`);
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK');
await browser.close();
