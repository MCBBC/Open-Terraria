// SW-FX29 探针：Sort 钮 E2E 冒烟（统一框架 tools/probe.mjs run --vite=auto）。
// 判据：
//  ① 播种散乱背包 → 点击 Sort 钮 → 主体槽 10-49 按层序重排（金标序:剑→镐→橡子→琥珀→火把→土）;
//  ② 色带反馈 .sw-glow-overlay 落 DOM（SetGlow :1529 → UI.setSlotGlow CSS 近似）;
//  ③ HasLockedInventory 门（quickStackLockTicks>0）→ 点击 no-op;
//  ④ 排序后币槽 50-53 保持空（主排序 ignore 面）。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_swfx29';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: 'swfx29', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');

  const result = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.__swGame;
    const ui = window.__swUI;
    if (!g || !ui) return { fail: 'no bridge' };
    // vid → 内部 id（探针桥 itemByVid = VANILLA_ITEM_KEY_BY_ID → ITEM_BY_KEY）
    const vidMap = {}, idToVid = {};
    for (const v of [2, 4, 1, 8, 999, 27, 3, 905, 40]) {
      const id = window.__swFlow.itemByVid(v);
      if (id === undefined || id < 0) return { fail: `vid ${v} 未注册` };
      vidMap[String(v)] = id;
      idToVid[id] = v;
    }
    // Sort 钮 = 原版布局构建器(flag inventoryLayout='vanilla',缺省 classic)——
    // 走 canonical options.set 链（触发 onChange → UI.ts:660 rebuildInventoryPanel）
    // Sort 钮 = 原版布局构建器(flag inventoryLayout='vanilla',缺省 classic)。
    // 探针直呼 buildInventoryFor('vanilla')（UI.ts:6469 分派层;运行期 set 的
    // onChange 链在页外动态 import 的模块实例下不保证同源）+ 登记面板开关
    await ui.buildInventoryFor('vanilla');
    await wait(200);
    const dbg = {
      builtLayout: ui._builtLayout,
      invPanelClass: ui.invPanel?.className ?? null,
      connected: !!ui.invPanel?.isConnected,

      vinvCount: document.querySelectorAll('[class*="vinv"]').length,
      sortBtnCount: document.querySelectorAll('button').length,
    };
    const slots = g.player.inv.slots;
    const vids = () => slots.map((s) => (s ? (idToVid[s.id] ?? -1) : null));
    // 播种:乱序塞进主体 10-49
    for (const [slot, v, stack] of [[30, 2, 50], [12, 4, 1], [25, 1, 1], [17, 8, 5], [41, 999, 3], [22, 27, 9]]) {
      slots[slot] = { id: vidMap[String(v)], stack };
    }
    void idToVid;
    const before = vids();
    ui.openInventory(true);
    await wait(300);
    const allBtns = [...document.querySelectorAll('button')];
    const sortBtn = allBtns.find((b) => (b.style.backgroundImage || '').includes('UI_Sort_0'));
    if (!sortBtn) return { fail: 'sort button not found', dbg };
    // 处理器挂 mousedown（Main.cs:42602 mouseLeftRelease 语义）——el.click() 不触发
    sortBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    await wait(400);
    void dbg;
    const after = vids();
    const glows = document.querySelectorAll('.sw-glow-overlay').length;
    // ③ 门:no-op（搬运演示窗等价短锁）
    slots[13] = { id: vidMap['3'], stack: 5 };
    g.quickStackLockTicks = 999;
    window.__swFx29BeforeGate = vids().slice(10, 50);
    sortBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    await wait(200);
    const gated = vids();
    g.quickStackLockTicks = 0;
    // 门生效判据:gated[] 为 vid 域,stone(vid 3) 仍占 13 未被排走（世界自带的新手
    // 铜系工具也在 10-49 内,门生效时整包无任何变动）
    const gateOk = gated[13] === 3 && JSON.stringify(gated.slice(10, 50)) === JSON.stringify(window.__swFx29BeforeGate);
    const main = (arr) => arr.slice(10, 50).filter((v) => v !== null && v > 0);
    return { before, after, gated, gateOk, glows, mainBefore: main(before), mainAfter: main(after) };
  });
  if (result.fail) { console.log('[sw-fx29] result:', JSON.stringify(result).slice(0, 1200)); L.chk('页内执行', false, result.fail); }
  else {
    L.chk('页内执行', true);
    L.chk('① 层序金标（剑→镐→橡子→琥珀→火把→土）',
      JSON.stringify(result.mainAfter) === JSON.stringify([4, 1, 27, 999, 8, 2]),
      `mainAfter=${JSON.stringify(result.mainAfter)} mainBefore=${JSON.stringify(result.mainBefore)}`);
    L.chk('② 色带反馈 .sw-glow-overlay', result.glows > 0, `glows=${result.glows}`);
    L.chk('③ HasLockedInventory 门拦截', result.gateOk === true);
    L.chk('④ 币槽 50-53 排序后为空（主排序 ignore 面）',
      result.after.slice(50, 58).every((v) => v === null), `after50s=${JSON.stringify(result.after.slice(50, 58))}`);
  }
} catch (e) {
  L.chk('异常', false, String(e?.message ?? e).slice(0, 300));
} finally {
  try { await browser.close(); } catch { /* 已关 */ }
}
process.exit(L.exitCode());
