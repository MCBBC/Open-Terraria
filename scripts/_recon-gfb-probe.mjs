// RECON-GFB 探针：JS getfixedboi 生成 + x86 金标 .wld 解析 双轨统计（只读侦察，用后即删）
// 跑法：SW_ORIGIN=http://localhost:5206 node tools/run-diag.mjs scripts/_recon-gfb-probe.mjs
//   环境变量 GFB_WLD=/path/to/gold.wld（缺省 /tmp/sw-recon-gfb/gfb-small-getfixedboi.wld）
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const WLD = process.env.GFB_WLD ?? '/tmp/sw-recon-gfb/gfb-small-getfixedboi.wld';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199'), { waitUntil: 'networkidle0' });

const wldB64 = readFileSync(WLD).toString('base64');
const out = await page.evaluate(async (b64) => {
  const fnv = (arr) => {
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < arr.length; i++) {
      h ^= arr[i] & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
      h ^= (arr[i] >>> 8) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  // 金标侧
  const { parseWld } = await import('/src/wld/WldParser.ts');
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const w = parseWld(bin);
  const t = w.tiles;
  const hist = (arr, active) => {
    const m = new Map();
    for (let i = 0; i < arr.length; i++) {
      if (active && !active[i]) continue;
      m.set(arr[i], (m.get(arr[i]) ?? 0) + 1);
    }
    return m;
  };
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const gold = {
    version: w.version, title: w.title, seed: w.seed,
    dims: [w.tilesWide, w.tilesHigh], isCrimson: w.isCrimson, gameMode: w.gameMode,
    worldId: w.worldId, moonType: w.moonType, moonPhase: w.moonPhase,
    spawn: [w.spawnX, w.spawnY], dungeon: [w.dungeonX, w.dungeonY],
    ground: w.groundLevel, rock: w.rockLevel,
    treeX: w.treeX, treeStyle: w.treeStyle, treeTops: w.treeTops,
    chests: w.chests.length, npcs: w.npcs.map(n => n.name),
    channels: {
      type: fnv(t.type), wall: fnv(t.wall), liquid: fnv(t.liquid), liquidType: fnv(t.liquidType),
    },
    typeTop: top(hist(t.type, t.active), 25),
    wallTop: top(hist(t.wall, null), 12),
    activeCount: (() => { let n = 0; for (let i = 0; i < t.active.length; i++) if (t.active[i]) n++; return n; })(),
    liquidCounts: (() => {
      const m = new Map();
      for (let i = 0; i < t.liquid.length; i++) {
        if (t.liquid[i] > 0) {
          const k = t.liquidType[i];
          m.set(k, (m.get(k) ?? 0) + 1);
        }
      }
      return [...m.entries()];
    })(),
    paintCount: (() => { let n = 0; for (let i = 0; i < t.paint.length; i++) if (t.paint[i]) n++; return n; })(),
    wireCount: (() => { let n = 0; for (let i = 0; i < t.wire.length; i++) if (t.wire[i]) n++; return n; })(),
  };
  // JS 生成侧（同 seed；evil 用金标值）
  const gen = await import('/src/world/gen/WorldGen.ts');
  const world = await gen.generateWorld({
    width: 4200, height: 1200, seedText: 'getfixedboi', name: 'gfb',
    evil: w.isCrimson ? 1 : 0,
  });
  const st = world.store;
  const js = {
    dims: [st.w, st.h], crimson: world.crimson,
    spawn: [world.spawnX, world.spawnY], dungeon: [world.dungeonX, world.dungeonY],
    ground: world.groundLevel, rock: world.rockLevel,
    treeX: world.treeX ?? null,
    channels: {
      type: fnv(st.type), wall: fnv(st.wall), liquid: fnv(st.liquid),
    },
    typeTop: top(hist(st.type, st.flags), 25),
    wallTop: top(hist(st.wall, null), 12),
    activeCount: (() => { let n = 0; for (let i = 0; i < st.flags.length; i++) if (st.flags[i]) n++; return n; })(),
    liquidCounts: (() => {
      const m = new Map();
      for (let i = 0; i < st.liquid.length; i++) {
        if (st.liquid[i] > 0) {
          const k = st.liquidType ? st.liquidType[i] : 0;
          m.set(k, (m.get(k) ?? 0) + 1);
        }
      }
      return [...m.entries()];
    })(),
    seedFlags: world.seedFlags,
  };
  return { gold, js, errs: [] };
}, wldB64).catch(e => ({ fatal: String(e), errs: [...errs] }));

console.log(JSON.stringify({ ...out, probeErrors: errs }, null, 1));
await browser.close();
