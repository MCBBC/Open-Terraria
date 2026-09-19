// ★红队复核探针(2026-09-19 perf 四刀对抗性复核)v2:关键玩法面冒烟。
//   A 相(缺省旗):信息列 canvas 路径(染色缓存活体)/对话/地图/F4 相机/canvas 活集
//   B 相(?infodom=1):DOM 信息列挂载/悬停委托/对话收起/地图收起/F4 sw-camera-hide/
//     背包横排 hideInfo 点击链/remaster 失效钩
// 产出:逐面 PASS/FAIL + 页面错误清单 + canvas 活集对照。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode, installPinnedRandom } from '../tools/probe/lib/game.mjs';
import { front } from '../tools/probe/lib/browser.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5278';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const fails = [];
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`PASS: ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; fails.push(name); console.log(`FAIL: ${name}  ${detail}`); }
};

// 公共:装全门禁饰品(贝壳电话族)让信息列 12 行全显
const equipAllInOne = (page) => page.evaluate(async () => {
  for (let i = 0; i < 60 && !(window.__swFlow?.itemByVid && window.__swGame?.player?.inv?.armor); i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const g = window.__swGame;
  const flow = window.__swFlow;
  if (!flow?.itemByVid || !g?.player?.inv?.armor) return { ok: false, why: 'no-bridge' };
  const vid = [3124, 5358, 3123].find((v) => flow.itemByVid(v) != null);
  if (vid == null) return { ok: false, why: 'no-allinone-vid' };
  const iid = flow.itemByVid(vid);
  g.player.inv.armor[3] = { id: iid, stack: 1 };
  return { ok: true, vid };
});

// 公共:在玩家旁生成一个城镇 NPC 并开对话(TownNPC 直建,_bj165 同款)
const openDialogOnFreshNpc = (page) => page.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window.__rt4Npc) {
    const npc = new TownNPC('guide', g.player.x + 40, g.world.groundLevel * 16 - 48);
    npc.home = null;
    g.entities.add(npc, 'npcs');
    window.__rt4Npc = npc;
  }
  const npc = window.__rt4Npc;
  npc.dead = false;
  npc.x = g.player.x + 30; npc.y = g.player.y;
  g.player.vx = 0; g.player.vy = 0;
  g.openNpcDialog(npc);
  return { dialog: g.npcDialogActive, talking: !!g.player.talking };
});

const browser = await launchBrowser({});
try {
  // ================= A 相:缺省旗(canvas 旧路径 + 染色缓存开) =================
  const page = await openPage(browser, {});
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push('pageerror: ' + String(e?.message ?? e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 200)); });
  installPinnedRandom(page, 913);
  const boot = await bootstrap(page, ORIGIN);
  ok('A bootstrap', boot.ok);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 1200 });
  ok('A world-built', gen.ok);
  await godMode(page, true);
  const eqA = await equipAllInOne(page);
  ok('A 装备全门禁饰品', eqA.ok === true, JSON.stringify(eqA));
  await front(page);
  await sleep(1000);

  const snapA0 = await page.evaluate(() => document.querySelectorAll('canvas').length);

  // A1 信息列 canvas 路径活体 → 染色缓存有条目且稳态零新增
  const a1 = await page.evaluate(async () => {
    const MB = await import('/src/vui/draw/MouseTextBake.ts');
    const s1 = MB.bakeStats();
    await new Promise((r) => setTimeout(r, 700));
    const s2 = MB.bakeStats();
    const rows = window.__swGame.renderer.infoAccs.state.rows.length;
    return { s1, s2, rows };
  });
  ok('A1 信息行在域', a1.rows >= 8, `rows=${a1.rows}`);
  ok('A1 染色缓存开且有条目', a1.s1.tintCacheOn === true && a1.s1.tintCount > 0,
    `tint=${a1.s1.tintCount} pool=${a1.s1.tintPool} maskCache=${a1.s1.count}`);
  ok('A1 稳态零重染(700ms 内零新增)', a1.s2.tintCount === a1.s1.tintCount,
    `Δ=${a1.s2.tintCount - a1.s1.tintCount}`);

  // A2 对话面:生成向导并开对话 → canShow=false → 关闭恢复
  const a3 = await openDialogOnFreshNpc(page);
  await sleep(500);
  const a3b = await page.evaluate(async () => {
    const g = window.__swGame;
    const shown = g.renderer.infoAccs.canShow(true, false, false);
    const dialogOpen = g.npcDialogActive;
    g.closeNpcDialog(true);
    return { shown, dialogOpen };
  });
  await sleep(400);
  ok('A2 对话开合正常', a3.dialog === true && a3b.dialogOpen === true,
    `open=${a3.dialog} stillOpen=${a3b.dialogOpen}`);
  ok('A2 对话中 canShow=false(信息列门)', a3b.shown === false);

  // A3 地图面:M 开全图 → 关
  await page.evaluate(() => window.__swGame.toggleFullMap());
  await sleep(500);
  const a4 = await page.evaluate(() => ({ open: window.__swGame.renderer.fullMap.open }));
  await page.evaluate(() => window.__swGame.toggleFullMap());
  await sleep(400);
  ok('A3 全图开合', a4.open === true, `open=${a4.open}`);

  // A4 F4 相机面(缺省:无 DOM 层)
  await page.evaluate(() => window.__swGame.renderer.captureMode.toggleRequest(window.__swGame.player, window.__swGame.world));
  await sleep(600);
  const a5 = await page.evaluate(() => {
    const active = window.__swGame.renderer.captureMode.active;
    window.__swGame.renderer.captureMode.toggleRequest(window.__swGame.player, window.__swGame.world);
    return { active };
  });
  await sleep(400);
  ok('A4 F4 相机开合', a5.active === true, `active=${a5.active}`);

  const snapA1 = await page.evaluate(() => document.querySelectorAll('canvas').length);
  ok('A canvas 活集稳定(全旅程)', snapA0 >= 3 && snapA1 === snapA0, `${snapA0}→${snapA1}`);

  // ================= B 相:?infodom=1 DOM 层全链 =================
  const page2 = await openPage(browser, {});
  const pageErrors2 = [];
  page2.on('pageerror', (e) => pageErrors2.push('pageerror: ' + String(e?.message ?? e).slice(0, 200)));
  page2.on('console', (m) => { if (m.type() === 'error') pageErrors2.push('console: ' + m.text().slice(0, 200)); });
  await page2.goto(ORIGIN + '/?infodom=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  installPinnedRandom(page2, 913);
  const boot2 = await bootstrap(page2, ORIGIN);
  ok('B bootstrap(?infodom=1 携带)', boot2.ok);
  const gen2 = await createGame(page2, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 1200 });
  ok('B world-built', gen2.ok);
  await godMode(page2, true);
  const eqB = await equipAllInOne(page2);
  ok('B 装备全门禁饰品', eqB.ok === true, JSON.stringify(eqB));
  await front(page2);
  await sleep(1000);

  const b1 = await page2.evaluate(() => {
    const el = document.querySelector('.sw-infoaccs');
    return { mounted: !!el, display: el?.style?.display ?? null, rows: el?.children?.length ?? 0,
      domActive: !!window.__swGame.renderer.infoAccs.dom?.active };
  });
  ok('B1 DOM 层挂载且活(12 行)', b1.mounted === true && b1.domActive === true && b1.rows >= 8,
    JSON.stringify(b1));

  // B2 悬停委托:图标盒 hover → infoAccHover≥0
  const iconBox = await page2.evaluate(() => {
    const ic = document.querySelector('.sw-infoaccs img');
    if (!ic) return null;
    const r = ic.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  let b2 = { hover: -2 };
  if (iconBox) {
    await page2.mouse.move(iconBox.x, iconBox.y);
    await sleep(80); await page2.mouse.move(iconBox.x + 1, iconBox.y);
    await sleep(400);
    b2 = await page2.evaluate(() => ({ hover: window.__swGame.renderer.infoAccHover }));
  }
  ok('B2 DOM 悬停委托命中', b2.hover >= 0, `hover=${b2.hover} box=${JSON.stringify(iconBox)}`);

  // B3 对话开 → DOM 收起;关 → 恢复
  const b3 = await openDialogOnFreshNpc(page2);
  await sleep(500);
  const b3b = await page2.evaluate(() => {
    const el = document.querySelector('.sw-infoaccs');
    const d1 = el?.style?.display;
    const active1 = window.__swGame.renderer.infoAccs.dom?.active;
    window.__swGame.closeNpcDialog(true);
    return { d1, active1 };
  });
  await sleep(500);
  const b3c = await page2.evaluate(() => {
    const el = document.querySelector('.sw-infoaccs');
    return { d2: el?.style?.display, active2: window.__swGame.renderer.infoAccs.dom?.active };
  });
  ok('B3 对话开合正常', b3.dialog === true && b3b.d1 !== undefined, `open=${b3.dialog}`);
  ok('B3 对话中 DOM 收起/关闭恢复', b3b.d1 === 'none' && b3b.active1 === false
    && b3c.d2 === 'block' && b3c.active2 === true, `${JSON.stringify(b3b)}→${JSON.stringify(b3c)}`);

  // B4 地图开 → DOM 收起;关 → 恢复
  await page2.evaluate(() => window.__swGame.toggleFullMap());
  await sleep(500);
  const b4 = await page2.evaluate(() => {
    const el = document.querySelector('.sw-infoaccs');
    const d1 = el?.style?.display;
    window.__swGame.toggleFullMap();
    return { d1 };
  });
  await sleep(500);
  const b4b = await page2.evaluate(() => (document.querySelector('.sw-infoaccs')?.style?.display));
  ok('B4 全图开 DOM 收起/关恢复', b4.d1 === 'none' && b4b === 'block', `${b4.d1}→${b4b}`);

  // B5 F4 相机:sw-camera-hide 类挂摘(main.ts 接线面)
  await page2.evaluate(() => window.__swGame.renderer.captureMode.toggleRequest(window.__swGame.player, window.__swGame.world));
  await sleep(500);
  const b5 = await page2.evaluate(() => {
    const el = document.querySelector('.sw-infoaccs');
    const cls = el?.className ?? '';
    window.__swGame.renderer.captureMode.toggleRequest(window.__swGame.player, window.__swGame.world);
    return { cls };
  });
  await sleep(400);
  const b5b = await page2.evaluate(() => (document.querySelector('.sw-infoaccs')?.className ?? ''));
  ok('B5 F4 激活 sw-camera-hide 挂/摘', b5.cls.includes('sw-camera-hide') && !b5b.includes('sw-camera-hide'),
    `on="${b5.cls}" off="${b5b}"`);

  // B6 背包横排 + hideInfo 点击链
  await page2.keyboard.press('Escape');
  await sleep(700);
  const b6 = await page2.evaluate(() => {
    const g = window.__swGame;
    const rows = document.querySelectorAll('.sw-infoaccs .sw-inf-row').length;
    const row = g.renderer.infoAccs.state.rows?.[0];
    return { rows, invOpen: g.renderer.playerInventory, hideIndex: row?.hideIndex ?? -1 };
  });
  ok('B6 背包横排 DOM 行', b6.invOpen === true && b6.rows > 0 && b6.hideIndex >= 0, JSON.stringify(b6));
  if (b6.hideIndex >= 0) {
    const ib2 = await page2.evaluate(() => {
      const ic = document.querySelector('.sw-infoaccs .sw-inf-row img');
      if (!ic) return null;
      const r = ic.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const b6pre = await page2.evaluate((hi) => window.__swGame.player.hideInfo[hi], b6.hideIndex);
    if (ib2) {
      await page2.mouse.move(ib2.x, ib2.y); await sleep(350);
      await page2.mouse.click(ib2.x, ib2.y); await sleep(400);
      const b6d = await page2.evaluate((hi) => window.__swGame.player.hideInfo[hi], b6.hideIndex);
      ok('B6 hideInfo 点击翻转', b6d !== b6pre, `${b6pre}→${b6d}`);
      if (b6d !== b6pre) { await page2.mouse.click(ib2.x, ib2.y); await sleep(300); }
    } else {
      ok('B6 hideInfo 点击翻转', false, 'no-icon-box');
    }
  }
  await page2.keyboard.press('Escape');
  await sleep(500);

  // B7 remaster 失效钩:①染色缓存清空 + DOM 活集不动
  const b7 = await page2.evaluate(async () => {
    const g = window.__swGame;
    const dom = g.renderer.infoAccDom;
    const iconCacheImgs = dom?._iconUrls?.size ?? -1;
    document.dispatchEvent(new CustomEvent('sw:remaster-applied', { detail: { files: [] } }));
    await new Promise((r) => setTimeout(r, 100));
    const MB = await import('/src/vui/draw/MouseTextBake.ts');
    return { iconCacheImgs, tintAfterRemaster: MB.bakeStats().tintCount };
  });
  ok('B7 remaster 事件清染色缓存(失效面)', b7.tintAfterRemaster === 0, JSON.stringify(b7));
  await sleep(600);
  const b7b = await page2.evaluate(async () => {
    const MB = await import('/src/vui/draw/MouseTextBake.ts');
    const el = document.querySelector('.sw-infoaccs');
    return { tintRebuilt: MB.bakeStats().tintCount, domAlive: !!el && el.style.display === 'block' };
  });
  ok('B7 染色缓存失效后一帧重建/DOM 存活', b7b.tintRebuilt > 0 && b7b.domAlive, JSON.stringify(b7b));

  const errs = pageErrors.filter((e) => !e.includes('favicon'));
  const errs2 = pageErrors2.filter((e) => !e.includes('favicon'));
  ok('A 相零页面错误', errs.length === 0, errs.slice(0, 3).join(' | '));
  ok('B 相零页面错误', errs2.length === 0, errs2.slice(0, 3).join(' | '));

  console.log(`\nTOTAL: ${pass} pass / ${fail} fail`);
  if (fails.length) console.log('FAILS:', fails.join(' | '));
} finally {
  await closeAllBrowsers();
}
