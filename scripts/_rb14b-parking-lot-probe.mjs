// SW-RB14b 探针(2026-09-12)——FX39 停车坪入口【逐入口 click 直读】+ 关包关店门实机面。
// 补 _fx39-default-flip-probe.mjs A14(只查按钮在位)的缺口:每个回调实际点穿,面板真开。
// 运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_rb14b-parking-lot-probe.mjs
// 金标:main.ts openInGamePause 停车坪(vanilla 门控=缺省常态路径);Main.cs:42496-42499
//      !playerInventory → SetNPCShopIndex(0)(RB14b F1 关包关店门)。
import {
  launchBrowser, openPage, bootstrap, createGame, ledger, front, savePageShot,
} from '../tools/probe/lib/index.mjs';

const fails = [];
const L = ledger();
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({ viewport: { width: 1600, height: 1000 } });
{
  const page = await openPage(browser, {});
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message ?? e).slice(0, 160)));
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) { console.log('BOOT FAIL', boot); process.exit(1); }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('P0 世界已建(缺省态直启,无 invlayout 参数)', gen.ok);
  await front(page);
  // 预置首用确认旗(道具搜索/旅程快捷门)——门语义另行有测,此处只验接线(bootstrap 后同文档落)
  await page.evaluate(() => {
    try {
      localStorage.setItem('sbw.itemSearchConfirmed', '1');
      localStorage.setItem('sbw.journeyQuick.weather', '1');
      localStorage.setItem('sbw.journeyQuick.time', '1');
    } catch { /* 隐私模式静默 */ }
  });

  const parkSetup = async () => {
    await page.evaluate(async () => {
      const ui = window.__swUI;
      ui.openInventory(true);
      await ui.refreshAllAsync();
      await new Promise((r) => setTimeout(r, 150));
      const vinv = document.querySelector('.sw-vinv');
      const setBtn = [...vinv.querySelectorAll('button')].find((b) => b.className.includes('vinv-txt') && (b.textContent || '').length <= 4);
      // openInventory 带 120ms 二次 settle 定时器,设置钮 mousedown 与重排竞速——重试到面板出现
      for (let i = 0; i < 3 && !document.querySelector('.sw-pause-panel'); i++) {
        setBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 300));
      }
    });
  };
  const clickParkEntry = (label) => page.evaluate(async (lb) => {
    const panel = document.querySelector('.sw-pause-panel');
    const btns = [...(panel?.querySelectorAll('button') ?? [])].map((b) => b.textContent || '');
    const btn = btns.includes(lb) ? [...panel.querySelectorAll('button')].find((b) => (b.textContent || '') === lb) : null;
    if (!btn) return { found: false, panelOpen: !!panel, btns };
    btn.click();
    await new Promise((r) => setTimeout(r, 250));
    return { found: true, panelOpen: !!panel, btns };
  }, label);

  // P1 设置钮 → 暂停面板(vanilla 缺省态)
  await parkSetup();
  L.chk('P1 设置钮开暂停面板(缺省 vanilla 态)', await page.evaluate(() => !!document.querySelector('.sw-pause-panel')));
  L.chk('P2 停车坪入口在位:住房/道具搜索/天气/时间(玩家列表:单机缺席=门语义)',
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('.sw-pause-panel button')].map((b) => b.textContent || '');
      return t.some((x) => x.includes('住房')) && t.some((x) => x.includes('道具搜索'))
        && t.some((x) => x.includes('天气控制')) && t.some((x) => x.includes('时间控制'))
        && !t.some((x) => x.includes('玩家列表'));
    }));

  // P3 住房入口 click 直读
  let r = await clickParkEntry('住房');
  let okHousing = r.found && await page.evaluate(() => !!document.querySelector('.sw-housing-panel'));
  L.chk('P3 住房入口点击 → .sw-housing-panel 开', okHousing);
  await page.evaluate(() => document.querySelector('.sw-housing-x')?.click() || window.__swFlow?.closeHousing?.());
  await sleep(150);

  // P4 道具搜索入口 click 直读(确认旗已预置=直达面板)
  await parkSetup();
  r = await clickParkEntry('道具搜索');
  L.chk('P4 道具搜索入口点击 → 搜索面板开(含输入框)', r.found && await page.evaluate(() =>
    !!document.querySelector('.sw-root input[placeholder*="名称"]') || [...document.querySelectorAll('input')].some((i) => (i.placeholder || '').includes('名称'))));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent === '✕')?.click(); });
  await sleep(120);

  // P5 时间/天气入口 click 直读(渲染器面板旗翻转;顺序对调以隔离二次入坪竞速)
  await parkSetup();
  r = await clickParkEntry('时间控制');
  const time = await page.evaluate(() => window.__swGame.renderer.timePanelOpen);
  await page.evaluate(() => { window.__swGame.renderer.timePanelOpen = false; });
  L.chk('P5a 时间控制入口点击 → renderer.timePanelOpen 翻转', r.found && time === true, JSON.stringify(r).slice(0, 160));
  await parkSetup();
  r = await clickParkEntry('天气控制');
  const weather = await page.evaluate(() => window.__swGame.renderer.weatherPanelOpen);
  await page.evaluate(() => { window.__swGame.renderer.weatherPanelOpen = false; });
  L.chk('P5b 天气控制入口点击 → renderer.weatherPanelOpen 翻转', r.found && weather === true, JSON.stringify(r).slice(0, 160));

  // P6 旅程/研究入口:appearance.difficulty=3(旅程)后出现并点穿
  await page.evaluate(() => { const p = window.__swGame.player; if (!p.appearance) p.appearance = {}; p.appearance.difficulty = 3; });
  await parkSetup();
  L.chk('P6 旅程态停车坪新增:力量菜单/研究入口', await page.evaluate(() => {
    const t = [...document.querySelectorAll('.sw-pause-panel button')].map((b) => b.textContent || '');
    return t.includes('力量菜单') && t.includes('研究');
  }));
  r = await clickParkEntry('研究');
  if (!r.found) console.log('DBG P7', JSON.stringify(r));
  const resOpen = await page.evaluate(() => !!document.querySelector('.sw-res-panel'));
  L.chk('P7 研究入口点击 → .sw-res-panel 开(RB14b F6 签订正后可达)', r.found && resOpen);
  if (resOpen) await page.evaluate(() => {
    const p = document.querySelector('.sw-res-panel');
    [...(p?.querySelectorAll('button') ?? [])].find((b) => b.textContent === '✕')?.click();
  });
  await sleep(120);
  await parkSetup();
  r = await clickParkEntry('力量菜单');
  L.chk('P8 旅程(力量菜单)入口点击 → .sw-jp-panel 开', r.found && await page.evaluate(() => !!document.querySelector('.sw-jp-panel')));
  await page.evaluate(() => {
    const p = document.querySelector('.sw-jp-panel');
    [...(p?.querySelectorAll('button') ?? [])].find((b) => b.textContent === '✕')?.click();
  });
  await sleep(120);

  // P9 RB14b F1 关包关店门:开店 → closeInventory(设置浮层/死亡同路径) → npcShopOpen 清
  await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    await ui.refreshAllAsync();
    g.npcShopOpen = true;
    ui.showNpcShop('商人', [{ vanillaId: 8, price: 50, prefix: 0, stack: 1 }], 10000, 1);
    await ui.refreshAllAsync();
    ui.closeInventory();          // RB14b F1:关包必须连店关(Main.cs:42496-42499)
  });
  await sleep(150);
  const f1 = await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    const afterClose = { shopFlag: g.npcShopOpen, shelfVisible: (() => {
      const c = document.querySelector('[data-vshop="0"]');
      return !!c && c.offsetParent !== null && ui.inventoryOpen;
    })() };
    g.npcShopOpen = false;   // 探针自清
    await ui.refreshAllAsync();
    return afterClose;
  });
  L.chk('P9 关包关店门:closeInventory 后 npcShopOpen=false(Main.cs:42496-42499 等价)', f1.shopFlag === false, JSON.stringify(f1));

  L.chk('P10 零页面错误', errs.length === 0, errs.join(' | '));
  await savePageShot(page, '/tmp/probe-out/rb14b-parking-lot.png');
  await page.evaluate(() => window.__swUI.closeInventory());
  await page.close();
}

console.log(`\n== SW-RB14b 停车坪探针完成 ${L.elapsed()} ==`);
if (L.fails.length) { console.log('FAILS:', L.fails.join(' | ')); process.exit(2); }
process.exit(0);
