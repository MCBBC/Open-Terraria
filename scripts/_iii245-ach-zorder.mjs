// IIII245 靶一验证探针:主菜单成就面板 z 序(用户截图实报"面板被菜单项盖住")。
//
// 根因假设(探针先行实证,修后复跑全绿):
//   .sw-ach-panel(z-index:120)挂在 .sw-root(z-index:10,position:fixed=独立
//   stacking context,UI.ts:368)内——其 z120 只在 .sw-root 语境里生效;
//   主菜单 .sw-title-menu(TitleMenu.ts:120,z-index:15)是 #game-root 下
//   平级语境,15>10 → 整个 .sw-root 子树(含成就面板)被菜单盖住。
//   同族缺陷:设置面板 .sw-set-panel(z25,直接挂 #game-root)按 mainFlow
//   openSettings 注释应"留在下层",成就面板实际也被它盖住。
//
// 断言面:
//   Z1 标题屏点"成就"→ 面板 DOM 存在
//   Z2 面板盒与菜单按钮盒相交(几何前提,缺了=断言 vacuous)
//   Z3 交叠区 elementFromPoint 命中 .sw-ach-panel(面板在上)= z 序正解
//   Z4 vanilla SetState 语义:面板开→菜单按钮态被替换(visibility hidden+不可命中)
//   Z5 开关循环 3 轮(✕ 关/Esc 关交替)后状态干净(面板无残留+按钮还原)
//   Z6 设置叠开链:设置→成就,面板在设置之上(elementFromPoint);✕ 只关成就,
//      设置仍在;Esc 关设置
import { launchBrowser, openPage, gotoApp, waitForBridge, savePageShot, resolveShotPath, Ledger } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/iii245-out';
const L = new Ledger({ label: 'III245-ach-zorder' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 轮询页内谓词(缺省 5s)。 */
async function waitFn(page, fn, timeout = 5000, poll = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn).catch(() => false)) return true;
    await sleep(poll);
  }
  return false;
}

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  L.chk('导航+桥就绪', await gotoApp(page, process.env.SW_ORIGIN), 'gotoApp 失败');
  L.chk('桥(__swFlow)', await waitForBridge(page, { timeout: 120_000 }));

  // 标题屏就绪:菜单按钮挂载 + splash 揭幕移除(揭幕前按钮被 z30 盖住点不到)
  L.chk('标题菜单挂载', await waitFn(page, () => !!document.querySelector('.sw-title-menu [data-act=ach]'), 20_000));
  L.chk('splash 揭幕移除', await waitFn(page, () => !document.getElementById('sw-splash'), 40_000, 250));
  // 启动链尾:向日葵幕 #sw-boot-prime(z10000,全屏吃点击)在 splash 收场后延迟
  // 1000ms 才撤(main.ts handoff)——不等它=真实点击被黑幕吞掉(diag1 实证)
  L.chk('boot-prime 幕撤除', await waitFn(page, () => !document.getElementById('sw-boot-prime'), 15_000, 250));
  await sleep(300);

  // ---- Z1/Z2/Z3:点成就,面板在上 ----
  await page.click('[data-act=ach]');
  L.chk('Z1 面板打开', await waitFn(page, () => !!document.querySelector('.sw-ach-panel'), 5000));

  const geom = await page.evaluate(() => {
    const panel = document.querySelector('.sw-ach-panel');
    const pr = panel.getBoundingClientRect();
    const btns = [...document.querySelectorAll('.sw-title-menu .sw-title-btn')].map((b) => {
      const r = b.getBoundingClientRect();
      return { act: b.dataset.act, x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const inter = (r) => Math.max(0, Math.min(pr.right, r.x + r.w) - Math.max(pr.left, r.x))
      * Math.max(0, Math.min(pr.bottom, r.y + r.h) - Math.max(pr.top, r.y));
    const hit = (px, py) => {
      const el = document.elementFromPoint(px, py);
      return el ? { hit: true, inPanel: !!el.closest('.sw-ach-panel'), tag: el.tagName, cls: String(el.className).slice(0, 40) } : { hit: false };
    };
    // 交叠区采样:取与面板相交的第一个按钮的交叠中心
    let sample = null;
    for (const b of btns) {
      const ox = Math.max(pr.left, b.x), oy = Math.max(pr.top, b.y);
      const ox2 = Math.min(pr.right, b.x + b.w), oy2 = Math.min(pr.bottom, b.y + b.h);
      if (ox2 > ox && oy2 > oy) { sample = hit((ox + ox2) / 2, (oy + oy2) / 2); break; }
    }
    return {
      panelRect: { x: pr.left, y: pr.top, w: pr.width, h: pr.height },
      overBtns: btns.filter((b) => inter(b) > 0).map((b) => b.act),
      sample,
      btnsVisible: [...document.querySelectorAll('.sw-title-menu .sw-title-btn')]
        .map((b) => getComputedStyle(b).visibility),
    };
  });
  L.say(`面板盒=${JSON.stringify(geom.panelRect)} 与按钮相交:[${geom.overBtns.join(',')}] 交叠命中=${JSON.stringify(geom.sample)}`);
  L.chk('Z2 几何前提:面板与菜单按钮相交(非 vacuous)', geom.overBtns.length > 0, `相交=${geom.overBtns.join(',')}`);
  L.chk('Z3 交叠区顶层=成就面板(z 序正解)', geom.sample?.hit && geom.sample.inPanel,
    `elementFromPoint=${JSON.stringify(geom.sample)}`);
  L.chk('Z4a 面板开→菜单按钮 visibility=hidden(vanilla SetState 独占)',
    geom.btnsVisible.length > 0 && geom.btnsVisible.every((v) => v === 'hidden'),
    `visibility=[${geom.btnsVisible.join(',')}]`);
  await savePageShot(page, resolveShotPath('ach-open', OUT));

  // ---- Z5:开关循环 3 轮(✕ / Esc 交替)----
  let loopOk = true, loopWhy = [];
  for (let i = 0; i < 3; i++) {
    const closeSel = i % 2 === 0;
    if (closeSel) {
      await page.click('.sw-ach-panel .sw-btn').catch((e) => { loopOk = false; loopWhy.push(`r${i} ✕点失败:${e.message}`); });
    } else {
      await page.keyboard.press('Escape');
    }
    if (!(await waitFn(page, () => !document.querySelector('.sw-ach-panel'), 3000))) { loopOk = false; loopWhy.push(`r${i} 关后面板残留`); }
    const vis = await page.evaluate(() =>
      [...document.querySelectorAll('.sw-title-menu .sw-title-btn')].map((b) => getComputedStyle(b).visibility));
    if (!(vis.length > 0 && vis.every((v) => v === 'visible'))) { loopOk = false; loopWhy.push(`r${i} 关后菜单未还原:[${vis.join(',')}]`); }
    await page.click('[data-act=ach]');
    if (!(await waitFn(page, () => !!document.querySelector('.sw-ach-panel'), 3000))) { loopOk = false; loopWhy.push(`r${i} 重开失败`); }
  }
  L.chk('Z5 开关循环 3 轮稳定(✕/Esc 交替+菜单还原+重开)', loopOk, loopWhy.join('; '));

  // ---- Z6:设置叠开链 ----
  await page.keyboard.press('Escape');   // 关循环尾开的面板
  await waitFn(page, () => !document.querySelector('.sw-ach-panel'), 3000);
  await page.click('[data-act=set]');
  L.chk('Z6-0 设置面板打开', await waitFn(page, () => !!document.querySelector('.sw-set-panel'), 5000));
  await page.click('[data-cat=achievements]');
  L.chk('Z6-1 设置→成就面板打开', await waitFn(page, () => !!document.querySelector('.sw-ach-panel'), 5000));
  const stack = await page.evaluate(() => {
    const p = document.querySelector('.sw-ach-panel')?.getBoundingClientRect();
    const s = document.querySelector('.sw-set-panel')?.getBoundingClientRect();
    if (!p || !s) return { why: '缺盒' };
    const ox = Math.max(p.left, s.left), oy = Math.max(p.top, s.top);
    const ox2 = Math.min(p.right, s.right), oy2 = Math.min(p.bottom, s.bottom);
    if (ox2 <= ox || oy2 <= oy) return { why: '不相交' };
    const el = document.elementFromPoint((ox + ox2) / 2, (oy + oy2) / 2);
    return { inAch: !!el?.closest('.sw-ach-panel'), cls: String(el?.className ?? '').slice(0, 40) };
  });
  L.chk('Z6-2 成就面板在设置面板之上(原版 SetState 叠开语义)', stack.inAch === true, JSON.stringify(stack));
  await savePageShot(page, resolveShotPath('ach-over-settings', OUT));
  await page.click('.sw-ach-panel .sw-btn');
  const afterClose = await page.evaluate(() => ({
    ach: !!document.querySelector('.sw-ach-panel'),
    set: !!document.querySelector('.sw-set-panel'),
  }));
  L.chk('Z6-3 ✕ 只关成就,设置仍在', afterClose.ach === false && afterClose.set === true, JSON.stringify(afterClose));
  await page.keyboard.press('Escape');
  L.chk('Z6-4 Esc 关设置', await waitFn(page, () => !document.querySelector('.sw-set-panel'), 3000));

  console.log(L.print());
  process.exit(L.exitCode());
} finally {
  await browser.close();
}
