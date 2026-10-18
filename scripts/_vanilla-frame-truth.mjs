// 全图统计:各 tile 类型的 wld 存帧率 → 帧全零类型 = 原版绘制期虚拟化(blend)类
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
const wldB64 = fs.readFileSync(needInput(join(DOWNLOADS, 'FTW V2.wld'))).toString('base64');
const out = await p.evaluate(async (b64) => {
  const { parseWld } = await import('/src/wld/WldParser.ts');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const w = parseWld(buf);
  const stat = {};
  const N = Math.min(w.tiles.active.length, w.tilesWide * w.tilesHigh);
  for (let i = 0; i < N; i++) {
    if (!w.tiles.active[i]) continue;
    const t = w.tiles.type[i];
    const s = stat[t] ?? (stat[t] = { n: 0, nz: 0 });
    s.n++;
    if (w.tiles.frameX[i] || w.tiles.frameY[i]) s.nz++;
  }
  // 只报高频类型(>=1000 次),帧零率 > 98% = 虚拟化
  return Object.entries(stat)
    .filter(([t, s]) => s.n >= 1000)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([t, s]) => ({ type: +t, count: s.n, frameZeroPct: Math.round(100 * (s.n - s.nz) / s.n) }));
}, wldB64);
console.log(JSON.stringify(out));
await b.close();
