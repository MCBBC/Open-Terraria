// 一次性诊断(mobile-adaptation-plan P0 验收):触屏输入地基 + HUD 三档布局断言。
// 断言面:
//  A. 触屏会话(844×390 横屏 T2):MobileControls 存在/SC 默认开/tapVirtual 数字键
//     切栏/虚拟 Inventory 开关背包('inventory' intent)/Esc 形态开暂停(world tap)/
//     世界触摸长按 rightDown/tap 不吞(mouseDown 电平窗口)。
//  B. 三视口 HUD:390×844(T3 两行五列) / 844×390(T2 平排) / 768×1024(T1=桌面几何):
//     data-huds 正确、hotbar 全格 ⊆ 视口宽、交互钮 ≥44pt、T1 hotbar 首格 x=20。
//  C. PC 隔离(hasTouch:false):无 .sw-mobile、data-huds=d0、hotbar 逐字节原样
//     (left=20px、选中格 opacity=1、未选 0.575)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const results = [];
const ok = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

async function bootPage(browser, vp, url = '/?play=small') {
  const page = await browser.newPage();
  await page.setViewport(vp);
  // 预置首启欢迎 ACK(WelcomeAnnounce inset0 z60 黑幕会拦截全部世界触摸——
  // 真机用户点一次关闭;探针走 localStorage 免弹)
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* noop */ }
  });
  await page.goto(ORIGIN + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  let inGame = false;
  for (let i = 0; i < 90 && !inGame; i++) {
    inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!inGame) await new Promise((r) => setTimeout(r, 2000));
  }
  ok(`boot ${vp.width}x${vp.height}`, inGame);
  return page;
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  // ---------- A/B1: 触屏横屏(T2) ----------
  const p2 = await bootPage(browser, { width: 844, height: 390, hasTouch: true, isMobile: true });
  const tierOf = (pg) => pg.evaluate(() => document.documentElement.dataset.huds);
  ok('A.tier=t2', (await tierOf(p2)) === 't2');

  // MobileControls 层存在 + SC 默认开
  const a1 = await p2.evaluate(() => ({
    mobileNodes: document.querySelectorAll('.sw-mobile .sw-mbtn, .sw-mobile .sw-mjoy').length,
    sysButtons: document.querySelectorAll('.sw-msys .sw-mbtn').length,
    scWanted: window.__swGame?.smartCursor?.wanted ?? null,
    aimJoystick: !!document.querySelector('.sw-matk .knob'),
  }));
  ok('A.mobile layer present', a1.mobileNodes >= 6, `nodes=${a1.mobileNodes}`);
  ok('A.use button is aim-joystick(knob)', a1.aimJoystick === true);
  ok('A.system column ≥3 btns', a1.sysButtons >= 3, `sys=${a1.sysButtons}`);
  ok('A.smart cursor default ON', a1.scWanted === true, `wanted=${a1.scWanted}`);

  // tapVirtual 数字键切栏(PressVirtual 边沿派发)
  const a2 = await p2.evaluate(() => {
    const g = window.__swGame;
    g.input.tapVirtual('Digit3');
    return g.player.inv.selected;
  });
  ok('A.pressVirtual Digit3 → slot idx2', a2 === 2, `selected=${a2}`);

  // 虚拟 Inventory(inventory intent)= 开背包;再按=收
  const a3 = await p2.evaluate(async () => {
    const g = window.__swGame;
    const ui = window.__swUI;
    g.input.tapVirtual('Inventory', { virtualIntent: 'inventory' });
    await new Promise((r) => setTimeout(r, 400));
    const opened = ui.invPanel && ui.invPanel.style.display === 'block';
    const pausedWhenOpen = g.paused;   // inventory intent 不该进暂停
    g.input.tapVirtual('Inventory', { virtualIntent: 'inventory' });
    await new Promise((r) => setTimeout(r, 400));
    const closed = !(ui.invPanel && ui.invPanel.style.display === 'block');
    // 暂停钮形态(intent 'pause',SW-BN2 三态化):无面板 → 暂停菜单
    g.input.tapVirtual('Inventory', { virtualIntent: 'pause' });
    await new Promise((r) => setTimeout(r, 400));
    const pausePanel = !!document.querySelector('.sw-pause-panel');
    g.input.tapVirtual('Escape');      // 收暂停(closePause 支)
    await new Promise((r) => setTimeout(r, 400));
    const pauseClosed = !document.querySelector('.sw-pause-panel');
    return { opened, pausedWhenOpen, closed, pausePanel, pauseClosed };
  });
  ok('A.virt inventory opens inv(open, not paused)', a3.opened && !a3.pausedWhenOpen);
  ok('A.virt inventory closes again', a3.closed);
  ok('A.virt pause intent opens pause menu', a3.pausePanel);
  ok('A.pause closes on next esc edge', a3.pauseClosed);

  // 世界触摸长按 450ms → rightDown 脉冲(CDP 受信 touch)
  const cs = await p2.createCDPSession();
  const wx = 500, wy = 180;
  await cs.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: wx, y: wy, id: 1 }] });
  await new Promise((r) => setTimeout(r, 450));
  const a4h = await p2.evaluate(() => window.__swGame.input.rightDown);
  await cs.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 100));
  const a4r = await p2.evaluate(() => window.__swGame.input.rightDown);
  ok('A.long-press → rightDown pulse', a4h === true && a4r === false, `held=${a4h} released=${!a4r}`);

  // 快速 tap 不吞:endFrame 释放后 mouseDown 干净;tap 窗口内电平可见
  const a5 = await p2.evaluate(async () => {
    const inp = window.__swGame.input;
    inp.mouseDown = false; inp.mouseHeld = false;
    return 'reset';
  });
  void a5;
  await p2.touchscreen.tap(wx, wy);
  const a5a = await p2.evaluate(() => window.__swGame.input.mouseDown || window.__swGame.pendingTapSeen);
  await new Promise((r) => setTimeout(r, 120));
  const a5b = await p2.evaluate(() => window.__swGame.input.mouseDown === false && window.__swGame.input.mouseHeld === false);
  ok('A.quick tap leaves no stuck level', a5b === true, `edge seen=${!!a5a} clean=${a5b}`);

  // ---------- B2: 触屏竖屏(T3) ----------
  const p3 = await bootPage(browser, { width: 390, height: 844, hasTouch: true, isMobile: true });
  ok('B.tier=t3', (await p3.evaluate(() => document.documentElement.dataset.huds)) === 't3');
  const fit3 = await p3.evaluate(() => {
    const vw = innerWidth;
    const slots = [...document.querySelectorAll('.sw-hotbar .sw-slot')].map((s) => s.getBoundingClientRect());
    const inVw = slots.every((r) => r.right <= vw + 0.5 && r.left >= -0.5);
    const rows = new Set(slots.map((r) => Math.round(r.top / 10))).size;
    const compact = document.querySelector('.sw-hotbar')?.classList.contains('compact');
    // 右簇/系统列按钮 ≥44 视觉或位于扩边体系内
    const btns = [...document.querySelectorAll('.sw-mobile .sw-mbtn, .sw-mobile .sw-mjump')];
    const tooSmall = btns.filter((b) => parseFloat(getComputedStyle(b).width) < 44).map((b) => b.className);
    // hotbar 与手机按钮矩形不相交(hotbar 上缘以上不应有右侧动作簇底缘重叠)
    return { vw, count: slots.length, inVw, rows, compact, tooSmall,
      maxRight: Math.max(...slots.map((r) => r.right)) };
  });
  ok('B.hotbar 10 slots inside viewport', fit3.count === 10 && fit3.inVw, JSON.stringify(fit3).slice(0, 160));
  ok('B.t3 two-row compact layout', fit3.compact === true && fit3.rows >= 2, `rows≈${fit3.rows}`);
  ok('B.all control buttons ≥44px', fit3.tooSmall.length === 0, `violations=${fit3.tooSmall.join(',')}`);

  // ---------- B3: iPad 尺寸(T1=桌面几何) ----------
  const p1 = await bootPage(browser, { width: 768, height: 1024, hasTouch: true, isMobile: true });
  ok('B.tier=t1', (await p1.evaluate(() => document.documentElement.dataset.huds)) === 't1');
  const fit1 = await p1.evaluate(() => ({
    firstLeft: document.querySelector('.sw-hotbar .sw-slot')?.style.left ?? '?',
    compact: document.querySelector('.sw-hotbar')?.classList.contains('compact'),
    mobileNodes: document.querySelectorAll('.sw-mobile *').length > 0,
  }));
  ok('B.t1 keeps vanilla geometry(x=20)', fit1.firstLeft === '20px' && fit1.compact === false, JSON.stringify(fit1));

  // ---------- C: PC 隔离对照 ----------
  const pc = await bootPage(browser, { width: 1280, height: 800, hasTouch: false, isMobile: false });
  const c1 = await pc.evaluate(() => {
    const sel = [...document.querySelectorAll('.sw-hotbar .sw-slot')];
    return {
      huds: document.documentElement.dataset.huds,
      mobileExists: !!document.querySelector('.sw-mobile'),
      firstLeft: sel[0]?.style.left ?? '?',
      firstOpacityUnsel: getComputedStyle(sel[1]).opacity,
      selOpacity: getComputedStyle(sel[0]).opacity,
      slotsScreenOk: sel.every((s) => parseFloat(s.style.left) >= 20),
      safeVarType: typeof document.documentElement.style.getPropertyValue('--sw-sat'),
    };
  });
  ok('C.PC tier=d0', c1.huds === 'd0');
  ok('C.PC has NO mobile layer', c1.mobileExists === false);
  ok('C.PC hotbar bytes identical(left20/opacity .575/1)',
    c1.firstLeft === '20px' && c1.firstOpacityUnsel === '0.575' && c1.selOpacity === '1',
    JSON.stringify(c1));
  // ---------- D: 操作模式动态切换(touchOpMode 设置项,2026-08-29 用户需求) ----------
  // 触屏会话内切 keyboard=控件层移除+整页回桌面几何;切回 auto=恢复
  const pd = await bootPage(browser, { width: 844, height: 390, hasTouch: true, isMobile: true });
  await new Promise((r) => setTimeout(r, 400));
  const dseq = await pd.evaluate(async () => {
    const set = async (v, waitMs = 700) => {
      const mod = await import('/src/core/Options.ts');
      await mod.options.set('touchOpMode', v);
      await new Promise((r2) => setTimeout(r2, waitMs));
      return {
        layer: !!document.querySelector('.sw-mobile'),
        huds: document.documentElement.dataset.huds,
      };
    };
    const off = await set('keyboard');
    const back = await set('auto');
    return { off, back };
  }).catch((e) => ({ error: String(e).slice(0, 120) }));
  ok('D.keyboard mode removes layer+d0', dseq?.off?.layer === false && dseq?.off?.huds === 'd0', JSON.stringify(dseq).slice(0, 140));
  ok('D.auto restores touch layer', dseq?.back?.layer === true && dseq?.back?.huds !== 'd0');
  // 键鼠档下世界触摸合成停用(CDP tap 不产生 mouseDown)
  await pd.evaluate(async () => {
    const mod = await import('/src/core/Options.ts');
    await mod.options.set('touchOpMode', 'keyboard');
  });
  await new Promise((r) => setTimeout(r, 700));
  await pd.touchscreen.tap(wx, wy);
  await new Promise((r) => setTimeout(r, 60));
  const d3 = await pd.evaluate(() => ({
    md: window.__swGame.input.mouseDown,
    mh: window.__swGame.input.mouseHeld,
  }));
  ok('D.keyboard mode stops world-touch synthesis', d3.md === false && d3.mh === false, JSON.stringify(d3));
  await pd.evaluate(async () => {
    const mod = await import('/src/core/Options.ts');
    await mod.options.set('touchOpMode', 'auto');
  });

  // ---------- E: 桌面强制 touch 档(hasTouch=false 也出控件层) ----------
  const pe = await bootPage(browser, { width: 1280, height: 800, hasTouch: false, isMobile: false }, '/?play=small');
  await pe.evaluate(async () => {
    const mod = await import('/src/core/Options.ts');
    await mod.options.set('touchOpMode', 'touch');
  });
  await new Promise((r) => setTimeout(r, 900));
  const e1 = await pe.evaluate(() => ({
    layer: !!document.querySelector('.sw-mobile'),
    huds: document.documentElement.dataset.huds,
  }));
  ok('E.desktop forced touch shows layer(non-d0)', e1.layer === true && e1.huds !== 'd0', JSON.stringify(e1));
  await pe.evaluate(async () => {
    const mod = await import('/src/core/Options.ts');
    await mod.options.set('touchOpMode', 'auto');
  });
} catch (err) {
  ok('probe crashed', false, String(err));
}

await browser.close();
const fails = results.filter((r) => !r.pass);
console.log(JSON.stringify({ total: results.length, failed: fails.length,
  failures: fails, all: results }, null, 1));
process.exit(fails.length ? 1 : 0);
