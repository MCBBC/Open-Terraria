// ============================================================================
// MP 同步轻件包（7 项）回归：module0 液体 / module4 图鉴 / module8 编排粒子 /
// module100 天空氛围 / module7 晶塔 / 玩家列表面板数据源（msg203）/ module2 地图 ping。
// 标杆：Terarria1456
//   Terraria.GameContent.NetModules/NetLiquidModule.cs（Liquid.cs:56 NetSendLiquid）
//   Terraria.GameContent.NetModules/NetBestiaryModule.cs（三 tracker OnPlayerJoining）
//   Terraria.GameContent.NetModules/NetParticlesModule.cs（ParticleOrchestraSettings 22B）
//   Terraria.GameContent.NetModules/NetAmbienceModule.cs（AmbienceServer.cs :96-129）
//   Terraria.GameContent.NetModules/NetTeleportPylonModule.cs（TeleportPylonsSystem）
//   Terraria.GameContent.NetModules/NetPingModule.cs（Main.cs:54926 双击 / PingMapLayer）
// 覆盖：编解码字节级往返 / 帧头（msg82+moduleId）/ ClientNet 收包分发 /
// Room 中继（排除发送者·条带过滤·进房补发·权威门）。全程 mock 传输层
// （NetWriter/NetReader 字节流直连 + 假 ws，同 journey-mp/leashed-net-sync 先例）。
// ============================================================================
import { describe, it, expect } from 'vitest';
import { NetWriter, NetReader, Msg, NetModule } from '../src/net/protocol';
import {
  writeLiquidModule, readLiquidModule, packLiquidCoord, unpackLiquidCoord,
  LIQUID_CELLS_PER_FRAME, type LiquidCell,
  writeMapPing, readMapPing, MapPingStore, PING_DURATION_MS, PING_MAX,
  writeBestiaryModule, readBestiaryModule, BestiarySub,
  writePylonModule, readPylonModule, PylonSub,
  writeParticleModule, readParticleModule, ParticleOrchestraType,
  writeAmbienceModule, readAmbienceModule,
  writePingProbe,
} from '../src/net/syncModules';
import { ClientNet } from '../src/net/ClientNet';
import { World } from '../src/world/World';
import { BestiaryTracker, bestiaryCreditId } from '../src/data/Bestiary';
import {
  AMBIENT_FAMILY_SKY_TYPE, ambientFamilyOfSkyType, pickAmbientFamily,
} from '../src/render/ambientFamilies';

/** 假 ws：send 采集帧（readyState=1=OPEN），无背压（journey-mp 同款） */
function fakeWs() {
  const sent: Uint8Array[] = [];
  const ws = {
    sent,
    readyState: 1,
    bufferedAmount: 0,
    send: (data: ArrayBuffer | Uint8Array) => { sent.push(new Uint8Array(data as ArrayBuffer)); },
    close: () => { ws.readyState = 3; },
    onopen: null, onmessage: null, onclose: null, onerror: null,
  };
  return ws;
}

/** 帧流解析出 (msgId, payload) 列表（按 len 切帧；journey-mp 同款） */
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

/** 剥 [len][msgId] 头喂 ClientNet.handle（journey-mp 同款） */
function feedNet(net: ClientNet, frame: Uint8Array): void {
  (net as unknown as { handle(msgId: number, r: NetReader): void })
    .handle(frame[2], new NetReader(frame.subarray(3)));
}

/** 采集某 moduleId 的下行帧（Room 测试用） */
function framesOfModule(sent: Uint8Array[], moduleId: number): NetReader[] {
  const out: NetReader[] = [];
  for (const { msgId, payload } of parseFrames(sent)) {
    if (msgId !== Msg.NetModules) continue;
    if (payload.u16() === moduleId) out.push(payload);
  }
  return out;
}

// ============================================================================
// 1. module0 液体（NetLiquidModule）
// ============================================================================
describe('module0 液体联机收敛（NetLiquidModule.cs）', () => {
  it('编解码往返：packed 坐标 + liquid/liquidType 逐格一致（含 +1 液型编码）', () => {
    const cells: LiquidCell[] = [
      { x: 100, y: 55, liquid: 255, liquidType: 1 },   // 水（仓库 +1 编码）
      { x: 4200, y: 1199, liquid: 200, liquidType: 3 },// 微光
      { x: 0, y: 0, liquid: 0, liquidType: 2 },        // 清空格（liquid=0 广播语义）
    ];
    const frame = writeLiquidModule(cells);
    expect(frame[2]).toBe(Msg.NetModules);
    const r = new NetReader(frame.subarray(3));
    expect(r.u16()).toBe(NetModule.Liquid);
    expect(readLiquidModule(r)).toEqual(cells);
  });

  it('packLiquidCoord：(x<<16)|y 原版打包 + 解包往返', () => {
    expect(packLiquidCoord(100, 55)).toBe((100 << 16) | 55);
    expect(unpackLiquidCoord(packLiquidCoord(4199, 1199))).toEqual({ x: 4199, y: 1199 });
    // 单帧批量上限（防超 65535B 包限；每条 6B）
    expect(LIQUID_CELLS_PER_FRAME).toBe(4096);
  });

  it('Room 中继：服务器镜像直写 + 逐端条带过滤（SerializeForPlayer 的 TileSections 门）', async () => {
    const { Room } = await import('../../server/src/room');
    const world = new World(64, 32, 7, 'liq-room');
    const room = new Room(world);
    const host = room.newClient(fakeWs() as never);
    host.slot = 0; host.state = 10; host.isHost = true;
    const guest = room.newClient(fakeWs() as never);
    guest.slot = 1; guest.state = 10;
    room.clients.add(host); room.clients.add(guest);
    // 访客只收过 (0,0) 条带（200×20）——(50,5) 在带内、(50,25) 在带外
    guest.sentStrips.add('0,0');
    const cells: LiquidCell[] = [
      { x: 50, y: 5, liquid: 128, liquidType: 1 },
      { x: 50, y: 25, liquid: 0, liquidType: 1 },
    ];
    (room as unknown as { handle(c: unknown, id: number, r: NetReader): void })
      .handle(host, Msg.NetModules, new NetReader(writeLiquidModule(cells).subarray(3)));
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    // 服务器镜像
    const st = world.store;
    expect(st.liquid[st.idx(50, 5)]).toBe(128);
    expect(st.liquid[st.idx(50, 25)]).toBe(0);
    // 访客只收带内格
    const guestFrames = framesOfModule((guest.ws as unknown as { sent: Uint8Array[] }).sent, NetModule.Liquid);
    expect(guestFrames).toHaveLength(1);
    expect(readLiquidModule(guestFrames[0])).toEqual([cells[0]]);
    // 发送者（房主）本地已生效——不回环
    expect(framesOfModule((host.ws as unknown as { sent: Uint8Array[] }).sent, NetModule.Liquid)).toHaveLength(0);
  });
});

// ============================================================================
// 2. module4 图鉴（NetBestiaryModule）
// ============================================================================
describe('module4 图鉴联机（NetBestiaryModule.cs）', () => {
  it('BestiaryTracker：RegisterKill 携累计 / Sight/Chat 首次才 true（tracker flag 门）', () => {
    const b = new BestiaryTracker();
    expect(b.registerSight(3)).toBe(true);     // 首遇
    expect(b.registerSight(3)).toBe(false);    // 幂等非首次
    expect(b.registerChat(229)).toBe(true);
    expect(b.registerChat(229)).toBe(false);
    expect(b.registerKill(3)).toBe(1);
    expect(b.registerKill(3)).toBe(2);         // 累计值（module4 上行载荷）
    const credit = bestiaryCreditId(3);
    b.setKillCountDirectly(credit, 5);         // 权威下发直写（钳门内）
    expect(b.kills.get(credit)).toBe(5);
  });

  it('编解码往返：7bit 计数（>127 多字节）+ 三子型', () => {
    const events = [
      { sub: BestiarySub.Kill as const, netId: 5, count: 300 },      // 7bit 两字节
      { sub: BestiarySub.Sight as const, netId: -30 },
      { sub: BestiarySub.Chat as const, netId: 229 },
    ];
    const frame = writeBestiaryModule(events);
    const r = new NetReader(frame.subarray(3));
    expect(r.u16()).toBe(NetModule.Bestiary);
    expect(readBestiaryModule(r)).toEqual(events);
  });

  it('Room：Kill 权威门（非房主 Kill 丢弃）+ 进房全量补发（三 tracker OnPlayerJoining）', async () => {
    const { Room } = await import('../../server/src/room');
    const world = new World(64, 32, 8, 'bst-room');
    const room = new Room(world);
    const host = room.newClient(fakeWs() as never);
    host.slot = 0; host.state = 10; host.isHost = true;
    const guest = room.newClient(fakeWs() as never);
    guest.slot = 1; guest.state = 10;
    const evil = room.newClient(fakeWs() as never);
    evil.slot = 2; evil.state = 10;             // 非房主
    room.clients.add(host); room.clients.add(guest); room.clients.add(evil);
    const handle = (c: typeof host, frame: Uint8Array) => {
      (room as unknown as { handle(c: unknown, id: number, r: NetReader): void })
        .handle(c, Msg.NetModules, new NetReader(frame.subarray(3)));
    };
    // 访客 Sight 受理（各端观测自家视野）；访客 Kill 丢弃（权威门）
    handle(evil, writeBestiaryModule([{ sub: BestiarySub.Sight, netId: 3 }]));
    handle(evil, writeBestiaryModule([{ sub: BestiarySub.Kill, netId: 3, count: 99 }]));
    expect(world.bestiary.sights.has(bestiaryCreditId(3))).toBe(true);
    expect(world.bestiary.kills.get(bestiaryCreditId(3))).toBeUndefined();
    // 房主 Kill 受理 + 广播
    handle(host, writeBestiaryModule([{ sub: BestiarySub.Kill, netId: 3, count: 7 }]));
    expect(world.bestiary.kills.get(bestiaryCreditId(3))).toBe(7);
    // 进房全量：新人收 kills（携累计）→ sights 两批
    const joiner = room.newClient(fakeWs() as never);
    joiner.slot = 3; joiner.state = 10;
    room.clients.add(joiner);
    room.bestiarySyncToJoiner(joiner);
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    const got: number[] = [];
    for (const p of framesOfModule((joiner.ws as unknown as { sent: Uint8Array[] }).sent, NetModule.Bestiary)) {
      for (const e of readBestiaryModule(p)) got.push(e.sub);
    }
    expect(got).toEqual([BestiarySub.Kill, BestiarySub.Sight]);
  });
});

// ============================================================================
// 3. module8 编排粒子（NetParticlesModule）
// ============================================================================
describe('module8 编排粒子联机（NetParticlesModule.cs）', () => {
  it('编解码：22B 载荷 1:1（type + Vector2×2 + i32 + u8）+ 微光两型常量对表', () => {
    const s = {
      posX: 1234.5, posY: -67.25, moveX: 8, moveY: -5.5,
      uniqueInfo: 77, invoker: 3,
    };
    const frame = writeParticleModule(ParticleOrchestraType.ShimmerTownNPC, s);
    expect(frame.length).toBe(3 + 2 + 1 + 21);           // 头 3 + moduleId 2 + type 1 + 21B
    const r = new NetReader(frame.subarray(3));
    expect(r.u16()).toBe(NetModule.Particles);
    const m = readParticleModule(r);
    expect(m.type).toBe(32);                             // ParticleOrchestraType.cs 注册序
    expect(m.settings).toEqual(s);
    // 本仓消费/生产子集对表（ShimmerTownNPC=32 / Send=33——NPC.cs:53674/:55994）
    expect(ParticleOrchestraType.ShimmerTownNPC).toBe(32);
    expect(ParticleOrchestraType.ShimmerTownNPCSend).toBe(33);
  });

  it('Room 中继：排除发送者全房转发（服务器 Broadcast :22-25）;ClientNet 分发 → hook', async () => {
    const { Room } = await import('../../server/src/room');
    const world = new World(64, 32, 9, 'par-room');
    const room = new Room(world);
    const host = room.newClient(fakeWs() as never);
    host.slot = 0; host.state = 10; host.isHost = true;
    const guest = room.newClient(fakeWs() as never);
    guest.slot = 1; guest.state = 10;
    room.clients.add(host); room.clients.add(guest);
    const s = { posX: 100, posY: 200, moveX: 0, moveY: 0, uniqueInfo: 0, invoker: 0 };
    (room as unknown as { handle(c: unknown, id: number, r: NetReader): void })
      .handle(host, Msg.NetModules, new NetReader(writeParticleModule(32, s).subarray(3)));
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    const guestFrames = framesOfModule((guest.ws as unknown as { sent: Uint8Array[] }).sent, NetModule.Particles);
    expect(guestFrames).toHaveLength(1);
    expect(readParticleModule(guestFrames[0])).toEqual({ type: 32, settings: s });
    expect(framesOfModule((host.ws as unknown as { sent: Uint8Array[] }).sent, NetModule.Particles)).toHaveLength(0);

    // 客户端收包分发 → onParticleOrchestra（Game 侧按型派发本地视觉）
    const got: Array<[number, number, number]> = [];
    const net = new ClientNet({ player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never,
      { onWorldReady: () => {}, onParticleOrchestra: (t, st) => got.push([t, st.posX, st.posY]) });
    feedNet(net, writeParticleModule(32, s));
    feedNet(net, writeParticleModule(99, s));           // 未知型：transport 层照收,消费端忽略
    expect(got).toEqual([[32, 100, 200], [99, 100, 200]]);
  });
});

// ============================================================================
// 4. module100 天空氛围（NetAmbienceModule + AmbienceServer）
// ============================================================================
describe('module100 天空氛围联机（NetAmbienceModule.cs）', () => {
  it('编解码：{u8 slot, i32 seed, u8 type} 原版布局', () => {
    const frame = writeAmbienceModule(4, -123456789, 0);
    const r = new NetReader(frame.subarray(3));
    expect(r.u16()).toBe(NetModule.Ambience);
    expect(readAmbienceModule(r)).toEqual({ playerSlot: 4, seed: -123456789, type: 0 });
  });

  it('SkyEntityType 映射：17 族双射 + Meteor(5)/BoneSerpent(6) 不入表', () => {
    const fams = Object.keys(AMBIENT_FAMILY_SKY_TYPE);
    expect(fams).toHaveLength(17);
    const ids = Object.values(AMBIENT_FAMILY_SKY_TYPE);
    expect(new Set(ids).size).toBe(17);                  // 无重复 id
    for (const [fam, id] of Object.entries(AMBIENT_FAMILY_SKY_TYPE)) {
      expect(ambientFamilyOfSkyType(id)).toBe(fam);     // 双射
    }
    expect(ambientFamilyOfSkyType(5)).toBeNull();       // Meteor 单接
    expect(ambientFamilyOfSkyType(6)).toBeNull();       // BoneSerpent 死码
    expect(ambientFamilyOfSkyType(19)).toBeNull();      // 越界（Count=19）
  });

  it('AmbienceServer（room.ambienceTick）：到期掷族 → 全房同 seed 同帧广播（含锚玩家）', async () => {
    const { Room } = await import('../../server/src/room');
    const world = new World(64, 32, 10, 'amb-room');
    const room = new Room(world);
    const a = room.newClient(fakeWs() as never);
    a.slot = 0; a.state = 10;
    const b = room.newClient(fakeWs() as never);
    b.slot = 1; b.state = 10;
    room.clients.add(a); room.clients.add(b);
    // 高度门：天空带（groundLevel*16+1600 之下）——两玩家均在带内
    a.lastX = 100; a.lastY = 100; a.lastPosAt = Date.now();
    b.lastX = 200; b.lastY = 120; b.lastPosAt = Date.now();
    // 推到到期（600-7200 游戏tick 计数;一次 tick 只走 60t——强制到期）
    (room as unknown as { ambTicksLeft: number }).ambTicksLeft = 1;
    room.ambienceTick();
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    const fa = framesOfModule((a.ws as unknown as { sent: Uint8Array[] }).sent, NetModule.Ambience);
    const fb = framesOfModule((b.ws as unknown as { sent: Uint8Array[] }).sent, NetModule.Ambience);
    expect(fa).toHaveLength(1);
    expect(fb).toHaveLength(1);                          // 含锚玩家自身（BroadcastOrLoopback）
    const ma = readAmbienceModule(fa[0]), mb = readAmbienceModule(fb[0]);
    expect(ma).toEqual(mb);                              // 同帧同 seed 同 type（字节相等）
    expect([a.slot, b.slot]).toContain(ma.playerSlot);  // 锚 = 在场玩家之一
    expect(ambientFamilyOfSkyType(ma.type)).not.toBeNull();
    // 未到期不掷（10-120s 节流）
    (a.ws as unknown as { sent: Uint8Array[] }).sent.length = 0;
    room.ambienceTick();
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    expect(framesOfModule((a.ws as unknown as { sent: Uint8Array[] }).sent, NetModule.Ambience)).toHaveLength(0);
  });

  it('pickAmbientFamily（共享表 = 服务器掷族同源）：晴天放宽支出鸟群', () => {
    // 与 weather-visual.test 的选族断言同源——此处钉"服务器/客户端同表"这一事实
    expect(pickAmbientFamily({
      dayTime: true, raining: false, eclipse: false, bloodMoon: false,
      pumpkinMoon: false, snowMoon: false, zoneHallow: false,
      playerAtSkyHeight: true, roll5: 0, pick: 0,
    })).toBe('birds');
  });
});

// ============================================================================
// 5. module7 晶塔（NetTeleportPylonModule）
// ============================================================================
describe('module7 晶塔权威模块（NetTeleportPylonModule.cs）', () => {
  it('编解码往返：sub0/1 增删 · sub2 请求者段可选（C→S 原生帧 0 / 中继帧回填）· sub3 回执文案', () => {
    // C→S 原生帧（无 requesterSlot——writePylonModule 补 0）
    const native = writePylonModule({ sub: PylonSub.PlayerRequestsTeleport, x: 100, y: 50, type: 2 });
    let r = new NetReader(native.subarray(3));
    expect(r.u16()).toBe(NetModule.TeleportPylon);
    expect(readPylonModule(r)).toEqual({ sub: 2, x: 100, y: 50, type: 2, requesterSlot: 0 });
    // S→房主 中继帧（服务器回填 requesterSlot——msg42 fromSlot 手法）
    const relay = writePylonModule({ sub: PylonSub.PlayerRequestsTeleport, x: 100, y: 50, type: 2, requesterSlot: 7 });
    const r2 = new NetReader(relay.subarray(3));
    r2.u16();   // 跳过 moduleId（readPylonModule 从 sub 字节起读）
    expect(readPylonModule(r2)).toEqual({ sub: 2, x: 100, y: 50, type: 2, requesterSlot: 7 });
    // 增/删 + 回执（ok=false 携 Net.* 文案键）
    const readOf = (f: Uint8Array) => {
      const rr = new NetReader(f.subarray(3));
      rr.u16();   // 跳过 moduleId
      return readPylonModule(rr);
    };
    expect(readOf(writePylonModule({ sub: PylonSub.PylonWasRemoved, x: 1, y: 2, type: 3 })))
      .toEqual({ sub: 1, x: 1, y: 2, type: 3 });
    const res = readOf(writePylonModule({
      sub: PylonSub.TeleportResult, targetSlot: 7, x: 10, y: 20, type: 1,
      ok: false, fail: 'Net.CannotTeleportBecauseNoNPC',
    } as never));
    expect(res).toMatchObject({ targetSlot: 7, ok: false, fail: 'Net.CannotTeleportBecauseNoNPC' });
  });

  it('Room：sub2 定向房主（附 requesterSlot）→ 房主 sub3 回执按 targetSlot 定向请求端', async () => {
    const { Room } = await import('../../server/src/room');
    const world = new World(64, 32, 11, 'pyl-room');
    const room = new Room(world);
    const host = room.newClient(fakeWs() as never);
    host.slot = 0; host.state = 10; host.isHost = true;
    const guest = room.newClient(fakeWs() as never);
    guest.slot = 3; guest.state = 10;
    room.clients.add(host); room.clients.add(guest);
    const handle = (c: typeof host, frame: Uint8Array) => {
      (room as unknown as { handle(c: unknown, id: number, r: NetReader): void })
        .handle(c, Msg.NetModules, new NetReader(frame.subarray(3)));
    };
    handle(guest, writePylonModule({ sub: PylonSub.PlayerRequestsTeleport, x: 5, y: 6, type: 0 }));
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    // 房主收 sub2（requesterSlot=3 回填）;请求端不收任何晶塔帧
    const hostFrames = framesOfModule((host.ws as unknown as { sent: Uint8Array[] }).sent, NetModule.TeleportPylon);
    expect(hostFrames).toHaveLength(1);
    expect(readPylonModule(hostFrames[0])).toEqual({ sub: 2, x: 5, y: 6, type: 0, requesterSlot: 3 });
    expect(framesOfModule((guest.ws as unknown as { sent: Uint8Array[] }).sent, NetModule.TeleportPylon)).toHaveLength(0);
    // 房主回执 → 服务器剥路由位定向回请求端（targetSlot 段仍在——写侧补 0,读侧见 0）
    handle(host, writePylonModule({
      sub: PylonSub.TeleportResult, targetSlot: 3, x: 5, y: 6, type: 0, ok: true, fail: null,
    }));
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    const guestFrames = framesOfModule((guest.ws as unknown as { sent: Uint8Array[] }).sent, NetModule.TeleportPylon);
    expect(guestFrames).toHaveLength(1);
    expect(readPylonModule(guestFrames[0])).toMatchObject({ sub: 3, ok: true, x: 5, y: 6 });
  });
});

// ============================================================================
// 6. 玩家列表面板数据源（msg203 探针表 + Msg.Ping 回显差分）
// ============================================================================
describe('玩家列表面板数据源（msg203 / Msg.Ping）', () => {
  function mkNet(hooks: Record<string, unknown>) {
    const net = new ClientNet(
      { player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never,
      { onWorldReady: () => {}, ...hooks } as never,
    );
    net.mySlot = 0;
    (net as unknown as { ws: unknown }).ws = fakeWs();
    return net;
  }

  it('msg203：探针表入 playerPings + onPingTable + serverTs 原样回显', () => {
    const tables: Array<Array<{ slot: number; rttMs: number }>> = [];
    const net = mkNet({ onPingTable: (t: Array<{ slot: number; rttMs: number }>) => tables.push(t) });
    feedNet(net, writePingProbe(123456.789, [{ slot: 1, rttMs: 88 }, { slot: 2, rttMs: 250 }]));
    expect(net.playerPings.get(1)).toBe(88);
    expect(net.playerPings.get(2)).toBe(250);
    expect(tables).toEqual([[{ slot: 1, rttMs: 88 }, { slot: 2, rttMs: 250 }]]);
    // 回显帧：{f64 serverTs} 原样
    const sent = (net as unknown as { ws: { sent: Uint8Array[] } }).ws.sent;
    const echoes = parseFrames(sent).filter((f) => f.msgId === Msg.ServerPingProbe);
    expect(echoes).toHaveLength(1);
    expect(echoes[0].payload.f64()).toBe(123456.789);
  });

  it('msg154 Ping 回显差分 → 本端 rttMs（面板"自己"行）', () => {
    const net = mkNet({});
    const past = performance.now() - 120;
    feedNet(net, new NetWriter(Msg.Ping).f64(past).finish());
    expect(net.rttMs).toBeGreaterThanOrEqual(110);      // 回显差分（时钟精度余量）
    expect(net.rttMs).toBeLessThan(1000);
  });
});

// ============================================================================
// 7. module2 地图 ping（NetPingModule + PingMapLayer）
// ============================================================================
describe('module2 地图 ping（NetPingModule.cs / PingMapLayer.cs）', () => {
  it('MapPingStore（Main.Pings）：容量 100 满员丢弃 / 15s 过期 / 10fps×5 帧动画', () => {
    const store = new MapPingStore();
    for (let i = 0; i < 150; i++) store.add(i, i * 100, 0);
    expect(store.pings).toHaveLength(PING_MAX);         // 满员静默丢弃
    expect(PING_MAX).toBe(100);
    // 过期收割（live 内移除——Draw 首段语义）
    store.clear();
    store.add(0, 0, 0);
    expect(store.live(PING_DURATION_MS - 1)).toHaveLength(1);
    expect(store.live(PING_DURATION_MS + 1)).toHaveLength(0);
    // 帧 = (存活秒 ×10) %5（PingMapLayer.cs:35-40 SpriteFrame(1,5)）
    const p = { x: 0, y: 0, at: 1000 };
    expect(MapPingStore.frameOf(p, 1000)).toBe(0);
    expect(MapPingStore.frameOf(p, 1050)).toBe(0);      // 0.05s×10=0.5 → floor 0
    expect(MapPingStore.frameOf(p, 1100)).toBe(1);      // 0.1s → 1
    expect(MapPingStore.frameOf(p, 1600)).toBe(6 % 5);  // 0.6s → 6 → 1
  });

  it('编解码 + ClientNet 分发：{f32 x, f32 y} 全屏地图 tile 坐标 → onMapPing', () => {
    const frame = writeMapPing(123.5, -67.25);
    const r = new NetReader(frame.subarray(3));
    expect(r.u16()).toBe(NetModule.PingModule);
    expect(readMapPing(r)).toEqual({ x: 123.5, y: -67.25 });
    const got: Array<[number, number]> = [];
    const net = new ClientNet(
      { player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never,
      { onWorldReady: () => {}, onMapPing: (x, y) => got.push([x, y]) });
    feedNet(net, writeMapPing(10, 20));
    feedNet(net, writeMapPing(NaN, 20));                // 非法坐标（脏流防御）
    expect(got).toEqual([[10, 20]]);
  });
});

// ============================================================================
// 8. msg21/145 微光尾段（SyncItemsWithShimmer 升格语义）
//    NetMessage.cs:88-92 `shimmerTime>0||shimmered` → msg21 升格 145；
//    :646-651 尾段 = Write(shimmered)+Write(shimmerTime)。本协议在 SyncItem op0
//    尾部条件携带（remaining 门，R16-13 prefix 尾读同构）；msg146 ShimmerActions
//    不需要——微光转化产物经 SyncItem spawn 自然广播。
// ============================================================================
describe('msg21/145 微光尾段（op0 条件携带 + Room 中继透传）', () => {
  const KEY = 'vi_50_MagicMirror';

  /** 手搓 op0 帧（len/msgId 头内含）：tail=false 模拟旧端 */
  function writeItemOp(netId: number, withTail: boolean, shimmerTime = 0.75): Uint8Array {
    const w = new NetWriter(Msg.SyncItem);
    w.u32(netId); w.u8(0);
    w.str(KEY); w.u16(3);
    w.f32(10.5); w.f32(20.25); w.f32(0.5); w.f32(-0.25);
    if (withTail) { w.u8(1); w.f32(shimmerTime); }
    return w.finish();
  }

  it('sendItemOp：微光态帧尾含 u8(1)+f32(shimmerTime)；非微光无尾段（旧端字节兼容）', () => {
    const net = new ClientNet({ player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never,
      { onWorldReady: () => {} });
    net.sendItemOp(0, 7, KEY, 3, 10.5, 20.25, 0.5, -0.25, true, 0.75);
    const frames = (net as unknown as { pendingFrames: Uint8Array[] }).pendingFrames;
    expect(frames).toHaveLength(1);
    const r = new NetReader(frames[0].subarray(3));
    expect(r.u32()).toBe(7);
    expect(r.u8()).toBe(0);
    expect(r.str()).toBe(KEY);
    expect(r.u16()).toBe(3);
    expect(r.f32()).toBeCloseTo(10.5, 5);   // x
    r.f32(); r.f32(); r.f32();              // y / vx / vy
    expect(r.remaining).toBe(5);            // u8+f32 尾段
    expect(r.u8()).toBe(1);
    expect(r.f32()).toBeCloseTo(0.75, 6);
    // 非微光：vy 后即帧底
    const net2 = new ClientNet({ player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never,
      { onWorldReady: () => {} });
    net2.sendItemOp(0, 8, KEY, 1, 0, 0, 0, 0);
    const r2 = new NetReader((net2 as unknown as { pendingFrames: Uint8Array[] }).pendingFrames[0]!.subarray(3));
    r2.u32(); r2.u8(); r2.str(); r2.u16(); r2.f32(); r2.f32(); r2.f32(); r2.f32();
    expect(r2.remaining).toBe(0);
  });

  it('接收端分发：带尾段帧 → onItemOp 携 shimmered/shimmerTime；旧端无尾段帧 → 缺省 undefined', () => {
    const ops: Array<Record<string, unknown>> = [];
    const net = new ClientNet({ player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never,
      { onWorldReady: () => {}, onItemOp: (o) => ops.push(o as unknown as Record<string, unknown>) });
    feedNet(net, writeItemOp(9, true));
    feedNet(net, writeItemOp(10, false));
    expect(ops).toHaveLength(2);
    expect(ops[0]!.shimmered).toBe(true);
    expect(ops[0]!.shimmerTime).toBeCloseTo(0.75, 6);
    expect(ops[1]!.shimmered).toBeUndefined();
    expect(ops[1]!.shimmerTime).toBeUndefined();
  });

  it('Room 中继透传尾段（解析重建不丢 145 段）+ S6 非法浮点拒帧', async () => {
    const { Room } = await import('../../server/src/room');
    const world = new World(64, 32, 10, 'shim-relay');
    const room = new Room(world);
    const a = room.newClient(fakeWs() as never); a.slot = 0; a.state = 10;
    const b = room.newClient(fakeWs() as never); b.slot = 1; b.state = 10;
    room.clients.add(a); room.clients.add(b);

    const relay = (frame: Uint8Array): void => {
      (room as unknown as { handle(c: unknown, id: number, r: NetReader): void })
        .handle(a, Msg.SyncItem, new NetReader(frame.subarray(3)));
      (room as unknown as { flushOutbox(): void }).flushOutbox();
    };
    // 属主校验：slot0 的 netId 高 8 位须=0
    relay(writeItemOp((0 << 24) | 42, true));
    const got = parseFrames((b.ws as unknown as { sent: Uint8Array[] }).sent)
      .filter((f) => f.msgId === Msg.SyncItem);
    expect(got).toHaveLength(1);
    const p = got[0]!.payload;
    p.u32(); p.u8(); p.str(); p.u16(); p.f32(); p.f32(); p.f32(); p.f32();
    expect(p.remaining).toBe(5);            // 尾段原样透传
    expect(p.u8()).toBe(1);
    expect(p.f32()).toBeCloseTo(0.75, 6);

    // S6 同款：shimmerTime 非有限值 → 整帧拒（b 不再收到第二条）
    relay(writeItemOp((0 << 24) | 43, true, NaN));
    expect(parseFrames((b.ws as unknown as { sent: Uint8Array[] }).sent)
      .filter((f) => f.msgId === Msg.SyncItem)).toHaveLength(1);
  });
});
