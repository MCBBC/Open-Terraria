// ============================================================================
// M9 旅程力量 + 研究进度联机同步测试（msg82 module5/6/9）
// 标杆：Terarria1456
//   Terraria.GameContent.NetModules/NetCreativePowersModule.cs（{powerId, 子消息}）
//   Terraria.GameContent.NetModules/NetCreativePowerPermissionsModule.cs（S→C 专向）
//   Terraria.GameContent.NetModules/NetCreativeUnlocksPlayerReportModule.cs
//     （C→S {userId, itemId, amount} → Broadcast 除发送者 → 同队门入账）
//   CreativePowerManager.cs（15 力量注册序/权限级 + SyncThingsToJoiningPlayer :167-181）
//   CreativePowersHelper.IsAvailableForPlayer（:182-197 权限门）
// 覆盖：编解码字节级往返 / 帧头（msg82+moduleId 5·6·9）/ ClientNet 收包分发与
//   权限缓存 / Room 权威态（世界态·个人态·拒绝纠正）/ 权限门（默认全员→房主→锁定）/
//   进房全量同步 / 研究上报中继（slot 回填+排除发送者）/ 快照应用（雨分支）。
// 全程 mock 传输层（NetWriter/NetReader 字节流直连 + 假 ws，同 leashed-net-sync 先例）。
// ============================================================================
import { describe, it, expect } from 'vitest';
import { NetWriter, NetReader, Msg, NetModule } from '../src/net/protocol';
import {
  writeJourneyWorldState, readJourneyWorldState,
  writeJourneyPersonalState, readJourneyPersonalState,
  writeJourneyTimeSkip, readJourneyTimeSkip,
  writeJourneyUnlockReport, writeJourneyUnlockRelay, readJourneyUnlockRelay,
  writeJourneyPermission, readJourneyPermission,
  isPowerAvailableFor, snapshotJourneyWorld, applyJourneyWorldState,
  PowerPermissionLevel, JOURNEY_POWER_COUNT,
  type JourneyWorldState,
} from '../src/net/journeySync';
import { ClientNet } from '../src/net/ClientNet';
import { World } from '../src/world/World';
import { createJourneyPowers } from '../src/world/JourneyPowers';

// ---------------------------------------------------------------------------
// 测试环境
// ---------------------------------------------------------------------------

/** 帧头：[u16 len][u8 msgId=82][u16 moduleId]（NetModules 信封） */
function openModule(frame: Uint8Array, moduleId: number): NetReader {
  const len = frame[0] | (frame[1] << 8);
  expect(len).toBe(frame.length);
  const r = new NetReader(frame.subarray(3));
  expect(r.u16()).toBe(moduleId);
  return r;
}

const WORLD0: JourneyWorldState = {
  freezeTime: false, timeRate: 1, freezeRain: false, freezeWind: false,
  stopBiomeSpread: false, difficultySlider: 0, windTarget: 0, cloudAlpha: 0,
};

describe('编解码（journeySync 字节级往返）', () => {
  it('module5 sub0 世界态：帧头 + 逐字段往返', () => {
    const s: JourneyWorldState = {
      freezeTime: true, timeRate: 24, freezeRain: true, freezeWind: false,
      stopBiomeSpread: true, difficultySlider: 0.66, windTarget: -0.8, cloudAlpha: 0.5,
    };
    const frame = writeJourneyWorldState(s);
    const r = openModule(frame, NetModule.CreativePowers);
    expect(r.u8()).toBe(0);                       // sub0
    const back = readJourneyWorldState(r);
    expect(back.freezeTime).toBe(s.freezeTime);
    expect(back.timeRate).toBe(s.timeRate);
    expect(back.freezeRain).toBe(s.freezeRain);
    expect(back.freezeWind).toBe(s.freezeWind);
    expect(back.stopBiomeSpread).toBe(s.stopBiomeSpread);
    expect(back.difficultySlider).toBeCloseTo(s.difficultySlider, 6);   // f32 量化
    expect(back.windTarget).toBeCloseTo(s.windTarget, 6);
    expect(back.cloudAlpha).toBeCloseTo(s.cloudAlpha, 6);
    expect(r.remaining).toBe(0);                  // 无残字节
  });

  it('module5 sub1 个人态：slot + flags + f32 往返', () => {
    const frame = writeJourneyPersonalState(7, {
      godmode: true, farPlacementRange: false, spawnRateSlider: 0.75,
    });
    const r = openModule(frame, NetModule.CreativePowers);
    expect(r.u8()).toBe(1);
    expect(readJourneyPersonalState(r)).toEqual({
      slot: 7, state: { godmode: true, farPlacementRange: false, spawnRateSlider: 0.75 },
    });
  });

  it('module5 sub2 时段跳跃 1-4 往返；非法值归 0（丢弃语义）', () => {
    for (const w of [1, 2, 3, 4] as const) {
      const r = openModule(writeJourneyTimeSkip(w), NetModule.CreativePowers);
      expect(r.u8()).toBe(2);
      expect(readJourneyTimeSkip(r)).toBe(w);
    }
    expect(readJourneyTimeSkip(new NetReader(Uint8Array.of(9)))).toBe(0 as never);
    expect(readJourneyTimeSkip(new NetReader(Uint8Array.of(0)))).toBe(0 as never);
  });

  it('module6 上报/中继：C→S 无 slot；S→C slot 回填在前（原版 userId 首字节序）', () => {
    const up = writeJourneyUnlockReport(292, 3);
    const r1 = openModule(up, NetModule.CreativeUnlocksReport);
    expect(r1.u16()).toBe(292);
    expect(r1.u16()).toBe(3);
    const relay = writeJourneyUnlockRelay(5, 292, 3);
    const r2 = openModule(relay, NetModule.CreativeUnlocksReport);
    expect(readJourneyUnlockRelay(r2)).toEqual({ slot: 5, itemId: 292, amount: 3 });
  });

  it('module9 权限：{byte 0, u16 powerId, byte level} + 越界钳 2', () => {
    for (const lv of [0, 1, 2] as const) {
      const r = openModule(writeJourneyPermission(12, lv), NetModule.CreativePowerPermissions);
      expect(readJourneyPermission(r)).toEqual({ powerId: 12, level: lv });
    }
    // 非 0 sub → 丢弃（powerId -1）
    const bad = new NetWriter(Msg.NetModules);
    bad.u16(NetModule.CreativePowerPermissions); bad.u8(1); bad.u16(0); bad.u8(2);
    const r = new NetReader(bad.finish().subarray(5));
    expect(readJourneyPermission(r).powerId).toBe(-1);
  });

  it('module id 对齐原版 NetworkInitializer.cs 注册序（CreativePowers=5/Unlocks=6/Permissions=9）', () => {
    expect(NetModule.CreativePowers).toBe(5);
    expect(NetModule.CreativeUnlocksReport).toBe(6);
    expect(NetModule.CreativePowerPermissions).toBe(9);
    expect(JOURNEY_POWER_COUNT).toBe(15);         // CreativePowerManager.Initialize :90-104
  });
});

describe('IsAvailableForPlayer（CreativePowersHelper :182-197）', () => {
  it('LockedForEveryone（0）= 全员拒（含房主——原版 default 分支无 host 豁免）', () => {
    expect(isPowerAvailableFor(PowerPermissionLevel.LockedForEveryone, true)).toBe(false);
    expect(isPowerAvailableFor(PowerPermissionLevel.LockedForEveryone, false)).toBe(false);
  });
  it('CanBeChangedByHostAlone（1）= host 放行 / 访客拒', () => {
    expect(isPowerAvailableFor(PowerPermissionLevel.CanBeChangedByHostAlone, true)).toBe(true);
    expect(isPowerAvailableFor(PowerPermissionLevel.CanBeChangedByHostAlone, false)).toBe(false);
  });
  it('CanBeChangedByEveryone（2，默认）= 全员放行', () => {
    expect(isPowerAvailableFor(PowerPermissionLevel.CanBeChangedByEveryone, true)).toBe(true);
    expect(isPowerAvailableFor(PowerPermissionLevel.CanBeChangedByEveryone, false)).toBe(true);
  });
});

describe('快照应用（applyJourneyWorldState）', () => {
  it('幂等覆写 + 雨分支（:1327-1337 slider>0 → StartRain / ==0 → StopRain）', () => {
    const w = new World(64, 32, 42, 'jm-test');
    w.difficulty = 3;
    w.journeyPowers = createJourneyPowers();
    applyJourneyWorldState(w, {
      ...WORLD0, freezeTime: true, timeRate: 12, difficultySlider: 0.33,
      windTarget: 0.5, cloudAlpha: 0.8,
    });
    expect(w.journeyFreezeTime).toBe(true);
    expect(w.journeyTimeRate).toBe(12);
    expect(w.journeyPowers.difficultySlider).toBeCloseTo(0.33, 6);
    expect(w.weather.windSpeedTarget).toBeCloseTo(0.5, 6);
    expect(w.weather.windSpeedCurrent).toBeCloseTo(0.5, 6);
    expect(w.weather.raining).toBe(true);
    expect(w.weather.cloudAlpha).toBeCloseTo(0.8, 6);
    expect(snapshotJourneyWorld(w).cloudAlpha).toBeCloseTo(0.8, 6);
    // 晴天分支
    applyJourneyWorldState(w, { ...WORLD0 });
    expect(w.weather.raining).toBe(false);
    expect(w.weather.cloudAlpha).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ClientNet 收包分发（module5/6/9 → hooks；Room 服务器侧逻辑同构自 journeySync
// 编解码 + 权限门纯函数，经下方 RoomHarness 直测——server 目录 tsconfig 独立
// （无 DOM lib），vitest 不跨根跑，Room 类以相对路径导入 TS 源直测）
// ---------------------------------------------------------------------------

describe('ClientNet 收包分发（module5/6/9 → hooks）', () => {
  function mkNet() {
    const got: string[] = [];
    const net = new ClientNet(
      { player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never,
      {
        onWorldReady: () => { /* 不触发 */ },
        onJourneyWorldState: (s: JourneyWorldState) => got.push(`world:${s.timeRate}:${s.freezeTime}`),
        onJourneyPersonalState: (slot: number, s: { godmode: boolean }) => got.push(`personal:${slot}:${s.godmode}`),
        onJourneyTimeSkip: (w: number) => got.push(`skip:${w}`),
        onJourneyUnlock: (slot: number, itemId: number, amount: number) => got.push(`unlock:${slot}:${itemId}:${amount}`),
        onJourneyPermission: (pid: number, lv: number) => got.push(`perm:${pid}:${lv}`),
      },
    );
    net.mySlot = 0;
    const feed = (frame: Uint8Array): void => {
      (net as unknown as { handle(msgId: number, r: NetReader): void })
        .handle(Msg.NetModules, new NetReader(frame.subarray(3)));
    };
    return { net, got, feed };
  }

  it('module9 → journeyPermissions 缓存 + onJourneyPermission 回调 + 门禁查询', () => {
    const { net, got, feed } = mkNet();
    feed(writeJourneyPermission(12, PowerPermissionLevel.CanBeChangedByHostAlone));
    expect(net.journeyPermissions[12]).toBe(PowerPermissionLevel.CanBeChangedByHostAlone);
    expect(got).toEqual(['perm:12:1']);
    // 门禁查询（默认 isHost=false）：Everyone(默认) 放行 / HostAlone 拒
    expect(net.journeyPowerAvailable(0)).toBe(true);
    expect(net.journeyPowerAvailable(12)).toBe(false);
    // 房主身份放行（countsAsHostForGameplay）
    net.policy = { ...net.policy, isHost: true };
    expect(net.journeyPowerAvailable(12)).toBe(true);
  });

  it('module5 sub0/sub1/sub2 → 三类 hooks', () => {
    const { net, got, feed } = mkNet();
    feed(writeJourneyWorldState({ ...WORLD0, timeRate: 12, freezeTime: true }));
    feed(writeJourneyPersonalState(3, { godmode: true, farPlacementRange: true, spawnRateSlider: 0.5 }));
    feed(writeJourneyTimeSkip(4));
    expect(got).toEqual(['world:12:true', 'personal:3:true', 'skip:4']);
  });

  it('module6 中继 → onJourneyUnlock（同队门在 Game 侧，此层不判）', () => {
    const { net, got, feed } = mkNet();
    feed(writeJourneyUnlockRelay(6, 292, 2));
    expect(got).toEqual(['unlock:6:292:2']);
  });
});

describe('研究进度上报（CreativeUI.SacrificeItem :308 语义）', () => {
  it('Research.sacrifice 跨线 → newly 集合（_newlyUnlocked :134-141）+ 清除（:104-108）', async () => {
    const { Research } = await import('../src/stats/Research');
    const r = new Research(undefined, { count: 10, need: { '292': 3 }, override: {} });
    expect(r.sacrifice(292, 2)).toBe(false);      // 未跨线
    expect(r.isNewlyResearched(292)).toBe(false);
    expect(r.sacrifice(292, 1)).toBe(true);       // 跨线 → newly
    expect(r.isNewlyResearched(292)).toBe(true);
    r.clearNewlyResearchedStatus(292);            // 浏览器悬停/取用消高亮
    expect(r.isNewlyResearched(292)).toBe(false);
    // resolvedIdsWithProgress = ForEachItemWithResearchProgress（:48-57）
    expect(r.resolvedIdsWithProgress()).toEqual([292]);
  });
});

// ---------------------------------------------------------------------------
// Room 服务器权威态（server/src/room.ts 直载——ws 经 server/node_modules 解析；
// 假 ws 收帧采集，同 mock 传输层纪律）
// ---------------------------------------------------------------------------

/** 假 ws：send 采集帧（readyState=1=OPEN），无背压 */
function fakeWs() {
  const sent: Uint8Array[] = [];
  const ws = {
    sent,
    readyState: 1,                    // WebSocket.OPEN
    bufferedAmount: 0,
    send: (data: ArrayBuffer | Uint8Array) => { sent.push(new Uint8Array(data as ArrayBuffer)); },
    close: () => { ws.readyState = 3; },
    onopen: null, onmessage: null, onclose: null, onerror: null,
  };
  return ws;
}

/** 帧流解析出 (msgId, payload) 列表（drain 语义简化——按 len 切帧） */
function parseFrames(frames: Uint8Array[]): Array<{ msgId: number; payload: NetReader }> {
  const out: Array<{ msgId: number; payload: NetReader }> = [];
  for (const f of frames) {
    let p = 0;
    while (p + 3 <= f.length) {
      const len = f[p] | (f[p + 1] << 8);
      out.push({ msgId: f[p + 2], payload: new NetReader(f.subarray(p + 3, p + len)) });
      p += len;
    }
  }
  return out;
}

describe('Room 旅程力量权威态（msg82 module5/6/9）', () => {
  interface JourneyRelayEvent { kind: string; slot?: number; which?: number; state?: unknown }

  async function mkRoom() {
    const { Room } = await import('../../server/src/room');
    const world = new World(64, 32, 42, 'jm-room');
    world.difficulty = 3;                       // isJourney
    const room = new Room(world);
    const host = room.newClient(fakeWs() as never);
    host.slot = 0; host.state = 10; host.isHost = true;
    const guest = room.newClient(fakeWs() as never);
    guest.slot = 1; guest.state = 10;
    room.clients.add(host); room.clients.add(guest);
    const feed = (c: typeof host, frame: Uint8Array) => {
      (room as unknown as { handle(c: unknown, msgId: number, r: NetReader): void })
        .handle(c, Msg.NetModules, new NetReader(frame.subarray(3)));
      // P1.3 合包：send 只入 outbox，ws.send 由 flushOutbox 冲洗
      (room as unknown as { flushOutbox(): void }).flushOutbox();
    };
    /** 单客户端收到的旅程事件流 */
    const eventsOf = (c: typeof host): JourneyRelayEvent[] => {
      const out: JourneyRelayEvent[] = [];
      for (const { msgId, payload } of parseFrames((c.ws as unknown as { sent: Uint8Array[] }).sent)) {
        if (msgId !== Msg.NetModules) continue;
        const mid = payload.u16();
        if (mid === NetModule.CreativePowers) {
          const sub = payload.u8();
          if (sub === 0) out.push({ kind: 'world', state: readJourneyWorldState(payload) });
          else if (sub === 1) {
            const m = readJourneyPersonalState(payload);
            out.push({ kind: 'personal', slot: m.slot, state: m.state });
          } else if (sub === 2) out.push({ kind: 'skip', which: readJourneyTimeSkip(payload) });
        } else if (mid === NetModule.CreativeUnlocksReport) {
          out.push({ kind: 'unlock', ...readJourneyUnlockRelay(payload) });
        } else if (mid === NetModule.CreativePowerPermissions) {
          out.push({ kind: 'perm', ...readJourneyPermission(payload) });
        }
      }
      return out;
    };
    return { room, host, guest, feed, eventsOf };
  }

  it('世界态：房主改冻结时间 → 权威态更新 + 广播他人（排除发送者）', async () => {
    const { room, host, guest, feed, eventsOf } = await mkRoom();
    feed(host, writeJourneyWorldState({ ...WORLD0, freezeTime: true, timeRate: 12 }));
    expect(room.journeyWorld?.freezeTime).toBe(true);
    expect(room.journeyWorld?.timeRate).toBe(12);
    // 世界镜像（--world 持久化面）
    expect(room.world.journeyFreezeTime).toBe(true);
    expect(room.world.journeyTimeRate).toBe(12);
    expect(eventsOf(guest)).toEqual([{ kind: 'world', state: { ...WORLD0, freezeTime: true, timeRate: 12 } }]);
    expect(eventsOf(host)).toEqual([]);         // 发送者本地已生效，不回环
  });

  it('默认权限（Everyone）：访客改难度滑杆 → 受理', async () => {
    const { room, guest, feed, eventsOf } = await mkRoom();
    feed(guest, writeJourneyWorldState({ ...WORLD0, difficultySlider: 0.66 }));
    expect(room.journeyWorld?.difficultySlider).toBeCloseTo(0.66, 6);
    expect(eventsOf(guest).length).toBe(0);     // 无纠正帧 = 受理
  });

  it('权限门：房主置 power12=HostAlone 后访客改难度 → 拒 + 权威态纠正回发', async () => {
    const { room, host, guest, feed, eventsOf } = await mkRoom();
    // 基线：访客先合法置 0.33
    feed(guest, writeJourneyWorldState({ ...WORLD0, difficultySlider: 0.33 }));
    expect(room.journeyWorld?.difficultySlider).toBeCloseTo(0.33, 6);
    // 房主锁 power12（module9 C→S：isHost 通道）
    feed(host, writeJourneyPermission(12, PowerPermissionLevel.CanBeChangedByHostAlone));
    expect(room.journeyPermissions[12]).toBe(PowerPermissionLevel.CanBeChangedByHostAlone);
    // 访客再改 → 整包拒 + 纠正回发 0.33 快照
    feed(guest, writeJourneyWorldState({ ...WORLD0, difficultySlider: 0.9 }));
    expect(room.journeyWorld?.difficultySlider).toBeCloseTo(0.33, 6);
    const ev = eventsOf(guest);
    // guest 收到：权限广播（module9 全员下发）+ 拒绝纠正（0.33 权威快照）
    expect(ev[0]).toEqual({ kind: 'perm', powerId: 12, level: 1 });
    expect(ev[1].kind).toBe('world');
    expect((ev[1].state as JourneyWorldState).difficultySlider).toBeCloseTo(0.33, 6);
    expect(ev.length).toBe(2);
    // 房主自己仍可改（HostAlone 放行）
    feed(host, writeJourneyWorldState({ ...WORLD0, difficultySlider: 0.9 }));
    expect(room.journeyWorld?.difficultySlider).toBeCloseTo(0.9, 6);
  });

  it('权限门：LockedForEveryone（0）连房主也拒（原版 default 无 host 豁免）', async () => {
    const { room, host, guest, feed, eventsOf } = await mkRoom();
    feed(host, writeJourneyPermission(5, PowerPermissionLevel.LockedForEveryone));
    feed(host, writeJourneyPersonalState(0, { godmode: true, farPlacementRange: true, spawnRateSlider: 0.5 }));
    // godmode(power5) 锁死 → 拒；权威态无记录（无既有记录 → 无纠正帧，仅权限广播）
    expect((room as unknown as { journeyPersonal: Map<number, unknown> }).journeyPersonal.has(0)).toBe(false);
    expect(eventsOf(guest)).toEqual([{ kind: 'perm', powerId: 5, level: 0 }]);
  });

  it('个人态：访客开无敌（power5 默认 Everyone）→ slot 权威覆写广播', async () => {
    const { room, guest, host, feed, eventsOf } = await mkRoom();
    feed(guest, writeJourneyPersonalState(9 /* 伪造 slot——服务器覆写 */, {
      godmode: true, farPlacementRange: true, spawnRateSlider: 0.25,
    }));
    const stored = (room as unknown as { journeyPersonal: Map<number, { godmode: boolean }> }).journeyPersonal.get(1);
    expect(stored?.godmode).toBe(true);         // 存在权威 slot=1 下
    const ev = eventsOf(host);
    expect(ev).toEqual([{
      kind: 'personal', slot: 1,
      state: { godmode: true, farPlacementRange: true, spawnRateSlider: 0.25 },
    }]);
  });

  it('时段跳跃：power2（正午）默认放行全员中继【含发送者】（ASharedButtonPower :407-413）', async () => {
    const { guest, host, feed, eventsOf } = await mkRoom();
    feed(guest, writeJourneyTimeSkip(2));
    expect(eventsOf(host)).toEqual([{ kind: 'skip', which: 2 }]);
    expect(eventsOf(guest)).toEqual([{ kind: 'skip', which: 2 }]);   // 发送者收包才本地跳
  });

  it('研究上报：slot 回填 + 排除发送者中继（NetCreativeUnlocksPlayerReportModule :22-26）', async () => {
    const { room, guest, host, feed, eventsOf } = await mkRoom();
    feed(guest, writeJourneyUnlockReport(292, 3));
    expect(eventsOf(host)).toEqual([{ kind: 'unlock', slot: 1, itemId: 292, amount: 3 }]);
    expect(eventsOf(guest)).toEqual([]);
  });

  it('进房全量同步（SyncThingsToJoiningPlayer :167-181）：权限 15 条 + 世界态 + 个人态', async () => {
    const { room, host, guest, feed, eventsOf } = await mkRoom();
    feed(host, writeJourneyWorldState({ ...WORLD0, freezeTime: true }));
    feed(host, writeJourneyPersonalState(0, { godmode: true, farPlacementRange: true, spawnRateSlider: 0.5 }));
    const joiner = room.newClient(fakeWs() as never);
    joiner.slot = 2; joiner.state = 10;
    room.clients.add(joiner);
    const guestBefore = eventsOf(guest).length;   // 此前 host 广播已入 guest
    (room as unknown as { journeySyncToJoiner(c: unknown): void }).journeySyncToJoiner(joiner);
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    const ev = eventsOf(joiner);
    // 15 条权限（默认 Everyone）
    expect(ev.filter((e) => e.kind === 'perm').length).toBe(15);
    // 世界态 + 他人个人态（slot 0 房主）在权限之后
    expect(ev[15]).toEqual({ kind: 'world', state: { ...WORLD0, freezeTime: true } });
    expect(ev[16]).toEqual({
      kind: 'personal', slot: 0,
      state: { godmode: true, farPlacementRange: true, spawnRateSlider: 0.5 },
    });
    // joiner 收帧不应打扰 guest（无增量）
    expect(eventsOf(guest).length).toBe(guestBefore);
  });

  it('非旅程世界：module5 整包丢弃', async () => {
    const { Room } = await import('../../server/src/room');
    const world = new World(64, 32, 42, 'jm-classic');
    world.difficulty = 0;                       // 非旅程
    const room = new Room(world);
    const c = room.newClient(fakeWs() as never);
    c.slot = 0; c.state = 10; c.isHost = true;
    room.clients.add(c);
    (room as unknown as { handle(c: unknown, msgId: number, r: NetReader): void })
      .handle(c, Msg.NetModules, new NetReader(writeJourneyWorldState({ ...WORLD0, freezeTime: true }).subarray(3)));
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    expect(room.journeyWorld).toBe(null);
  });
});
