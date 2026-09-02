// CorruptionAndCrimson pass（槽 #030）双 flavor 掷数+输出对拍门（t2 批 2026-09-02）。
//
// 背景：七认证链（mile8）全部是腐化世界（SW_EVIL=0），猩红世界的槽 #030 输出面从未
// 被认证——nba2 掷数二分曾把「腐化世界 5,128,077 vs 猩红世界 756,506」误读为 6.8× 的
// JS 债。t2 批用 x86 rig（/tmp/rrrr-rigs，SW_EVIL=0/1、SW_PASSCHAIN）双 flavor 定谳：
//
//   flavor        x86 R（槽窗口）   JS 槽内掷数   差
//   evil=0 腐化   5,128,078         5,128,077     +1
//   evil=1 猩红     756,507           756,506     +1
//   （+1 = vanilla RunPass 尾 WorldGenerator.cs:515 `RandNext = genRand.Next()`
//     诊断掷——世界中立（下个 pass 头重播种子），JS 不复刻，恒定落在 x86 窗口内）
//   ⇒ CorruptionPass 掷流与 x86 逐掷同构（两 flavor）。
//
//   槽末四通道 FNV（JJHook pc.txt 口径：typ u16LE=原版 sheet / act u8 / wal u16LE /
//   liq u8，y 外 x 内；x86=/tmp/t2-out/{cor,crim}/pc.txt P|29）：
//   evil=0: A:346f8c0b W:adf86bf5 L:99eb6ea0   evil=1: A:c8809903 W:82569b5c L:99eb6ea0
//   JS 侧 act/wal/liq 三通道全等；typ 通道有 48 格幽灵 type 差（js 1/57/59 vs x86 0），
//   已证为上游继承（Underworld 入口前已存在，CorruptionPass 全 pass 不写 1/57/59）——
//   上游洞穴/地狱域债，不在本门裁决范围。
//
// ★上游 WIP 敏感性：掷数与 A/W/L 都依赖 Corruption pass 入口世界态（拒绝采样环/
//   裂隙几何/祭坛落位）。上游 pass 并发修复期若入口态分叉，本门会红——先用
//   tests/shimmer-checkpoint 的「前缀·非本文件裁决」思路定位再动手，勿盲改 CorruptionPass。
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { GenProgress } from '../src/world/gen/GenProgress';
import { TILE_DEFS } from '../src/data/tiles';
import type { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200, SEED = '9293480';
// 与 x86 t2 rig 对拍定谳值（见头注；换 rig 重产时同步更新）
const EXPECT = {
  cor: { rolls: 5128077, act: 0x346f8c0b, wal: 0xadf86bf5, liq: 0x99eb6ea0 },
  crim: { rolls: 756506, act: 0xc8809903, wal: 0x82569b5c, liq: 0x99eb6ea0 },
} as const;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

function fnv32(bytes: Uint8Array): number {
  let h = 2166136261 >>> 0;
  for (let k = 0; k < bytes.length; k++) {
    h = (h ^ bytes[k]!) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

async function runFlavor(evil: 0 | 1): Promise<{ rolls: number; act: number; wal: number; liq: number }> {
  const g = globalThis as {
    __swOnRoll?: (v: number, inst: object) => void;
    __swCorSlotEnd?: (st: TileStore, gs: GenState) => void;
  };
  const prevRoll = g.__swOnRoll, prevEnd = g.__swCorSlotEnd;
  let rollCount = 0, slotRolls = -1;
  let digests = { act: -1, wal: -1, liq: -1 };
  const bp = GenProgress.prototype as unknown as { beginVan: (name: string) => void };
  const origBegin = bp.beginVan;
  try {
    g.__swOnRoll = () => { rollCount++; };
    g.__swCorSlotEnd = (st: TileStore) => {
      slotRolls = rollCount;   // pass 末（Lakes reseed 前）= 槽内掷数
      const n = st.w * st.h;
      const act = new Uint8Array(n), typ = new Uint16Array(n);
      for (let i = 0; i < n; i++) {
        act[i] = (st.flags[i]! & 1) ? 1 : 0;   // x86: t.active()?1:0
        typ[i] = SHEET[st.type[i]!] ?? 0;
      }
      digests = {
        act: fnv32(act),
        wal: fnv32(new Uint8Array(st.wall.buffer, st.wall.byteOffset, st.wall.byteLength)),
        liq: fnv32(new Uint8Array(st.liquid.buffer, st.liquid.byteOffset, st.liquid.byteLength)),
      };
      void typ;
    };
    bp.beginVan = function (_name: string) {
      if (_name === 'Corruption') rollCount = 0;   // 槽头清零（重播种子后首窗）
      origBegin.call(this, _name);
    };
    await generateWorld({ width: W, height: H, seedText: SEED, evil });
  } finally {
    bp.beginVan = origBegin;
    g.__swOnRoll = prevRoll;
    g.__swCorSlotEnd = prevEnd;
  }
  return { rolls: slotRolls, ...digests };
}

describe('Corruption 槽双 flavor 对拍门（x86 t2 rig 定谳）', () => {
  for (const [flavor, evil] of [['cor', 0], ['crim', 1]] as const) {
    it(`evil=${evil}（${flavor}）：槽内掷数 + 槽末 act/wal/liq 全等`, async () => {
      const r = await runFlavor(evil);
      const e = EXPECT[flavor];
      expect(r.rolls, `${flavor} 槽内掷数（x86 同窗口 R=${e.rolls + 1} 含尾诊断掷）`).toBe(e.rolls);
      expect(r.act.toString(16), `${flavor} act FNV`).toBe(e.act.toString(16));
      expect(r.wal.toString(16), `${flavor} wal FNV`).toBe(e.wal.toString(16));
      expect(r.liq.toString(16), `${flavor} liq FNV`).toBe(e.liq.toString(16));
    }, 600000);
  }
});
