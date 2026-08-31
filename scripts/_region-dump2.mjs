// 区域矩阵(游戏内权威):__swLoadJson 载档后按 tile key 打印家具区几何。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const pg = await b.newPage();
await pg.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded' });
await pg.waitForSelector('.sw-title-menu', { timeout: 90000 });
await pg.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
const out = await pg.evaluate(async ({ saveTxt, cx, cy, r }) => {
  await window.__swLoadJson(saveTxt);
  await new Promise(r2 => setTimeout(r2, 1500));
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const keyOf = (t) => String(TILE_DEFS[t]?.key ?? ('#' + t));
  const sym = (k) => {
    if (/dresser/.test(k)) return 'DRE';
    if (/(^v_?21_|chest)/i.test(k)) return 'CHS';
    if (/table/.test(k)) return 'TBL';
    if (/boreal/.test(k)) return 'BOR';
    if (/beam/.test(k)) return 'BEM';
    if (/platform/.test(k)) return 'PLT';
    if (/bottle|potion/.test(k)) return 'BOT';
    if (/bookcase/.test(k)) return 'BKC';
    if (/piano/.test(k)) return 'PNO';
    if (/bench/.test(k)) return 'BNH';
    if (/chandelier/.test(k)) return 'CHN';
    if (/workbench/.test(k)) return 'WKB';
    if (/door/.test(k)) return 'DOR';
    const m = k.match(/(\d{1,4})/) ?? null;
    return 'Q' + (m ? m[1] : '?');
  };
  const lines = [];
  for (let y = cy - r - 1; y <= cy + r + 2; y++) {
    let row = `y=${String(y).padStart(4)} `;
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      if (!st.inBounds(x, y)) { row += '### '; continue; }
      const i = st.idx(x, y);
      row += st.flags[i] ? sym(keyOf(st.type[i])).padEnd(3, '.') + ' ' : '..  ';
    }
    lines.push(row);
  }
  const detail = [];
  for (let y = cy - r - 1; y <= cy + r + 2; y++) {
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const k = keyOf(st.type[i]);
      if (/dresser|(^|_)chest|\btables?\b|boreal_wood\b/.test(k)) detail.push(`${x},${y} ${k} fx=${st.frameX[i]} fy=${st.frameY[i]}`);
    }
  }
  const wallsSet = new Set();
  for (let y = cy - r - 1; y <= cy + r + 2; y++) {
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      if (!st.inBounds(x, y)) continue;
      const wv = st.wall[st.idx(x, y)];
      if (wv) wallsSet.add(wv);
    }
  }
  return { lines, detail, walls: [...wallsSet].sort((x, y2) => x - y2) };
}, { saveTxt: readFileSync(process.env.SW_MAP, 'utf8'), cx: Number(process.env.CX ?? 1631), cy: Number(process.env.CY ?? 330), r: Number(process.env.R ?? 6) });
console.log(out.lines.join('\n'));
console.log('DETAIL:\n' + out.detail.join('\n'));
console.log('WALLS:', out.walls.join(','));
await b.close();
