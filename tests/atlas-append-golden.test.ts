// atlas 追加式改造保护闸门(2026-08-21):Item_Atlas_2 新页(6147-6195 共 49 键)落地后,
// 防止未来"全量重排/重生成"悄悄挪动既有键位——任何既有 {icon,ix,iy,iw,ih} 漂移立即爆红。
// ①规模锚:items ≥ 6108、tiles 含 753 键(1457 新增 Giant Tiki tile 753)
// ②锚定快照:20 个既有物品键五字段与 git HEAD 版逐字段相等(无 git 仓库时退化为
//   本文件内冻结表——两路都查:冻结表恒查,HEAD 可用时额外校验冻结表本身未腐)
// ③新页存在性:vanilla/Item_Atlas_2.png 在盘,49 新键 icon 全指它
// ④新页像素抽查:6147-6195 全量 49 键矩形内完全不透明像素数 > 0
//   (源图全透明的原版件可豁免——当前 49 键无一件豁免,若未来新增全透明件,
//    把 vid 加进 TRANSPARENT_EXEMPT 并注明源图证据)
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
// pngjs 无类型声明(同 tests/liquid-shimmer-render.test.ts 的既有用法)
// @ts-ignore
import { PNG } from 'pngjs';
import vanillaJson from '../public/sprites/vanilla.json';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANILLA_PATH = join(ROOT, 'public/sprites/vanilla.json');
const ATLAS2 = 'vanilla/Item_Atlas_2.png';

interface ItemEntry {
  icon: string; ix: number; iy: number; iw: number; ih: number;
}
const items = (vanillaJson as { items: Record<string, ItemEntry> }).items;
const tiles = (vanillaJson as { tiles: Record<string, unknown> }).tiles;

/** ②冻结锚定快照(2026-08-21 自当版 vanilla.json 抓取,等价当时 HEAD):
 *  键 → [icon, ix, iy, iw, ih]。覆盖 0/1 两页 + 新页前夜 6146,散点跨 1~6195。 */
const FROZEN_ANCHORS: Record<number, [string, number, number, number, number]> = {
  1: ['vanilla/Item_Atlas_0.png', 1408, 960, 32, 32],      // IronPickaxe
  99: ['vanilla/Item_Atlas_0.png', 1772, 960, 16, 32],     // IronBow
  753: ['vanilla/Item_Atlas_0.png', 988, 996, 32, 32],     // Seaweed
  756: ['vanilla/Item_Atlas_0.png', 552, 378, 52, 52],     // MushroomSpear
  757: ['vanilla/Item_Atlas_0.png', 1458, 318, 46, 54],    // TerraBlade
  1206: ['vanilla/Item_Atlas_0.png', 1970, 1900, 30, 26],  // PalladiumHelmet
  1226: ['vanilla/Item_Atlas_0.png', 804, 238, 68, 68],    // ChlorophyteClaymore
  2223: ['vanilla/Item_Atlas_0.png', 544, 486, 28, 46],    // PulseBow
  2365: ['vanilla/Item_Atlas_0.png', 574, 486, 46, 46],    // ImpStaff
  3000: ['vanilla/Item_Atlas_0.png', 1044, 852, 32, 34],   // AlchemyTable
  3183: ['vanilla/Item_Atlas_0.png', 1528, 434, 44, 48],   // GoldenBugNet
  4281: ['vanilla/Item_Atlas_0.png', 612, 664, 38, 38],    // BabyBirdStaff
  5097: ['vanilla/Item_Atlas_0.png', 976, 378, 52, 52],    // BatBat
  5129: ['vanilla/Item_Atlas_0.png', 1230, 536, 42, 42],   // Flymeal
  5460: ['vanilla/Item_Atlas_0.png', 742, 2014, 56, 26],   // DeadCellsBarrelLauncher
  5502: ['vanilla/Item_Atlas_0.png', 800, 2014, 28, 26],   // PlayerVoiceCatItem
  5563: ['vanilla/Item_Atlas_0.png', 1914, 1566, 28, 30],  // AetheriumSink
  5999: ['vanilla/Item_Atlas_1.png', 728, 410, 32, 22],    // LibrarianBed
  6100: ['vanilla/Item_Atlas_0.png', 1000, 1598, 16, 30],  // WaterLamp
  6146: ['vanilla/Item_Atlas_1.png', 350, 2, 32, 26],      // Music Box (Silence)
};

/** git HEAD 版 vanilla.json(仓库不存在/无 HEAD 时 null) */
function headVanillaJson(): Record<string, ItemEntry> | null {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' });
  if (top.status !== 0 || !top.stdout.trim()) return null;
  const repoRoot = top.stdout.trim();
  const rel = relative(repoRoot, VANILLA_PATH).split(sep).join('/');
  const show = spawnSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (show.status !== 0) return null;
  try {
    return (JSON.parse(show.stdout) as { items: Record<string, ItemEntry> }).items;
  } catch {
    return null;
  }
}

/** ④源图全透明豁免件(原版本就无像素——登记须附源图证据;当前为空) */
const TRANSPARENT_EXEMPT = new Set<number>();

describe('atlas 追加保护闸门: 规模锚', () => {
  it('items ≥ 6108 / tiles 含 753 键(1457 Giant Tiki)', () => {
    expect(Object.keys(items).length).toBeGreaterThanOrEqual(6108);
    expect(tiles).toHaveProperty('753');
  });
  it('新页 49 键 6147-6195 连续在册(icon 全指 Item_Atlas_2)', () => {
    for (let id = 6147; id <= 6195; id++) {
      expect(items[String(id)], `item ${id} 缺键`).toBeTruthy();
      expect(items[String(id)].icon).toBe(ATLAS2);
    }
  });
});

describe('atlas 追加保护闸门: 既有键锚定快照(防全量重排)', () => {
  const head = headVanillaJson();

  it('冻结表 20 键 {icon,ix,iy,iw,ih} 逐字段相等(任何重排立即爆红)', () => {
    const bad: string[] = [];
    for (const [idStr, want] of Object.entries(FROZEN_ANCHORS)) {
      const cur = items[idStr];
      if (!cur) { bad.push(`${idStr} 缺键`); continue; }
      const got: [string, number, number, number, number] = [cur.icon, cur.ix, cur.iy, cur.iw, cur.ih];
      if (got[0] !== want[0] || got[1] !== want[1] || got[2] !== want[2] || got[3] !== want[3] || got[4] !== want[4]) {
        bad.push(`${idStr}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('git HEAD 可用时:冻结表与 HEAD 逐字段相等(冻结表本身未腐)', () => {
    if (!head) return;   // 本仓当前非 git 仓库 → 冻结表即权威锚(上一用例已查)
    const bad: string[] = [];
    for (const [idStr, want] of Object.entries(FROZEN_ANCHORS)) {
      const cur = head[idStr];
      if (!cur) { bad.push(`${idStr} HEAD 缺键`); continue; }
      const got: [string, number, number, number, number] = [cur.icon, cur.ix, cur.iy, cur.iw, cur.ih];
      if (got.some((v, i) => v !== want[i])) bad.push(`${idStr}: HEAD ${JSON.stringify(got)} vs 冻结 ${JSON.stringify(want)}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('atlas 追加保护闸门: 新页像素抽查', () => {
  const pngPath = join(ROOT, 'public/sprites', ATLAS2);
  it('vanilla/Item_Atlas_2.png 在盘', () => {
    expect(existsSync(pngPath)).toBe(true);
  });
  it('6147-6195 全量 49 键:矩形内完全不透明(alpha=255)像素数 > 0', () => {
    const png = PNG.sync.read(readFileSync(pngPath));
    const thin: string[] = [];
    for (let id = 6147; id <= 6195; id++) {
      if (TRANSPARENT_EXEMPT.has(id)) continue;   // 源图全透明原版件豁免
      const e = items[String(id)];
      expect(e, `item ${id}`).toBeTruthy();
      expect(e.icon).toBe(ATLAS2);
      let opaque = 0;
      for (let y = e.iy; y < e.iy + e.ih; y++) {
        for (let x = e.ix; x < e.ix + e.iw; x++) {
          if (png.data[(y * png.width + x) * 4 + 3] === 255) opaque++;
        }
      }
      if (opaque <= 0) thin.push(`${id}(${e.ix},${e.iy},${e.iw}×${e.ih})`);
    }
    expect(thin).toEqual([]);
  });
});
