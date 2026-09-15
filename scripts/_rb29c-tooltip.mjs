// RB29c 补充探针:③tooltip vanilla 槽显式锚 + Finding C 影响面(滞留货架仍可购买)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5232';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

// ---- ① tooltip 锚(vanilla 开包态,悬停背包格 0) ----
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  const r = await page.evaluate(async () => {
    document.getElementById('sw-welcome-announce')?.remove();
    const ui = window.__swUI, g = window.__swGame;
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('inventoryLayout', 'vanilla');
    ui.openInventory(true);
    // 背包格 0 放一件物(铜短剑)
    const { ITEM_BY_KEY } = await import('/src/data/items.ts');
    ui.game.player.inv.slots[10] = { id: ITEM_BY_KEY['copper_broadsword'] ?? ITEM_BY_KEY[Object.keys(ITEM_BY_KEY)[0]], stack: 1 };
    ui.refreshAll();
    await new Promise((r2) => setTimeout(r2, 250));
    // 悬停【可见且有物】的 vanilla 背包格(.sw-vinv 域;0-9=隐藏热键栏域)
    const cands = [...document.querySelectorAll('.sw-vinv .sw-slot')]
      .filter((e) => { const r2 = e.getBoundingClientRect(); return r2.width > 0 && r2.height > 0 && e.querySelector('img'); });
    const hovered = cands[0] ?? null;
    const hr = hovered?.getBoundingClientRect().toJSON() ?? null;
    hovered?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await new Promise((r2) => setTimeout(r2, 120));
    const tr = ui.tooltip.getBoundingClientRect().toJSON();
    const shown = ui.tooltip.style.display === 'block';
    return { shown, hovered: hr ? { x: +hr.x.toFixed(0), y: +hr.y.toFixed(0), w: +hr.width.toFixed(0) } : null,
      tip: { x: +tr.x.toFixed(0), y: +tr.y.toFixed(0) }, layout: ui._builtLayout };
  });
  console.log('[tooltip]', JSON.stringify(r));
  ok(r.shown, `tooltip 显示(shown=${r.shown})`);
  ok(r.hovered && r.hovered.x >= 16, `vanilla 开包态悬停格自身有效(rect.x=${r.hovered?.x};旧 bug=回退命中隐藏热键栏 rect=(0,0))`);
  ok(r.tip.x > 20, `tooltip 不再钉左上(tip.x=${r.tip.x})`);
  ok(r.hovered && Math.abs(r.tip.x - (r.hovered.x + r.hovered.w + 8)) < 6, `tooltip 锚=悬停格右+8(期望 ${r.hovered ? r.hovered.x + r.hovered.w + 8 : '?'}/实测 ${r.tip.x})`);
  ok(errs.length === 0, `tooltip 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ---- ② Finding C 影响面:滞留货架购买仍成交(npcShopBuy 无 npcShopOpen 门) ----
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + '/?play=small&invlayout=classic', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
  await page.evaluate(async () => {
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('inventoryLayout', 'classic');
    const g = window.__swGame;
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const m = new TownNPC('merchant', g.player.x + 40, g.world.groundLevel * 16 - 48);
    m.home = null; g.entities.add(m, 'npcs');
    const gd = new TownNPC('guide', g.player.x + 100, g.world.groundLevel * 16 - 48);
    gd.home = null; g.entities.add(gd, 'npcs');
    window.__rb29_merchant = m; window.__rb29_guide = gd;
  });
  await sleep(200);
  const r = await page.evaluate(async () => {
    const g = window.__swGame;
    const m = window.__rb29_merchant;
    // 玩家钉到商人旁(keepAlive 域内)
    m.x = g.player.x + 40; m.y = g.world.groundLevel * 16 - m.h; m.vx = 0; m.vy = 0;
    g.player.x = m.x - 30; g.player.y = m.y + m.h - g.player.h; g.player.vx = 0; g.player.vy = 0;
    g.openNpcDialog(m);
    await new Promise((r2) => setTimeout(r2, 200));
    const dlgWasOpen = !!document.querySelector('.sw-npc-dialog');
    document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="shop"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const samples = [];
    for (let i = 0; i < 5; i++) {
      await new Promise((r2) => setTimeout(r2, 100));
      // 每拍重新钉位(压 NPC 游走/物理漂移噪声)
      m.x = g.player.x + 40; m.y = g.world.groundLevel * 16 - m.h; m.vx = 0; m.vy = 0;
      g.player.vx = 0; g.player.vy = 0;
      samples.push({ t: i * 100 + 100, open: g.npcShopOpen, dlg: !!g.dialogNpc,
        dx: Math.round(m.x - g.player.x), dy: Math.round(m.y - g.player.y) });
    }
    g.gainCopper(1000000);   // 备货:1 金币
    const shopPhase = { shopOpen: g.npcShopOpen, float: !!window.__swUI.npcShop, coins: g.coinsOwned() };
    if (!shopPhase.shopOpen) console.log('[stale-shop-diag]', dlgWasOpen, JSON.stringify(samples));
    // 切对话 B(收包链)
    const gd = window.__rb29_guide;
    gd.x = g.player.x + 60; gd.y = g.world.groundLevel * 16 - gd.h; gd.vx = 0; gd.vy = 0; gd.talkCooldown = 9999;
    g.openNpcDialog(gd);
    await new Promise((r2) => setTimeout(r2, 300));
    const after = { shopOpen: g.npcShopOpen, float: !!window.__swUI.npcShop, coins0: g.coinsOwned() };
    // 滞留面板上的常规货购买(火把 vid 8;无光标持物=直接买)
    const buy = g.npcShopBuy(8, undefined, undefined);
    const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
    const torchIid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[8]] ?? -1;
    return { dlgWasOpen, shopPhase, after, buy, coinsAfterBuy: g.coinsOwned(),
      torchInInv: g.player.inv.slots.some((s) => s && s.id === torchIid) };
  });
  console.log('[stale-shop]', JSON.stringify(r));
  ok(r.dlgWasOpen && r.shopPhase.shopOpen && r.shopPhase.float, `开店态就绪(dlg=${r.dlgWasOpen} shopOpen=${r.shopPhase.shopOpen} float=${r.shopPhase.float})`);
  // ★SW-RB29c F1 修复后翻绿（旧基线断言=float=true 滞留+滞留面可购买,见本探针
  //  修复前版）：closeInventory 收包链补 npcShop DOM 收面（与 closeNpcDialog 对称），
  //  对话 B 后 Game 态与浮动面板【双收】,滞留购买面随之消失（原版 CloseAll 同相）
  ok(!r.after.shopOpen && !r.after.float, `对话B后 Game 态与浮动面板均已收(shopOpen=${r.after.shopOpen} float=${r.after.float})`);
  ok(r.buy === false && r.coinsAfterBuy === r.after.coins0, `货架收面后购买不再成交(buy=${r.buy} 铜币 ${r.after.coins0}→${r.coinsAfterBuy};原版此面已随 CloseAll 消失)`);
  ok(errs.length === 0, `stale-shop 无页面错误(${errs.join(' | ')})`);
  await page.screenshot({ path: '/tmp/rb29c-stale-buy.png' });
  await page.close();
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
