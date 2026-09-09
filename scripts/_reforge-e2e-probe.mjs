// 哥布林工匠重铸端到端探针(2026-09-09 用户要求检查)
//  运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs --timeout=560000 scripts/_reforge-e2e-probe.mjs
//  链:生成哥布林→对话→重铸钮→overlay→放件→重铸→词缀/钱币断言(vanilla 布局档)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-invgrid'), { timeout: 240000, polling: 1000 });
await new Promise((r) => setTimeout(r, 800));

{
  const v = await page.evaluate(async () => {
    const g = window.__swGame, ui = window.__swUI;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    document.getElementById('sw-welcome-announce')?.remove();
    const out = {};
    // ① 生成哥布林工匠(vanilla NPCID.GoblinTinkerer=388)并贴到玩家身边
    const spawnErr = g.debugSpawnNpc(107, 1, false);
    await sleep(200);
    const npc = g.entities.npcs.find((n) => n.npcKey === 'goblin_tinkerer');
    out.goblinSpawned = !!npc; out.spawnErr = spawnErr;
    if (!npc) return out;
    const p = g.player;
    npc.x = p.x; npc.y = p.y;   // 贴身
    // ② 打开对话(私有方法运行期直调)
    g.openNpcDialog(npc);
    await sleep(200);
    const dlg = document.querySelector('.sw-npc-dialog, [class*="npc-dialog"]') || (() => {
      return [...document.querySelectorAll('body > div, .sw-root > div')].find((d) => (d.textContent || '').includes('哥布林') || (d.textContent || '').includes('工匠'));
    })();
    out.dialogOpen = !!dlg;
    // ③ 找「重铸」按钮(Lang.inter(19))并点击
    const reforgeBtn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '重铸');
    out.reforgeBtnInDialog = !!reforgeBtn;
    if (!reforgeBtn) return out;
    reforgeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // NpcDialog 钮绑 click
    await sleep(200);
    out.diag = {
      dlgStillOpen: !!document.querySelector('.sw-npc-dialog'),
      dialogNpc: g.dialogNpc ? g.dialogNpc.npcKey : null,
      showReforgeType: typeof ui.showReforge,
      overlayCount: [...document.body.children].filter((d) => d.style.zIndex === '1150').length,
    };
    if (!out.reforgeOverlay) {
      // 隔离:直调 Game 侧路由(排除 DOM click 链)
      g.npcDialogButton('reforge');
      await sleep(200);
      out.diag.directCall = [...document.body.children].some((d) => d.style.zIndex === '1150');
      out.diag.directReforgeEl = !!ui.reforgeEl;
      if (!out.diag.directCall) return out;
    }
    // ④ overlay 打开(z-1150 全屏遮罩)
    const overlay = [...document.body.children].find((d) => d.tagName === 'DIV' && (d.style.zIndex === '1150'));
    out.reforgeOverlay = !!overlay;
    out.reforgeTitle = overlay ? (overlay.textContent || '').includes('重铸') : false;
    // ⑤ 放入可重铸武器(扫描首件 canReforge 物品)
    const { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
    let wid = -1;
    for (let vid = 1; vid < 700; vid++) {
      const k = VANILLA_ITEM_KEY_BY_ID[vid];
      const iid = k !== undefined ? ITEM_BY_KEY[k] : undefined;
      if (iid !== undefined && g.canReforge({ id: iid })) { wid = iid; break; }
    }
    out.weaponId = wid;
    // 钱给足(铂金×10=10_000_000 铜?100 铂=1_000_000…给 50 铂金)
    const platK = VANILLA_ITEM_KEY_BY_ID[74];
    if (platK !== undefined) { const pid = ITEM_BY_KEY[platK]; if (pid !== undefined) g.player.inv.add(pid, 50); }
    ui.heldStack = { id: wid, stack: 1 };
    const slot = ui.reforgeSlotEl;
    out.slotExists = !!slot;
    if (!slot) return out;
    slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(100);
    out.itemPlaced = !!ui.reforgeItem;
    out.prefixBefore = ui.reforgeItem?.prefix ?? null;
    // ⑥ 点「重铸」执行钮(overlay 面板内第一个 .sw-btn)
    const panel = overlay.querySelector('.sw-panel');
    const doBtn = panel.querySelector('.sw-btn');
    const coinsBefore = g.coinsOwned();
    doBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(150);
    out.prefixAfter = ui.reforgeItem?.prefix ?? null;
    out.coinsSpent = coinsBefore - g.coinsOwned();
    out.costShown = (panel.textContent || '').includes('铜币') || (panel.textContent || '').includes('铜');
    // ⑦ 再铸一次(shift 不必)+ 取回 + 关闭
    doBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(100);
    out.prefixAfter2 = ui.reforgeItem?.prefix ?? null;
    const slotAgain = ui.reforgeSlotEl;
    slotAgain.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));   // 取回
    await sleep(80);
    out.itemTakenBack = ui.heldStack !== null && ui.reforgeItem === null;
    const closeBtn = [...panel.querySelectorAll('.sw-btn')].find((b) => (b.textContent || '').includes('关闭'));
    closeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(80);
    out.overlayClosed = ![...document.body.children].some((d) => d.style.zIndex === '1150');
    return out;
  }).catch((e) => ({ evalFail: String(e).slice(0, 300) }));

  if (v.evalFail) {
    ok(false, `evaluate 失败: ${v.evalFail}`);
  } else {
    ok(v.goblinSpawned, `① 哥布林工匠生成 got ${v.goblinSpawned} err=${v.spawnErr}`);
    ok(v.dialogOpen, `② 对话打开 got ${v.dialogOpen}`);
    ok(v.reforgeBtnInDialog, `③ 对话含「重铸」按钮 got ${v.reforgeBtnInDialog}`);
    ok(v.reforgeOverlay && v.reforgeTitle, `④ 点钮 → 重铸 overlay 打开 got ${v.reforgeOverlay}/${v.reforgeTitle}`);
    ok(v.weaponId > 0, `⑤ 找到可重铸武器 iid=${v.weaponId}`);
    ok(v.slotExists && v.itemPlaced, `⑤ 持物点槽 → 放入 got slot=${v.slotExists} placed=${v.itemPlaced}`);
    ok(v.coinsSpent > 0 && v.prefixAfter !== null && v.prefixAfter !== v.prefixBefore,
      `⑥ 点重铸 → 扣费+词缀变化 前=${v.prefixBefore} 后=${v.prefixAfter} 花=${v.coinsSpent}铜`);
    ok(v.prefixAfter2 !== null, `⑥b 再铸一次 got ${v.prefixAfter2}`);
    ok(v.itemTakenBack, `⑦ 点槽取回 got ${v.itemTakenBack}`);
    ok(v.overlayClosed, `⑦ 关闭钮 → overlay 收 got ${v.overlayClosed}`);
  }
  ok(errs.length === 0, `无页面错误 ${errs.length ? JSON.stringify(errs.slice(0, 2)) : ''}`);
}
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
