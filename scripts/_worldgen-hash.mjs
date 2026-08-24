// 世界生成位级对拍探针(build:release G1 强化):?play=small 生成世界后
// 对 store 全通道做 FNV-1a 32 哈希。同 origin 两跑验确定性,跨 origin(dev=未混淆
 // vs preview=混淆)验混淆 worker 位级等价。
// 用法:SW_ORIGIN=http://localhost:4174 node tools/run-diag.mjs scripts/_worldgen-hash.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 200)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await p.waitForFunction(() => window.__swGame?.world?.store, { timeout: 300_000 });
// 等世界生成完全 settle(生成是异步 worker 流,store 出现≠完成)
await p.waitForFunction(() => window.__swGame?.world?.genDone === true || window.__swGame?.world?.ready === true, { timeout: 300_000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 3000));

const hash = await p.evaluate(() => {
  const st = window.__swGame.world.store;
  // FNV-1a 32bit over bytes
  const fnv = (u8) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  const chans = {
    type: fnv(new Uint8Array(st.type.buffer)), wall: fnv(new Uint8Array(st.wall.buffer)),
    liquid: fnv(st.liquid), liquidType: fnv(st.liquidType),
    half: fnv(st.half), slope: fnv(st.slope), frameX: fnv(new Uint8Array(st.frameX.buffer)),
    frameY: fnv(new Uint8Array(st.frameY.buffer)), paint: fnv(st.paint), coat: fnv(st.coat),
  };
  return { size: `${st.w}x${st.h}`, ...chans };
});
console.log(JSON.stringify({ origin: ORIGIN, ...hash }));
await b.close();
process.exit(0);
