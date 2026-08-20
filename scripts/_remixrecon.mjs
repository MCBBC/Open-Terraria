// RECON-REMIX 探针（用完即删）：JS 侧 remix/skyblock 种子生成现状 + 对拍金标 .wld
// 用法：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_remixrecon.mjs
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const GOLD = process.env.REMIX_GOLD ?? '/tmp/sw-remix-recon/home/remix.wld';

// —— Node 侧：金标头种子布尔梯（WldParser 头序复刻，v>=222..302 九布尔）——
function readSeedBooleans(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 0;
  const u32 = () => { const v = dv.getUint32(p, true); p += 4; return v; };
  const version = u32();
  p += 7 + 1 + 4 + 8;                    // magic+fileType+revision+favorite
  const n = dv.getInt16(p, true); p += 2; // sectionCount
  const pointers = [];
  for (let i = 0; i < n; i++) { pointers.push(u32()); }
  const bitLen = dv.getInt16(p, true); p += 2;
  p += Math.ceil(bitLen / 8);
  p = pointers[0];
  // string: u7len + bytes
  const rdStr = () => { const l = dv.getUint8(p); p += 1; const s = Buffer.from(buf.buffer, buf.byteOffset + p, l).toString('utf8'); p += l; return s; };
  const title = rdStr();
  let seedText = '';
  if (version >= 179) { seedText = rdStr(); p += 8; }
  if (version >= 181) p += 16;
  u32(); p += 16;                        // worldId + bounds×4
  const tilesHigh = u32(), tilesWide = u32();
  const gameMode = u32();
  const bool = () => { const b = dv.getUint8(p); p += 1; return b !== 0; };
  const flags = {};
  if (version >= 222) flags.drunk = bool();
  if (version >= 227) flags.good = bool();
  if (version >= 238) flags.tenth = bool();
  if (version >= 239) flags.dontStarve = bool();
  if (version >= 241) flags.notTheBees = bool();
  if (version >= 249) flags.remix = bool();
  if (version >= 266) flags.noTraps = bool();
  if (version >= 267) flags.zenith = bool();
  if (version >= 302) flags.skyblock = bool();
  return { version, title, seedText, tilesWide, tilesHigh, gameMode, flags };
}

const goldBuf = readFileSync(GOLD);
const head = readSeedBooleans(goldBuf);
console.log('[gold-head]', JSON.stringify(head));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });

const goldB64 = goldBuf.toString('base64');
const out = await page.evaluate(async (goldB64) => {
  const bin = atob(goldB64);
  const goldBytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const res = {};
  const wg = await import('/src/world/gen/WorldGen.ts');
  const { parseSeed } = await import('/src/world/gen/SeedEasterEggs.ts');

  // 1) 触发解析
  res.parse = {
    remix: parseSeed("don't dig up").flags,
    remixPlain: parseSeed('dontdigup').flags,
    skyblock: parseSeed('skyblock').flags,
    gfb: parseSeed('getfixedboi').flags,
  };

  // 2) JS 生成现状：remix / skyblock / 普通 三份（4200×1200，evil 自然随机）
  const gen = async (seedText, tag) => {
    const t0 = Date.now();
    try {
      const w = await wg.generateWorld({ width: 4200, height: 1200, seedText });
      // 层带首图景：每 40 行活跃格计数 + 首行活跃样本，判 remix 是否倒置
      const st = w.store;
      const rows = [];
      for (let y = 0; y < st.h; y += 40) {
        let c = 0, liq = 0;
        for (let x = 0; x < st.w; x += 7) { const i = y * st.w + x; if (st.flags[i] & 1) c++; if (st.liquid[i]) liq++; }
        rows.push(y + ":" + c + "/" + liq);
      }
      let topSolidY = -1, botAirY = -1;
      for (let y = 0; y < st.h; y++) { let any = false; for (let x = 2080; x < 2120; x++) { if (st.flags[y * st.w + x] & 1) { any = true; break; } } if (any) { topSolidY = y; break; } }
      return { tag, ms: Date.now() - t0, spawn: [w.spawnX, w.spawnY], ground: w.groundLevel, rock: w.rockLevel, topSolidY, rows, err: null };
    } catch (e) {
      return { tag, ms: Date.now() - t0, err: String(e && e.stack || e).slice(0, 600) };
    }
  };
  res.js = [
    await gen('dont dig up', 'remix'),
    await gen('skyblock', 'skyblock'),
    await gen('plain-recon', 'plain'),
  ];

  // 3) 金标解析 + 四通道对拍（remix 金标 vs JS remix 世界）
  try {
    const { parseWld } = await import('/src/wld/WldParser.ts');
    const wld = parseWld(new Uint8Array(goldBytes));
    res.gold = {
      spawn: [wld.spawnX, wld.spawnY], ground: wld.groundLevel, rock: wld.rockLevel,
      moon: wld.moonType, dungeon: [wld.dungeonX, wld.dungeonY], w: wld.tilesWide, h: wld.tilesHigh,
    };
    const js = res.js.find((r) => r.tag === 'remix' && !r.err);
    if (js) {
      const w = 4200, h = 1200;
      const jw = await wg.generateWorld({ width: w, height: h, seedText: 'dont dig up' });
      const st = jw.store;
      const t = wld.tiles;
      let dAct = 0, dTyp = 0, dWal = 0, dLiq = 0;
      // 全量逐格（wld 列优先 x*h+y；JS 行优先 y*w+x）
      for (let x = 0; x < w; x++) {
        const colBase = x * h;
        for (let y = 0; y < h; y++) {
          const wi = colBase + y, ji = y * w + x;
          const wa = t.active[wi], ja = (st.flags[ji] & 1) ? 1 : 0;
          if (wa !== ja) dAct++;
          else if (wa) { if (t.type[wi] !== st.type[ji]) dTyp++; }
          if (t.wall[wi] !== st.wall[ji]) dWal++;
          if (t.liquid[wi] !== st.liquid[ji]) dLiq++;
        }
      }
      // 金标层带图景（同 JS 采样口径）
      const rows = [];
      for (let y = 0; y < h; y += 40) {
        let c = 0, liq = 0;
        for (let x = 0; x < w; x += 7) { const i = x * h + y; if (t.active[i]) c++; if (t.liquid[i]) liq++; }
        rows.push(y + ":" + c + "/" + liq);
      }
      res.diff4 = { dAct, dTyp, dWal, dLiq };
      res.goldRows = rows;
    }
  } catch (e) {
    res.goldErr = String(e && e.stack || e).slice(0, 400);
  }
  return res;
}, goldB64);

out.pageErrors = errs;
console.log(JSON.stringify(out, null, 1).slice(0, 14000));
await browser.close();
