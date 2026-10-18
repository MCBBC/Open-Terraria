// wld 帧虚拟化普查仪（参数化）:解析指定 .wld,输出每类型 存帧率/帧样本。
// 用法: WLD=path OUT=/path/out.json SW_ORIGIN=... node tools/run-diag.mjs scripts/_wld-frame-survey.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const WLD = process.env.WLD ?? needInput(join(DOWNLOADS, 'FTW V2.wld'));
const OUT = process.env.OUT ?? '/tmp/wld-frame-survey.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wldB64 = fs.readFileSync(WLD).toString('base64');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 800, height: 600 } });
const p = await b.newPage();
await p.goto(ORIGIN + '/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
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
    const s = stat[t] ?? (stat[t] = { n: 0, nz: 0, samples: [] });
    s.n++;
    if (w.tiles.frameX[i] || w.tiles.frameY[i]) {
      s.nz++;
      if (s.samples.length < 5) s.samples.push([w.tiles.frameX[i], w.tiles.frameY[i]]);
    }
  }
  return { world: w.title, w: w.tilesWide, h: w.tilesHigh, types: stat };
}, wldB64);
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('survey →', OUT, 'types:', Object.keys(out.types).length, 'world:', out.world, `${out.w}x${out.h}`);
await b.close();
