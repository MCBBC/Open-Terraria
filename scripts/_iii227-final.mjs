// ★IIIII227 探针③：全旗最终记录批——公告栏屏蔽（localStorage ack）+ 场景截图 +
//   rainbowroad 箱物六选一池 raw-id 复核（首版 vidOfIid 对无 vid 字段 def 误报 0）。
// 产物 /tmp/iii227-out/final-report.json + shot-<seed>[-tag].png
// 运行：SW_ORIGIN=http://localhost:5283 node tools/run-diag.mjs --timeout=1800000 scripts/_iii227-final.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5283';
const OUT = '/tmp/iii227-out';
mkdirSync(OUT, { recursive: true });

const SEEDS = ['monochrome', 'negativeinfinity', 'invisibleplane', 'xrayvision', 'rainbowroad', 'truckstop', 'wedonteventestforthat'];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 1800000,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
await page.bringToFront();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));
const report = { seeds: [], pageErrors: errs };

for (const seed of SEEDS) {
  console.log('==', seed);
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
  await page.evaluate(() => {
    try {
      localStorage.setItem('sw-gate', '1');
      localStorage.setItem('sw.welcome.announce.acked', '1');
    } catch { /* noop */ }
  });
  await page.evaluate((s) => {
    void window.__swFlow.createWorldProbe({ seed: s, size: 0, name: 'iii227f', difficulty: 0, evil: 0 })?.catch?.(() => {});
  }, seed);
  let ok = false;
  const t1 = Date.now();
  while (Date.now() - t1 < 420000) {
    ok = await page.evaluate(() => !!globalThis.__swGame?.world).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ok) { report.seeds.push({ seed, error: 'not ready' }); continue; }
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });

  const rep = await page.evaluate(async () => {
    const { TILE } = await import('/src/core/constants.ts');
    const g = globalThis.__swGame;
    const world = g.world, st = world.store;
    const out = { flags: { ...world.seedFlags } };
    const tp = (x, y) => {
      g.player.x = x * TILE; g.player.y = y * TILE; g.player.vx = 0; g.player.vy = 0;
      g.camera.x = x * TILE; g.camera.y = y * TILE;
    };
    out.surface = { x: Math.floor(st.w / 2), y: Math.floor(world.groundLevel) - 6 };
    if (world.seedFlags.rainbowStuff) {
      // 找彩虹苔密集点（地下）
      const { TILE_DEFS } = await import('/src/data/tiles.ts');
      const bySheet = (s) => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
      const id627 = bySheet(627), id126 = bySheet(126);
      let best = null;
      for (let k = 0; k < 40000 && !best; k++) {
        const x = 60 + ((k * 1103) % (st.w - 120));
        const y = 60 + ((k * 733) % (st.h - 120));
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === id627) {
          let n = 0;
          for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
            const j = st.idx(Math.min(st.w - 1, Math.max(0, x + dx)), Math.min(st.h - 1, Math.max(0, y + dy)));
            if (st.flags[j] && st.type[j] === id627) n++;
          }
          if (n > 30) best = { x, y };
        }
      }
      if (best) { tp(best.x, best.y); out.spot = 'rainbowmoss'; out.spotAt = best; }
      // 箱物 raw 复核
      const vids = [3556, 2870, 1067, 1066, 5075, 4469];
      const iids = vids.map((v) => ({ vid: v, iid: window.__swFlow.itemByVid(v) }));
      const found = {};
      for (const { vid, iid } of iids) {
        if (iid < 0) { found[vid] = 'unregistered'; continue; }
        found[vid] = 0;
        for (const chest of world.chests) {
          if (!chest) continue;
          if (chest.items.some((it) => it && it.stack > 0 && it.id === iid)) found[vid]++;
        }
      }
      out.rainbowChestRaw = found;
      out.discoballCount = (() => {
        let n = 0;
        for (let y = 40; y < st.h - 40; y += 2) for (let x = 40; x < st.w - 40; x += 2) {
          const i = st.idx(x, y);
          if (st.flags[i] && st.type[i] === id126) n++;
        }
        return n * 4;   // 步长 2×2 → ×4 还原
      })();
    }
    if (world.seedFlags.pooEverywhere) {
      const { TILE_DEFS } = await import('/src/data/tiles.ts');
      const id666 = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 666);
      for (let k = 0; k < 40000; k++) {
        const x = 60 + ((k * 1103) % (st.w - 120));
        const y = 60 + ((k * 733) % (st.h - 120));
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === id666) { tp(x, y - 2); out.spot = 'poo'; out.spotAt = { x, y }; break; }
      }
    }
    if (world.seedFlags.portalGunInChests) {
      const gun = window.__swFlow.itemByVid(3384);
      const withGun = [];
      for (const chest of world.chests) {
        if (!chest) continue;
        if (chest.items.some((it) => it && it.stack > 0 && it.id === gun)) withGun.push({ x: chest.x, y: chest.y });
      }
      out.chestsWithGun = withGun.length;
      out.gunChestSample = withGun.slice(0, 3);
      if (withGun[0]) { tp(withGun[0].x, withGun[0].y - 3); out.spot = 'gunChest'; }
    }
    if (world.seedFlags.coatEverythingIlluminant) {
      out.spot = 'underground';
      tp(Math.floor(st.w / 2), Math.floor(world.rockLevel) + 50);
    }
    if (world.seedFlags.coatEverythingEcho) {
      out.spot = 'underground';
      tp(Math.floor(st.w / 2), Math.floor(world.rockLevel) + 40);
    }
    return out;
  });
  report.seeds.push({ seed, ...rep });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/shot-${seed}.png` });
}
writeFileSync(`${OUT}/final-report.json`, JSON.stringify(report, null, 1));
console.log('written; errs=', errs.length);
await browser.close();
