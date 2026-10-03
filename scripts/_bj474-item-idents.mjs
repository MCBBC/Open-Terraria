// BJ474：查 item 3119 / dye 1011 身份 + 玩家染料槽实况
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const SAVE_PATH = process.env.SAVE || '/Users/vinlic/Downloads/map-天真的钴最高点 (3).json';
const saveJson = readFileSync(SAVE_PATH, 'utf8');
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.evaluate(async (text) => {
  const m = await import('/src/save/KvStore.ts');
  await m.kvDelete('sandboxworld.worlds.index');
  for (let i = 1; i <= 8; i++) await m.kvDelete(`sandboxworld.world.${i}`);
  return m.kvSet('sandboxworld.quicksave', text);
}, saveJson);
await page.goto(ORIGIN + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!window.__swFlow).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => new Promise((resolve) => {
  const w = window;
  if (w.__swGame?.world?.store) return resolve({ skip: true });
  const to = setTimeout(() => resolve({ timeout: true }), 120000);
  Promise.resolve(w.__swFlow.quickLoad()).then(() => { clearTimeout(to); resolve({ ok: true }); },
    (e) => { clearTimeout(to); resolve({ err: String(e).slice(0, 300) }); });
}));
await new Promise((r) => setTimeout(r, 8000));
const st = await page.evaluate(async () => {
  const items = await import('/src/data/items.ts');
  const D = items.ITEM_DEFS;
  const name = (id) => D[id] ? `${D[id].name} (vid=${D[id].vid ?? '?'} wing=${D[id].wing ?? '?'})` : 'undef';
  const p = window.__swGame.player;
  const dyeSlots = p.inv.dye?.map((it, i) => it ? [i, it.id, name(it.id)] : null)?.filter(Boolean) ?? [];
  return {
    item3119: name(3119),
    dye1011: name(1011),
    dyeSlots,
    armorWithDye: p.inv.armor?.slice(0, 20).map((it, i) => it ? [i, it.id, name(it.id)] : null)?.filter(Boolean),
    wingDyeVid: p.wingDyeVid(),
  };
});
console.log(JSON.stringify(st, null, 1));
await browser.close();
