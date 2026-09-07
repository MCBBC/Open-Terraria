// 刀 2 验证探针:vanilla 布局构建器主体(2026-09-07)
//  运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_vanilla-inv-knife2-probe.mjs
//  覆盖:flag 互斥/网格 50 槽+热键栏隐藏/原版坐标(视口 1600×1000 → K=1、mH=256、num20=430)/
//        三列 x/页签切换杂项页/classic 守恒(缺省布局零漂移)/截图
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));

// ---------- ① classic 守恒(缺省无 URL 覆盖) ----------
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));
{
  const c = await page.evaluate(() => {
    const ui = window.__swUI;
    ui.openInventory();
    const vinv = document.querySelector('.sw-vinv');
    const dock = !!document.querySelector('.sw-eqdock');
    const grid = document.querySelectorAll('.sw-invgrid .sw-slot').length;
    const hotbarDisplay = ui.hotbarEl.style.display;
    ui.closeInventory();
    return { vinvExists: !!vinv, dock, grid, hotbarDisplay };
  });
  ok(!c.vinvExists && c.dock && c.grid === 40 && c.hotbarDisplay === '', `① classic 守恒:无 .sw-vinv/有 eqdock/网格 40/热键栏显示 (got vinv=${c.vinvExists} dock=${c.dock} grid=${c.grid} hotbar='${c.hotbarDisplay}')`);
}

// ---------- ② vanilla 档(URL 覆盖) ----------
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));
{
  const v = await page.evaluate(async () => {
    const ui = window.__swUI;
    const dock = !!document.querySelector('.sw-eqdock');
    const vinv = document.querySelector('.sw-vinv');
    if (!vinv) return { vinvExists: false };
    ui.openInventory();
    await new Promise((r) => setTimeout(r, 150));   // refreshAll=rAF 合并通道,等一拍再读
    const hotbar = ui.hotbarEl.style.display;
    const invCount = vinv.querySelectorAll('.sw-slot[data-where="inv"]').length;
    const q = (sel) => vinv.querySelector(sel);
    const slot0 = q('.sw-slot[data-idx="0"][data-where="inv"]');
    const slot1 = q('.sw-slot[data-idx="1"][data-where="inv"]');
    const slot49 = q('.sw-slot[data-idx="49"][data-where="inv"]');
    const equip = q('.sw-slot[data-idx="0"][data-where="armor"]');
    const vanity = q('.sw-slot[data-idx="10"][data-where="armor"]');
    const dye = q('.sw-slot[data-idx="0"][data-where="dye"]');
    const trash = q('.sw-trash');
    const quick = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('ChestStack'));
    const best = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.style.backgroundImage.includes('UI_Bestiary'));
    const tabs = [...vinv.querySelectorAll('.vinv-btn')].filter((b) => b.style.backgroundImage.includes('DisplaySlots'));
    const miscTab = tabs.find((b) => b.style.backgroundImage.includes('DisplaySlots_2'));
    const miscSlot = q('[data-where="misc"]');
    const miscPageBefore = miscSlot && miscSlot.offsetParent !== null;
    miscTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const miscPageAfter = miscSlot.offsetParent !== null;
    const equipPageAfter = equip.offsetParent !== null;
    // 回页 0(再点一次)
    miscTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const equipBack = equip.offsetParent !== null;
    return {
      vinvExists: true, dock, hotbar, invCount,
      hotbarRestored: await (async () => {
        let closeErr = 'ok';
        try { ui.closeInventory(); } catch (e) { closeErr = String(e && e.stack || e).slice(0, 200); }
        await new Promise((r) => setTimeout(r, 200));
        const d = ui.hotbarEl.style.display;
        const dName = ui.hotbarNameEl.style.display;
        const invDisp = ui.invPanel.style.display;
        ui.openInventory();
        await new Promise((r) => setTimeout(r, 200));
        window.__vinvDbg = { closeErr, d, dName, invDisp };
        return d === '';
      })(),
      slot0: { x: slot0.offsetLeft, y: slot0.offsetTop },
      pitch: slot1.offsetLeft - slot0.offsetLeft,
      slot49: { x: slot49.offsetLeft, y: slot49.offsetTop },
      equipX: equip.offsetLeft, vanityX: vanity.offsetLeft, dyeX: dye.offsetLeft,
      trash: { x: trash.offsetLeft, y: trash.offsetTop },
      quick: quick ? { x: quick.offsetLeft, y: quick.offsetTop } : null,
      best: best ? { x: best.offsetLeft, y: best.offsetTop } : null,
      tabCount: tabs.length, miscPageBefore, miscPageAfter, equipPageAfter, equipBack,
      armorCount: vinv.querySelectorAll('.sw-slot[data-where="armor"]').length,
      dyeCount: vinv.querySelectorAll('.sw-slot[data-where="dye"]').length,
      miscCount: vinv.querySelectorAll('.sw-slot[data-where="misc"]').length,
      miscDyeCount: vinv.querySelectorAll('.sw-slot[data-where="miscDye"]').length,
    };
  });
  ok(v.vinvExists === true && !v.dock, '② flag=vanilla:有 .sw-vinv 无 eqdock');
  ok(v.invCount === 58, `② 网格 50+钱币弹药 8 = 58 inv 槽 (got ${v.invCount})`);
  ok(v.armorCount === 20 && v.dyeCount === 10 && v.miscCount === 5 && v.miscDyeCount === 5, `② 装备/时装 20+染料 10+杂项 5+杂项染料 5 (got ${v.armorCount}/${v.dyeCount}/${v.miscCount}/${v.miscDyeCount})`);
  ok(v.hotbar === 'none', '② 开包热键栏隐藏(原版 GUIHotbarDrawInner 早退)');
  const dbg = await page.evaluate(() => window.__vinvDbg);
  ok(v.hotbarRestored, `② 关包热键栏还原(display="") dbg=${JSON.stringify(dbg)}`);
  ok(v.slot0.x === 20 && v.slot0.y === 20, `② slot0=(20,20) (got ${v.slot0.x},${v.slot0.y})`);
  ok(v.pitch === 47, `② 步距 trunc(47.6)=47 (got ${v.pitch})`);
  ok(v.slot49.x === 448 && v.slot49.y === 210, `② slot49=(448,210) 第 5 行 (got ${v.slot49.x},${v.slot49.y})`);
  ok(v.equipX === 1508 && v.vanityX === 1461 && v.dyeX === 1414, `② 三列 x=sw-92/-139/-186=1508/1461/1414 (got ${v.equipX}/${v.vanityX}/${v.dyeX})`);
  ok(v.trash.x === 448 && v.trash.y === 258, `② 垃圾桶 (448,258) (got ${v.trash.x},${v.trash.y})`);
  ok(v.quick && v.quick.x === 498 && v.quick.y === 244, `② QuickStack (498,244) (got ${v.quick && v.quick.x},${v.quick && v.quick.y})`);
  ok(v.best && v.best.x === 498 && v.best.y === 278, `② 图鉴 (498,278) (got ${v.best && v.best.x},${v.best && v.best.y})`);
  ok(v.tabCount === 3, `② 页签 3 枚(杂项/住房/相机) (got ${v.tabCount})`);
  ok(!v.miscPageBefore && v.miscPageAfter && !v.equipPageAfter && v.equipBack, '② 页签切换:杂项页显/装备页藏/再点回装备页');
}

// 截图存档(先关欢迎弹窗)
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button, .sw-btn')].find((b) => (b.textContent || '').includes('我知晓'));
  if (btn) btn.click();
  window.__swUI.openInventory();
});
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/vanilla-inv-knife2.png' });

ok(errs.length === 0, `无页面错误 ${errs.length ? JSON.stringify(errs) : ''}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
