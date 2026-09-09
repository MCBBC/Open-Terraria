// 哥布林工匠重铸端到端探针(刀 12 原位化版;2026-09-09)
//  运行:SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs --timeout=560000 scripts/_reforge-e2e-probe.mjs
//  vanilla 档:原位重铸(槽 (50,270)/锤 (120,310)/储蓄 (180,258),Main.cs:42268-42393 逐式);
//  classic 档:modal 冒烟(保留形态,零改动红线回归)
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

const boot = async (pg, url) => {
  await pg.goto(ORIGIN + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv, .sw-invgrid'), { timeout: 240000, polling: 1000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
};

// ============ vanilla 档:原位重铸 ============
{
  await boot(page, '/?play=small&invlayout=vanilla');
  const v = await page.evaluate(async () => {
    const g = window.__swGame, ui = window.__swUI;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    g.debugSpawnNpc(107, 1, false);
    await sleep(200);
    const npc = g.entities.npcs.find((n) => n.npcKey === 'goblin_tinkerer');
    if (!npc) return { noNpc: true };
    npc.x = g.player.x; npc.y = g.player.y;
    g.openNpcDialog(npc);
    await sleep(150);
    const reforgeBtn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '重铸');
    if (!reforgeBtn) { out.noBtn = true; return out; }
    reforgeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // NpcDialog 钮绑 click
    await sleep(200);
    out.reforgeOpen = ui.vinvReforgeOpen === true;
    out.noModal = ![...document.body.children].some((d) => d.style.zIndex === '1150');
    const { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
    let wid = -1;
    for (let vid = 1; vid < 700; vid++) {
      const k = VANILLA_ITEM_KEY_BY_ID[vid];
      const iid = k !== undefined ? ITEM_BY_KEY[k] : undefined;
      if (iid !== undefined && g.canReforge({ id: iid })) { wid = iid; break; }
    }
    out.weaponId = wid;
    const platK = VANILLA_ITEM_KEY_BY_ID[74];
    if (platK !== undefined) { const pid = ITEM_BY_KEY[platK]; if (pid !== undefined) g.player.inv.add(pid, 50); }
    const copK = VANILLA_ITEM_KEY_BY_ID[71];   // 铜币入 bank[0](DrawSavings 数库内钱币)
    out.dbgCop = { k: copK ?? null };
    if (copK !== undefined) {
      const copId = ITEM_BY_KEY[copK];
      out.dbgCop.iid = copId ?? null;
      if (copId !== undefined) g.player.banks[0][0] = { id: copId, stack: 500 };
    }
    const slot = ui.vinvReforgeSlotEl;
    out.slotPos = slot ? { x: slot.offsetLeft, y: slot.offsetTop } : null;
    const hammer = ui.vinvReforgeHammerEl;
    ui.heldStack = { id: wid, stack: 1 };
    slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(100);
    out.itemPlaced = !!ui.reforgeItem;
    out.prefixBefore = ui.reforgeItem?.prefix ?? null;
    await sleep(80);   // 有件态变化 → 强制重排拍(锤/储蓄显隐)
    out.hammerPos = hammer ? { x: hammer.offsetLeft, y: hammer.offsetTop } : null;
    const coinsBefore = g.coinsOwned();
    hammer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(150);
    out.prefixAfter = ui.reforgeItem?.prefix ?? null;
    out.coinsSpent = coinsBefore - g.coinsOwned();
    out.savingsShown = ui.vinvSavingsEl ? ui.vinvSavingsEl.children.length > 0 : false;
    out.dbgSave = {
      banksType: typeof g.player.banks,
      bank0Coin: g.player.banks?.[0]?.[0] ? `${g.player.banks[0][0].id}x${g.player.banks[0][0].stack}` : null,
      savingsHtml: ui.vinvSavingsEl ? ui.vinvSavingsEl.innerHTML.slice(0, 80) : null,
    };
    // 原位开箱 → 重铸自动退出(:42277 chest≠-1 → InReforgeMenu=false)
    ui.vinvReforgeOpen = true;
    // 直接设 ui.openChest(测显示门;游戏开箱链的 tickChestAutoClose 会关掉不在
    // 世界箱列表里的假箱——首跑实测)
    ui.openChest = { x: Math.floor(g.player.x / 16) + 2, y: Math.floor(g.player.y / 16), items: new Array(40).fill(null) };
    await sleep(100);
    out.reforgeExitOnChest = ui.vinvReforgeOpen === false;
    out.chestStrip = [...document.querySelectorAll('.sw-slot')].filter((s) => s.offsetLeft >= 73 && s.offsetLeft <= 120 && s.offsetTop >= 258 && s.offsetTop <= 400 && s.offsetParent !== null).map((s) => ({ x: s.offsetLeft, y: s.offsetTop, d: s.style.display }));
    out.chestStripShown = out.chestStrip.length >= 10;
    out.dbgChest = {
      openChest: !!ui.openChest,
      chestSlotCount: document.querySelectorAll('.sw-slot[data-where="chest"]').length,
      firstChest: (() => { const s = document.querySelector('.sw-slot[data-where="chest"]'); return s ? { x: s.offsetLeft, y: s.offsetTop, d: s.style.display, op: !!s.offsetParent } : null; })(),
    };
    g.closeInventory();
    await ui.refreshAllAsync();
    out.chestStripHiddenAfterClose = ![...document.querySelectorAll('.sw-slot')].some((s) => s.offsetLeft === 73 && s.offsetTop === 258 && s.style.display !== 'none' && s.offsetParent !== null);
    return out;
  }).catch((e) => ({ evalFail: String(e).slice(0, 300) }));

  if (v.evalFail) {
    ok(false, `evaluate 失败: ${v.evalFail}`);
  } else if (v.noNpc || v.noBtn) {
    ok(false, `前置失败 ${JSON.stringify(v)}`);
  } else {
    ok(v.reforgeOpen && v.noModal, `vanilla:原位开启且无 modal got ${v.reforgeOpen}/${v.noModal}`);
    ok(v.slotPos && v.slotPos.x === 50 && v.slotPos.y === 270, `vanilla:重铸槽 (50,270) got ${JSON.stringify(v.slotPos)}`);
    ok(v.hammerPos && v.hammerPos.x === 120 && v.hammerPos.y === 310, `vanilla:锤钮 (120,310) got ${JSON.stringify(v.hammerPos)}`);
    ok(v.itemPlaced && v.prefixBefore !== undefined, `vanilla:放入(整件克隆) got ${v.itemPlaced}`);
    ok(v.prefixAfter !== undefined && v.prefixAfter !== v.prefixBefore && v.coinsSpent > 0,
      `vanilla:点锤=扣费+词缀 前=${v.prefixBefore} 后=${v.prefixAfter} 花=${v.coinsSpent}铜`);
    console.log('[dbg-save]', JSON.stringify({ ...v.dbgSave, cop: v.dbgCop }));
    console.log('[dbg-chest]', JSON.stringify(v.dbgChest));
    ok(v.savingsShown, `vanilla:储蓄显示 got ${v.savingsShown}`);
    ok(v.reforgeExitOnChest, `vanilla:开箱自动退出重铸(:42277) got ${v.reforgeExitOnChest}`);
    ok(v.chestStripShown, `vanilla:宝箱条叠背包下方 got ${JSON.stringify((v.chestStrip || []).slice(0, 3))}`);
    ok(v.chestStripHiddenAfterClose, `vanilla:关包宝箱条隐藏 got ${v.chestStripHiddenAfterClose}`);
  }
  ok(errs.length === 0, `vanilla:无页面错误 ${errs.length ? JSON.stringify(errs.slice(0, 2)) : ''}`);
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
