// ★SW-BO1 2026-09-07（SW-BL1 P1/P2 清偿守卫）：模特姿态数据面
//  P2 ChangePose 循环（TEDisplayDoll.cs:918-923 + IsValidPose :135-153 +
//  SupportedUseStylePoses :53-89）——dollNextPose 纯函数直驱。
//  P1 pose 持久化——furnitureToSave/FromSave 往返 + WldExport→WldParser 导出回环
//  （含旧实现缺陷回归锁：导出模特三元组必须按位图门控写,否则读侧失步）。
import { describe, it, expect } from 'vitest';
import { parseWld, type WldTileEntity } from '../src/wld/WldParser';
import {
  dollNextPose, furnitureToSave, furnitureFromSave, furnitureSlotCount,
  type FurnitureItemRecord,
} from '../src/world/FurnitureItems';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_STABLE_OF_INTERNAL } from '../src/data/items';
import { exportWld } from '../src/wld/WldExport';

const iid = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]];
// 存档稳定 id（serialize 透传域）——往返测试注入 mapId 用（Uint16Array 索引域）
const STABLE = (id: number): number => ITEM_STABLE_OF_INTERNAL[id] || 0;

/** 构造 19 槽模特记录：fills = [槽位, vid][]（IsValidPose 只读 slots[9]=_misc[0] 持握槽） */
const doll = (fills: Array<[number, number]>, pose?: number): FurnitureItemRecord => {
  const slots: FurnitureItemRecord['slots'] = new Array(furnitureSlotCount('display_doll')).fill(null);
  for (const [slot, vid] of fills) slots[slot] = { id: iid(vid), stack: 1 };
  return { x: 10, y: 10, kind: 'display_doll', slots, ...(pose !== undefined ? { pose } : {}) };
};
const HELD: Array<[number, number]> = [[9, 4]];   // 持握槽 9 = 铁短剑 4（useStyle 1）

describe('SW-BO1 P2：ChangePose 循环（TEDisplayDoll.cs:918-923 + IsValidPose :135-153）', () => {
  it('0..3（Standing/Sitting/Jumping/Walking）恒合法逐拍 +1（(uint)testedPose<=3u）', () => {
    expect(dollNextPose(doll([], 0))).toBe(1);
    expect(dollNextPose(doll([], 1))).toBe(2);
    expect(dollNextPose(doll([], 2))).toBe(3);
  });

  it('空持握槽：pose3 → 4 非法回 0（misc[0] 空 → SupportedUseStylePoses 查无）', () => {
    expect(dollNextPose(doll([], 3))).toBe(0);
    expect(dollNextPose(doll([]))).toBe(1);   // 未入库缺省 0 起步
  });

  it('useStyle 1（剑族,注册 Use1-Use5 :56-60）：3→4→5→6→7→8→回 0 全循环', () => {
    const sword = doll(HELD, 3);   // 持握槽=4 铁短剑 useStyle 1（vanilla-itemfunc 实测）
    const seq: number[] = [];
    let rec = sword;
    for (let i = 0; i < 7; i++) {
      const next = dollNextPose(rec);
      seq.push(next);
      rec = { ...rec, pose: next };
    }
    expect(seq).toEqual([4, 5, 6, 7, 8, 0, 1]);   // 8(Use5)→9 非法回 0→1
  });

  it('useStyle 5（弓族,注册 Use1-5 :62-66）：3→4→…→8→回 0', () => {
    // 796 肌腱弓 useStyle 5（vanilla-itemfunc 实测）——注册表 5=Use1-5 全档
    let rec = doll([[9, 796]], 3);
    const seq: number[] = [];
    for (let i = 0; i < 7; i++) {
      const next = dollNextPose(rec);
      seq.push(next);
      rec = { ...rec, pose: next };
    }
    expect(seq).toEqual([4, 5, 6, 7, 8, 0, 1]);
  });

  it('useStyle 9（召唤杖族,单 Use1 :70）：3→4→回 0（5 不在列表）', () => {
    // 28 火之巨杖 useStyle 9（vanilla-itemfunc 实测）
    expect(dollNextPose(doll([[9, 28]], 3))).toBe(4);
    expect(dollNextPose(doll([[9, 28]], 4))).toBe(0);
  });
});

describe('SW-BO1 P1：pose 持久化往返', () => {
  it('furnitureToSave/FromSave：pose 随档（undefined 旧档同形）', () => {
    const recs: FurnitureItemRecord[] = [
      doll([[9, 4]], 6),
      { x: 1, y: 1, kind: 'item_frame', slots: new Array(furnitureSlotCount('item_frame')).fill(null) },
    ];
    const saved = furnitureToSave(recs, (id) => id);
    expect(saved[0].pose).toBe(6);
    expect(saved[1].pose).toBeUndefined();
    const back = furnitureFromSave(saved, (id) => id);
    expect(back[0].pose).toBe(6);
    expect(back[0].slots[9]).toEqual({ id: iid(4), stack: 1 });   // 持握槽=9
    expect(back[1].pose).toBeUndefined();
  });

  it('WldExport→WldParser 回环：pose/位图门控三元组逐位还原（SW-BL1 P1 验收）', () => {
    const W = 40, H = 30;
    const type = new Uint16Array(W * H);
    const frameX = new Uint16Array(W * H), frameY = new Uint16Array(W * H);
    const wall = new Uint16Array(W * H), liquid = new Uint16Array(W * H);
    const liquidType = new Uint16Array(W * H), wire = new Uint16Array(W * H);
    const half = new Uint8Array(W * H), slope = new Uint8Array(W * H);
    const paint = new Uint8Array(W * H), paintWall = new Uint8Array(W * H);
    const coat = new Uint8Array(W * H);
    for (let y = 20; y < H; y++) type[y * W + 0] = 1;   // 泥地
    const save = {
      format: 'sandboxworld.save', version: 5,
      header: { name: 'pose-rt', seedText: '1', worldId: 1, gameMode: 0, isCrimson: false,
        moonType: 0, moonPhase: 0, bgStyles: {} },
      tiles: { w: W, h: H, type, frameX, frameY, wall, liquid, liquidType, wire, half, slope, paint, paintWall, coat },
      chests: [], npcs: [],
      furniture: [{
        x: 2, y: 2, kind: 'display_doll' as const, pose: 7,
        slots: [
          { id: STABLE(iid(37)), stack: 1 },        // equip0 头盔
          null, null, null, null, null, null,
          null,
          { id: STABLE(iid(756)), stack: 1 },       // equip8 坐骑槽（位图3 bit1 面）
          { id: STABLE(iid(4)), stack: 1 },         // misc 持握（位图3 bit0）
          { id: STABLE(iid(1114)), stack: 1 },      // dye0
          null, null, null, null, null, null,
          null,
          { id: STABLE(iid(1114)), stack: 1 },      // dye8（位图3 bit2 面）
        ],
      }],
      flags: {},
    };
    const bytes = exportWld(save as unknown as Parameters<typeof exportWld>[0]);
    const parsed = parseWld(bytes);
    const te = parsed.tileEntities.find((t: WldTileEntity) => t.type === 3) as WldTileEntity;
    expect(te).toBeDefined();
    expect(te.doll!.pose).toBe(7);                       // ★旧实现恒 0 的回写真值面
    expect(te.doll!.equip[0]!.vid).toBe(37);
    expect(te.doll!.equip[8]!.vid).toBe(756);            // 位图3 bit1 门控槽
    expect(te.doll!.misc!.vid).toBe(4);                  // 位图3 bit0
    expect(te.doll!.dyes[0]!.vid).toBe(1114);
    expect(te.doll!.dyes[8]!.vid).toBe(1114);            // 位图3 bit2（旧 dy 偏移把 misc 当 dye0）
    // 流对齐回归锁：模特 TE 之后无滞留字节 → 段计数精确 1（旧实现无条件全写 20+ 三元组,
    // 读侧按位图只消费 4 个 → 段尾字节残留/后续 TE 错位）
    expect(parsed.tileEntities.length).toBe(1);
    expect(parsed.teSkipped).toBe(0);
  });
});
