// 悬停气泡端到端探针：真实 UI.showTooltipFor 对多类物品渲染，断言行序含关键行族。
// 物品注入走 spawnDrop+拾取（模块分叉教训）。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
check('世界就绪', true);

// vanilla.json PascalKey
await page.evaluate(async () => {
  const v = await fetch('/sprites/vanilla.json').then((r) => r.json());
  window.__keys = {};
  for (const vid of ['4', '157', '3509', '2289', '188', '288', '9', '40', '48']) {
    window.__keys[vid] = `vi_${vid}_${v.items[vid].key}`;
  }
});

const hover = async (vid) => {
  return page.evaluate(async (v) => {
    const g = window.__swGame, ui = window.__swUI;
    // 游戏侧注入：丢在玩家身上拾取，选中该槽
    const key = window.__keys[v];
    const d = g.spawnDrop(g.player.cx, g.player.y + 4, key, 1, 0, -1);
    if (!d) return { why: 'no drop ' + key };
    const want = d.itemId;
    for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
    const inv = g.player.inv;
    const sel = inv.slots.findIndex((sl) => sl && sl.id === want);
    if (sel < 0) return { why: 'no pickup' };
    inv.selected = sel;
    // 悬停该格
    ui['showTooltipFor'](sel, 'inv');
    const d2 = (await import('/src/data/items.ts')).ITEM_DEFS[inv.slots[sel].id];
    return { text: ui.tooltip.innerText, key: d2?.key };
  }, vid);
};

const cases = [
  ['铜短剑 4（近战四行）', '4', (t) => t.includes('近战伤害') && t.includes('%暴击率') && t.includes('速度') && t.includes('击退')],
  ['水之杖 157（魔法+耗魔）', '157', (t) => t.includes('魔法伤害') && t.includes('魔力')],
  ['铜镐 3509（镐力）', '3509', (t) => t.includes('%镐力')],
  ['钓鱼竿 2289（渔力/鱼饵）', '2289', (t) => t.includes('%渔力') && t.includes('需要鱼饵')],
  ['治疗药水 188（恢复/消耗品）', '188', (t) => t.includes('恢复') && t.includes('消耗品')],
  ['黑曜石皮药水 288（持续行）', '288', (t) => t.includes('持续时间')],
  ['木材 9（可放置/材料）', '9', (t) => t.includes('可放置') && t.includes('材料')],
  ['木箭 40（弹药）', '40', (t) => t.includes('弹药')],
  ['宝箱 48（容器行=官方译"接收到信号时会收集附近的掉落物品"）', '48', (t) => t.includes('收集附近的掉落')],
];
for (const [name, vid, ok] of cases) {
  const r = await hover(vid);
  const text = r.text ?? '';
  check(name, !!text && ok(text), (r.key ?? '') + ' | ' + text.split('\n').slice(1, 4).join(' | ').slice(0, 90));
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
