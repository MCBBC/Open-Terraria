// SW-FX52 探针：关包热栏右键可达（RB12b C2 现状复核）+ onBuffsFrame 逐帧接线活体验证。
// 金标：Main.cs:44322-44387 GUIHotbarDrawInner —— 关包态 context13 只 Draw 不 Handle，
// 右键开包/换型/装备/拆半整面不可达（悬停 mouseInterface 吞世界交互）；开包态 context0
// 全链照走（RightClick ItemSlot.cs:1636+ 首支 OpenableBag）。DrawBuffIcon Main.cs:44042
// 每帧语义 → 逐帧接线后 buff 图标生灭当帧跟手（1Hz 整刷臂不动）。
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5201'}/?play=small`,
  { waitUntil: 'domcontentloaded', timeout: 90000 });
const t0 = Date.now();
for (let i = 0; i < 90; i++) {
  const ok = await page.evaluate(() => !!window.__swGame?.player && !!window.__swUI).catch(() => false);
  if (ok) break;
  await new Promise((r) => setTimeout(r, 1000));
  if (i === 89) throw new Error('game boot timeout');
}
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if (/我知道了|知道了/.test(b.textContent || '')) b.click();
});

const res = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
  const slot = (i) => document.querySelector(`.sw-hotbar .sw-slot[data-idx="${i}"][data-where="inv"]`);
  const rightClick = (el) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mousedown', {
      button: 2, bubbles: true, cancelable: true,
      clientX: r.x + r.width / 2, clientY: r.y + r.height / 2,
    }));
  };
  const invOpen = () => ui.invPanel?.style.display === 'block';
  const bagIid = invIndexOfVanilla(3318);      // 史王袋（OpenableBag/BossBag 首支）
  const torchIid = invIndexOfVanilla(8);       // 火把（99 叠,拆半靶）
  g.player.inv.slots[0] = { id: bagIid, stack: 1 };
  g.player.inv.slots[1] = { id: torchIid, stack: 99 };
  ui.refreshAll();
  await raf(); await raf();

  // ---- ① 关包态：袋右键 = 整面吞（不开包/不消耗/不开背包/不透世界 rightDown）
  const openBefore = invOpen();
  rightClick(slot(0));
  await raf(); await raf();
  const closedBag = {
    openBefore, invOpened: invOpen(),
    bagGone: g.player.inv.slots[0]?.id !== bagIid || !g.player.inv.slots[0],
    rightDown: g.input.rightDown,
  };
  // ---- ② 关包态：99 叠右键 = 不拆半
  rightClick(slot(1));
  await raf(); await raf();
  const closedStack = { stack: g.player.inv.slots[1]?.stack ?? -1, held: !!ui.heldStack };
  // ---- ③ 关包态：装备物右键 = 不装备（swapEquip 不可达）
  const hermesIid = invIndexOfVanilla(53);     // 疾跑鞋（可装备配饰）
  g.player.inv.slots[2] = { id: hermesIid, stack: 1 };
  ui.refreshAll(); await raf();
  rightClick(slot(2));
  await raf(); await raf();
  const closedEquip = { stillInSlot: g.player.inv.slots[2]?.id === hermesIid };
  // ---- ④ 开包态非回归：同袋右键 = 开包消耗 + 背包已开（RB12b 门只关包生效）
  ui.openInventory(true);
  await raf(); await raf();
  const openState = invOpen();
  g.player.inv.slots[0] = { id: bagIid, stack: 1 };
  ui.refreshAll(); await raf();
  rightClick(slot(0));
  await raf(); await raf();
  const openBag = { openState, bagConsumed: g.player.inv.slots[0]?.id !== bagIid || !g.player.inv.slots[0] };
  ui.closeInventory();
  await raf();
  // ---- ⑤ onBuffsFrame 逐帧接线活体（全自动面）：不手动调 cb，仅挂/摘 buff 后等
  //  2 渲染帧 —— Game.fixedUpdate 每 tick 的逐帧调用必须已把图标上/下屏（1Hz 整刷
  //  臂最坏要等 1s；两帧内可见 = 逐帧通道活的直接证据）
  const BuffType = (await import('/src/stats/Buffs.ts')).BuffType;
  const visBuffs = () => [...document.querySelectorAll('.sw-buff')]
    .filter((b) => b.style.display !== 'none').length;
  g.paused = false; g.input.uiBlocking = false;
  const tick0 = g.tickCount;
  await raf(); await raf(); await raf(); await raf();
  const ticking = g.tickCount > tick0;
  const before = visBuffs();
  g.player.buffs.apply(BuffType.Ironskin, 25 * 60);
  await raf(); await raf(); await raf();
  const afterAdd = visBuffs();
  g.player.buffs.remove(BuffType.Ironskin);
  await raf(); await raf(); await raf();
  const afterRemove = visBuffs();
  return {
    closedBag, closedStack, closedEquip, openBag,
    buffs: { before, afterAdd, afterRemove, ticking },
  };
});
console.log('RESULT ' + JSON.stringify(res, null, 1));
const bad = [];
if (res.closedBag.openBefore !== false) bad.push('①前置:背包应为关');
if (res.closedBag.invOpened) bad.push('①关包右键袋 → 背包被开(原版不可达)');
if (res.closedBag.bagGone) bad.push('①关包右键袋 → 袋被消耗');
if (res.closedBag.rightDown) bad.push('①关包右键 → rightDown 置位(世界交互未吞)');
if (res.closedStack.stack !== 99 || res.closedStack.held) bad.push('②关包右键 99 叠 → 拆半可达');
if (!res.closedEquip.stillInSlot) bad.push('③关包右键装备物 → 装备可达');
if (!res.openBag.openState) bad.push('④开包态未建立');
if (!res.openBag.bagConsumed) bad.push('④开包态袋右键未消耗(门误伤开包全链!)');
if (!res.buffs.ticking) bad.push('⑤fixedUpdate 未在跑(tickCount 不进)');
if (!(res.buffs.afterAdd > res.buffs.before)) bad.push('⑤buff 添加未上屏(逐帧通道死)');
if (!(res.buffs.afterRemove <= res.buffs.before)) bad.push('⑤buff 移除未下屏(逐帧通道死)');
console.log(bad.length ? '❌ FAIL\n' + bad.join('\n') : '✅ 全部通过');
if (errs.length) console.log('JS错误:', errs.join(' | '));
await browser.close();
process.exit(bad.length || errs.length ? 1 : 0);
