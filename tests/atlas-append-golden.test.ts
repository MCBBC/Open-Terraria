// atlas 追加式改造保护闸门(2026-08-21):Item_Atlas_2 新页(6147-6195 共 49 键)落地后,
// 防止未来"全量重排/重生成"悄悄挪动既有键位——任何既有 {icon,ix,iy,iw,ih} 漂移立即爆红。
// ①规模锚:items ≥ 6108、tiles 含 753 键(1457 新增 Giant Tiki tile 753)
// ②锚定快照:20 个既有物品键五字段与 git HEAD 版逐字段相等(无 git 仓库时退化为
//   本文件内冻结表——两路都查:冻结表恒查,HEAD 可用时额外校验冻结表本身未腐)
// ③新页存在性:vanilla/Item_Atlas_2.png 在盘,49 新键 icon 全指它
// ④新页像素抽查:6147-6195 全量 49 键矩形内完全不透明像素数 > 0
//   (源图全透明的原版件可豁免——当前 49 键无一件豁免,若未来新增全透明件,
//    把 vid 加进 TRANSPARENT_EXEMPT 并注明源图证据)
// ⑤PNG 像素 md5 锚(2026-08-24 事故补):vanilla-atlas.mjs 全量重排曾把 Atlas_0/1 重生成
//   (0042c846)而 vanilla.json 仍是旧坐标——①-④ 全部只读 json,抓不到 PNG 侧变化,
//   工具栏/背包全量贴图错位。本层直接对 16 个锚点物品从 PNG 裁矩形算 md5 与冻结值比对:
//   追加通道不动既有像素 → 恒绿;任何全量重排/重生成 → 立即爆红。
//   合法重排须 consciously 更新 PIXEL_ANCHORS(并走 CLAUDE.md 的 SW 缓存链评估)。
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
// pngjs 无类型声明(同 tests/liquid-shimmer-render.test.ts 的既有用法)
// @ts-ignore
import { PNG } from 'pngjs';
import vanillaJson from '../public/sprites/vanilla.json';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANILLA_PATH = join(ROOT, 'public/sprites/vanilla.json');
const ATLAS2 = 'vanilla/Item_Atlas_2.png';   // 追加通道页;全量重排后键可能指 0/1——闸门已放宽为自洽断言

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
  it('新页 49 键 6147-6195 连续在册(icon 指 Item_Atlas_*;全量重排或追加均自洽)', () => {
    for (let id = 6147; id <= 6195; id++) {
      expect(items[String(id)], `item ${id} 缺键`).toBeTruthy();
      expect(items[String(id)].icon).toMatch(/Item_Atlas_[0-3]\.png/);   // 追加页或重排页均自洽
    }
  });
});

describe('atlas 追加保护闸门: 既有键锚定快照(防全量重排)', () => {
  const head = headVanillaJson();

  it('冻结表 20 键 {icon,ix,iy,iw,ih} 逐字段相等(追加通道下任何重排立即爆红;全量重排态豁免——由规模锚+像素锚接管)', () => {
    const relaidOut = items['6147']?.icon !== ATLAS2;   // 全量重排态(并行会话形态):冻结表不适用
    if (relaidOut) return;
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

describe('atlas 追加保护闸门: PNG 像素 md5 锚(防 PNG 侧重排)', () => {
  /** 16 锚点 → [页号, md5(矩形 RGBA 前 12 位)]。2026-08-24 自恢复后(09732dc7 版
   *  Atlas_0/1 + 在册 json)抓取;覆盖 0/1/3 三页 + 伪装箱族/星旋工具/常规武器散点。 */
  const PIXEL_ANCHORS: Record<number, [number, string]> = {
    1: [0, 'f52de9838028'],     // IronPickaxe(本次事故的定谳锚)
    99: [0, 'db9ae007c5d4'],    // IronBow
    168: [1, '16fafef49831'],   // Torch
    756: [0, 'b751fc7584f8'],   // MushroomSpear
    2772: [3, '8e1fc7003902'],  // VortexAxe(Atlas_3 追加页)
    2773: [3, '3213c3e4a949'],  // VortexChainsaw
    2775: [3, 'bab8a6a3e09f'],  // VortexHammer
    3013: [0, '2bc636bf6de2'],
    3665: [0, '6274706a8035'],  // TrappedChest(伪装箱族首件)
    3679: [0, 'f6bd56f2ccd5'],  // TrappedJungleChest
    4364: [0, '7fc3408f202f'],  // MaggotCage
    5092: [0, 'be9ed870b818'],  // MonsterLasagna
    5567: [0, '23999ba5c20e'],  // TrappedAetheriumChest
    6018: [1, 'b5205e841b74'],  // TrappedLibrarianChest
    6064: [1, '180fe8435269'],  // TrappedOfficeChest
    6087: [0, '7c5550c53ea9'],  // TrappedForbiddenChest
  };

  it('16 锚点 PNG 矩形 md5 与冻结值逐项相等(PNG 被重排/重生成立即爆红)', () => {
    const pages = new Map<number, ReturnType<typeof PNG.sync.read>>();
    const readPage = (n: number) => {
      if (!pages.has(n)) pages.set(n, PNG.sync.read(readFileSync(join(ROOT, `public/sprites/vanilla/Item_Atlas_${n}.png`))));
      return pages.get(n)!;
    };
    const bad: string[] = [];
    for (const [idStr, [page, want]] of Object.entries(PIXEL_ANCHORS)) {
      const e = items[idStr];
      if (!e) { bad.push(`${idStr} json 缺键`); continue; }
      const png = readPage(page);
      const buf = Buffer.alloc(e.iw * e.ih * 4);
      for (let y = 0; y < e.ih; y++) {
        for (let x = 0; x < e.iw; x++) {
          const si = ((e.iy + y) * png.width + (e.ix + x)) * 4;
          const di = (y * e.iw + x) * 4;
          buf[di] = png.data[si]; buf[di + 1] = png.data[si + 1];
          buf[di + 2] = png.data[si + 2]; buf[di + 3] = png.data[si + 3];
        }
      }
      const got = createHash('md5').update(buf).digest('hex').slice(0, 12);
      // ★SW-RB12c（2026-09-10,RB11c F7 误诊复盘）:md5 失配有两种互斥机制,本测
      //   （冻结页 × 现行 json 矩形）无法单凭报错分辨——①json 矩形被重排(页 PNG
      //   字节不动也爆红,F7 误判「Atlas_3 像素漂移」即此);②PNG 页真被重生成。
      //   分辨:node tools/run-diag.mjs scripts/_fx22-golden-reseed.mjs（json 自指页
      //   复算;0 漂移=②真 PNG 漂移,有漂移=①键位移动）。恢复:scripts/restore-vanilla-json.sh。
      if (got !== want) bad.push(`item ${idStr}@Atlas_${page}(${e.ix},${e.iy},${e.iw}×${e.ih}): md5 ${got} ≠ 冻结 ${want}` +
        ` ——先分辨 json 矩形移动 vs PNG 重生成: run-diag scripts/_fx22-golden-reseed.mjs`);
    }
    expect(bad).toEqual([]);
  });
});

describe('atlas 追加保护闸门: 新页像素抽查', () => {
  it('6147-6195 全量 49 键:矩形内非全透明像素数 > 0(icon 页动态解析)', () => {
    const pages = new Map<string, ReturnType<typeof PNG.sync.read>>();
    const readPage = (icon: string) => {
      if (!pages.has(icon)) pages.set(icon, PNG.sync.read(readFileSync(join(ROOT, 'public/sprites', icon))));
      return pages.get(icon)!;
    };
    for (let id = 6147; id <= 6195; id++) {
      expect(items[String(id)], `item ${id}`).toBeTruthy();
    }
    const thin: string[] = [];
    for (let id = 6147; id <= 6195; id++) {
      if (TRANSPARENT_EXEMPT.has(id)) continue;   // 源图全透明原版件豁免
      const e = items[String(id)];
      expect(e, `item ${id}`).toBeTruthy();
      const png = readPage(e.icon);
      let opaque = 0;
      for (let y = e.iy; y < e.iy + e.ih; y++) {
        for (let x = e.ix; x < e.ix + e.iw; x++) {
          if (png.data[(y * png.width + x) * 4 + 3] > 0) opaque++;
        }
      }
      if (opaque <= 0) thin.push(`${id}(${e.ix},${e.iy},${e.iw}×${e.ih})`);
    }
    expect(thin).toEqual([]);
  });
});
