// ★BJ563（2026-10-09）MECH_ACC_VIDS 补齐 4346/5095/6190 + 「改其一必同步另一」不变式锁
//  （BJ583 登记债清偿：★F3/★F5③ 机械族三件只补了 INV_EFFECTIVE_VIDS,MECH_ACC_VIDS
//  ——虚空袋段键面的机械族全集——stale 在 8 员;本刀补齐对齐并上双向锁）。
//  定谳锚（Terarria1457 亲读）：
//   · RefreshMechanicalAccsFromItemType（Player.cs:12895-12937）分支表：
//     3619|3611→InfoAccMechShowWires(:12897-1300)/2216|3061|5126→autoPaint(:12909-12)/
//     3624→autoActuator(:12913-16)/4346→preventAllItemPickups(:12917-20)/
//     4767|5323→dontHurtCritters(:12921-24)/5095→hasLucyTheAxe(:12929-32)/
//     6190→oldStyleParkour(:12933-36)。三件身位（ID/ItemID.cs）：
//     4346=EncumberingStone(:10238)/5095=LucyTheAxe(:11736)/6190=OldStyleParkourBook(:13926)。
//   · 虚空袋重放面（UpdateEquips Player.cs:13027-13040）：bank4 逐格
//     `WorksInVoidBag[type2]` 门 → RefreshInfoAccsFromItemType+RefreshMechanicalAccsFromItemType;
//     WorksInVoidBag=Factory.CreateBoolSet(true, 4346, 5095)（ID/ItemID.cs:82,例外恰
//     4346/5095 二件=袋内【不】重放）。
//   · 两表职责：INV_EFFECTIVE_VIDS=背包 58 格段+虚空袋段键面（信息∪机械）⊇机械族段;
//     MECH_ACC_VIDS=机械族全集（虚空袋段第二析取支）——不变式：机械族成员集两表恒等。
//  判别力（旧 8 员表必红）：
//   §1 分支表行为钉（三件债钉+11 员全表钉+建模边界 5309/486/2799 零旗钉+信息族纯度钉）
//   §2 两表同步不变式（≡原版 11 员/INV∩机械分类==MECH/MECH⊆INV——任一表单边改→红）
//   §3 消费面结构钉（虚空袋段 WorksInVoidBag 门在前+双表析取在位,键面语义不漂移）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  refreshMechanicalAccsFromItemType, INV_EFFECTIVE_VIDS, MECH_ACC_VIDS,
} from '../src/entities/Player';

const HERE = dirname(fileURLToPath(import.meta.url));
const PSRC = readFileSync(join(HERE, '..', 'src/entities/Player.ts'), 'utf8');

type AccFlags = Parameters<typeof refreshMechanicalAccsFromItemType>[0];
const FLAG_KEYS = ['mechShowWires', 'autoActuator', 'autoPaint', 'dontHurtCritters',
  'preventAllItemPickups', 'hasLucyTheAxe', 'oldStyleParkour'] as const;
const freshFlags = (): AccFlags => ({
  mechShowWires: false,
  autoActuator: false,
  autoPaint: false,
  dontHurtCritters: false,
  preventAllItemPickups: false,
  hasLucyTheAxe: false,
  oldStyleParkour: false,
});
/** vid 在本仓机械建模面触发的旗集（空=不响应） */
const flippedFlags = (vid: number): string[] => {
  const f = freshFlags();
  refreshMechanicalAccsFromItemType(f, vid);
  return FLAG_KEYS.filter((k) => f[k]);
};

/** 原版机械族全表（RefreshMechanicalAccsFromItemType 分支表 1:1;旗名=本仓
 *  MechanicalAccFlags 域）——★BJ563 三件新补=4346/5095/6190 */
const VANILLA_MECH_TABLE: Array<[number, string[]]> = [
  [3619, ['mechShowWires']],          // MechanicalLens（ItemID.cs:8784）
  [3611, ['mechShowWires']],          // WireKite 宏伟蓝图（:8768）
  [3624, ['autoActuator']],           // Presserator 加压器
  [2216, ['autoPaint']],              // Paint Sprayer
  [3061, ['autoPaint']],              // Architect Gazetteer
  [5126, ['autoPaint']],              // Hand Of Creation
  [4767, ['dontHurtCritters']],       // Guide To Critter Companionship
  [5323, ['dontHurtCritters']],       // 双件套
  [4346, ['preventAllItemPickups']],  // EncumberingStone 拖累石（:10238/:12917-20）★BJ563 补
  [5095, ['hasLucyTheAxe']],          // LucyTheAxe（:11736/:12929-32）★BJ563 补
  [6190, ['oldStyleParkour']],        // OldStyleParkourBook 旧世界跑酷指南（:13926/:12933-36）★BJ563 补
];

// ================================================================
// §1 机械族分支表行为钉（Player.cs:12895-12937——任一分支改→红）
// ================================================================
describe('★BJ563 §1 机械族分支表行为钉（RefreshMechanicalAccsFromItemType）', () => {
  it('★债钉 4346 EncumberingStone → preventAllItemPickups（:12917-12920）且仅此一旗', () => {
    expect(flippedFlags(4346)).toEqual(['preventAllItemPickups']);
  });
  it('★债钉 5095 LucyTheAxe → hasLucyTheAxe（:12929-12932）且仅此一旗', () => {
    expect(flippedFlags(5095)).toEqual(['hasLucyTheAxe']);
  });
  it('★债钉 6190 OldStyleParkourBook → oldStyleParkour（:12933-12936）且仅此一旗', () => {
    expect(flippedFlags(6190)).toEqual(['oldStyleParkour']);
  });
  it('机械族 11 员全表逐 vid 期望旗（3619/3611/3624/2216/3061/5126/4767/5323+三件新补）', () => {
    for (const [vid, expected] of VANILLA_MECH_TABLE) {
      expect(flippedFlags(vid), `vid ${vid}`).toEqual([...expected].sort());
    }
  });
  it('建模边界钉：5309(dontHurtNature 无消费端不接)/486·2799(标尺线/格,FX36 域恒显) 零旗', () => {
    expect(flippedFlags(5309)).toEqual([]);
    expect(flippedFlags(486)).toEqual([]);
    expect(flippedFlags(2799)).toEqual([]);
  });
  it('信息族纯度钉：INV 信息族代表 vid 不触发任何机械旗（§2 机械分类器前提）', () => {
    for (const vid of [15, 707, 393, 3036, 3084, 3099, 3102, 3119, 3123, 5358, 5574, 5575, 5576]) {
      expect(flippedFlags(vid), `vid ${vid}`).toEqual([]);
    }
  });
});

// ================================================================
// §2 两表同步不变式（「改其一必同步另一」——任一表单边改→红）
// ================================================================
describe('★BJ563 §2 两表同步不变式（MECH_ACC_VIDS ↔ INV_EFFECTIVE_VIDS 机械族段）', () => {
  const VANILLA_MECH = new Set(VANILLA_MECH_TABLE.map(([v]) => v));

  it('① MECH_ACC_VIDS ≡ 原版机械族 11 员（BJ563 补齐后;任一单边删改→红）', () => {
    expect(MECH_ACC_VIDS.size).toBe(VANILLA_MECH.size);
    for (const v of VANILLA_MECH) expect(MECH_ACC_VIDS.has(v), `vid ${v}`).toBe(true);
  });
  it('② INV∩机械分类 == MECH_ACC_VIDS（INV 单边扩面=★F3/★F5③ 病灶方向→红）', () => {
    const invMech = [...INV_EFFECTIVE_VIDS].filter((v) => flippedFlags(v).length > 0);
    expect(new Set(invMech)).toEqual(MECH_ACC_VIDS);
  });
  it('③ MECH_ACC_VIDS ⊆ INV_EFFECTIVE_VIDS（机械族必在背包生效域内;MECH 单边扩面→红）', () => {
    for (const v of MECH_ACC_VIDS) expect(INV_EFFECTIVE_VIDS.has(v), `vid ${v}`).toBe(true);
  });
});

// ================================================================
// §3 消费面结构钉（equipStatsKey 虚空袋段语义不漂移——锁的前提面）
// ================================================================
describe('★BJ563 §3 消费面结构钉（equipStatsKey 虚空袋段,Player.ts 单点）', () => {
  it('虚空袋段：WORKS_IN_VOID_BAG_FALSE 例外门在前,双表析取在后（消费面在位）', () => {
    expect(PSRC).toContain('!WORKS_IN_VOID_BAG_FALSE.has(vid)');
    expect(PSRC).toContain('(INV_EFFECTIVE_VIDS.has(vid) || MECH_ACC_VIDS.has(vid))');
  });
  it('WORKS_IN_VOID_BAG_FALSE 例外=恰 4346/5095 二件（ItemID.cs:82 字面;MECH 收此二件不扩重放面）', () => {
    expect(PSRC).toContain('const WORKS_IN_VOID_BAG_FALSE = new Set<number>([4346, 5095]);');
  });
  it('MECH_ACC_VIDS 字面钉（11 员定序;bj583 §5④ 同钉互证）', () => {
    expect(PSRC).toContain('export const MECH_ACC_VIDS = new Set<number>([3619, 3611, 3624, 2216, 3061, 5126, 4767, 5323, 4346, 5095, 6190]);');
  });
});
