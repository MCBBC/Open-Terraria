// 橡实弹弓耗弹定谳:装弹弓+橡实→实射→数橡实;逐链诊断(ammoOf/useAmmo/pickAmmoSlot)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5206') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) {
  await new Promise(r => setTimeout(r, 5000));
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player))) break;
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const inv = g.player.inv;
  const items = await import('/src/data/items.ts');
  const vc = await import('/src/data/vanillaItemCombat.ts');
  const DEFS = items.ITEM_DEFS;
  const hits = { sling: -1, acorn: -1, slingKeys: [], acornKeys: [] };
  for (let i = 0; i < DEFS.length; i++) {
    const d = DEFS[i]; if (!d) continue;
    const k = String(d.key ?? '');
    if (k.includes('5629')) { hits.slingKeys.push(`${i}:${k}`); if (hits.sling < 0) hits.sling = i; }
    if (/acorn/i.test(k)) { hits.acornKeys.push(`${i}:${k}`); if (hits.acorn < 0) hits.acorn = i; }
  }
  const dAcorn = DEFS[hits.acorn], dSling = DEFS[hits.sling];
  const viId = (key) => { const m = /^vi_(\d+)/.exec(key ?? ''); return m ? parseInt(m[1]) : -1; };
  const ammoOf = (d) => d.ammoId ?? ((d.vid != null || viId(d.key) >= 0) ? (vc.itemCombat(d.vid ?? viId(d.key))?.ammo ?? 0) : 0);
  const diag = {
    acornDef: { key: dAcorn?.key, vid: dAcorn?.vid, ammoId: dAcorn?.ammoId },
    slingDef: { key: dSling?.key, vid: dSling?.vid, ammoId: dSling?.ammoId },
    ammoOfAcorn: dAcorn ? ammoOf(dAcorn) : null,
    ammoOfSling: dSling ? ammoOf(dSling) : null,
    useAmmo5629: vc.itemCombat(5629)?.useAmmo ?? null,
    shoot5629: vc.itemCombat(5629)?.shoot ?? null,
  };
  // 装备:热栏 0=弹弓,5=橡实 999
  const IBK = items.ITEM_BY_KEY;
  const give = (slot, defId, stack) => { inv.slots[slot] = { id: defId, stack }; };
  give(0, IBK['vi_5629_AcornSlingshot'] ?? hits.sling, 1);
  give(5, IBK['vi_27_Acorn'] ?? hits.acorn, 999);
  g.player.selectedSlot = 0;
  const acornBefore = inv.slots[5]?.stack ?? 0;
  // 游戏同式解析(对齐 Game.ts:13401-13411)
  const useAmmoGame = vc.itemCombat(5629)?.useAmmo ?? 40;
  diag.useAmmoGame = useAmmoGame;
  const slot27 = g.player.pickAmmoSlot((id) => ammoOf(DEFS[id]) === 27, 27, 5629);
  const slotGame = g.player.pickAmmoSlot((id) => ammoOf(DEFS[id]) === useAmmoGame, useAmmoGame, 5629);
  diag.pickWith27 = slot27;
  diag.pickWithGameUseAmmo = slotGame;
  // 实射:瞄准右侧空地,mouseDown 保持 240 tick(autoReuse 连发)
  g.player.x += 0; // 原地
  g.input.mouseX = 800; g.input.mouseY = 430; g.input.mouseDown = true; g.input.rightDown = false;
  for (let i = 0; i < 240; i++) g.fixedUpdate(1 / 60);
  g.input.mouseDown = false;
  const acornAfter = inv.slots[5]?.stack ?? 0;
  // 射出的 1088 弹计数(entities 桶 projId=1088)
  let n1088 = 0;
  for (const e of g.entities.all?.() ?? []) if (e.projId === 1088) n1088++;
  // 弹弓耐久/堆叠核对
  diag.slots = { slingStack: inv.slots[0]?.stack, acornBefore, acornAfter, consumed: acornBefore - acornAfter, n1088 };
  // 1088 弹是否真的飞出(entities 计数)
  return { hits, diag };
});
console.log('ACORN=' + JSON.stringify(out));
await browser.close();
