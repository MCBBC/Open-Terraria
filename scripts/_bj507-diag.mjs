import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 150 && !(await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)); i++) await wait(2000);
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
await page.evaluate(async () => {
  const g = window.__swGame;
  const { bestiaryGating } = await import('/src/data/Bestiary.ts');
  bestiaryGating.unlockAll = true;
  const ui = window.__swUI;
  const { BestiaryPanel } = await import('/src/ui/BestiaryPanel.ts');
  const { flattenDropsForNpc } = await import('/src/ui/BestiaryPanel.ts');
  const { VANILLA_NPCS } = await import('/src/data/vanillaNpcs.ts');
  window.__diag = { flattenDropsForNpc, VANILLA_NPCS };
  window.__bj507Panel = new BestiaryPanel(document.body, {
    getTracker: () => g.world.bestiary,
    atlas: g.renderer?.atlas ?? null,
    isCrimson: () => false, isExpert: () => false, isMaster: () => false,
    showItemTooltip: (itemId, anchor, notes) => ui.showFloatingItemTooltip(itemId, anchor, notes),
    hideItemTooltip: () => ui.hideFloatingItemTooltip(),
    onBack: () => {},
  });
  await new Promise((r) => setTimeout(r, 800));
});
await wait(1500);
// 点第一卡 → 读详情内部态
await page.evaluate(() => {
  const cell = document.querySelectorAll('.sw-bst-cell')[0];
  cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await wait(800);
const diag = await page.evaluate(() => {
  const p = window.__bj507Panel;
  const rows = p.working;
  const sel = p.selected;
  const drops = sel ? window.__diag.flattenDropsForNpc(sel.npcId, 0) : null;
  const v = sel ? window.__diag.VANILLA_NPCS[String(sel.npcId > 0 ? sel.npcId : (sel.npcId >= -10 ? 1 : 14))] : null;
  return {
    working0: rows.slice(0, 5).map((r) => ({ npcId: r.npcId, name: r.name, state: r.state })),
    sel: sel ? { npcId: sel.npcId, name: sel.name, state: sel.state } : null,
    animLiveSize: p.animLive ? p.animLive.size : 'no-field',
    animTofPortrait: 'n/a',
    canAnim: sel ? p.canAnimateNpc(sel.npcId) : null,
    frames: v?.frames,
    aiStyle: v?.aiStyle,
    dropCount: drops ? drops.length : 'n/a',
    dropRows: document.querySelectorAll('.sw-bst-drop').length,
    firstDrop: drops && drops[0] ? { item: drops[0].item, chance: drops[0].chance } : null,
  };
});
console.log(JSON.stringify(diag, null, 2));
// Portrait animLive 观测：animLive 里的画布是否在动
const live = await page.evaluate(() => {
  const p = window.__bj507Panel;
  const samples = [];
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const arr = [...(p.animLive ?? [])].map((c) => {
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let sum = 0;
        for (let k = 3; k < d.length; k += 4) sum += d[k];
        return { connected: c.isConnected, t: p.animT.get(c), alphaSum: sum };
      });
      samples.push({ at: Date.now() - t0, arr });
      if (Date.now() - t0 > 900) { clearInterval(iv); resolve(samples); }
    }, 300);
  });
});
console.log('animLive timeline:', JSON.stringify(live, null, 2));
browser.close();
process.exit(0);
