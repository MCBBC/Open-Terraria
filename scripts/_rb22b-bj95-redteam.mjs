// RB22b 红蓝对抗抽测（BJ95 三债）:
//   A. R3③ 带参入口页经 bootstrap 两跳 → perfFlags 仍生效(swperf=0 → __swPerfFlags.get()===false)
//      + keepQuery:false 逃生门回旧行为(洗参 → flags.get()===true) + 既有无参调用方零变化。
//   B. R1③ 标注门(Game.ts:8458 !inpOverDomUi):合法路径可达(画布点击落标) + 拖槽位拾取沿
//      悬停面板期不落标(门拦) + 移出 UI 后无残留标注(沿已耗) 。
//   C. R1③ 住房查询门(:12637):合法路径可达(画布点击 housingQuery 恰 1 次) + 拖槽位拾取沿
//      不误发面板坐标查询(门拦)。
// 运行: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=420000 scripts/_rb22b-bj95-redteam.mjs
import { launchBrowser, openPage, bootstrap, front, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await launchBrowser({});
const results = [];
const chk = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} :: ${detail}`); };

// ---------- A. carryQuery / bootstrap 透传 ----------
{
  const page = await openPage(browser);
  await front(page);
  await page.goto(`${ORIGIN}/?swperf=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // ★首页即重新导航会打断首个 boot 链(SW 域既有 flake,裸预导航同样复现,与 BJ95 无关):
  //   settle 3s 让预导航 boot 完成再 bootstrap(对齐 _bj78 探针「先 boot 再带参重导航」节奏)
  await sleep(3000);
  const r = await bootstrap(page, ORIGIN);
  const navInfo = page.__navs ? null : null;
  const at = await page.evaluate(() => ({
    search: location.search,
    flags: window.__swPerfFlags ? window.__swPerfFlags.get() : null,
    tCount: (location.search.match(/t=/g) ?? []).length,
    bridge: typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld,
  }));
  chk('A1 bootstrap ok', r.ok === true, JSON.stringify({ ok: r.ok, why: r.why ?? '' }));
  chk('A2 带参透传+flags 生效', at.flags === false && at.search.includes('swperf=0') && at.bridge,
    JSON.stringify(at));
  chk('A3 恒剥 t= 不叠双份', at.tCount === 1, `t= 出现 ${at.tCount} 次, search=${at.search}`);

  // keepQuery:false 逃生门:同页(现 URL 已带 swperf=0&t=)再 bootstrap → 洗参
  const r2 = await bootstrap(page, ORIGIN, { keepQuery: false });
  const at2 = await page.evaluate(() => ({
    search: location.search,
    flags: window.__swPerfFlags ? window.__swPerfFlags.get() : null,
  }));
  chk('A4 keepQuery:false 洗参回旧行为', r2.ok === true && !at2.search.includes('swperf') && at2.flags === true,
    JSON.stringify(at2));
  await page.close();
}

// ---------- B/C. 两门行为面(进入世界) ----------
{
  const errors = [];
  const page = await openPage(browser, { errors });
  await front(page);
  await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv') || document.querySelector('.sw-hotbar'), { timeout: 240000, polling: 1000 });
  await sleep(1500);

  // 进入世界准备:清欢迎/给槽 10 一件物品(拾取成沿才补武)
  const ready = await page.evaluate(async () => {
    document.getElementById('sw-welcome-announce')?.remove();
    const g = window.__swGame;
    const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
    const woodId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[9]];
    g.player.inv.slots[10] = { id: woodId, stack: 500, favorited: false, prefix: 0 };
    window.__swUI.openInventory(true);
    await (window.__swUI.refreshAllAsync ? window.__swUI.refreshAllAsync() : Promise.resolve(window.__swUI.refreshAll()));
    return { ok: true };
  });
  chk('B0 世界就绪+开包+槽10给物', ready.ok === true, JSON.stringify(ready));

  const slot10 = await page.evaluate(() => {
    const el = document.querySelector('.sw-vinv .sw-slot[data-idx="10"][data-where="inv"]')
      ?? document.querySelector('.sw-slot[data-idx="10"][data-where="inv"]');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });

  // ---- B. 标注门 ----
  // 合法路径:画布点击落标
  await page.evaluate(() => { const g = window.__swGame; g.annotateMode = true; g.marks = []; });
  await sleep(300);
  // 画布中心偏右(避开面板)找世界点:canvas 取 renderer 活画布(querySelector('canvas')
  // 可能命中零尺寸离屏画布 → 点(0,0)落热栏 bbox 内=over:true 伪影)
  const wp = await page.evaluate(() => {
    const g = window.__swGame;
    const cv = g.renderer?.canvas ?? document.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    return { x: r.left + r.width * 0.72, y: r.top + r.height * 0.72, w: r.width, h: r.height, left: r.left, top: r.top };
  });
  const overAtWp = await page.evaluate(({ x, y, left, top }) => {
    const g = window.__swGame;
    const sx = g.input.mouseX, sy = g.input.mouseY;
    g.input.mouseX = x - left; g.input.mouseY = y - top;   // inp.mouseX=画布内坐标
    const o = g.inpOverDomUi();
    g.input.mouseX = sx; g.input.mouseY = sy;
    return o;
  }, wp);
  chk('Bw 世界点不悬 DOM UI', wp.w > 0 && overAtWp === false, JSON.stringify({ ...wp, overAtWp }));
  // canvas 点击须跨 tick(down/sleep/up 同 tick 内 click 会丢沿——Input 边沿语义)
  await page.mouse.move(wp.x, wp.y); await sleep(120);
  await page.mouse.down(); await sleep(120); await page.mouse.up();
  await sleep(500);
  const legalMark = await page.evaluate(() => ({ n: window.__swGame.marks.length, over: window.__swGame.inpOverDomUi() }));
  chk('B1 合法路径可达(画布点击落标)', legalMark.n === 1, JSON.stringify(legalMark));

  // 门拦:悬停面板拖槽位拾取沿不落标
  await page.mouse.move(slot10.x, slot10.y); await sleep(80);
  await page.mouse.down(); await sleep(50);
  await page.mouse.move(slot10.x + 30, slot10.y + 12, { steps: 4 });   // >4px,仍在面板内
  await sleep(400);
  const gateMark = await page.evaluate(() => ({
    n: window.__swGame.marks.length,
    armed: window.__swGame.input.mouseDown,
    held: window.__swUI.heldStack?.stack ?? null,
    over: window.__swGame.inpOverDomUi(),
  }));
  chk('B2 拖拾取成沿(heldStack 置+mouseDown 武)', gateMark.armed === true && gateMark.held !== null, JSON.stringify(gateMark));
  chk('B3 标注门拦面板沿', gateMark.n === 1 && gateMark.over === true, JSON.stringify(gateMark));

  // 按住移出 UI 到世界:沿已耗,不得补落标
  await page.mouse.move(wp.x, wp.y, { steps: 10 });
  await sleep(400);
  const outMark = await page.evaluate(() => ({ n: window.__swGame.marks.length, over: window.__swGame.inpOverDomUi() }));
  chk('B4 移出 UI 无残留标注', outMark.n === 1, JSON.stringify(outMark));
  await page.mouse.up(); await sleep(200);
  await page.evaluate(() => { window.__swGame.annotateMode = false; });
  await sleep(200);

  // ---- C. 住房查询门 ----
  await page.evaluate(() => {
    const g = window.__swGame;
    g.housingMode = { kind: 'query' };
    window.__HQ_CALLS = 0;
    const orig = g.housingQuery.bind(g);
    g.housingQuery = (...a) => { window.__HQ_CALLS++; return orig(...a); };
  });
  await sleep(200);
  // 合法路径:画布点击 → 恰 1 次查询(跨 tick 手势)
  await page.mouse.move(wp.x, wp.y); await sleep(120);
  await page.mouse.down(); await sleep(120); await page.mouse.up();
  await sleep(500);
  const legalHQ = await page.evaluate(() => window.__HQ_CALLS);
  chk('C1 住房查询合法路径可达', legalHQ === 1, `housingQuery 调用 ${legalHQ} 次(期望 1)`);

  // 门拦:面板拖槽位拾取沿不误发
  await page.mouse.move(slot10.x, slot10.y); await sleep(80);
  await page.mouse.down(); await sleep(50);
  await page.mouse.move(slot10.x + 30, slot10.y + 12, { steps: 4 });
  await sleep(400);
  const gateHQ = await page.evaluate(() => ({ calls: window.__HQ_CALLS, over: window.__swGame.inpOverDomUi() }));
  chk('C2 住房门拦面板沿', gateHQ.calls === 1 && gateHQ.over === true, JSON.stringify(gateHQ));
  await page.mouse.move(wp.x, wp.y, { steps: 8 });
  await sleep(300);
  const outHQ = await page.evaluate(() => ({ calls: window.__HQ_CALLS, over: window.__swGame.inpOverDomUi() }));
  chk('C3 移出 UI 无残留查询(沿已耗)', outHQ.calls === 1, JSON.stringify(outHQ));
  await page.mouse.up(); await sleep(200);
  await page.evaluate(() => { const g = window.__swGame; g.housingMode = null; });

  chk('B/C 页面零 JS 错误', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
  await page.close();
}

await browser.close().catch(() => {});
const fails = results.filter((r) => !r.ok);
console.log(`\nRB22b 抽测: ${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);
