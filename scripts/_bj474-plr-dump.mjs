// BJ474：解析用户 .plr，dump 装备/染料（判定翼支 186+绿染料 vs 靴支仙尘 61）
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const PLR_PATH = process.env.PLR || needInput(join(DOWNLOADS, 'Vinlic (1).plr'));
const raw = readFileSync(PLR_PATH);
const b64 = raw.toString('base64');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
const out = await page.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const m = await import('/src/save/PlrImport.ts');
  const r = m.parsePlr(bin);
  const items = await import('/src/data/items.ts');
  const D = items.ITEM_DEFS;
  const nm = (id) => (D[id] ? `${D[id].name ?? D[id].key ?? id}(wing=${D[id].wing ?? '-'})` : String(id));
  const ps = r.playerState ?? {};
  const pick = (arr) => (arr ?? []).map((s) => s ? { id: s.id, n: nm(s.id), st: s.stack } : null);
  return {
    name: r.appearance?.name,
    version: r.version,
    psKeys: Object.keys(ps),
    armor: pick(ps.armor),
    dye: pick(ps.dye),
    inventory: pick(ps.inventory),
  };
}, b64);
console.log(JSON.stringify(out, null, 1));
await browser.close();
