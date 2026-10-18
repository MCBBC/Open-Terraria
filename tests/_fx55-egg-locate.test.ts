// 一次性诊断（FX55）：扫描用户世界档中的 tile 752（奇莱特蛋/巨型龙蛋），报告坐标。
// 通道：node 侧 vitest（纯单测，不需要 dev server）
//   npx vitest run tests/_fx55-egg-locate.test.ts
// 输出：控制台表 + /tmp/fx55-egg-locate.json
// 不改任何源码/存档。
import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { readLocalFixture, localFixtureMissing } from './fixturePath';
import { parseWld } from '../src/wld/WldParser';
import { parseWldToSave } from '../src/wld/WldImport';
import {
  TILE_BY_KEY, TILE_DEFS, TILE_STABLE_OF_INTERNAL,
} from '../src/data/tiles';

const WLD_PATH = 'fx55-soul-hex.wld';   // ★C档收编:原 ~/Downloads/欺诈的灵魂祸根.wld
const OUT_PATH = '/tmp/fx55-egg-locate.json';

/** 原版 tileSolid 近似：本仓 TILE_DEFS[].solid 对齐原版 Main.tileSolid（平台 19 为
 *  tileSolidTop,solid=false,但其 sheet 在 TILE_TABLE_SHEETS 内=Place2x2 地面门并集） */
const SOLID_SHEET = new Set<number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh !== undefined && TILE_DEFS[id].solid) SOLID_SHEET.add(sh);
}

describe.skipIf(localFixtureMissing(WLD_PATH))('FX55: 用户世界档 752 蛋扫描', () => {
  it('scan', () => {
    const buf = readLocalFixture(WLD_PATH);
    const wld = parseWld(buf);
    const { save, report } = parseWldToSave(buf);

    const w = wld.tilesWide, h = wld.tilesHigh;
    const t = wld.tiles;
    const surf = wld.groundLevel;   // worldSurface（f64 原值）
    const rock = wld.rockLevel;
    const uw = h - 200;             // Main.UnderworldLayer = maxTilesY-200（Main.cs:2863）
    const idx = (x: number, y: number) => y * w + x;
    const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

    // ============ 1) 原始 wld 域：全量扫 type 752 ============
    const cells: Array<{ x: number; y: number; fx: number; fy: number }> = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(x, y);
        if (t.active[i] && t.type[i] === 752) cells.push({ x, y, fx: t.frameX[i], fy: t.frameY[i] });
      }
    }
    const is752 = (x: number, y: number) => inB(x, y) && t.active[idx(x, y)] && t.type[idx(x, y)] === 752;
    // 蛋=2×2（worldgen Place2x2 帧直拷 0/18）；顶左格=上邻与左邻均非 752
    const eggs = cells.filter((c) => !is752(c.x - 1, c.y) && !is752(c.x, c.y - 1));
    // 补查：致动器虚化(位 inactive)的 752 格——上表 raw 扫描只认 active 位,防漏
    const inactive752: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(x, y);
        if (!t.active[i] && t.type[i] === 752) inactive752.push({ x, y });
      }
    }

    // ============ 2) parseWldToSave 交叉核对（save.tiles 稳定 id RLE 解码） ============
    const eggInternal = TILE_BY_KEY['v_752_chillet_egg'];
    const eggStable = TILE_STABLE_OF_INTERNAL[eggInternal];
    let saveCellCount = 0;
    const saveCells: Array<{ x: number; y: number }> = [];
    {
      const bytes = Buffer.from(save.tiles, 'base64');
      let p = 0;
      const rv = () => { let v = 0, s = 0, b: number; do { b = bytes[p++]; v |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return v; };
      let i = 0;
      const n = w * h;
      while (i < n && p < bytes.length) {
        const run = rv() + 1;
        const ty = rv();
        let fx = 0, fy = 0;
        if (ty !== 0) { fx = rv(); fy = rv(); }
        if (ty === eggStable) {
          for (let k = 0; k < run; k++) {
            const j = i + k;
            saveCells.push({ x: j % w, y: Math.floor(j / w) });
          }
          saveCellCount += run;
        }
        i += run;
      }
    }

    // ============ 3) 坐标换算（深度英尺/东西英尺） ============
    // 深度 = (tileY − worldSurface) × 2（地下为正;地表以上为负=海拔）
    // 东西 = (tileX − spawnX) × 2（正=出生点以东）
    const depthFeet = (y: number) => Math.round((y - surf) * 2);
    const ewFeet = (x: number) => Math.round((x - wld.spawnX) * 2);
    const zoneOf = (y: number) =>
      y < surf ? '地表以上' : y < rock ? '地下(土层)' : y < uw ? '洞穴层' : '地狱层';

    const eggRows = eggs.map((e) => ({
      topLeftTile: [e.x, e.y],
      occupies: `${e.x}..${e.x + 1}, ${e.y}..${e.y + 1}`,
      depthFeet: depthFeet(e.y),
      zone: zoneOf(e.y),
      ewFeet: ewFeet(e.x),
      ewDir: ewFeet(e.x) >= 0 ? '东' : '西',
      rowsBelowRock: Math.round(e.y - rock),
      frame: [e.fx, e.fy],
      style: Math.floor(e.fy / 36),
    }));

    // ============ 4) 0 颗时的佐证统计：蛋放置域 2×2 净空合法候选点 ============
    let candidates = -1, candidatesWin200 = -1, clearOnlyWin200 = -1;
    if (eggs.length === 0) {
      // worldgen 蛋锚(x,y)=2×2 右下角,域 x∈[10,w-11] y∈[10,h-11];j 掷域=rock..h-201
      // (remix: rock..h-351)。合法=2×2(x-1..x,y-1..y)全空 + 双列地面(y+1)实心/桌面。
      // 地面门 = 原版 tileSolid(以 TILE_DEFS solid 近似) ∪ Place2x2 tileTable sheet 集
      // （SurfaceDecorPasses.ts PLACE2X2_TABLE 字面拷贝,佐证用途）
      const TABLE_SHEETS = new Set([14, 18, 19, 87, 88, 101, 114, 275, 276, 277, 278, 279, 280, 281,
        285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380,
        391, 392, 393, 394, 405, 413, 414, 427, 435, 436, 437, 438, 439, 469,
        532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559,
        582, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612,
        619, 629, 632, 640, 643, 644, 645, 710]);
      const gOk = (x: number, y: number) => {
        if (!inB(x, y)) return false;
        const i = idx(x, y);
        if (!t.active[i]) return false;
        const sh = t.type[i];
        return SOLID_SHEET.has(sh) || TABLE_SHEETS.has(sh);
      };
      const legal = (x: number, y: number) => {
        if (x < 10 || y < 10 || x > w - 11 || y > h - 11) return false;
        for (let a = x - 1; a <= x; a++) for (let b = y - 1; b <= y; b++) if (t.active[idx(a, b)]) return false;
        return gOk(x - 1, y + 1) && gOk(x, y + 1);
      };
      const clearOnly = (x: number, y: number) => {
        if (x < 10 || y < 10 || x > w - 11 || y > h - 11) return false;
        for (let a = x - 1; a <= x; a++) for (let b = y - 1; b <= y; b++) if (t.active[idx(a, b)]) return false;
        return true;
      };
      candidates = 0; candidatesWin200 = 0; clearOnlyWin200 = 0;
      const y0 = Math.max(10, Math.floor(rock)), y1 = Math.min(h - 11, h - 201);
      const winY1 = Math.min(h - 11, Math.floor(rock) + 200);
      for (let y = y0; y <= y1; y++) {
        for (let x = 10; x <= w - 11; x++) {
          if (legal(x, y)) {
            candidates++;
            if (y <= winY1) candidatesWin200++;
          }
          if (y <= winY1 && clearOnly(x, y)) clearOnlyWin200++;
        }
      }
    }

    // ============ 5) 汇总 ============
    const target = w <= 4200 ? 6 : w <= 6400 ? 9 : 12;
    const summary = {
      file: WLD_PATH,
      worldName: wld.title,
      wldVersion: wld.version,
      worldGenVersion: wld.worldGenVersion.toString(),
      size: [w, h],
      eggTargetBySize: target,
      seed: wld.seed,
      gameMode: wld.gameMode,
      crimson: wld.isCrimson,
      spawnTile: [wld.spawnX, wld.spawnY],
      groundLevel: surf,
      rockLevel: rock,
      underworldLayer: uw,
      depthFeetOfRock: Math.round((rock - surf) * 2),
      eggCellsRaw: cells.length,
      eggCount: eggs.length,
      inactive752Cells: inactive752,
      eggs: eggRows,
      saveDomainEggCells: saveCellCount,
      saveDomainCells: saveCells.slice(0, 20),
      flagsKeyCount: Object.keys(wld.flags).length,
      unlockedBiomeTorchesInWldFlags: 'unlockedBiomeTorches' in wld.flags,
      compatDegraded752: report.tilesDegraded.filter((e) => e.id === 752),
      candidatesIfZero: eggs.length === 0
        ? { legalWholeDomain: candidates, legalWithin200RowsBelowRock: candidatesWin200, clearOnlyWithin200Rows: clearOnlyWin200 }
        : null,
    };

    console.log('==== FX55 752-egg scan ====');
    console.log(JSON.stringify(summary, null, 2));
    writeFileSync(OUT_PATH, JSON.stringify(summary, null, 2));
  });
});
