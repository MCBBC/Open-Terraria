// ★BJ660 件1（2026-10-12）导入档 bank 储蓄链崩溃锁（BJ659 真机复核揭出）。
// 定谳：
//  · 症状：导入世界后 UI 刷新链（layoutVanilla/paintVanillaInvSlots）每帧抛
//    「Cannot read properties of undefined (reading 'length')」，栈锚
//    coinSavingsByBank——用户导入档必现。
//  · 原版存档语义（定谳锚）：bank/bank2/bank3/bank4 四桶随 .plr 角色档携行
//    （Player.cs:1468-1474 Chest.CreateBank(-2..-5)）,【.wld 本体无 bank 数据】——
//    导入档的 bank 桶应初始化为空桶,而非缺字段。
//  · 病灶两面：①导入链 save.player 不携 banks 字段（WldImport player 形不完整）
//    ②储蓄数据口 Game.coinSavingsByBank 对 pools 本体无兜底（layoutVanilla
//    UI.ts:9131 每帧经此取储蓄行签名,缺桶玩家态=每帧抛）。
// 判别锁：
//  §1 导入链形补字段：golden .wld 全量解析 → save.player.banks = 4×40 空桶
//     （缺字段=红,变异 M2 锚）。
//  §2 数据口兜底：Game.prototype.coinSavingsByBank 窄视图（全仓 0 处 new Game(),
//     BJ607 判例）——banks 缺失/桶残缺/带币三态（缺 banks 红=变异 M1 锚;带币=分桶
//     归账判别）。
//  §3 储蓄面板数据面：coinSavingsCopper/coinSavingsSplit 同窄视图——面板渲染取数口
//     shape 锁（layoutVanilla 签名位/储蓄行/四银行图标门同源）。
// E2E：真机链（scripts/_bj660-import-crash.mjs,5202 私有实例+用户 .wld 全 UI 流）
//     已证零错误+储蓄面板渲染+banks 4×40——本文件钉形防回潮。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWldToSave } from '../src/wld/WldImport';
import { Game } from '../src/core/Game';
import { coinIndexOf } from '../src/items/Inventory';
import { ITEM_DEFS } from '../src/data/items';

const GOLDEN_WLD = join(__dirname, 'golden', 'wld', '12345世界.wld');

// 全仓 0 处 new Game()——prototype 方法窄视图 .call（bj467 §4/bj641 同式）
type Savings = (this: unknown) => [number, number, number, number];
type CopperFn = (this: unknown) => number;
const savingsByBank = Game.prototype.coinSavingsByBank as unknown as Savings;
const savingsCopper = Game.prototype.coinSavingsCopper as unknown as CopperFn;
const savingsSplit = Game.prototype.coinSavingsSplit as unknown as Savings;
const rig = (banks: unknown): unknown => ({
  player: { banks },
  coinSavingsByBank: savingsByBank,   // copper/split 内部 this. 委托同实现（真实链同相）
  coinSavingsCopper: savingsCopper,   // split 内部 this.coinSavingsCopper() 同理
});

describe('BJ660 件1 §1：导入链 bank 桶形（.wld 无 bank 数据=显式空桶）', () => {
  it('golden .wld 全量解析：save.player.banks = 4×40 全空桶（缺字段=红）', () => {
    const buf = readFileSync(GOLDEN_WLD);
    const { save } = parseWldToSave(new Uint8Array(buf));
    const banks = (save.player as { banks?: unknown[][] }).banks;
    expect(Array.isArray(banks), 'save.player.banks 缺失=导入链形回潮（M2 锚）').toBe(true);
    expect(banks!.length).toBe(4);                       // 存钱罐/保险箱/熔炉/虚空库
    for (const bucket of banks!) {
      expect(bucket.length).toBe(40);                    // Chest.CreateBank 40 槽
      expect(bucket.every((s) => s === null)).toBe(true); // .wld 无 bank 数据=全空
    }
  });
});

describe('BJ660 件1 §2：coinSavingsByBank 数据口兜底（layoutVanilla 每帧消费位）', () => {
  it('banks 缺失（undefined）：[0,0,0,0] 零抛（旧「reading length」必红=M1 锚）', () => {
    expect(savingsByBank.call(rig(undefined))).toEqual([0, 0, 0, 0]);
  });
  it('桶残缺（null 桶/短桶）：零抛零账（pools[b] ?? [] 双防保持）', () => {
    expect(savingsByBank.call(rig([null, null]))).toEqual([0, 0, 0, 0]);
    expect(savingsByBank.call(rig([Array(40).fill(null)]))).toEqual([0, 0, 0, 0]);
  });
  it('带币分桶归账：bank2(banks[1]) 银×3 → out[1]=300、余桶 0（shape [n,n,n,n]）', () => {
    let silverId = -1;
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      if (ITEM_DEFS[i] && coinIndexOf(i) === 1) { silverId = i; break; }   // 银（×100）
    }
    expect(silverId).toBeGreaterThanOrEqual(0);
    const banks = [Array(40).fill(null), Array(40).fill(null), Array(40).fill(null), Array(40).fill(null)];
    banks[1][5] = { id: silverId, stack: 3 };
    expect(savingsByBank.call(rig(banks))).toEqual([0, 300, 0, 0]);
  });
});

describe('BJ660 件1 §3：储蓄面板数据面（coinSavingsCopper/Split 取数口 shape）', () => {
  it('空桶：copper=0、split [0,0,0,0]（导入档储蓄行不画,布局签名 savBanks 全 0）', () => {
    const empty = [Array(40).fill(null), Array(40).fill(null), Array(40).fill(null), Array(40).fill(null)];
    expect(savingsCopper.call(rig(empty))).toBe(0);
    expect(savingsSplit.call(rig(empty))).toEqual([0, 0, 0, 0]);
    expect(savingsCopper.call(rig(undefined))).toBe(0);   // 缺桶态同零抛（UI 链同源）
  });
  it('银×3（§2 同桶）：copper=300、split [0,3,0,0]（铜/银/金/铂档序）', () => {
    let silverId = -1;
    for (let i = 0; i < ITEM_DEFS.length; i++) {
      if (ITEM_DEFS[i] && coinIndexOf(i) === 1) { silverId = i; break; }
    }
    const banks = [Array(40).fill(null), Array(40).fill(null), Array(40).fill(null), Array(40).fill(null)];
    banks[1][5] = { id: silverId, stack: 3 };
    expect(savingsCopper.call(rig(banks))).toBe(300);
    expect(savingsSplit.call(rig(banks))).toEqual([0, 3, 0, 0]);
  });
});
