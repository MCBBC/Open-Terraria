// SW-FX38 实机探针:合成配方列表滚轮【滚距/步进/吸附】语义定谳(2026-09-11)。
// 权威:Main.cs:17592-17640 DoScrollingInInventory + CraftingUI.cs:572-583
// ScrollCraftingList(整批 += + 钳,无音)+ :585-602 ScrollCraftingGrid(每档 ±cols,
// +=支 :597 一响)+ :376-404 吸附步进(0.97×-6.5px/拍,行界音 :388-393)。
// 档数 = ScrollWheelDelta/120 C# 向零截断;XNA 上滚为正 ⇒ 浏览器 deltaY<0=+1 档。
// 旧实现症状(本探针的判别力来源):max(1,round(dY/120)) 对子档拍(dY=±40)虚生 1 档;
//   同号映射=手势反转;瞬时重排=无滑行。
// 运行:node tools/probe.mjs run scripts/_fx38.mjs --vite=auto
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
  const cg = await import('/src/ui/craftingGrid.ts');
  g.vanillaAvailableRecipes = () => vr.VANILLA_RECIPES.slice(0, 300).map((r) => ({ r, count: 3 }));
  ui.openInventory();
  await raf(6);
  ui.refreshAll();
  await raf(6);
  // 行界音计数(吸附 tick 面非滚轮面)
  let ticks = 0;
  const origPlay = g.sfx.play.bind(g.sfx);
  g.sfx.play = (k, ...a) => { if (k === 'menuTick') ticks++; return origPlay(k, ...a); };
  const focus = () => ui.vinvCraftFocusV;
  const len = () => ui.vinvCraftAvailV.length;
  const listEl = ui.vinvCraftListEl;
  const wheelList = (deltaY) => listEl.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: 60, clientY: 400, bubbles: true, cancelable: true }));
  const R = { len: len() };

  // A. 子档拍吞步(dY=40 → 原版 0 档;旧实现虚生 +1=判别点)
  ticks = 0; const fa = focus(); wheelList(40); await raf(14);
  R.A = { f0: fa, f1: focus(), ticks, moved: focus() !== fa };

  // B. 方向+滑行:dY=-120(浏览器上滚)=原版 +1 档 → glideY 自 +65 吸附滑行
  ticks = 0; const fb = focus(); wheelList(-120);
  R.B_gl0 = +ui.vinvCraftGlideY.toFixed(3);            // 重播种即 65(旧实现无此态)
  const glideSeq = [];
  for (let f = 0; f < 14; f++) { glideSeq.push(+ui.vinvCraftGlideY.toFixed(3)); await raf(1); }
  R.B = { f0: fb, f1: focus(), ticks, glideSeq, settled: ui.vinvCraftGlideY === 0 };

  // C. 连滚两档 → +2,行界音 2 响
  ticks = 0; const fc = focus(); wheelList(-120); await raf(14); wheelList(-120); await raf(14);
  R.C = { f0: fc, f1: focus(), ticks };

  // D. 整批 -240 → +2 一事件(行界音 2 响随滑行散布)
  ticks = 0; const fd = focus(); wheelList(-240); await raf(20);
  R.D = { f0: fd, f1: focus(), ticks };

  // E. 下滚 +120 → -1;顶端钳 0 no-op 无音
  ticks = 0; const fe = focus(); wheelList(120); await raf(14);
  R.E = { f0: fe, f1: focus(), ticks };
  ui.vinvCraftFocusGoto(0); ui.vinvCraftGlideY = 0; ui.vinvUpdateCraftList(); await raf(2);
  ticks = 0; wheelList(120); await raf(14);
  R.Eclamp = { f0: 0, f1: focus(), ticks };

  // F. 尾端上滚钳 len-1 no-op 无音
  ui.vinvCraftFocusGoto(len() - 1); ui.vinvCraftGlideY = 0; ui.vinvUpdateCraftList(); await raf(2);
  ticks = 0; wheelList(-120); await raf(14);
  R.F = { f0: len() - 1, f1: focus(), ticks };

  // G. 网格分页(PipsUseGrid ∧ 命中网格矩形):dY=-120 → recStart += cols(+音 :597);
  //    dY=+120 → recStart -= cols(无音)——原版手势反转保留面。列表支同拍恒走(RB13b)
  //    ⇒ 音计数去耦:G 臂焦点钉 len-1(列表 no-op 无音),G3 臂焦点钉 0(同)
  ui.vinvPipsUseGrid = true;
  ui.vinvUpdateCraftGrid();
  await raf(3);
  const gb = ui.vinvCraftGridEl.getBoundingClientRect();
  const inGrid = { clientX: gb.x + 10, clientY: gb.y + 10 };
  const wheelWin = (deltaY) => window.dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: inGrid.clientX, clientY: inGrid.clientY, bubbles: true, cancelable: true }));
  const pinFocus = (v) => { ui.vinvCraftFocusGoto(v); ui.vinvCraftGlideY = 0; ui.vinvUpdateCraftList(); };
  const geo = cg.craftGridGeometry(ui.vinvLayoutCtx.sw, ui.vinvLayoutCtx.sh);   // cols/rows 与页内同源
  ui.vinvCraftRecStart = 0;
  pinFocus(len() - 1);
  ticks = 0; wheelWin(-120); await raf(14);
  const rs1 = ui.vinvCraftRecStart, gTicks1 = ticks;
  pinFocus(0);
  ticks = 0; wheelWin(120); await raf(14);
  const rs2 = ui.vinvCraftRecStart, gTicks2 = ticks;
  R.G = { rs0: 0, rs1, rs2, gTicks1, gTicks2, cols: geo.cols, page: geo.cols * geo.rows, avail: len() };
  // 网格子档拍不分页
  ticks = 0; const rsA = ui.vinvCraftRecStart; wheelWin(40); await raf(14);
  R.Gsub = { rsA, rsB: ui.vinvCraftRecStart, ticks };

  // H. recStart 每拍绘制钳制(recStart>avail-cols·rows 收页再钳 0;滚轮 +=支钳 avail-cols)
  ui.vinvCraftRecStart = 9999;
  ui.vinvUpdateCraftGrid();
  await raf(2);
  R.H_drawClamp = ui.vinvCraftRecStart;
  R.H_expect = Math.max(0, R.G.avail - R.G.page);

  ui.closeInventory();
  return R;
});

L.chk(`配方域 300 行(实得 ${out.len})`, out.len === 300);
L.chk(`A 子档拍 dY=+40 整吞(焦点 ${out.A.f0}→${out.A.f1} 不动,音 ${out.A.ticks})`, !out.A.moved && out.A.ticks === 0, '旧实现虚生 +1=偏快根因');
L.chk(`B 方向 dY=-120(上滚)→焦点+1(${out.B.f0}→${out.B.f1})`, out.B.f1 === out.B.f0 + 1);
L.chk(`B 吸附滑行非瞬移(glideY 重播种 ${out.B_gl0}${out.B.settled ? ',已收敛' : ',未收敛!'})`, out.B_gl0 > 0 && out.B.settled, `样本[${out.B.glideSeq.slice(0, 6).join(',')}...]`);
L.chk(`B 行界音恰 1 响(实得 ${out.B.ticks})`, out.B.ticks === 1);
L.chk(`C 连滚两档 ${out.C.f0}→${out.C.f1} 音 2(实得 ${out.C.ticks})`, out.C.f1 === out.C.f0 + 2 && out.C.ticks === 2);
L.chk(`D 整批 dY=-240 ${out.D.f0}→${out.D.f1} 音 2(实得 ${out.D.ticks})`, out.D.f1 === out.D.f0 + 2 && out.D.ticks === 2);
L.chk(`E 下滚 dY=+120 ${out.E.f0}→${out.E.f1} 音 1(实得 ${out.E.ticks})`, out.E.f1 === out.E.f0 - 1 && out.E.ticks === 1);
L.chk(`E2 顶端钳 0 no-op 无音(${out.Eclamp.f1},音 ${out.Eclamp.ticks})`, out.Eclamp.f1 === 0 && out.Eclamp.ticks === 0);
L.chk(`F 尾端上滚钳 n-1 no-op 无音(${out.F.f1},音 ${out.F.ticks})`, out.F.f1 === out.len - 1 && out.F.ticks === 0);
L.chk(`G 网格 dY=-120 → recStart+cols=${out.G.cols}(${out.G.rs0}→${out.G.rs1}) 列表支焦点钳尾 no-op 无音`, out.G.rs1 === out.G.rs0 + out.G.cols && out.G.gTicks1 === 1);
L.chk(`G2 网格 +=支音 1/−=支无音(${out.G.gTicks1}/${out.G.gTicks2})`, out.G.gTicks1 === 1 && out.G.gTicks2 === 0);
L.chk(`G3 下滚 recStart−cols(${out.G.rs1}→${out.G.rs2})`, out.G.rs2 === out.G.rs0);
L.chk(`G4 网格子档拍不分页(${out.Gsub.rsA}→${out.Gsub.rsB},音 ${out.Gsub.ticks})`, out.Gsub.rsA === out.Gsub.rsB && out.Gsub.ticks === 0);
L.chk(`H recStart 绘制钳制 9999→${out.H_drawClamp}(期望 avail−page=${out.H_expect})`, out.H_drawClamp === out.H_expect);

console.log(L.exitCode() === 0 ? 'FX38 PASS: 滚距/步进/吸附与 1457 逐字同相' : 'FX38 FAIL: 见上');
await browser.close();
process.exit(L.exitCode());
