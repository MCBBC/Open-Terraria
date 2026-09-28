// ★wheel passive 化+开包 hitch diff 门验收探针(2026-09-29,只读+归因,零 src 触碰)。
// 验收面:
//  ①防累积:开/关包 20 轮+notifyInventoryChanged×20 → wheel 监听 live 数恒定
//    (惰性格池拆建=churn 非泄漏);non-passive wheel 新增=0(Violation 消失)
//  ②开包拍帧距:每开包帧窗 p50/p99/max——diff 门稳态 vs 门失效(WA 弱map重置=旧
//    全量重刷路径)同页 A/B
//  ③DOM 写抑制:每拍 CSSStyleDeclaration.setProperty 计数(门开≈0 vs 门失效=全量)
//  ④positive control:合成 non-passive wheel 挂点=插桩自证(防插桩中立性伪影)
// 运行:SW_ORIGIN=http://localhost:5262 node tools/run-diag.mjs scripts/_wheel-passive-openbag-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, stage, sleep, ledger, front,
  armPerfInstrumentation, installFrameProbe } from '../tools/probe/lib/index.mjs';

const L = ledger();
const violations = [];
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  await armPerfInstrumentation(page, {});
  page.on('console', (msg) => {
    const t = msg.text();
    if (/Violation/i.test(t)) violations.push(t);
  });
  // 预载插桩(evaluateOnNewDocument=先于页面脚本):wheel add/remove/live+passive 面+setProperty 计数
  await page.evaluateOnNewDocument(() => {
    const W = (window.__swWheelProbe = {
      adds: 0, addsPassive: 0, addsNonPassive: 0, removes: 0,
      liveByEl: new Map(), sp: 0,
    });
    const origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      if (type === 'wheel') {
        W.adds++;
        const p = typeof opts === 'object' && opts !== null ? !!opts.passive : !!opts;
        if (p) W.addsPassive++; else W.addsNonPassive++;
        W.liveByEl.set(this, (W.liveByEl.get(this) ?? 0) + 1);
      }
      return origAdd.call(this, type, fn, opts);
    };
    const origRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.removeEventListener = function (type, fn, opts) {
      if (type === 'wheel') {
        W.removes++;
        const n = (W.liveByEl.get(this) ?? 0) - 1;
        if (n <= 0) W.liveByEl.delete(this); else W.liveByEl.set(this, n);
      }
      return origRemove.call(this, type, fn, opts);
    };
    const spDesc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'setProperty');
    CSSStyleDeclaration.prototype.setProperty = function (...a) {
      W.sp++;
      return spDesc.value.apply(this, a);
    };
  });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await installFrameProbe(page);
  const staged = await stage(page, { w: 90, h: 26, platform: { key: 'stone' }, light: 'torch', player: true, camera: true });
  L.chk('stage', staged.ok, staged.why ?? '');
  await sleep(2000);

  // ---- 正控:合成 non-passive wheel 挂点(插桩自证:若本计数不涨=插桩失明) ----
  const posCtl = await page.evaluate(() => {
    const W = window.__swWheelProbe;
    const d = document.createElement('div');
    const before = W.addsNonPassive;
    d.addEventListener('wheel', () => {}, {});   // 无 passive 键=non-passive
    return { ok: W.addsNonPassive === before + 1, before, after: W.addsNonPassive };
  });
  const violAtCtl = violations.length;   // 正控挂点若触发浏览器 Violation 告警,记账于此(排除出后续零消息判定)
  L.chk('positive-control(non-passive wheel 挂点被插桩捕获)', posCtl.ok, JSON.stringify(posCtl));

  const baseline = await page.evaluate(() => {
    const W = window.__swWheelProbe;
    let live = 0; for (const n of W.liveByEl.values()) live += n;
    return { live, adds: W.adds, addsNonPassive: W.addsNonPassive };
  });
  L.say(`[baseline] wheel live=${baseline.live} adds=${baseline.adds} nonPassive=${baseline.addsNonPassive}`);

  // ---- 帧窗工具:取 t0 后 20 帧逐帧 dt+窗内 setProperty 计数 ----
  const openOnce = async (unmask) => {
    const t0 = await page.evaluate((unmask) => {
      const ui = window.__swUI;
      const P = window.__swPerf;
      const W = window.__swWheelProbe;
      W.sp = 0;                                   // 本拍 setProperty 计数归零(窗内读取)
      if (unmask) ui._slotPaintSigs = new WeakMap();   // 门失效=旧全量重刷路径(A/B 的 B 臂)
      const mark = performance.now();
      ui.openInventory();
      return { mark, n: P.frames.length };
    }, unmask);
    await sleep(700);   // 开包 settle(rAF 合并拍+120ms 二次贴位)
    const win = await page.evaluate((t0) => {
      const P = window.__swPerf;
      const W = window.__swWheelProbe;
      const i0 = P.frameAt.findIndex((t) => t >= t0.mark);
      const dts = i0 < 0 ? [] : P.frames.slice(i0, i0 + 20);
      const lt = P.longtasks.filter((x) => x.t >= t0.mark).length;
      return { dts, sp: W.sp, lt };
    }, t0);
    await page.evaluate(() => { window.__swUI.closeInventory(); });
    await sleep(250);
    return win;
  };

  // ---- ①+②+③:开/关包 20 轮(每轮 A/B 交替:A=稳态门,B=门失效旧路径) ----
  const gated = []; const unmasked = [];
  for (let i = 0; i < 20; i++) {
    gated.push(await openOnce(false));          // A 臂:diff 门在位
    unmasked.push(await openOnce(true));        // B 臂:_slotPaintSigs 重置=全量重刷(旧路径)
  }
  const stat = (arr) => {
    const all = arr.map((w) => w.dts).flat().filter((d) => d > 0).sort((a, b) => a - b);
    const q = (p) => all.length ? +all[Math.min(all.length - 1, Math.floor(all.length * p))].toFixed(1) : 0;
    const firsts = arr.map((w) => w.dts[0] ?? 0).sort((a, b) => a - b);
    const rest = arr.map((w) => (w.dts.slice(1).filter((d) => d > 0))).flat().sort((a, b) => a - b);
    const sps = arr.map((w) => w.sp).sort((a, b) => a - b);
    const med = (xs) => xs.length ? +xs[Math.floor(xs.length / 2)].toFixed(1) : 0;
    return {
      p50: q(0.5), p99: q(0.99), max: all.length ? +all[all.length - 1].toFixed(1) : 0,
      firstFrameMed: med(firsts), restP99: (() => { const i = Math.min(rest.length - 1, Math.floor(rest.length * 0.99)); return rest.length ? +rest[i].toFixed(1) : 0; })(),
      spMed: med(sps), spMax: sps.length ? sps[sps.length - 1] : 0,
      ltTotal: arr.reduce((s, w) => s + w.lt, 0),
    };
  };
  const sA = stat(gated); const sB = stat(unmasked);
  L.say(`[②开包帧距 A臂=diff门稳态] ${JSON.stringify(sA)}`);
  L.say(`[②开包帧距 B臂=门失效(旧全量重刷)] ${JSON.stringify(sB)}`);
  L.chk('②③A臂 setProperty 抑制(A臂中位 sp < B臂中位 sp 的 1/3)', sA.spMed * 3 < sB.spMed || sA.spMed === 0, `A spMed=${sA.spMed} vs B spMed=${sB.spMed}`);
  L.chk('②A臂首帧(display 翻转+布局,本刀域外)与 B 臂同带', Math.abs(sA.firstFrameMed - sB.firstFrameMed) < 25, `A 首帧=${sA.firstFrameMed}ms B 首帧=${sB.firstFrameMed}ms(差=门内外 slot 重刷差)`);

  // ---- ①防累积:notifyInventoryChanged×20+再 10 轮开关包 → live 数对拍 ----
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => { window.__swGame.notifyInventoryChanged(); });
    await sleep(40);
  }
  for (let i = 0; i < 10; i++) {
    await openOnce(false);
  }
  const after = await page.evaluate(() => {
    const W = window.__swWheelProbe;
    let live = 0; for (const n of W.liveByEl.values()) live += n;
    return { live, adds: W.adds, addsNonPassive: W.addsNonPassive, removes: W.removes };
  });
  L.say(`[①防累积] live baseline=${baseline.live} → after=${after.live} (adds=${after.adds} removes=${after.removes} 非累积判定=live 回基线带)`);
  L.chk('①wheel live 恒定(不随 churn 线性增长)', after.live <= baseline.live + 30, `baseline=${baseline.live} after=${after.live}`);
  L.chk('①non-passive wheel 新增=0(churn 面监听恒 passive)', after.addsNonPassive === baseline.addsNonPassive, `nonPassive adds=${after.addsNonPassive}(baseline=${baseline.addsNonPassive} 含正控 1+BestiaryPanel 立面 preventDefault 1)`);
  L.chk('①Violation 零新增消息(churn 面非被动 wheel 挂点已灭;正控告警除外)', violations.length === violAtCtl, `violations=${JSON.stringify(violations.slice(0, 3))} violAtCtl=${violAtCtl}`);

  // ---- ③补:内容真变化面不误伤(给 10 号槽塞物→刷新→图标落位) ----
  const mut = await page.evaluate(async () => {
    const g = window.__swGame;
    const ui = window.__swUI;
    const inv = g.player.inv;
    const before0 = inv.slots[10] ? inv.slots[10].id : 0;
    inv.slots[10] = { id: 1, stack: 5, prefix: 0 };   // 石块族安全塞入(pickaxe id=1 常备无撞)
    g.notifyInventoryChanged();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const el = ui.slotEl(10, 'inv');
    const img = el && el.querySelector('img');
    return { painted: !!img && (img.getAttribute('src') ?? '').length > 0, before0 };
  });
  L.chk('③真变化面不误伤(槽 10 塞物后图标落位)', mut.painted, JSON.stringify(mut));

  console.log('WHEELPROBE-DONE');
} finally {
  await browser.close();
}
