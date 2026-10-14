// ★BJ669e2 v5（清偿A-F1/F2 verdict 同步 + F4/F5/F6 定谳四合一;2026-10-14）。
//  v4 基础上（v3 合成 dispatchEvent 与真实边界事件不同相的教训,改 page.mouse 原生
//  输入:慢移入 A → 1 步快跳 B=病灶相）更新/扩四部分:
//  ①F1/F2 verdict 重锚:cursorTooltipPos 已对齐 ThickMouse +6/+6（Main.cs:20385-20389,
//    :2684+:276 默认档恒开）与 item 路径文字缘钳（Main.cs:20561-20579:num4=4 opaque
//    关/18 开;.sw-tooltip padding 9/13 补偿→元素缘 pad 5/9 开、-9/-5 关）→ 期望
//    top=by+20、left 非钳=bx+20;opaque 关子程验 num4=4 档（钳支 sl=vw+9−tw）。
//  ②F6 定谳:悬停槽原地左键拾取（无位移,不产生边界事件）→ 修复后气泡隐藏
//    （原版空槽悬停零 tooltip,ItemSlot.cs:3174/:3179 IsAir 不置 hoverItemName）;
//    修前形态=旧内容气泡残留随光标漂移（anchored call 同式演示）。
//  ③F5 定谳:悬停宿主 DOM 移除（refreshAll 重建行族等价物证）→ Chrome 不派发
//    mouseleave → 修前跟随臂携陈旧气泡永久漂移;修后跟随臂 isConnected 检查一拍隐藏。
//  ④F4 定谳:classic+touch 象限（page2:touchOpMode='touch'+inventoryLayout='classic'）:
//    (a) 合成长按（touchstart→380ms 计时）全路径 → 修复后=触屏元素矩形锚;
//    (b) anchor 缺席直呼 showSlotHintTouch（=修复前 classic bindHint 丢 host 的
//        精确形状）→ 落光标锚支 mouseX=0 → 钉 (20,20) 左上角=病灶物证。
//  运行:起私有 vite（SW_PORT=5201 SW_NO_HMR=1）后
//    SW_ORIGIN=http://localhost:5201 node scripts/_bj669-tip-move-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const R = {};   // 分部结论汇总
const num = (v) => parseFloat(v);

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: 'bj669t', size: 'small' });
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true; options.data.playWhenUnfocused = true;
  const ui = window.__swUI;
  ui.openInventory(true);
  // 保证装备区前两格有物（armor[0]/armor[1]）+ F6 用背包格 10 有物
  const g = window.__swGame;
  if (!g.player.inv.armor[0]) g.player.inv.armor[0] = { id: 96, stack: 1 };   // 铜盔
  if (!g.player.inv.armor[1]) g.player.inv.armor[1] = { id: 98, stack: 1 };   // 铜链甲
  if (!g.player.inv.slots[10]) g.player.inv.slots[10] = { id: 96, stack: 1 };
  ui.refreshAll();
});
await wait(500);
const out = await page.evaluate(() => new Promise((resolve) => {
  const all = [...document.querySelectorAll('.sw-slot')];
  const slots = all.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.right > window.innerWidth - 340 && r.width > 20 && r.width < 80;
  });
  if (slots.length < 2) { resolve({ err: 'few', n: slots.length }); return; }
  // 排序：右列优先（装备区），取上下两格
  slots.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left || a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const A = slots[0].getBoundingClientRect(), B = slots[1].getBoundingClientRect();
  const tip = document.querySelector('.sw-tooltip');
  window.__enterSnaps = [];
  for (const el of [slots[0], slots[1]]) {
    el.addEventListener('mouseenter', () => {
      window.__enterSnaps.push({
        left: tip.style.left, top: tip.style.top,
        text: (tip.textContent || '').slice(0, 12),
        display: tip.style.display,
      });
    });
  }
  resolve({
    n: slots.length,
    A: { cx: Math.round(A.left + A.width / 2), cy: Math.round(A.top + A.height / 2), l: Math.round(A.left), t: Math.round(A.top) },
    B: { cx: Math.round(B.left + B.width / 2), cy: Math.round(B.top + B.height / 2), l: Math.round(B.left), t: Math.round(B.top) },
    viewport: { w: window.innerWidth, h: window.innerHeight },
    _tip: !!tip,
    _hooks: true,
  });
}));

// ============ ① F1/F2：光标锚 +6/+6 与 opaque 两档文字缘钳 ============
const ax = out.A.cx, ay = out.A.cy, bx = out.B.cx, by = out.B.cy;
const vw = out.viewport.w, vh = out.viewport.h;
await page.mouse.move(ax - 120, ay - 60, { steps: 4 });          // 场外起步
await page.mouse.move(ax, ay, { steps: 6 });                     // 慢移入 A（enter+连续 move）
await wait(250);
const hoverA = await page.evaluate(() => ({
  ...document.querySelector('.sw-tooltip') && {
    left: document.querySelector('.sw-tooltip').style.left,
    top: document.querySelector('.sw-tooltip').style.top,
    text: (document.querySelector('.sw-tooltip').textContent || '').slice(0, 12),
    display: document.querySelector('.sw-tooltip').style.display,
  },
  enterSnaps: window.__enterSnaps,
}));
await page.mouse.move(bx, by, { steps: 1 });                     // ★1 步快跳 B=真实病灶相
const justAfter = await page.evaluate(() => {
  const t = document.querySelector('.sw-tooltip');
  return { left: t.style.left, top: t.style.top, text: (t.textContent || '').slice(0, 12), display: t.style.display };
});
await wait(120);                                                 // settled（同批纠正应已完成）
const settled = await page.evaluate(() => {
  const t = document.querySelector('.sw-tooltip');
  return { left: t.style.left, top: t.style.top, text: (t.textContent || '').slice(0, 12), display: t.style.display };
});
const sl = num(settled.left), st = num(settled.top);
// 期望位=cursorTooltipPos 同式（F1 后）：top=by+20 精确；left 非钳支=bx+20、右缘
// 钳支 sl=vw−5−tw（opaque 开档元素缘 pad=18−13=5;钳一致性由恒等式自证）
const clamped = sl < bx + 20;
const twInferred = clamped ? vw - 5 - sl : 0;
const clampConsistent = !clamped
  || ((bx + 20 + twInferred) > vw - 5 && sl === vw - 5 - twInferred);
const posOk = st === by + 20 && clampConsistent;
const contentOk = settled.text === justAfter.text && settled.display === 'block';
const followOk = num(justAfter.top) !== num(hoverA.top);
R.F1F2 = { clamped, twInferred, posOk, contentOk, followOk, PASS: posOk && contentOk && followOk };
// F2 子程：opaque 关档（num4=4 → 元素缘 padX=4−13=−9 → 钳支 sl=vw+9−tw）
const opaqueOff = await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.opaqueBoxBehindTooltips = false;
  return options.data.opaqueBoxBehindTooltips;
});
await page.mouse.move(bx + 2, by, { steps: 1 });                 // 1px 级 move → 跟随臂重钳
await wait(120);
const settledOff = await page.evaluate(() => {
  const t = document.querySelector('.sw-tooltip');
  return { left: t.style.left, top: t.style.top, display: t.style.display };
});
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.opaqueBoxBehindTooltips = true;                   // 还原默认档
});
const sl2 = num(settledOff.left);
const clamped2 = sl2 < bx + 22;
const twInferred2 = clamped2 ? vw + 9 - sl2 : 0;
const clampConsistent2 = !clamped2
  || ((bx + 22 + twInferred2) > vw + 9 && sl2 === vw + 9 - twInferred2);
const posOkOff = num(settledOff.top) === by + 20 && clampConsistent2 && settledOff.display === 'block';
R.F2_opaqueOff = { opaqueOff, clamped2, twInferred2, posOkOff, PASS: posOkOff };

// ============ ② F6：原地左键拾取残泡 ============
// 悬停背包格 10（有物）→ 原地 down/up（零位移,零边界事件）→ 修复后气泡隐藏
await page.mouse.move(ax - 160, ay - 120, { steps: 3 });         // 先离场清气泡
await wait(80);
const f6prep = await page.evaluate(() => {
  const slot = document.querySelector('[data-where="inv"][data-idx="10"]');
  if (!slot) return { err: 'no-slot' };
  const r = slot.getBoundingClientRect();
  return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
});
await page.mouse.move(f6prep.cx, f6prep.cy, { steps: 3 });
await wait(120);
const f6shown = await page.evaluate(() => {
  const t = document.querySelector('.sw-tooltip');
  return { display: t.style.display, follow: window.__swUI.tooltipFollowsCursor };
});
await page.mouse.down();                                          // 原地按下（不移动）
await page.mouse.up();                                            // 原地抬起 = pickUp 无位移支
await wait(120);
const f6after = await page.evaluate(() => {
  const t = document.querySelector('.sw-tooltip');
  return {
    display: t.style.display,
    held: !!window.__swGame.player.inv && !!window.__swUI.heldStack,
    slotEmpty: !window.__swGame.player.inv.slots[10],
  };
});
R.F6 = {
  shownBefore: f6shown, after: f6after,
  PASS: f6shown.display === 'block' && f6shown.follow === true
    && f6after.display === 'none' && f6after.held === true && f6after.slotEmpty === true,
};

// ============ ③ F5：悬停宿主 DOM 移除 → 跟随臂一拍隐藏 ============
await page.mouse.move(360, 640, { steps: 3 });                   // 中性区清场
await wait(80);
await page.evaluate(() => {
  const h = document.createElement('div');
  h.id = 'sw-f5-host';
  h.style.cssText = 'position:fixed;left:500px;top:400px;width:90px;height:26px;';
  document.body.appendChild(h);
  window.__swUI.showFloatingItemTooltip(96, h);                  // 铜盔载荷,光标支 followsCursor=true
});
await page.mouse.move(520, 410, { steps: 2 });                   // 跟随臂活跃（宿主在册）
await wait(80);
const f5shown = await page.evaluate(() => {
  const t = document.querySelector('.sw-tooltip');
  return { display: t.style.display };
});
await page.evaluate(() => document.getElementById('sw-f5-host').remove());   // 宿主游离（无 mouseleave）
await page.mouse.move(560, 430, { steps: 1 });                   // 下一拍 move → isConnected 门
await wait(80);
const f5after = await page.evaluate(() => {
  const t = document.querySelector('.sw-tooltip');
  return { display: t.style.display, follow: window.__swUI.tooltipFollowsCursor };
});
R.F5 = {
  shownBefore: f5shown, after: f5after,
  PASS: f5shown.display === 'block' && f5after.display === 'none' && f5after.follow === false,
};

console.log('==== page1 (desktop) ====');
console.log(JSON.stringify({ out, hoverA, justAfter, settled, settledOff, R }, null, 1));

// ============ ④ F4：classic+touch 象限（page2） ============
const page2 = await openPage(browser, {});
await bootstrap(page2, process.env.SW_ORIGIN);
await page2.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.touchOpMode = 'touch';        // 强制触屏档（bindHint 注册期判 coarse 支）
  options.data.inventoryLayout = 'classic';  // classic 象限（:1942 旧白名单病灶面）
  options.data.backgroundRun = true; options.data.playWhenUnfocused = true;
});
await createGame(page2, { mode: 'direct', seed: 'bj669f4', size: 'small' });
const f4env = await page2.evaluate(async () => {
  const ui = window.__swUI;
  ui.openInventory(true);
  const g = window.__swGame;
  if (!g.player.inv.slots[11]) g.player.inv.slots[11] = { id: 98, stack: 1 };
  if (ui._builtLayout !== 'classic') {
    const { options } = await import('/src/core/Options.ts');
    options.data.inventoryLayout = 'classic';
    ui.rebuildInventoryPanel();
  }
  ui.refreshAll();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const slot = document.querySelector('[data-where="inv"][data-idx="11"]');
  if (!slot) return { err: 'no-slot11', layout: ui._builtLayout };
  const r = slot.getBoundingClientRect();
  return {
    layout: ui._builtLayout,
    mode: (await import('/src/core/input/touchMode.ts')).resolveTouchMode(),
    rect: { l: r.left, t: r.top, rgt: r.right, b: r.bottom },
    vw: innerWidth, vh: innerHeight,
  };
});
let f4 = null;
if (!f4env.err) {
  // (a) 合成长按全路径：slot touchstart → bindHint 380ms 计时 → showSlotHintTouch(host)
  await page2.evaluate(() => {
    const slot = document.querySelector('[data-where="inv"][data-idx="11"]');
    const r = slot.getBoundingClientRect();
    const t = new Touch({ identifier: 7, target: slot, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    slot.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [t], bubbles: true, cancelable: true }));
  });
  await wait(700);   // > touchLongPressMs 380
  const f4a = await page2.evaluate(() => {
    const el = document.querySelector('.sw-tooltip');
    // 触屏档 HUD 缩放有过渡动画——矩形以【读取拍】为准（f4env 早测会漂）
    const r = document.querySelector('[data-where="inv"][data-idx="11"]').getBoundingClientRect();
    return {
      display: el.style.display, left: parseFloat(el.style.left), top: parseFloat(el.style.top),
      follow: window.__swUI.tooltipFollowsCursor,
      text: (el.textContent || '').slice(0, 10),
      rTop: r.top, rRight: r.right,
    };
  });
  await page2.evaluate(() => {
    const el = document.querySelector('.sw-tooltip');
    el.style.display = 'none';   // 清场供 (b)
    window.__swUI.tooltipFollowsCursor = false;
  });
  // (b) anchor 缺席直呼 = 修复前 classic bindHint 丢 host 的精确形状（病灶物证）
  const f4b = await page2.evaluate(() => {
    const ui = window.__swUI;
    const slot = document.querySelector('[data-where="inv"][data-idx="11"]');
    ui.showSlotHintTouch(11, 'inv', undefined);   // 修复前 :1942 classic 支传 undefined
    const el = document.querySelector('.sw-tooltip');
    return {
      display: el.style.display, left: parseFloat(el.style.left), top: parseFloat(el.style.top),
      follow: ui.tooltipFollowsCursor,
    };
  });
  await wait(60);
  const f4bAfterMove = await page2.evaluate(() => {
    // 触屏无 mousemove 流——钉死即钉死（(b) 病灶:气泡贴原点,不随任何锚）
    const el = document.querySelector('.sw-tooltip');
    return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
  });
  // (a) 期望=触屏元素矩形锚：left=r.right+8（右缘钳 vw−18−tw）、top=r.top（底缘钳 vh−18−th）
  const rgt = f4a.rRight, tp = f4a.rTop;
  const aPosOk = f4a.display === 'block' && f4a.follow === false
    && Math.abs(f4a.top - tp) < 2                                  // 槽顶对齐（上方空间充足,不触钳）
    && (Math.abs(f4a.left - (rgt + 8)) < 2 || f4a.left < rgt + 8); // 槽右+8 或右缘钳回退
  const bBugOk = f4b.display === 'block'
    && f4b.left <= 30 && f4b.top <= 30                             // = mouseX/mouseY=0 光标锚支钉 (20,20) 左上角
    && f4bAfterMove.left === f4b.left;                             // 触屏无流,永钉死=漂移起点
  f4 = { env: f4env, a: f4a, b: f4b, bAfterMove: f4bAfterMove, aPosOk, bBugOk, PASS: aPosOk && bBugOk };
} else {
  f4 = { env: f4env, PASS: false };
}
R.F4 = f4;

const pass = R.F1F2.PASS && R.F2_opaqueOff.PASS && R.F6.PASS && R.F5.PASS && R.F4.PASS;
console.log('==== page2 (classic+touch) / 汇总 ====');
console.log(JSON.stringify({ f4env, f4: R.F4, VERDICT: { ...R, ALL_PASS: pass } }, null, 1));
await browser.close();
process.exitCode = pass ? 0 : 2;
