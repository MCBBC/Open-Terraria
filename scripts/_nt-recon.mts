// RECON-NOTRAPS 探针(用毕即删;零 src/tests 改动)
//  1. 私有 vite 页内 generateWorld('notraps') + ('586841289') 对照
//  2. 页内:头锚+对象计数;typ/wal/act/liq/wir 五通道原始字节经本地 HTTP 上传 node
//  3. node:parseWld(vanilla) → 全量通道 diff+分块热区+对象计数 → /tmp/notraps86/
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';
import { parseWld } from '../src/wld/WldParser.ts';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/notraps86';
const UP_PORT = Number(process.env.NT_UP_PORT ?? 7963);

// ---------- 上传服务器 ----------
const bufs = new Map<string, Uint8Array>();
let totalLen = 0;
const srv = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const u = new URL(req.url ?? '/', 'http://x');
  const ch = u.searchParams.get('ch') ?? '';
  if (req.method === 'POST' && ch && ch !== 'done') {
    const off = Number(u.searchParams.get('off') ?? '0');
    const len = Number(u.searchParams.get('len') ?? '0');
    const parts: Buffer[] = [];
    req.on('data', (d: Buffer) => parts.push(d));
    req.on('end', () => {
      const joined = Buffer.concat(parts);
      if (!bufs.has(ch)) bufs.set(ch, new Uint8Array(0));
      const old = bufs.get(ch)!;
      if (old.length < off + len) {
        const grown = new Uint8Array(off + len);
        grown.set(old); bufs.set(ch, grown);
      }
      bufs.get(ch)!.set(new Uint8Array(joined.buffer, joined.byteOffset, joined.length), off);
      totalLen += joined.length;
      res.end('ok');
    });
  } else if (ch === 'done') {
    (globalThis as Record<string, unknown>).__upDone = true;
    res.end('ok');
  } else { res.end('ok'); }
});
await new Promise<void>((r) => srv.listen(UP_PORT, '127.0.0.1', r));

// ---------- 浏览器侧:生成+采集 ----------
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs: string[] = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'networkidle0' });

const FAMS: Record<string, number[]> = {
  plate135: [135], dart137: [137], explos141: [141], geyser443: [443], tnt654: [654],
  statue105: [105], chest21: [21], gold467: [467],
  boulder138: [138], boulder484: [484], boulder664: [664], boulder665: [665],
  b711: [711], b712: [712], b713: [713], b714: [714], b715: [715], b716: [716],
};

const jsOut = await page.evaluate(async ({ up, fams }: { up: string; fams: Record<string, number[]> }) => {
  const wg = await import('/src/world/gen/WorldGen.ts');
  const se = await import('/src/world/gen/SeedEasterEggs.ts');
  const results: Record<string, unknown> = {};
  for (const [tag, seedText] of [['nt', 'notraps'], ['plain', '586841289']] as const) {
    const parsed = se.parseSeed(seedText);
    const t0 = performance.now();
    const world = await wg.generateWorld({ width: 4200, height: 1200, seedText, name: 'nt' });
    const st = world.store; const n = st.w * st.h;
    // 通道上传(typ u16/wal u16/act u8/liq u8/wir u8)
    const act = new Uint8Array(n);
    for (let i = 0; i < n; i++) act[i] = st.flags[i] & 1;
    const CH = 2_000_000;
    for (const [name, arr] of [['typ', st.type], ['wal', st.wall], ['act', act], ['liq', st.liquid], ['wir', st.wire]] as const) {
      for (let off = 0; off < arr.length; off += CH) {
        const sub = arr.subarray(off, Math.min(off + CH, arr.length));
        await fetch(`${up}?ch=${tag}_${name}&off=${off}&len=${sub.length}`, { method: 'POST', body: sub });
      }
    }
    // 对象计数
    const want = new Map<number, string>();
    for (const [fam, ids] of Object.entries(fams)) for (const id of ids) want.set(id, fam);
    const famCount: Record<string, number> = {};
    for (const k of Object.keys(fams)) famCount[k] = 0;
    let wireRed = 0, actuator = 0, deadMan = 0;
    for (let i = 0; i < n; i++) {
      if (st.flags[i] & 1) {
        const t = st.type[i]; const fam = want.get(t);
        if (fam) famCount[fam]++;
        if (t === 21 && (st.frameX[i] === 36 || st.frameX[i] === 54)) deadMan++;
      }
      const w = st.wire[i];
      if (w & 1) wireRed++;
      if (w & 16) actuator++;
    }
    const chests = (world as unknown as { chests?: Array<{ x: number; y: number; items?: Array<{ id: number; stack: number } | null> }> }).chests ?? [];
    let gasTrapChests = 0;
    for (const c of chests) if ((c.items ?? []).some((it) => it && it.id === 5346)) gasTrapChests++;
    results[tag] = {
      seedText, flags: parsed.flags, specialName: parsed.specialName,
      genMs: Math.round(performance.now() - t0), w: st.w, h: st.h,
      anchors: {
        groundLevel: world.groundLevel, rockLevel: world.rockLevel, crimson: world.crimson,
        dungeonX: world.dungeonX, jungleX: world.jungleX, spawnX: world.spawnX, spawnY: world.spawnY,
      },
      famCount, wireRed, actuator, deadMan,
      chestTotal: chests.length, gasTrapChests,
    };
  }
  await fetch(`${up}?ch=done`, { method: 'POST' });
  return results;
}, { up: `http://127.0.0.1:${UP_PORT}`, fams: FAMS });
await browser.close();
srv.close();
fs.writeFileSync(`${OUT}/js-side.json`, JSON.stringify(jsOut, null, 1));

// ---------- node 侧:vanilla 对拍 ----------
function vanSide(path: string) {
  const buf = new Uint8Array(fs.readFileSync(path));
  const wld = parseWld(buf);
  const t = wld.tiles; const n = wld.tilesWide * wld.tilesHigh;
  const idx = (x: number, y: number) => y * wld.tilesWide + x;
  const want = new Map<number, string>();
  for (const [fam, ids] of Object.entries(FAMS)) for (const id of ids) want.set(id, fam);
  const famCount: Record<string, number> = {};
  for (const k of Object.keys(FAMS)) famCount[k] = 0;
  let wireRed = 0, actuator = 0, deadMan = 0;
  // vanilla actuator:parser wire u8? 保守仅 red-wire 位(见 WldTileData)
  for (let i = 0; i < n; i++) {
    if (t.active[i]) {
      const fam = want.get(t.type[i]);
      if (fam) famCount[fam]++;
      if (t.type[i] === 21 && (t.frameX[i] === 36 || t.frameX[i] === 54)) deadMan++;
    }
    if (t.wire[i]) wireRed++;
  }
  let gasTrapChests = 0;
  for (const c of wld.chests) if (c.items.some((it) => it && it.id === 5346)) gasTrapChests++;
  return {
    wld, famCount, wireRed, actuator, deadMan, gasTrapChests, idx,
    chestTotal: wld.chests.length,
  };
}

function chanDiff(tag: string, van: ReturnType<typeof vanSide>) {
  const wld = van.wld; const W = wld.tilesWide; const H = wld.tilesHigh;
  const chs: Array<[string, number]> = [['typ', 2], ['wal', 2], ['act', 1], ['liq', 1], ['wir', 1]];
  const out: Record<string, unknown> = {};
  for (const [name, bpe] of chs) {
    const jsB = bufs.get(`${tag}_${name}`);
    if (!jsB) { out[name] = { missing: true }; continue; }
    const jsArr = bpe === 2 ? new Uint16Array(jsB.buffer, jsB.byteOffset, jsB.byteLength / 2) : jsB;
    let diff = 0;
    const BX = 100, BY = 100;
    const blocks = new Map<string, number>();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let jv: number; let vv: number;
        if (name === 'typ') { jv = jsArr[i] ?? 65535; vv = wld.tiles.active[i] ? wld.tiles.type[i] : 0; }
        else if (name === 'wal') { jv = jsArr[i]; vv = wld.tiles.wall[i]; }
        else if (name === 'act') { jv = jsArr[i]; vv = wld.tiles.active[i] ? 1 : 0; }
        else if (name === 'liq') { jv = jsArr[i]; vv = wld.tiles.liquid[i]; }
        else { jv = (jsArr[i] & 1) !== 0 ? 1 : 0; vv = wld.tiles.wire[i] ? 1 : 0; }
        if (jv !== vv) {
          diff++;
          const bk = `${Math.floor(x / BX)},${Math.floor(y / BY)}`;
          blocks.set(bk, (blocks.get(bk) ?? 0) + 1);
        }
      }
    }
    const top = [...blocks.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 8)
      .map(([k, c]) => ({ block: k, cells: c }));
    out[name] = { diffCells: diff, diffPct: +(diff * 100 / (W * H)).toFixed(3), hotBlocks: top };
  }
  return out;
}

const report: Record<string, unknown> = { js: jsOut, errs };
for (const [tag, file] of [['nt', 'nt_notraps.wld'], ['plain', 'nt_plain.wld']] as const) {
  const p = `${OUT}/${file}`;
  if (!fs.existsSync(p)) { report[`van_${tag}`] = { missing: true }; continue; }
  const van = vanSide(p);
  report[`van_${tag}`] = {
    anchors: {
      groundLevel: van.wld.groundLevel, rockLevel: van.wld.rockLevel, crimson: van.wld.isCrimson,
      dungeonX: van.wld.dungeonX, spawnX: van.wld.spawnX, spawnY: van.wld.spawnY,
      worldId: van.wld.worldId, moonType: van.wld.moonType, moonPhase: van.wld.moonPhase,
      title: van.wld.title, seed: van.wld.seed, version: van.wld.version,
    },
    famCount: van.famCount, wireRed: van.wireRed, deadMan: van.deadMan,
    chestTotal: van.chestTotal, gasTrapChests: van.gasTrapChests,
    chanDiff_vs_js: chanDiff(tag, van),
  };
}
// vanilla nt vs plain 纯 noTraps 效应(typ 通道分族计数差)
if (fs.existsSync(`${OUT}/nt_notraps.wld`) && fs.existsSync(`${OUT}/nt_plain.wld`)) {
  const a = vanSide(`${OUT}/nt_notraps.wld`); const b = vanSide(`${OUT}/nt_plain.wld`);
  const eff: Record<string, number> = {};
  for (const k of Object.keys(FAMS)) eff[k] = (a.famCount[k] ?? 0) - (b.famCount[k] ?? 0);
  eff.wireRed = a.wireRed - b.wireRed;
  eff.deadMan = a.deadMan - b.deadMan;
  eff.chestTotal = a.chestTotal - b.chestTotal;
  report.van_noTraps_effect = eff;
}
fs.writeFileSync(`${OUT}/nt-recon-result.json`, JSON.stringify(report, null, 1));
console.log('== JS side ==');
console.log(JSON.stringify(jsOut, null, 1).slice(0, 4000));
console.log('== summary ==');
for (const tag of ['nt', 'plain']) {
  const r = report[`van_${tag}`] as Record<string, unknown> | undefined;
  if (!r || (r as { missing?: boolean }).missing) { console.log(`van_${tag}: MISSING`); continue; }
  console.log(`van_${tag}:`, JSON.stringify(r.anchors), JSON.stringify(r.famCount));
  console.log(`  wireRed=${r.wireRed} deadMan=${r.deadMan} chests=${r.chestTotal} gas5346=${r.gasTrapChests}`);
  console.log(`  chanDiff_vs_js:`, JSON.stringify(r.chanDiff_vs_js));
}
if (report.van_noTraps_effect) console.log('van_noTraps_effect:', JSON.stringify(report.van_noTraps_effect));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 5));
process.exit(0);
