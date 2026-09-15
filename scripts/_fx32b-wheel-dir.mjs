// SW-FX32b 实机探针:经典竖列表滚轮【方向】定谳(2026-09-15 用户报"滚动方向与原版相反")。
// 权威链(逐字取证):
//  1) PlayerInput.cs:901-902 ScrollWheelDelta=ScrollWheelValue−ScrollWheelValueOld;
//     MouseInput(:1407 域) ScrollWheelValue+=MouseInfo.ScrollWheelValue——XNA 累计值
//     (docs.monogame.net MouseState: "incremented when the wheel is scrolled up")
//     ⇒ 【上滚 +120/notch,下滚 −120】(仓内旁证:Player.cs:24424 热栏 /−120=下滚+1 槽)。
//  2) Main.cs:17593-17640 DoScrollingInInventory: num=ScrollWheelDelta/120;
//     flag 支 :17633-17640 ScrollCraftingList(num)【无取负】。
//  3) CraftingUI.cs:572-582 ScrollCraftingList: focusRecipe += mouseWheel(钳 [0,n−1])。
//  4) CraftingUI.cs:376-404/:186-201: availableRecipeY[i]=original+(i−focusRecipe)·65,
//     屏 Y=410+availableRecipeY[i]·scale−30·scale+adjY ⇒ 大 i 画在【下方】。
// ⇒ 原版定谳:【上滚(deltaY<0)=focusRecipe+1=焦点(金框)向列表下方移一行,内容整体上滑】;
//    下滚(deltaY>0)=focusRecipe−1=焦点上移,内容下滑。
// 判别力(本探针):滚前金框锚格 settle 后 DOM top 必【减】(上滑) ∧ focusV 恰 +1;
//   下滚必【增】∧ −1;格面/容器面双入口同向(排除双绑定反向);端点钳零位移。
// 运行:SW_ORIGIN=http://localhost:5222 node tools/run-diag.mjs scripts/_fx32b-wheel-dir.mjs
import { launchBrowser, openPage, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => L.say('[pageerror] ' + String(e.message).slice(0, 200)));

await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const raf = (n) => new Promise((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); });
  const vr = await import('/src/data/vanillaRecipes.ts');
  g.vanillaAvailableRecipes = () => vr.VANILLA_RECIPES.slice(0, 300).map((r) => ({ r, count: 3 }));
  ui.openInventory();
  await raf(6);
  ui.refreshAll();
  await raf(6);
  for (let n = 0; n < 60 && ui.vinvCraftCellEls.length === 0; n++) { ui.refreshAll(); await raf(4); }

  const focus = () => ui.vinvCraftFocusV;
  const len = () => ui.vinvCraftAvailV.length;
  // 注:悬停非焦点格也会描金(原版 DrawGoldBGForCraftingMaterial :206-213 同相),
  //     虚拟光标停点下的格会带 Back14——故只断言【焦点格】有金,不做全表唯一性。
  const goldAt = (i) => String(ui.vinvCraftCellEls[i]?.el.style.getPropertyValue('--slot-bgimg') || '').includes('Inventory_Back14');
  const cellTop = (i) => ui.vinvCraftCellEls[i].el.getBoundingClientRect().top;
  const pin = (v) => { ui.vinvCraftFocusGoto(v); ui.vinvCraftGlideY = 0; ui.vinvUpdateCraftList(); };
  const settle = async (cap = 180) => { let n = 0; while (ui.vinvCraftGlideY !== 0 && n++ < cap) await raf(1); await raf(2); };
  const wheelOn = (el, deltaY, x = 60, y = 400) => el.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const R = { len: len() };

  // ---- 臂1:格面入口(滚轮落在配方格上) 上滚 deltaY=-120 ----
  const PIN = Math.min(40, len() - 5);
  pin(PIN); await settle();
  R.a0 = { focus: focus(), gold: goldAt(PIN), topPin: cellTop(PIN), glide: ui.vinvCraftGlideY };
  wheelOn(ui.vinvCraftCellEls[PIN].el, -120);
  await settle();
  R.a1 = { focus: focus(), gold: goldAt(focus()), topPin: cellTop(PIN), pend: ui.vinvCraftWheelPendPx };
  R.a_dTop = +(R.a1.topPin - R.a0.topPin).toFixed(3);

  // ---- 臂2:窗口 flag 支入口(invPanel 冒泡→window 级 vinvGridWheelTick→flag 支) 上滚 deltaY=-120 ----
  pin(PIN); await settle();
  R.b0 = { focus: focus(), topPin: cellTop(PIN) };
  wheelOn(ui.invPanel, -120);
  await settle();
  R.b1 = { focus: focus(), topPin: cellTop(PIN), pend: ui.vinvCraftWheelPendPx };
  R.b_dTop = +(R.b1.topPin - R.b0.topPin).toFixed(3);

  // ---- 臂3:格面入口 下滚 deltaY=+120(与臂1 反向) ----
  pin(PIN); await settle();
  R.c0 = { focus: focus(), topPin: cellTop(PIN) };
  wheelOn(ui.vinvCraftCellEls[PIN].el, +120);
  await settle();
  R.c1 = { focus: focus(), topPin: cellTop(PIN) };
  R.c_dTop = +(R.c1.topPin - R.c0.topPin).toFixed(3);

  // ---- 臂4:子档拍(dY=-60 半档) 零位移(RB14d 累计器语义保持) ----
  pin(PIN); await settle();
  const d0 = focus();
  wheelOn(ui.vinvCraftCellEls[PIN].el, -60); await raf(10);
  R.d = { f0: d0, f1: focus(), pend: ui.vinvCraftWheelPendPx };
  // 半档拍随后补足另一半 → 恰 +1(累计器跨事件留置)
  wheelOn(ui.vinvCraftCellEls[PIN].el, -60); await settle();
  R.d2 = { f0: d0, f1: focus(), pend: ui.vinvCraftWheelPendPx };

  // ---- 臂5:端点钳(焦点 0 下滚 / 焦点 n−1 上滚) 零位移 ----
  pin(0); await settle();
  const e0 = focus();
  wheelOn(ui.vinvCraftCellEls[0].el, +120); await settle();
  R.eDownClamp = { f0: e0, f1: focus() };
  pin(len() - 1); await settle();
  const f0 = focus();
  wheelOn(ui.vinvCraftCellEls[len() - 1].el, -120); await settle();
  R.fUpClamp = { f0, f1: focus() };

  ui.closeInventory();
  return R;
});

const V = '原版定谳:上滚=焦点向列表下方(内容上滑),下滚反向';
L.chk(`配方域 300 行(实得 ${out.len})`, out.len === 300);
L.chk(`臂0 预置态:焦点格描金(${out.a0.focus}/金=${out.a0.gold}) glide 已敛(${out.a0.glide})`, out.a0.gold && out.a0.glide === 0);
L.chk(`臂1 格面上滚 dY=-120 → 焦点恰+1(${out.a1.focus}=${out.a0.focus}+1)`, out.a1.focus === out.a0.focus + 1);
L.chk(`臂1 焦点格 DOM top 下降=内容上滑(Δtop=${out.a_dTop}px<0)`, out.a_dTop < 0, V);
L.chk(`臂1 金框随焦点下移(新焦点格 ${out.a1.focus} 描金=${out.a1.gold})`, out.a1.gold);
L.chk(`臂1 无双消费(累计器余 ${out.a1.pend})`, out.a1.pend === 0);
L.chk(`臂2 容器面上滚同向:焦点+1(${out.b1.focus}) ∧ top 下降(Δ=${out.b_dTop})`, out.b1.focus === out.b0.focus + 1 && out.b_dTop < 0, '双入口反向=刀错面');
L.chk(`臂3 下滚 dY=+120 反向:焦点−1(${out.c1.focus}) ∧ top 上升(Δ=${out.c_dTop}>0)`, out.c1.focus === out.c0.focus - 1 && out.c_dTop > 0);
L.chk(`臂4 半档拍整吞(${out.d.f0}→${out.d.f1},余 ${out.d.pend})`, out.d.f1 === out.d.f0 && out.d.pend !== 0);
L.chk(`臂4 两半档补足恰 +1(${out.d2.f0}→${out.d2.f1},余 ${out.d2.pend})`, out.d2.f1 === out.d2.f0 + 1 && out.d2.pend === 0);
L.chk(`臂5 顶端下滚钳零位移(${out.eDownClamp.f0}→${out.eDownClamp.f1})`, out.eDownClamp.f1 === 0);
L.chk(`臂5 尾端上滚钳零位移(${out.fUpClamp.f0}→${out.fUpClamp.f1})`, out.fUpClamp.f1 === out.len - 1);

console.log(L.exitCode() === 0
  ? `FX32b PASS: 列表滚轮方向与 1457 定谳同相(${V})——用户报反向不复现`
  : 'FX32b FAIL: 见上');
await browser.close();
process.exit(L.exitCode());
