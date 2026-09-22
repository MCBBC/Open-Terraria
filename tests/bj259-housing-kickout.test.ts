// ★BJ259（2026-09-22 用户实报「不能把 NPC 踢出房间」）守卫网：
//  效果面 = WorldGen.kickOut（WorldGen.cs:4791-4799）1:1——homeless=true（本仓
//      home=null 承接）+ lookForHomeTimeout=KickOutLookForHomeTimeout（NPC.cs:6556
//      =3600）+ TownManager.KickOut（本仓无房位面=无操作等价）;leashHome/kickedOut
//      为本仓侧标（leashHome=拴家标清零同 dropped 臂口径;kickedOut=① 轮再安置臂
//      豁免标,vanilla 无该臂故无对应面）。
//  消费面 = 近链迁入门（WorldGen.cs:5543 pickHomelessMover）+ 优先型锁扫描
//      （:72176 pickPrioritizedTownNPCType）的 lookForHomeTimeout==0 冷却门。
//  触发资格面 = DrawNPCHousesInWorld 旗可见过滤（Main.cs:41422-41424）——
//      old_man(37)/bound/dead/无家者不挂旗=不可踢（House.housingUiActive 右键旗臂,
//      Renderer.houseBannerNpcAt 命中与 drawHouseBanners 几何单源）。
import { describe, it, expect } from 'vitest';
import {
  pickPrioritizedTownNPCType, pickHomelessMover, houseBannerVisible,
  type PrioritizedLockNpcView, type NearChainNpcView,
} from '../src/world/Housing';
import { TownNPC } from '../src/entities/TownNPC';
import { Game } from '../src/core/Game';

const lockView = (
  npcId: number, homeless: boolean,
  opts?: { bound?: boolean; dead?: boolean; lookForHomeTimeout?: number },
): PrioritizedLockNpcView => ({
  npcId, homeless,
  bound: opts?.bound ?? false,
  dead: opts?.dead ?? false,
  lookForHomeTimeout: opts?.lookForHomeTimeout ?? 0,
});

describe('BJ259 效果面：Game.kickOutNPC（WorldGen.kickOut :4791-4799 1:1）', () => {
  it('踢出 → homeless(home=null) + lookForHomeTimeout=3600 + kickedOut + leashHome 清零', () => {
    const g = Object.create(Game.prototype) as Game;
    const n = new TownNPC('merchant', 100, 100);
    n.home = { x: 210, y: 60 };
    n.leashHome = true;
    n.homelessDespawn = false;
    g.kickOutNPC(n);
    expect(n.home).toBeNull();                 // homeless=true（本仓编码）
    expect(n.lookForHomeTimeout).toBe(3600);   // NPC.KickOutLookForHomeTimeout :6556
    expect(n.kickedOut).toBe(true);            // ① 轮臂豁免标（repo 侧）
    expect(n.leashHome).toBe(false);           // 拴家标清零（可自由游走）
    expect(n.homelessDespawn).toBe(false);     // kickOut 不触碰夜扫标（:4791-4799 无此写面）
  });

  it('被踢者即刻失旗（旗可见面过滤 = Main.cs:41422-41424）', () => {
    const n = new TownNPC('merchant', 100, 100);
    n.home = { x: 210, y: 60 };
    expect(houseBannerVisible(n)).toBe(true);
    n.home = null;
    expect(houseBannerVisible(n)).toBe(false);
  });
});

describe('BJ259 冷却门消费面（lookForHomeTimeout==0）', () => {
  it('优先型锁：冷却中者不持锁（:72176 字面）,到期恢复,无冷却者可越位', () => {
    expect(pickPrioritizedTownNPCType([lockView(17, true, { lookForHomeTimeout: 3600 })])).toBe(-1);
    expect(pickPrioritizedTownNPCType([lockView(17, true, { lookForHomeTimeout: 1 })])).toBe(-1);
    expect(pickPrioritizedTownNPCType([lockView(17, true, { lookForHomeTimeout: 0 })])).toBe(17);
    // 被踢者排队中,后位无冷却者先持锁
    expect(pickPrioritizedTownNPCType([
      lockView(17, true, { lookForHomeTimeout: 3600 }), lockView(20, true),
    ])).toBe(20);
  });

  it('近链迁入：冷却中者无资格（:5543 字面）,缺省字段=0 同形', () => {
    const v = (t?: number): NearChainNpcView<unknown> =>
      ({ key: 'merchant', npcId: 17, home: null, lookForHomeTimeout: t, ref: {} });
    expect(pickHomelessMover([v(3600)], 17)).toBeNull();
    expect(pickHomelessMover([v(1)], 17)).toBeNull();
    expect(pickHomelessMover([v(0)], 17)).not.toBeNull();
    // 冷却者不挡同型后位?——vanilla 门序逐位判,冷却者跳过后位同型者仍可迁
    const later = { key: 'merchant2', npcId: 17, home: null, lookForHomeTimeout: 0, ref: {} };
    expect(pickHomelessMover([v(3600), later], 17)).toBe(later);
    // 缺省 lookForHomeTimeout（undefined）按 0（NPC 字段缺省同形）
    expect(pickHomelessMover([{ key: 'merchant', npcId: 17, home: null, ref: {} }], 17)).not.toBeNull();
  });
});

describe('BJ259 触发资格面（不可踢型对照,Main.cs:41422-41424 过滤）', () => {
  it('old_man(37)/bound/dead/无家者不挂旗=不可踢;驻家城镇体可踢', () => {
    expect(houseBannerVisible({ home: { x: 1, y: 1 }, npcKey: 'merchant' })).toBe(true);
    expect(houseBannerVisible({ home: { x: 1, y: 1 }, npcKey: 'old_man' })).toBe(false);   // type 37 :41424
    expect(houseBannerVisible({ home: { x: 1, y: 1 }, npcKey: 'merchant', bound: true })).toBe(false);
    expect(houseBannerVisible({ home: { x: 1, y: 1 }, npcKey: 'merchant', dead: true })).toBe(false);
    expect(houseBannerVisible({ home: null, npcKey: 'merchant' })).toBe(false);
    expect(houseBannerVisible({})).toBe(false);
  });
});
