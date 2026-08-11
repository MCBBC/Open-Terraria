// 金标 .wld 元信息（原版 1.4.5.6 小世界，2026-08-11 由用户在 Steam 版生成）。
// 守护金标完整性 + 为种子等价 diff 提供 (seedText, evil) 入参对照。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseWld } from '../src/wld/WldParser';
import { translateSeed } from '../src/core/rng';

const GOLDEN_DIR = fileURLToPath(new URL('./golden/wld/', import.meta.url));

/** 金标清单：文件名 → { seedText, evil }（evil: 0 腐化 1 猩红，与 GenConfig 同义） */
export const GOLDEN_WORLDS = [
  { file: '9293480世界.wld', seedText: '9293480', evil: 0 as const },
  { file: '12345世界.wld', seedText: '12345', evil: 0 as const },
  { file: '20260811世界.wld', seedText: '20260811', evil: 0 as const },
  { file: '2147483647世界.wld', seedText: '2147483647', evil: 1 as const },
  { file: 'SandboxWorld世界.wld', seedText: 'SandboxWorld', evil: 1 as const },
];

/** 解析金标（缓存：seed-parity 等测试复用） */
const cache = new Map<string, ReturnType<typeof parseWld>>();
export function loadGolden(file: string) {
  if (!cache.has(file)) {
    const buf = readFileSync(GOLDEN_DIR + file);
    cache.set(file, parseWld(new Uint8Array(buf)));
  }
  return cache.get(file)!;
}

describe('金标 .wld 元信息（原版 1.4.5.6）', () => {
  for (const g of GOLDEN_WORLDS) {
    it(`${g.seedText}：小世界 4200×1200，邪恶=${g.evil ? '猩红' : '腐化'}，经典模式`, () => {
      const w = loadGolden(g.file);
      expect(w.version).toBeGreaterThan(300); // 1.4.4+ 存档版本
      expect(w.tilesWide).toBe(4200);
      expect(w.tilesHigh).toBe(1200);
      expect(w.seed).toBe(g.seedText);
      expect(w.isCrimson).toBe(g.evil === 1);
      expect(w.gameMode).toBe(0); // 经典
      expect(w.hardMode).toBe(false);
      // translateSeed（数字→Abs / 字母→Crc32）派生值无 NaN/越界
      const seedInt = translateSeed(g.seedText);
      expect(Number.isInteger(seedInt)).toBe(true);
    });
  }
});
