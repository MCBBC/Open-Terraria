// ★BJ224 实机复验：穿神圣套后 (a)时装槽贝壳发夹 tooltip 无套装奖励行（用户截图场景）
// (b)神圣套件本尊背包悬停=单件文本 (c)佩戴槽悬停=N/D 绿档。直调 ui.showTooltipFor 读 DOM。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
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
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // 穿神圣近战三件 558/551/552；时装头槽 armor[10]=贝壳发夹 2417；背包 0=发夹 1=神圣胸甲
  g.player.inv.armor[0] = { id: idOf(558), stack: 1 };
  g.player.inv.armor[1] = { id: idOf(551), stack: 1 };
  g.player.inv.armor[2] = { id: idOf(552), stack: 1 };
  g.player.inv.armor[10] = { id: idOf(2417), stack: 1 };
  g.player.inv.slots[0] = { id: idOf(2417), stack: 1 };
  g.player.inv.slots[1] = { id: idOf(551), stack: 1 };
  ui.openInventory();
  ui.refreshAllNow?.() ?? ui.refreshAll();
  await wait(300);
  const dump = (i, where) => {
    ui.showTooltipFor(i, where);
    const html = ui.tooltip.innerHTML ?? '';
    const lines = html.split(/<br\s*\/?>/).map((s) => s.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
    return { lines, raw: html };
  };
  // A. 截图场景：时装槽发夹 → 无套装奖励行
  const A = dump(10, 'armor');
  // B. 背包发夹 → 无
  const B = dump(0, 'inv');
  // C. 背包神圣胸甲 → 单件文本（注册序首套=召唤套,主件头 → 随头部装备改变）
  const C = dump(1, 'inv');
  // D. 佩戴槽胸甲（全套在身）→ 套装奖励(3/3) 绿
  const D = dump(1, 'armor');
  // E. 佩戴槽头盔 → 套装奖励(3/3) 本套文本
  const E = dump(0, 'armor');
  const greenInD = /rgb\(50,\s*205,\s*50\)|LimeGreen/i.test(D.raw);
  return {
    A: A.lines, B: B.lines, C: C.lines, D: D.lines, E: E.lines,
    checks: {
      A_noSetBonus: !A.lines.some((l) => l.includes('套装奖励')),
      B_noSetBonus: !B.lines.some((l) => l.includes('套装奖励')),
      C_singlePiece: C.lines.some((l) => l === '套装奖励：随头部装备改变'),
      C_notHallowedActive: !C.lines.some((l) => l.includes('攻击敌人后进入免疫状态')),
      D_worn33: D.lines.some((l) => l === '套装奖励(3/3)') && D.lines.some((l) => l === '攻击敌人后进入免疫状态'),
      D_green: greenInD,
      E_worn33: E.lines.some((l) => l === '套装奖励(3/3)'),
    },
  };
});
console.log('[probe] A 时装槽发夹行:', JSON.stringify(res.A));
console.log('[probe] B 背包发夹行:', JSON.stringify(res.B));
console.log('[probe] C 背包神圣胸甲行:', JSON.stringify(res.C));
console.log('[probe] D 佩戴胸甲行:', JSON.stringify(res.D));
console.log('[probe] E 佩戴头盔行:', JSON.stringify(res.E));
console.log('[probe] checks', JSON.stringify(res.checks));
console.log('[probe] pageerrors', errs.length ? errs.slice(0, 3) : 'none');
await browser.close().catch(() => {});
const ok = res.checks && Object.values(res.checks).every(Boolean) && errs.length === 0;
console.log(ok ? 'BJ224 PROBE PASS' : 'BJ224 PROBE FAIL');
process.exit(ok ? 0 : 1);
