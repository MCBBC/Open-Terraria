import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
await p.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.sw-title-menu', { timeout: 60000 });
await p.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
const out = await p.evaluate(async (saveTxt) => {
  await window.__swLoadJson(saveTxt);
  await new Promise(r => setTimeout(r, 900));
  const g = window.__swGame;
  const g2 = { ...g };
  void g2;
  const { ITEM_BY_KEY, ITEM_DEFS } = await import('/src/data/items.ts');
  const { itemCombat } = await import('/src/data/vanillaItemCombat.ts');
  const c98 = itemCombat(98), c97 = itemCombat(97);
  const res = {
    c98: c98 ? { autoReuse: c98.autoReuse, ranged: c98.ranged, useAmmo: c98.useAmmo, useTime: c98.useTime } : null,
    c97ammo: c97?.ammo ?? null,
    def98: (() => { const d = ITEM_DEFS[ITEM_BY_KEY['vi_98_迷你鲨']]; return d ? { key: d.key, ranged: d.ranged } : null; })(),
    exists: !!window.__swGame,
  };
  // 直接试枪：挂迷你鲨+填弹54，单帧调用 updateUse 级别点击
  const P = window.__swGame.player;
  P.inv.slots.fill(null);
  P.inv.slots[0] = { id: ITEM_BY_KEY['vi_98_迷你鲨'], stack: 1 };
  P.inv.slots[54] = { id: ITEM_BY_KEY['vi_97_火枪子弹'], stack: 50 };
  P.inv.selected = 0;
  // 手动走一次 pickAmmoSlot
  const tryPick = () => {
    const st = P.inv;
    const useAmmo = c98?.useAmmo ?? 97;
    const ammoOf = (d) => d.ammoId ?? ((d.vid != null || Number(String(d.key).match(/^vi_(\d+)/)?.[1]) >= 0) ? itemCombat(Number(String(d.key).match(/^vi_(\d+)/)?.[1]) ?? d.vid)?.ammo ?? 0 : 0);
    return st.pickAmmoSlot?.((d) => d && ammoOf(d) === useAmmo, useAmmo, 98);
  };
  let pickRaw = 'missing';
  try { pickRaw = String(typeof P.pickAmmoSlot === 'function' ? tryPick() : 'no-fn'); }
  catch (e) { pickRaw = 'THREW:' + (e instanceof Error ? e.message : String(e)); }
  const ballKeyDef = (() => { const i2 = ITEM_BY_KEY['vi_97_火枪子弹']; const d = i2 != null ? ITEM_DEFS[i2] : null; return d ? { idx: i2, key: d.key } : null; })();
  return { pickRaw, ballKeyDef,
    manualPickResult: pickRaw,
    slot54id: P.inv.slots[54]?.id };
}, readFileSync(process.env.BULB_MAP, 'utf8'));
console.log(JSON.stringify(out));
await b.close();
