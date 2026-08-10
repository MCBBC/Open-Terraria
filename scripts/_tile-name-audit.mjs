import { readFileSync, readdirSync } from 'node:fs';
const l10n = {};
for (const f of readdirSync('public/l10n').filter(f => f.endsWith('.json') && f !== 'index.json')) l10n[f.replace('.json','')] = JSON.parse(readFileSync('public/l10n/' + f, 'utf8'));
const gen = readFileSync('src/i18n/idNames.generated.ts','utf8');
const grab = (name) => {
  const m = gen.match(new RegExp(`export const ${name}: Record<number, string> = \\{([\\s\\S]*?)\\n\\};`));
  const out = {};
  if (m) for (const [, id, v] of m[1].matchAll(/'(\d+)': '([^']+)'/g)) out[id] = v;
  return out;
};
const ITEM_NAME_BY_ID = grab('ITEM_NAME_BY_ID');
const TILE_PLACER = grab('TILE_NAME_ITEM_BY_SHEET');
const TILE_ZH = grab('TILE_NAME_ZH_BY_ID');
const TILE_EN = grab('TILE_NAME_EN_BY_ID');
const tilesTs = readFileSync('src/data/tiles.ts','utf8');
const re = /def\(\{/g; let m2;
const sheets = new Set();
while ((m2 = re.exec(tilesTs))) {
  let depth = 1, i = m2.index + 5;
  while (i < tilesTs.length && depth > 0) { if (tilesTs[i] === '{') depth++; else if (tilesTs[i] === '}') depth--; i++; }
  const body = tilesTs.slice(m2.index + 5, i - 1);
  const s = body.match(/sheet: (\d+)/)?.[1];
  if (s) sheets.add(Number(s));
}
console.log('唯一 sheet:', sheets.size);
let bad = 0;
for (const s of sheets) {
  const placer = TILE_PLACER[s];
  const okPlacer = placer !== undefined && ITEM_NAME_BY_ID[placer];
  const idmap = TILE_ZH[s] ?? TILE_EN[s];
  if (!okPlacer && !idmap) { console.log('断链 sheet', s); bad++; }
}
console.log(bad === 0 ? 'ALL TILES RESOLVABLE OK' : `断链 ${bad}`);
