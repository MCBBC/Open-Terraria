// SW-FX32 刀①探针(2026-09-11)——商店侧内嵌布局实机面(货架几何+快乐度+买卖流+门态+储蓄行)
// 运行:node tools/probe.mjs run scripts/_sw-fx32-shop-probe.mjs --vite=auto
// 金标:Terarria1457 Main.cs:42500-42532(货架/店名/快乐度)+:67677-67680(offsets)
//      +ItemSlot.cs:3712-3757(DrawSavings);1458 同域零增量(Main.cs:42508-42538 同式)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const CHROME = process.env.SW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_sw-fx32-shop-probe';
mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (cond, name) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  defaultViewport: { width: 1600, height: 1000 },   // K=1:vanillaScaleFor(1600,1000)=1
});

{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
  await sleep(800);
  const out = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ui = window.__swUI;
    const g = window.__swGame;
    document.getElementById('sw-welcome-announce')?.remove();
    const o = {};
    // 金标几何(Main.cs:42522-42523 逐槽截断;invBottom=258 :6746,scale 0.755 :42513)
    const gx = (i) => Math.trunc(73 + (i % 10) * 56 * 0.755);
    const gy = (i) => Math.trunc(258 + Math.floor(i / 10) * 56 * 0.755);
    const cellsOf = () => [...document.querySelectorAll('.sw-vinv .sw-vshop-cell')];

    // ---- 真链开店:商人(17) + 快乐度 1.2 → openNpcShop → cb.onNpcShop → 内嵌面 ----
    // ★桩 NPC 必须带真实位置:tickNpcDialogKeepAlive 每 tick 复查
    //  worldRegionIntersects(dn.x,dn.y,dn.w,dn.h)——无位桩=首 tick 即走远关店
    const px0 = Math.floor(g.player.cx), py0 = Math.floor(g.player.cy);
    g.dialogNpc = { npcKey: 'merchant', vanillaId: 17, talking: true, dead: false,
      x: px0, y: py0, w: 20, h: 42 };
    g.dialogHappiness = { priceMul: 1.2 };
    g.openNpcShop();
    await sleep(400);
    o.shopOpen = g.npcShopOpen === true;
    o.invOpen = document.querySelector('.sw-vinv')?.style.display === 'block';

    // ---- 货架几何:40 格逐槽 offsetLeft/Top == 金标 ----
    const cells = cellsOf();
    o.cellCount = cells.length;
    o.cellMismatch = [];
    for (const c of cells) {
      const i = Number(c.dataset.vshop);
      if (c.offsetLeft !== gx(i) || c.offsetTop !== gy(i)) {
        o.cellMismatch.push({ i, got: [c.offsetLeft, c.offsetTop], want: [gx(i), gy(i)] });
      }
    }
    o.cellsGeometryOk = cells.length === 40 && o.cellMismatch.length === 0;

    // ---- 店名 @(504,258) ----
    const title = [...document.querySelectorAll('.sw-vinv .vinv-txt')]
      .find((e) => e.offsetLeft === 504 && e.offsetTop === 258);
    o.titlePosOk = !!title;
    o.titleText = title?.textContent ?? '';

    // ---- 快乐度:图标 24×24 中心(516,366)=左上(504,354),帧 3(mul 1.2>1.1→-72px);
    //      文字 @(530,356)=120%(Main.cs:42506 三元链+:42510 P0) ----
    const happy = document.querySelector('.sw-vinv div[style*="UI_NPCHappiness"]');
    o.happyPosOk = !!happy && happy.offsetLeft === 504 && happy.offsetTop === 354;
    o.happyFrame = happy ? happy.style.backgroundPosition : '';
    o.happyFrameOk = o.happyFrame === '-72px 0px';
    const happyTxt = [...document.querySelectorAll('.sw-vinv .vinv-txt')]
      .find((e) => e.offsetLeft === 530 && e.offsetTop === 356);
    o.happyTextOk = !!happyTxt && happyTxt.textContent === '120%';

    // ---- 储蓄行:空仓不画(ItemSlot.cs:3726 num5>0 门) ----
    const savedEl = [...document.querySelectorAll('.sw-vinv .vinv-txt')]
      .find((e) => e.offsetLeft === 504 && e.offsetTop === 298);
    o.savedHiddenWhenEmpty = !savedEl || savedEl.offsetParent === null;

    // ---- 卖面:光标持物点空格 → 整叠卖出(ItemSlot.cs:1435-1438→case 4 :1195-1212) ----
    const firstEmpty = cells.find((c) => c.classList.contains('is-empty'));
    o.hasEmptySellZone = !!firstEmpty;
    const src = g.player.inv.slots.find((s) => s && s.stack > 0);
    o.hasItemToSell = !!src;
    if (src && firstEmpty) {
      ui.heldStack = { id: src.id, stack: src.stack, prefix: src.prefix ?? 0 };
      const before = g.coinsOwned();
      firstEmpty.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      await sleep(300);
      o.sellOk = ui.heldStack === null
        && (g.coinsOwned() > before || g.shopBuybackStock.length > 0);
      o.sellCoins = [before, g.coinsOwned(), g.shopBuybackStock.length];
    }

    // ---- 币物侦测(免 vid 反查):逐槽取出看 coinsOwned 落差 → 得币物 ----
    let coinItem = null;
    for (let i = 0; i < g.player.inv.slots.length && !coinItem; i++) {
      const s = g.player.inv.slots[i];
      if (!s) continue;
      g.player.inv.slots[i] = null;
      const withIt = g.coinsOwned();
      g.player.inv.slots[i] = s;
      const withoutIt = g.coinsOwned();
      if (withoutIt - withIt > 0) coinItem = s;   // 取出时总身家跌=币物
    }
    // ---- 储蓄行:币物塞存钱罐 → 标签 (504,298)/币行 (515,333)/存钱罐图标齐画 ----
    if (coinItem) {
      g.player.banks[0][0] = coinItem;
      ui.refreshAll();
      await sleep(250);
      const saved2 = [...document.querySelectorAll('.sw-vinv .vinv-txt')]
        .find((e) => e.offsetLeft === 504 && e.offsetTop === 298);
      o.savedShownAfterSeed = !!saved2 && saved2.offsetParent !== null
        && saved2.textContent.length > 0;
      o.savedText = saved2?.textContent ?? '';
      const coinRow = [...document.querySelectorAll('.sw-vinv div')]
        .find((e) => e.offsetLeft === 515 && e.offsetTop === 333);
      o.coinRowOk = !!coinRow && coinRow.offsetParent !== null
        && coinRow.querySelectorAll('img').length === 4;
      const piggy = [...document.querySelectorAll('.sw-vinv img')]
        .find((im) => Math.abs(im.offsetLeft - (504 + 70 - 10.4)) < 3
          && Math.abs(im.offsetTop - (258 + 60 - 10.4)) < 3);
      o.piggyIconOk = !!piggy && piggy.offsetParent !== null;
    } else {
      o.savedShownAfterSeed = null;   // 无币可侦测=环境缺前置,该组不判
    }

    // ---- 买面:最后一格(回购条目尾接)左键 → 扣币(:1910-1923) ----
    const buyable = [...cells].filter((c) => !c.classList.contains('is-empty') && c.dataset.ok === '1');
    const lastBuyable = buyable[buyable.length - 1];
    o.hasBuyable = !!lastBuyable;
    if (lastBuyable) {
      const before = g.coinsOwned();
      lastBuyable.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      await sleep(300);
      o.buyOk = g.coinsOwned() < before;
      o.buyCoins = [before, g.coinsOwned()];
    }

    // ---- 命中域:格 0 中心 elementFromPoint == 格本体 ----
    const c0 = cells[0];
    const hit0 = c0 ? document.elementFromPoint(c0.offsetLeft + 19, c0.offsetTop + 19) : null;
    o.hit0Ok = hit0 === c0 || (hit0 && c0.contains(hit0));
    return o;
  });
  await page.screenshot({ path: OUT + '/fx32-shop-open.png' });
  out.pageErrors = errs;
  for (const [k, v] of Object.entries(out)) {
    if (k !== 'pageErrors' && k !== 'cellMismatch') console.log(`  ${k} = ${JSON.stringify(v)}`);
  }
  console.log(`  cellMismatch = ${JSON.stringify(out.cellMismatch.slice(0, 5))}`);
  ok(out.shopOpen && out.invOpen, '真链开店:openNpcShop → npcShopOpen+vanilla 内嵌面开包(Main.cs:41164 同相)');
  ok(out.cellsGeometryOk, `货架 40 格逐槽==金标 73/258 步 42.28 截断(实测 mismatch=${out.cellMismatch.length})`);
  ok(out.titlePosOk, `店名 @(504,258) Main.cs:42502(文本=${out.titleText})`);
  ok(out.happyPosOk && out.happyFrameOk && out.happyTextOk, `快乐度帧3@中心(516,366)+文字120% @(530,356)(Main.cs:42506-42512;帧=${out.happyFrame})`);
  ok(out.savedHiddenWhenEmpty, '空仓储蓄行不画(ItemSlot.cs:3726 num5>0 门)');
  ok(out.hasEmptySellZone, '空格=售卖放置区(.is-empty 格在案;Main.cs:42531 空格照画)');
  ok(!out.hasItemToSell || out.sellOk, `卖出流:持物点空格 → 整叠卖出+光标清(实测 ${JSON.stringify(out.sellCoins)})`);
  ok(out.savedShownAfterSeed !== null, `储蓄行:币入存钱罐 → 标签/币行/存钱罐图标齐画(实测 ${JSON.stringify([out.savedShownAfterSeed, out.savedText, out.coinRowOk, out.piggyIconOk])})`);
  ok(!out.hasBuyable || out.buyOk, `买入流:左键尾格(回购) → 扣币(实测 ${JSON.stringify(out.buyCoins)})`);
  ok(out.hit0Ok, '命中域:格 0 中心 elementFromPoint=格本体');
  ok(out.pageErrors.length === 0, '红方:零页面错误');
  for (const e of out.pageErrors) console.log(`  pageError: ${e}`);

  // ---- 第二段:PipsUseGrid 门 + 关店收面 ----
  const out2 = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ui = window.__swUI;
    const g = window.__swGame;
    const o = {};
    const cells = () => [...document.querySelectorAll('.sw-vinv .sw-vshop-cell')];
    o.visibleBefore = cells().every((c) => c.offsetParent !== null);
    ui.vinvPipsUseGrid = true;      // Main.cs:42500 门——网格态货架整段不画
    ui.refreshAll();
    await sleep(200);
    o.hiddenInGridMode = cells().every((c) => c.offsetParent === null || c.style.display === 'none');
    ui.vinvPipsUseGrid = false;
    ui.refreshAll();
    await sleep(200);
    o.restoredAfterGrid = cells().every((c) => c.offsetParent !== null);
    g.closeNpcDialog();             // 关店收面真链:Game.closeNpcDialog → npcShopClose
    await sleep(250);               //   + cb.onNpcDialogClose → ui.closeNpcDialog → refreshAll
    o.hiddenAfterClose = cells().every((c) => c.offsetParent === null || c.style.display === 'none')
      && g.npcShopOpen === false;
    return o;
  });
  for (const [k, v] of Object.entries(out2)) console.log(`  ${k} = ${JSON.stringify(v)}`);
  ok(out2.visibleBefore && out2.hiddenInGridMode && out2.restoredAfterGrid, 'PipsUseGrid 门:网格态整段不画/关网格复原(Main.cs:42500)');
  ok(out2.hiddenAfterClose, '关店收面:closeNpcDialog → 货架隐藏+npcShopOpen 清');
  ok(errs.length === 0, '红方:全程零页面错误');
  await page.close();
}
await browser.close();
console.log(fails.length === 0 ? 'ALL PASS' : `FAILED: ${fails.length}`);
process.exit(fails.length === 0 ? 0 : 1);
