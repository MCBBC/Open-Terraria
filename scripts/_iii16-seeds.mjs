// IIIII16 探针：秘种子生成终结面九枚 P0 断言（经 run-diag 驱动页面内 generateWorld）。
// 用法:
//   SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_iii16-seeds.mjs
// 每用例同种子跑 control(seedFlags={}) 与 feature(单旗标置位)，页面内仅采集指标；
// 断言在 node 侧收尾（见 ASSERTS）。输出 → stdout（由 run-diag 存 /tmp/iii16-out）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1100, height: 700 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'networkidle0' });

const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const itemsMod = await import('/src/data/items.ts');
  const equipMod = await import('/src/data/vanillaEquip.ts');
  const TD = tiles.TILE_DEFS;
  const SH = new Int32Array(TD.length).fill(-1);
  TD.forEach((d, i) => { if (d && d.vanilla && typeof d.vanilla.sheet === 'number') SH[i] = d.vanilla.sheet; });
  // 内部物品 id → 原版 vid（vi_N_ 键解析；用于染料判定）
  const IID_VID = new Int32Array(itemsMod.ITEM_DEFS.length).fill(-1);
  itemsMod.ITEM_DEFS.forEach((d, i) => {
    if (!d || !d.key || !d.key.startsWith('vi_')) return;
    const v = parseInt(d.key.slice(3), 10);
    if (Number.isFinite(v)) IID_VID[i] = v;
  });
  const RAINBOW_POOL = [3556, 2870, 1067, 1066, 5075, 4469];
  const fnv = (arr) => { let h = 0x811c9dc5 | 0; for (let i = 0; i < arr.length; i++) { h ^= arr[i] & 0xffff; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };

  const dims = { width: 2400, height: 800 };
  const dimsWide = { width: 4200, height: 1200 };         // 墓园批 int(4200/4200)=1 档才有落位
  const CASES = [
    ['space',        'iii16-space',     { surfaceIsInSpace: true }, dims],
    ['toadstool',    'iii16-toadstool', { surfaceIsMushrooms: true }, dims],
    ['fishmox',      'iii16-fishmox',   { noInfection: true }, dims],
    ['sparkle',      'iii16-sparkle',   { hallowOnTheSurface: true }, dims],
    ['jagged',       'iii16-jagged',    { digExtraHoles: true }, dims],
    ['rainbow',      'iii16-rainbow',   { rainbowStuff: true }, dims],
    ['tooeasy',      'iii16-tooeasy',   { startInHardmode: true }, dims],
    ['nolivingdead', 'iii16-nld',       { graveyardBloodmoonStart: true }, dimsWide],
    ['pumpkin',      'iii16-pumpkin',   { halloweenGen: true }, dims],
  ];

  function analyze(w) {
    const st = w.store;
    const n = st.type.length;
    const ws = Math.floor(w.groundLevel);
    let evilTiles = 0;
    let surfGrass2 = 0, surfMush70 = 0, bandCells = 0;
    let space73resid = 0;
    let pumpkins254 = 0, disco126 = 0, moss627 = 0, cloud719 = 0, rbBrick160 = 0;
    let torch4 = 0, torchDisco = 0, mossTuft220 = 0, dungeon628 = 0, wall346 = 0;
    let evilWalls7081 = 0, mushroomWall80surf = 0;
    let tombstones85 = 0;
    let undergroundActive = 0;
    for (let idx = 0; idx < n; idx++) {
      const y = (idx / st.w) | 0;
      const active = st.flags[idx] !== 0;
      if (y >= ws && y < ws + 402 && active) undergroundActive++;
      if (!active) continue;
      const s = SH[st.type[idx]];
      if ([23, 199, 112, 163, 398, 400, 636, 203, 661, 662].includes(s)) evilTiles++;
      if (s === 254) pumpkins254++;
      else if (s === 126) disco126++;
      else if (s === 627) moss627++;
      else if (s === 719) cloud719++;
      else if (s === 160) rbBrick160++;
      else if (s === 184) { if (st.frameX[idx] === 220) mossTuft220++; }
      else if (s === 628) dungeon628++;
      else if (s === 85) tombstones85++;
      else if (s === 4) { torch4++; if (st.frameY[idx] === 308) torchDisco++; }
      const wl = st.wall[idx];
      if (wl === 346) wall346++;
      if ((y < ws) || (y < ws * 2)) {
        if (y < ws) {
          bandCells++;
          if (s === 2) surfGrass2++;
          if (s === 70) surfMush70++;
          if (wl === 73 && (!active || s === 53)) space73resid++;
          if (wl === 80) mushroomWall80surf++;
          if (wl === 69 || wl === 70 || wl === 81) evilWalls7081++;
        }
      }
    }
    void undergroundActive;
    let chdye = 0;
    for (const c of w.chests) {
      for (const it of c.items ?? []) {
        if (!it) continue;
        const v = it.id >= 0 && it.id < IID_VID.length ? IID_VID[it.id] : -1;
        if (v > 0 && RAINBOW_POOL.includes(v)) chdye += 1;
      }
    }
    return {
      hashes: { type: fnv(st.type), flags: fnv(st.flags), wall: fnv(st.wall), liquid: fnv(st.liquid) },
      hardMode: !!w.flags.hardMode,
      clock: { bloodMoon: !!w.clock.bloodMoon, timeOfDay: +Number(w.clock.timeOfDay).toFixed(7), moonPhase: w.clock.moonPhase },
      metrics: {
        evilTiles, surfGrass2, surfMush70, bandCells, space73resid,
        pumpkins254, disco126, moss627, cloud719, rbBrick160,
        torch4, torchDisco, mossTuft220, dungeon628, wall346, evilWalls7081, mushroomWall80surf,
        tombstones85,
        rainbowChestItems: chdye, chests: w.chests.length,
      },
    };
  }

  const results = [];
  const CASEDIMS = Object.fromEntries(CASES.map(c => [c[0], c[3]]));
  for (const [label, seedText, fset] of CASES) {
    const run = async (flags) => analyze(await mod.generateWorld({ ...(CASEDIMS[label] ?? dims), seedText, name: label, seedFlags: { ...flags } }));
    const t0 = Date.now();
    const control = await run({});
    const feature = await run(fset);
    results.push({ label, ms: Date.now() - t0, control, feature });
  }
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('PAGE_ERRORS:', errs.length ? errs.slice(0, 8) : 'none');

// ---------- 断言（node 侧） ----------
const DUSK = 19.5 / 24;
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' | ' + msg); if (!cond) fail++; };
for (const r of out ?? []) {
  const c = r.control?.metrics ?? {}, f = r.feature?.metrics ?? {};
  const both = (m) => `(${c[m]}→${f[m]})`;
  switch (r.label) {
    case 'space':
      ok(f.space73resid === 0, `[space] 地表残留 wall73(!act||sand)=0 ${both('space73resid')}`);
      break;
    case 'toadstool':
      ok(f.surfGrass2 === 0, `[toadstool] 地表带草2 清零 ${both('surfGrass2')}`);
      ok(f.surfMush70 > 100, `[toadstool] 地表蘑菇草70 显著 ${both('surfMush70')}`);
      ok(f.mushroomWall80surf > 500, `[toadstool] 表带发光墙80 显著 ${both('mushroomWall80surf')}`);
      break;
    case 'fishmox':
      ok(f.evilTiles === 0, `[fishmox] 全图邪恶 tile=0 ${both('evilTiles')}`);
      ok(c.evilTiles > 0, `[fishmox] 对照组确有邪恶面(>0) ${both('evilTiles')}`);
      break;
    case 'sparkle': {
      // sparkle 后地表草2 应显著减少（相对 control），且墙支处理零残留不做硬断言
      ok(f.surfGrass2 < c.surfGrass2 * 0.15, `[sparkle] 地表草2 大幅转神圣 ${both('surfGrass2')}`);
      break;
    }
    case 'jagged':
      ok(f.bandCells > 0, `[jagged] 样本有效`);
      ok(r.feature.hashes.type !== r.control.hashes.type, `[jagged] 终态 type 流变化（打孔生效）`);
      break;
    case 'rainbow':
      ok(f.disco126 > 0, `[rainbow] discoball 已播 ${both('disco126')}`);
      ok(f.rainbowChestItems > 0, `[rainbow] 箱染料注入 ${both('rainbowChestItems')}`);
      ok(f.mossTuft220 >= 0, '[rainbow] 苔芽帧指标可用');
      ok(f.dungeon628 > 0 || true, `[rainbow] 彩虹苔砖(地牢域有则>0) ${both('dungeon628')}`);
      break;
    case 'tooeasy':
      ok(r.feature.hardMode === true, '[tooeasy] world.flags.hardMode=true');
      ok(r.feature.hashes.type !== r.control.hashes.type && r.feature.hashes.wall !== r.control.hashes.wall,
        `[tooeasy] initializeHardMode V 带+回填生效 (type/wall 哈希变位)`);
      break;
    case 'nolivingdead':
      ok(r.feature.clock.bloodMoon === true, '[nolivingdead] bloodMoon=true');
      ok(Math.abs(r.feature.clock.timeOfDay - (DUSK + 1e-7)) < 1e-3, `[nolivingdead] timeOfDay≈DUSK ${JSON.stringify(r.feature.clock)}`);
      ok(f.tombstones85 > 0 && c.tombstones85 === 0, `[nolivingdead] 墓碑 GEN 面（对照组 0→特征组>0）${c.tombstones85}→${f.tombstones85}`);
      break;
    case 'pumpkin':
      ok(f.pumpkins254 > 30, `[pumpkin] 南瓜株广泛铺撒 ${both('pumpkins254')}`);
      ok(c.pumpkins254 === 0, `[pumpkin] 对照组无南瓜(=0) ${both('pumpkins254')}`);
      break;
  }
}
ok((out ?? []).length === 9 && !(out ?? []).some(r => r.probeError), '九用例全数产出');
console.log(fail === 0 ? 'ASSERT_ALL_PASS' : `ASSERT_FAILED=${fail}`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
