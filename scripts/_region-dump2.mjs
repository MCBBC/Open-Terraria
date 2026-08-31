// 区域矩阵(游戏内权威):__swLoadJson 载档后按 internal→stable 标签打印家具区几何。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const pg = await b.newPage();
await pg.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded' });
await pg.waitForSelector('.sw-title-menu', { timeout: 60000 });
await pg.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
const out = await pg.evaluate(async ({ saveTxt, cx, cy, r }) => {
  await window.__swLoadJson(saveTxt);
  await new Promise(r2 => setTimeout(r2, 1400));
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_STABLE_OF_INTERNAL: _T, TILE_DEFS } = await import('/src/data/tiles.ts');
  const keyOf = (t) => TILE_DEFS[t]?.key ?? ('#' + t);
  const shortOf = (k2) => {
    const map2 = { chest: 'CH', dresser: 'DR', wood_table: 'TB', 'v_14_tables': 'TB', 'v_88_dressers': 'DR',
      boreal_wood: 'BW', wooden_beam: 'BM', platforms: 'PL', bottles: 'BT', bookcase: 'BC', piano: 'PN',
      bench: 'BN', chandelier: 'CD', door: 'DO', workbench: 'WB', anvil: 'AN', basin: 'BS', candle: 'CA' };
    let out2 = k2;
    for (const [pat, sym] of Object.entries(map2)) { if (k2.includes(pat)) { out2 = sym; break; } }
    return out2.slice(0, 3).padEnd(3, '.');
  };
  const tag = (x, y) => {
    if (!st.inBounds(x, y)) return '###';
    const i = st.idx(x, y);
    if (!st.flags[i]) return '.. ';
    const k2 = keyOf(st.type[i]);
    const m2 = k2.match(/^v_(\d+)/);
    const base = m2 ? 'V' + String(Number(m2[1])).padStart(2, '0') : shortOf(k2);
    return base.padStart(3, '.') + ' ';
  };
  const lines = [];
  for (let y = cy - r - 1; y <= cy + r + 2; y++) {
    let row = `y=${String(y).padStart(4, ' ')} `;
    for (let x = cx - r - 1; x <= cx + r + 1; x++) row += tag(x, y);
    lines.push(row);
  }
  const detail = [];
  return { lines, detail, walls: [...wallsSet].sort((a, b) => a - b) };
}, { saveTxt: readFileSync(process.env.SW_MAP, 'utf8'), cx: Number(process.env.CX ?? 1631), cy: Number(process.env.CY ?? 330), r: Number(process.env.R ?? 6) });
console.log(out.lines.join('\n'));
console.log('DETAIL:', JSON.stringify(out.detail));
console.log('WALLS:', out.walls.join(','));
await b.close();
