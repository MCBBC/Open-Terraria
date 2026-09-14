// FX22 对话面板探针:①面板几何(宽 500/水平居中/y=100,NPCChatPanel.cs:65-66 锚)
// ②开店收面板(原版 OpenShop Main.cs:41162-41169 npcChatText=""→面板门 :47490 关;
//   dialogNpc 会话保持) ③重开对话链重现面板 ④走远 keepAlive 收会话+店
// ⑤追报回归:面板钮(close/shop)mousedown 派发中途面板被 remove → window 层
//   Input.mousedown 门(isDomUiTarget)必须仍拦住,不得漏成世界开火/耗弹。
// 跑法(私有静默实例,防打断并行会话):
//   SW_PORT=5205 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5205 nohup npx vite > /tmp/vite-5205.log 2>&1 &
//   SW_ORIGIN=http://localhost:5205 node tools/run-diag.mjs --timeout=600000 scripts/_fx22-dialog-pos.mjs
import puppeteer from 'puppeteer-core';
const CHROME = process.env.SW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS ${name}${extra ? ' | ' + extra : ''}`); }
  else { fail++; console.log(`FAIL ${name}${extra ? ' | ' + extra : ''}`); }
};
const approx = (a, b, tol = 2) => Math.abs(a - b) <= tol;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1400, height: 900 },
});

async function boot(suffix) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small' + suffix, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(800);
  return { page, errs };
}

/** 一次布局(classic/vanilla)跑全序列 ①→⑤ */
async function sequence(layout, suffix) {
  console.log(`\n===== layout=${layout || 'classic'} =====`);
  const { page, errs } = await boot(suffix);
  const ammoSum = () => page.evaluate(() => {
    const g = window.__swGame;
    return g.player.inv.slots.reduce((s, it) => s + (it ? (it.stack ?? 1) : 0), 0);
  });

  // ---- 0 场景:商人 NPC + 手持枪 + 弹药(漏世界层回归的"弹药面"物质) ----
  const setup = await page.evaluate(async () => {
    document.getElementById('sw-welcome-announce')?.remove();
    const g = window.__swGame;
    const { options } = await import('/src/core/Options.ts');
    options.data.autoPause = false;   // ④走远须世界照常步进——autoPause 开时背包开=暂停,keepAlive 冻结(可达性,非语义面)
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const n = new TownNPC('merchant', g.player.x + 30, g.world.groundLevel * 16 - 48);
    n.home = { x: Math.floor(n.cx / 16), y: Math.floor(n.cy / 16) };
    g.entities.add(n, 'npcs');
    window.__fx22npc = n;
    g.player.x = n.cx - 30; g.player.y = n.cy - 8;
    g.player.debugGod = true;
    const IBK = window.__swItems ?? {};
    const keys = Object.keys(IBK);
    const gunKey = keys.find((k) => k.startsWith('vi_1553_')) ?? keys.find((k) => k.startsWith('vi_98_'));   // SDMG/迷你鲨
    const ammoKey = keys.find((k) => k.startsWith('vi_97_')) ?? keys.find((k) => k.startsWith('vi_546_'));   // 火枪弹
    if (gunKey) g.player.inv.slots[0] = { id: IBK[gunKey], stack: 1 };
    if (ammoKey) g.player.inv.slots[53] = { id: IBK[ammoKey], stack: 99 };
    g.player.inv.selected = 0;
    return { npc: !!n, gunKey: gunKey ?? null, ammoKey: ammoKey ?? null };
  });
  ok(`${layout} 0 商人+枪+弹就位`, setup.npc && !!setup.gunKey && !!setup.ammoKey,
    `gun=${setup.gunKey} ammo=${setup.ammoKey}`);
  const ammo0 = await ammoSum();

  // ---- ① 开对话 → 面板几何(宽 500±2 / 水平居中±4 / y=100±2) ----
  await page.evaluate(async () => {
    const g = window.__swGame;
    g.openNpcDialog.call(g, window.__fx22npc);
    await new Promise((r) => setTimeout(r, 250));
  });
  const geo = await page.evaluate(() => {
    const p = document.querySelector('.sw-npc-dialog');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { w: r.width, left: r.left, top: r.top, vw: window.innerWidth, h: r.height };
  });
  ok(`${layout} ①面板存在`, !!geo);
  ok(`${layout} ①面板宽 500±2`, approx(geo?.w ?? -1, 500, 2), `w=${geo?.w}`);
  ok(`${layout} ①水平居中±4(screenWidth/2-250)`, approx(geo?.left ?? -1, (geo?.vw ?? 0) / 2 - 250, 4),
    `left=${geo?.left} 期望=${((geo?.vw ?? 0) / 2 - 250).toFixed(1)}`);
  ok(`${layout} ①y=100±2`, approx(geo?.top ?? -1, 100, 2), `top=${geo?.top}`);
  if (layout === 'legacy') await page.screenshot({ path: '/tmp/fx22-dialog-pos.png' });

  // ---- ② 点商店钮 → 面板收 + 货架显 + dialogNpc 仍活 + 点击不漏世界层 ----
  const shop = await page.evaluate(async () => {
    const g = window.__swGame;
    const btn = document.querySelector('.sw-npc-dialog button[data-b="shop"]');
    if (!btn) return { btnFound: false };
    let saw = false;
    const spy = () => { saw = true; };
    window.addEventListener('mousedown', spy);
    const ammoBefore = g.player.inv.slots.reduce((s, it) => s + (it ? (it.stack ?? 1) : 0), 0);
    const swingBefore = g.swing?.t ?? 0;
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));   // 真实冒泡派发
    await new Promise((r) => setTimeout(r, 400));
    window.removeEventListener('mousedown', spy);
    const shopEl = document.querySelector('.sw-npc-shop');
    const vinvTitle = window.__swUI.vinvShopTitleEl;
    return {
      btnFound: true, saw,
      panelGone: !document.querySelector('.sw-npc-dialog'),
      dialogAlive: g.dialogNpc !== null, active: g.npcDialogActive, shopOpen: g.npcShopOpen,
      classicShelf: !!shopEl && shopEl.getClientRects().length > 0,
      vinvShelf: g.npcShopOpen && !!vinvTitle && vinvTitle.getClientRects().length > 0,
      ammoBefore,
      ammoAfter: g.player.inv.slots.reduce((s, it) => s + (it ? (it.stack ?? 1) : 0), 0),
      swingBefore, swingAfter: g.swing?.t ?? 0,
      mouseDown: g.input.mouseDown, mouseHeld: g.input.mouseHeld,
    };
  });
  ok(`${layout} ②商店钮在`, shop.btnFound === true);
  ok(`${layout} ②事件到达 window 层(spy)`, shop.saw === true);
  ok(`${layout} ②面板收起(display none 级)`, shop.panelGone === true);
  ok(`${layout} ②dialogNpc 会话保持`, shop.dialogAlive === true && shop.active === true);
  ok(`${layout} ②货架显(${layout === 'legacy' ? 'classic .sw-npc-shop' : 'vinv 内嵌'})`,
    layout === 'legacy' ? shop.classicShelf === true : shop.vinvShelf === true,
    `classic=${shop.classicShelf} vinv=${shop.vinvShelf}`);
  ok(`${layout} ②Input 门拦住(mouseDown/mouseHeld 恒 false)`,
    shop.mouseDown === false && shop.mouseHeld === false,
    `down=${shop.mouseDown} held=${shop.mouseHeld}`);
  ok(`${layout} ②无世界开火(弹药/挥动不变)`, shop.ammoAfter === shop.ammoBefore && shop.swingAfter <= 1,
    `ammo ${shop.ammoBefore}→${shop.ammoAfter} swing ${shop.swingBefore}→${shop.swingAfter}`);

  // ---- ③ 重开对话链(openNpcDialog) → 面板重现,同一屏位(统一位置) ----
  await page.evaluate(async () => {
    const g = window.__swGame;
    g.openNpcDialog.call(g, window.__fx22npc);
    await new Promise((r) => setTimeout(r, 250));
  });
  const regeo = await page.evaluate(() => {
    const p = document.querySelector('.sw-npc-dialog');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return { w: r.width, left: r.left, top: r.top };
  });
  ok(`${layout} ③重开后面板重现`, !!regeo);
  ok(`${layout} ③重现=同一屏位(统一位置)`,
    !!regeo && !!geo && approx(regeo.w, geo.w, 2) && approx(regeo.left, geo.left, 2) && approx(regeo.top, geo.top, 2),
    `①(${geo?.w},${geo?.left},${geo?.top}) ③(${regeo?.w},${regeo?.left},${regeo?.top})`);

  // ---- ④ 走远(keepAlive 清 dialogNpc) → 面板+货架全收 ----
  await page.evaluate(async () => {
    const g = window.__swGame;
    g.player.x += 2000;   // worldRegion(±80,±48px) 外
    await new Promise((r) => setTimeout(r, 1500));
  });
  const away = await page.evaluate(() => {
    const g = window.__swGame;
    const vinvTitle = window.__swUI.vinvShopTitleEl;
    return {
      npcCleared: g.dialogNpc === null, shopClosed: g.npcShopOpen === false,
      panelGone: !document.querySelector('.sw-npc-dialog'),
      classicShelfGone: !document.querySelector('.sw-npc-shop'),
      vinvShelfGone: g.npcShopOpen === false && !(vinvTitle && vinvTitle.getClientRects().length > 0),
    };
  });
  ok(`${layout} ④走远 dialogNpc 清`, away.npcCleared === true);
  ok(`${layout} ④npcShopOpen 清`, away.shopClosed === true);
  ok(`${layout} ④面板不重现(原版同相:npcChatText 仍空)`, away.panelGone === true);
  ok(`${layout} ④货架随会话收`, layout === 'legacy' ? away.classicShelfGone === true : away.vinvShelfGone === true,
    `classic=${away.classicShelfGone} vinv=${away.vinvShelfGone}`);

  // ---- ⑤ 关闭钮漏世界层回归(追报主诉):走回 NPC 重开 → 点关闭 ----
  await page.evaluate(async () => {
    const n = window.__fx22npc;
    const g = window.__swGame;
    g.player.x = n.cx - 30; g.player.y = n.cy - 8;
    g.openNpcDialog.call(g, n);
    await new Promise((r) => setTimeout(r, 250));
  });
  const closeRun = await page.evaluate(async () => {
    const g = window.__swGame;
    const btn = document.querySelector('.sw-npc-dialog button[data-b="close"]');
    if (!btn) return { btnFound: false };
    let saw = false;
    const spy = () => { saw = true; };
    window.addEventListener('mousedown', spy);
    const ammoBefore = g.player.inv.slots.reduce((s, it) => s + (it ? (it.stack ?? 1) : 0), 0);
    const swingBefore = g.swing?.t ?? 0;
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));   // 真实冒泡派发
    await new Promise((r) => setTimeout(r, 400));
    window.removeEventListener('mousedown', spy);
    return {
      btnFound: true, saw,
      panelGone: !document.querySelector('.sw-npc-dialog'),
      dialogCleared: g.dialogNpc === null,
      ammoBefore,
      ammoAfter: g.player.inv.slots.reduce((s, it) => s + (it ? (it.stack ?? 1) : 0), 0),
      swingBefore, swingAfter: g.swing?.t ?? 0,
      mouseDown: g.input.mouseDown, mouseHeld: g.input.mouseHeld,
    };
  });
  ok(`${layout} ⑤关闭钮在`, closeRun.btnFound === true);
  ok(`${layout} ⑤事件到达 window 层(spy)`, closeRun.saw === true);
  ok(`${layout} ⑤面板收+dialogNpc 清`, closeRun.panelGone === true && closeRun.dialogCleared === true);
  ok(`${layout} ⑤Input 门拦住(mouseDown/mouseHeld 恒 false)`,
    closeRun.mouseDown === false && closeRun.mouseHeld === false,
    `down=${closeRun.mouseDown} held=${closeRun.mouseHeld}`);
  ok(`${layout} ⑤无世界开火(弹药/挥动不变)`,
    closeRun.ammoAfter === closeRun.ammoBefore && closeRun.swingAfter <= 1,
    `ammo ${closeRun.ammoBefore}→${closeRun.ammoAfter} swing ${closeRun.swingBefore}→${closeRun.swingAfter}`);

  ok(`${layout} 页面错误零`, errs.length === 0, errs.slice(0, 2).join(' | '));
  void ammo0;
  await page.close();
}

await sequence('legacy', '&invlayout=legacy');   // classic 浮面商店(用户实报布局;vanilla 现为缺省)
await sequence('vanilla', '');                    // 缺省=vanilla 内嵌货架(FX32)

console.log(`\nfx22 probe: ${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
