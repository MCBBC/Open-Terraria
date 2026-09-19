// ★红队复核 fix-up:v2 冒烟三个待定面的收敛复核(等图标懒加载窗关闭后再测)。
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

const equipAllInOne = (page) => page.evaluate(async () => {
  for (let i = 0; i < 60 && !(window.__swFlow?.itemByVid && window.__swGame?.player?.inv?.armor); i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  const g = window.__swGame;
  const flow = window.__swFlow;
  const vid = [3124, 5358, 3123].find((v) => flow.itemByVid(v) != null);
  if (vid == null) return { ok: false };
  g.player.inv.armor[3] = { id: flow.itemByVid(vid), stack: 1 };
  return { ok: true, vid };
});

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, {});
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message ?? e).slice(0, 160)));
  installPinnedRandom(page, 913);
  await page.goto(ORIGIN + '/?infodom=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const boot = await bootstrap(page, ORIGIN);
  ok('boot', boot.ok);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', settleMs: 1200 });
  ok('world', gen.ok);
  await godMode(page, true);
  const eq = await equipAllInOne(page);
  ok('equip', eq.ok === true);
  await front(page);
  await sleep(800);

  // 等图标懒加载窗关闭(img 实际渲染:complete && naturalWidth>0)
  const iconsReady = await page.waitForFunction(() => {
    const ics = [...document.querySelectorAll('.sw-infoaccs .sw-inf-row img')];
    return ics.length > 0 && ics.filter((i) => i.style.display !== 'none' && i.complete && i.naturalWidth > 0).length >= 12;
  }, { timeout: 30000, polling: 500 }).then(() => true).catch(() => false);
  ok('图标懒加载窗关闭(12 图标实渲染)', iconsReady === true);

  // F1 悬停委托(图标已实渲染)
  const box = await page.evaluate(() => {
    const ic = document.querySelector('.sw-infoaccs .sw-inf-row img');
    const r = ic.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y); await sleep(100);
  await page.mouse.move(box.x + 1, box.y); await sleep(400);
  const f1 = await page.evaluate(() => ({ hover: window.__swGame.renderer.infoAccHover,
    domHover: window.__swGame.renderer.infoAccs.dom?.hoverRow?.() }));
  ok('F1 DOM 悬停委托命中', f1.hover >= 0, JSON.stringify({ ...f1, box }));

  // F2 高亮框 InfoIcon_13 显示(悬停面渲染)
  const f2 = await page.evaluate(() => {
    const rows = document.querySelectorAll('.sw-infoaccs .sw-inf-row');
    const hl = rows[0]?.children?.[1];
    return { hlDisplay: hl?.style?.display ?? null };
  });
  ok('F2 悬停高亮框显示', f2.hlDisplay === 'block', JSON.stringify(f2));

  // F3 hideInfo 点击翻转(横排)
  await page.keyboard.press('Escape'); await sleep(700);
  const f3pre = await page.evaluate(() => {
    const g = window.__swGame;
    const row = g.renderer.infoAccs.state.rows?.[0];
    return { hideIndex: row?.hideIndex ?? -1, before: row ? g.player.hideInfo[row.hideIndex] : null };
  });
  const box2 = await page.evaluate(() => {
    const ic = document.querySelector('.sw-infoaccs .sw-inf-row img');
    const r = ic.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box2.x, box2.y); await sleep(300);
  const hoverNow = await page.evaluate(() => window.__swGame.renderer.infoAccHover);
  await page.mouse.click(box2.x, box2.y); await sleep(400);
  const f3post = await page.evaluate((hi) => window.__swGame.player.hideInfo[hi], f3pre.hideIndex);
  ok('F3 hideInfo 点击翻转', f3pre.hideIndex >= 0 && f3post !== f3pre.before,
    `hi=${f3pre.hideIndex} ${f3pre.before}→${f3post} hoverNow=${hoverNow}`);
  if (f3post !== f3pre.before) { await page.mouse.click(box2.x, box2.y); await sleep(250); }
  await page.keyboard.press('Escape'); await sleep(500);

  // F4 F4 相机:走真实 F4 键路径(initCameraModeWiring 挂 onActiveChange 后才 toggle)
  await page.keyboard.press('F4');
  await sleep(500);
  const f4 = await page.evaluate(() => {
    const active = window.__swGame.renderer.captureMode.active;
    const cls = document.querySelector('.sw-infoaccs')?.className ?? '';
    return { active, cls };
  });
  await page.keyboard.press('F4');
  await sleep(400);
  const f4b = await page.evaluate(() => {
    const active = window.__swGame.renderer.captureMode.active;
    const cls = document.querySelector('.sw-infoaccs')?.className ?? '';
    return { active, cls };
  });
  ok('F4 F4 激活 + sw-camera-hide 挂/摘',
    f4.active === true && f4.cls.includes('sw-camera-hide')
    && f4b.active === false && !f4b.cls.includes('sw-camera-hide'),
    `on=${JSON.stringify(f4)} off=${JSON.stringify(f4b)}`);

  // F5 对话面真实门值(诊断 player.talking 实况——预存共享面,非本刀面)
  const f5 = await page.evaluate(async () => {
    const g = window.__swGame;
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    if (!window.__rt4Npc2) {
      const npc = new TownNPC('guide', g.player.x + 40, g.world.groundLevel * 16 - 48);
      npc.home = null;
      g.entities.add(npc, 'npcs');
      window.__rt4Npc2 = npc;
    }
    const npc = window.__rt4Npc2;
    npc.dead = false; npc.x = g.player.x + 30; npc.y = g.player.y;
    g.openNpcDialog(npc);
    return { dialog: g.npcDialogActive, playerTalking: !!(g.player).talking };
  });
  await sleep(400);
  const f5b = await page.evaluate(() => {
    const el = document.querySelector('.sw-infoaccs');
    const canvasSame = true;   // 双支同表达式(源码级已核);此处取实况门值
    window.__swGame.closeNpcDialog(true);
    return { display: el?.style?.display, canvasSame };
  });
  ok('F5 对话中信息列实况(预存共享门 player.talking 恒 false→双支同显)',
    f5.dialog === true && f5.playerTalking === false && f5b.display === 'block',
    JSON.stringify({ ...f5, display: f5b.display }));

  ok('零页面错误', errs.length === 0, errs.slice(0, 2).join('|'));
  console.log(`\nTOTAL: ${pass} pass / ${fail} fail`);
  if (fails.length) console.log('FAILS:', fails.join(' | '));
} finally {
  await closeAllBrowsers();
}
