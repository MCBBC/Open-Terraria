// ============================================================================
// 末批 S 级散件回归：① 发色剂联机同步 ② 多人 loot 口径（2026-08-20）。
// 标杆：Terarria1456
//   Terraria/NetMessage.cs:142（msg4 PlayerInfo 携带 hairDye byte——skinVariant/
//     voiceVariant/voicePitchOffset/hair/name/hairDye/... 序）
//   Terraria.GameContent.ItemDropRules/ItemDropRule.cs:10-17/31-33
//     （BossBag = DropBasedOnExpertMode(DropNothing, DropLocalPerClient..)；
//      MasterModeDropOnAllPlayers = DropBasedOnMasterMode(DropNothing, DropPerPlayer..)）
//   Terraria.GameContent.ItemDropRules/CommonCode.cs:35-58/60-88
//     （DropItemLocalPerClientAndSetNPCMoneyTo0：各交互端各一份 msg90 instanced,
//      value=0;DropItemForEachInteractingPlayerOnThePlayer：逐交互玩家独立掷 +
//      落该玩家头顶普通物品 + value=0）——1.4.5.6 两族注册全部经由 BossBag(18)/
//     MasterModeDropOnAllPlayers(29),无裸 local/perPlayer 注册
//   Terraria/MessageBuffer.cs:1422-1471（case 90 InstancedItem：instanced=true +
//     reservedFor=myPlayer + keepTime=600——各端私有副本）
//   Terraria/NPC.cs:79634 + Terraria/Player.cs:11666-11689
//     （NPCLoot closestPlayer = Player.FindClosest：曼哈顿中心距,active&&!dead,
//      严格 < 取先扫描槽——luck/hp/mana 注入源）
// 覆盖：ClientNet 外观 JSON hairDye 三时刻（PlayerSlot/PlayerSpawn 重发/
//   resendAppearance）+ Room 盲转 + resolveDrops per-client 族（bossBag/masterAll
//   × 单人/多人）+ module14 定向中继（房主门/合帧/伪造拒绝）+ msg16 尾段
//   mana/luck 中继镜像。全程 mock 传输层（journey-mp/mp-sync-pack 同款）。
// ============================================================================
import { describe, it, expect } from 'vitest';
import { NetWriter, NetReader, Msg, NetModule } from '../src/net/protocol';
import {
  writeInstancedLootModule, readInstancedLootModule,
  INSTANCED_LOOT_PER_FRAME, type InstancedLootEntry,
} from '../src/net/syncModules';
import { ClientNet, type RemotePlayerState } from '../src/net/ClientNet';
import { World } from '../src/world/World';
import { RNG } from '../src/core/rng';
import { resolveDrops, type NpcDropCtx } from '../src/drops/NpcDrops';

// ---------------------------------------------------------------------------
// 测试基建（journey-mp / mp-sync-pack 同款）
// ---------------------------------------------------------------------------

/** 假 ws：send 采集帧（readyState=1=OPEN），无背压 */
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

/** 剥 [len][msgId] 头喂 ClientNet.handle */
function feedNet(net: ClientNet, frame: Uint8Array): void {
  (net as unknown as { handle(msgId: number, r: NetReader): void })
    .handle(frame[2], new NetReader(frame.subarray(3)));
}

/** 采集某 msgId 的原始帧 [len][msgId][payload]（合帧 WS 消息内逐帧切分） */
function framesRaw(sent: Uint8Array[], msgId: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const f of sent) {
    let p = 0;
    while (p + 3 <= f.length) {
      const len = f[p] | (f[p + 1] << 8);
      if (f[p + 2] === msgId) out.push(f.subarray(p, p + len));
      p += len;
    }
  }
  return out;
}

function mkNet(hooks: Record<string, unknown>, player?: Record<string, unknown>) {
  const net = new ClientNet(
    { player: { appearance: null, hostile: false, team: 0, inv: { slots: [] }, ...player } } as never,
    { onWorldReady: () => {}, ...hooks } as never,
  );
  net.mySlot = 0;
  net.active = true;                 // resendAppearance 等主动发送的连接态门
  (net as unknown as { ws: unknown }).ws = fakeWs();
  return net;
}

/** SyncPlayer 帧载荷 {u8 slot, str appearanceJson} → 解析外观对象 */
function syncPlayerJson(frame: Uint8Array): Record<string, unknown> {
  const r = new NetReader(frame.subarray(3));
  r.u8();                            // slot
  return JSON.parse(r.str()) as Record<string, unknown>;
}

function mkRoom() {
  // Room 动态 import（server/ 目录独立 tsconfig；mp-sync-pack 先例）
  return import('../../server/src/room').then(({ Room }) => {
    const world = new World(64, 32, 7, 'mp-loot-room');
    const room = new Room(world);
    const mk = (slot: number, isHost = false) => {
      const c = room.newClient(fakeWs() as never);
      c.slot = slot; c.state = 10; c.isHost = isHost;
      room.clients.add(c);
      return c;
    };
    return { room, mk };
  });
}

const wsSent = (c: unknown) => (c as unknown as { ws: { sent: Uint8Array[] } }).ws.sent;

// ============================================================================
// ① 发色剂联机同步（msg4 PlayerInfo hairDye byte 的 JSON 化等价）
// ============================================================================
describe('发色剂联机（msg4 hairDye → SyncPlayer 外观 JSON）', () => {
  it('PlayerSlot 分配时刻：上行 SyncPlayer 外观 JSON 并入 hairDye（NetMessage.cs:142）', () => {
    const net = mkNet({}, { appearance: { name: '甲', hair: 5 }, hairDye: 7 });
    feedNet(net, new NetWriter(Msg.PlayerSlot).u8(0).str('sess-1').finish());
    const frames = framesRaw(wsSent(net), Msg.SyncPlayer);
    expect(frames.length).toBe(1);
    const json = syncPlayerJson(frames[0]) as { hairDye: number; hair: number };
    expect(json.hairDye).toBe(7);      // Player.hairDye byte（1..12 染料档）
    expect(json.hair).toBe(5);         // 外观本体不受并入影响
  });

  it('裸加入流程（无角色档）：仍发 {hairDye:0}（原版 msg4 无条件发的等价）', () => {
    const net = mkNet({});             // appearance 缺省 null、hairDye 缺省 0
    feedNet(net, new NetWriter(Msg.PlayerSlot).u8(0).str('').finish());
    const frames = framesRaw(wsSent(net), Msg.SyncPlayer);
    expect(frames.length).toBe(1);
    expect((syncPlayerJson(frames[0]) as { hairDye: number }).hairDye).toBe(0);
  });

  it('PlayerSpawn 世界就绪重发 + resendAppearance 均并入 hairDye（回归：重发曾缺键）', () => {
    const net = mkNet({}, { appearance: { name: '乙', hair: 1 }, hairDye: 12 });
    (net as unknown as { pendingWorld: World }).pendingWorld = new World(8, 8, 1, 'hair-dye');
    feedNet(net, new NetWriter(Msg.PlayerSpawn).u8(0).i32(64).i32(32).finish());
    let frames = framesRaw(wsSent(net), Msg.SyncPlayer);
    expect(frames.length).toBe(1);     // R2 重发（PlayerSpawn 时刻）——曾裸发 appearance 缺键
    expect((syncPlayerJson(frames[0]) as { hairDye: number }).hairDye).toBe(12);
    // 染料使用后的快速通道（Game.ts:7685 消费点）
    net.resendAppearance();
    frames = framesRaw(wsSent(net), Msg.SyncPlayer);
    expect(frames.length).toBe(2);
    expect((syncPlayerJson(frames[1]) as { hairDye: number }).hairDye).toBe(12);
  });

  it('全链中继：房主 SyncPlayer(hairDye) → Room 盲转 → 访客 RemotePlayerState.appearance 携带', async () => {
    const { room, mk } = await mkRoom();
    const host = mk(0, true);
    const guest = mk(1);
    const net = mkNet({}, { appearance: { name: '丙', hair: 3 }, hairDye: 4 });
    net.resendAppearance();
    const up = framesRaw(wsSent(net), Msg.SyncPlayer)[0];
    // 房主原始上线帧直投服务器（wire bytes 不重构）
    room.handle(host, Msg.SyncPlayer, new NetReader(up.subarray(3)));
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    // 服务器盲转（room.ts SyncPlayer case：排除发送者广播）→ 访客端零协议改动
    const relayed = framesRaw(wsSent(guest), Msg.SyncPlayer);
    expect(relayed).toHaveLength(1);
    expect(framesRaw(wsSent(host), Msg.SyncPlayer)).toHaveLength(0);   // 回环抑制
    // 访客 ClientNet 收包：players[0].appearance 携带 hairDye（Game.ts 代理染色
    // 消费点：parsed.hairDye → proxy.hairDye → Renderer.hairDyeRenderColor）。
    // SyncPlayer 只更新既有表项——先喂 PlayerActive（真实进房序：加入公告先行）
    const gnet = mkNet({});
    gnet.mySlot = 1;
    feedNet(gnet, new NetWriter(Msg.PlayerActive).u8(0).bool(true).str('丙').finish());
    feedNet(gnet, relayed[0]);
    const rp: RemotePlayerState | undefined = gnet.players.get(0);
    expect(rp).toBeDefined();
    expect((JSON.parse(rp!.appearance) as { hairDye: number }).hairDye).toBe(4);
  });
});

// ============================================================================
// ② 多人 loot 口径（per-client 族：bossBag / masterAll）
// ============================================================================
function lootCtx(over: Partial<NpcDropCtx> = {}): NpcDropCtx {
  return {
    rng: new RNG(1234),
    netId: 657, type: 657,          // Queen Slime：bossBag 4957 + masterAll 4960(1/4)
    isExpert: true, isMaster: true, hardMode: true, crimson: false,
    flags: {},
    x: 800, y: 3200,
    worldSurfaceTile: 100, rockLayerTile: 150, underworldTileY: 400,
    maxTilesX: 4200, maxTilesY: 1200,
    lifeMax: 100, friendly: false, boss: true, damage: 20, value: 50000,
    hp: 200, hpMax: 400, mana: 40, manaMax: 180,
    ...over,
  };
}

describe('Boss 袋族 per-client（DropLocalPerClientAndResetsNPCMoneyTo0）', () => {
  it('MP 结算端：bossBag 标 scope=local 单条（单掷——各交互端同结果各得一份）+ 钱币清零', () => {
    const ctx = lootCtx({ lootPlayers: [
      { slot: 0, interacting: true }, { slot: 1, interacting: true }, { slot: 2, interacting: false },
    ] });
    const res = resolveDrops(ctx);
    const bags = res.drops.filter((d) => d.id === 4957);
    expect(bags).toHaveLength(1);                       // 单掷：一次求值一份袋
    expect(bags[0].scope).toBe('local');                // 结算层按交互端逐个发放（module14）
    expect(bags[0].slot).toBeUndefined();
    // NPC 钱归零（DropLocalPerClient..To0——防 Boss 袋+钱双吃刷钱）
    expect(res.zeroValue).toBe(true);
  });

  it('单人（lootPlayers 缺席）：无 scope 直掉 + zeroValue——今日行为零变化', () => {
    const res = resolveDrops(lootCtx({}));
    const bags = res.drops.filter((d) => d.id === 4957);
    expect(bags).toHaveLength(1);
    expect(bags[0].scope).toBeUndefined();
    expect(res.zeroValue).toBe(true);
  });
});

describe('大师宠物/遗物族 perPlayer（DropPerPlayerOnThePlayer）', () => {
  it('MP 结算端：逐交互玩家独立掷（槽序,CommonCode.cs:71-76）——未交互端永不中', () => {
    let slot0Only = 0, slot1Only = 0, both = 0, neither = 0;
    for (let seed = 0; seed < 400; seed++) {
      const ctx = lootCtx({
        rng: new RNG(seed * 7919 + 17),
        lootPlayers: [
          { slot: 0, interacting: true }, { slot: 1, interacting: true }, { slot: 2, interacting: false },
        ],
      });
      const res = resolveDrops(ctx);
      const pets = res.drops.filter((d) => d.id === 4960);
      for (const p of pets) {
        expect(p.scope).toBe('perPlayer');
        expect(p.slot === 0 || p.slot === 1).toBe(true);   // 未交互 slot2 永不在列
      }
      expect(res.zeroValue).toBe(true);                    // value=0f 恒清（:77）
      const s0 = pets.some((p) => p.slot === 0), s1 = pets.some((p) => p.slot === 1);
      if (s0 && !s1) slot0Only++;
      else if (s1 && !s0) slot1Only++;
      else if (s0 && s1) both++;
      else neither++;
    }
    // 独立掷的四种组合全现（denom=4：(3/4)²≈56% neither、各 19% 单中、6% 双中）
    expect(slot0Only).toBeGreaterThan(20);
    expect(slot1Only).toBeGreaterThan(20);
    expect(both).toBeGreaterThan(5);
    expect(neither).toBeGreaterThan(100);
  });

  it('单人：单掷 ≤1 件、无 scope（CommonCode.cs:80-85 netMode!=2 段）', () => {
    let hit = 0;
    for (let seed = 0; seed < 400; seed++) {
      const res = resolveDrops(lootCtx({ rng: new RNG(seed * 7919 + 17) }));
      const pets = res.drops.filter((d) => d.id === 4960);
      expect(pets.length).toBeLessThanOrEqual(1);
      for (const p of pets) expect(p.scope).toBeUndefined();
      if (pets.length) hit++;
    }
    expect(hit).toBeGreaterThan(60);        // 1/4 × 400 ≈ 100（掷骰在跑）
  });
});

describe('module14 定向中继（msg90 InstancedItem 语义）', () => {
  it('房主上行 → 按 targetSlot 定向（同目标合帧）,发送端不回环,非目标端不可见', async () => {
    const { room, mk } = await mkRoom();
    const host = mk(0, true);
    const g1 = mk(1);
    const g2 = mk(2);
    const BAG = 'vi_4957_QueenSlimeBossBag', PET = 'vi_4960_QueenSlimePetItem';
    room.handle(host, Msg.NetModules, new NetReader(writeInstancedLootModule([
      { targetSlot: 1, key: BAG, stack: 1, x: 100, y: 200, vx: 0.5, vy: -2 },
      { targetSlot: 2, key: BAG, stack: 1, x: 100, y: 200, vx: 0.5, vy: -2 },
      { targetSlot: 1, key: PET, stack: 1, x: 100, y: 200, vx: 0.5, vy: -2 },
    ]).subarray(3)));
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    // g1：一帧两条（targetSlot=1 合帧）；g2：一帧一条；host：零（自己的副本本地落地）
    const decode = (raw: Uint8Array) => {
      const r = new NetReader(raw.subarray(3));
      expect(r.u16()).toBe(NetModule.InstancedLoot);
      return readInstancedLootModule(r);
    };
    const f1 = framesRaw(wsSent(g1), Msg.NetModules).map(decode);
    expect(f1).toHaveLength(1);
    expect(f1[0].map((e) => e.key)).toEqual([BAG, PET]);
    expect(f1[0].every((e) => e.targetSlot === 1)).toBe(true);
    const f2 = framesRaw(wsSent(g2), Msg.NetModules).map(decode);
    expect(f2).toHaveLength(1);
    expect(f2[0]).toHaveLength(1);
    expect(framesRaw(wsSent(host), Msg.NetModules)).toHaveLength(0);
  });

  it('访客伪造上行整包忽略（凭空造物通道）+ 未知 key 丢弃 + 编解码往返', async () => {
    const { room, mk } = await mkRoom();
    const host = mk(0, true);
    const g1 = mk(1);
    // 访客冒发：非房主 → 整包忽略
    room.handle(g1, Msg.NetModules, new NetReader(writeInstancedLootModule([
      { targetSlot: 0, key: 'vi_4957_QueenSlimeBossBag', stack: 1, x: 0, y: 0, vx: 0, vy: 0 },
    ]).subarray(3)));
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    expect(framesRaw(wsSent(host), Msg.NetModules)).toHaveLength(0);
    // 房主发未知 key：丢弃（不中继）
    room.handle(host, Msg.NetModules, new NetReader(writeInstancedLootModule([
      { targetSlot: 1, key: 'vi_99999_nonexistent', stack: 1, x: 0, y: 0, vx: 0, vy: 0 },
    ]).subarray(3)));
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    expect(framesRaw(wsSent(g1), Msg.NetModules)).toHaveLength(0);
    // 编解码往返 + 批量上限
    const entries: InstancedLootEntry[] = Array.from({ length: 20 }, (_, i) => ({
      targetSlot: i % 4, key: 'vi_71_CopperCoin', stack: i + 1,
      x: i * 16.5, y: -i * 3.25, vx: -1.5 * i, vy: 0,
    }));
    const r = new NetReader(writeInstancedLootModule(entries).subarray(3));
    expect(r.u16()).toBe(NetModule.InstancedLoot);
    const back = readInstancedLootModule(r);
    expect(back).toEqual(entries.slice(0, INSTANCED_LOOT_PER_FRAME));   // 截到单帧上限
    expect(INSTANCED_LOOT_PER_FRAME).toBe(16);
  });

  it('ClientNet 分发：module14 → onInstancedLoot 钩子（Game 侧 netLocalOnly 落地）', () => {
    const got: InstancedLootEntry[][] = [];
    const net = mkNet({ onInstancedLoot: (e: InstancedLootEntry[]) => got.push(e) });
    feedNet(net, writeInstancedLootModule([
      { targetSlot: 0, key: 'vi_4957_QueenSlimeBossBag', stack: 1, x: 1, y: 2, vx: 3, vy: 4 },
      { targetSlot: 2, key: 'vi_4957_QueenSlimeBossBag', stack: 1, x: 5, y: 6, vx: 7, vy: 8 },
    ]));
    expect(got).toHaveLength(1);
    expect(got[0]).toHaveLength(2);        // 过滤在 Game 层（netApplyInstancedLoot 再验 mySlot）
  });
});

describe('msg16 尾段 luck/mana 镜像（closestPlayer 掉落结算数据源）', () => {
  it('客户端 → Room 中继保尾 → 对端 RemotePlayerState.luck/mana 落位;旧端无尾段保持缺省', async () => {    const { room, mk } = await mkRoom();
    const g1 = mk(1);
    const g2 = mk(2);
    // g1 上行带尾段（mana 88/200 + luck 0.62）
    room.handle(g1, Msg.PlayerLifeMana, new NetReader(new NetWriter(Msg.PlayerLifeMana)
      .u8(1).i16(300).i16(400).u16(2).u16(1).i16(88).i16(200).f32(0.62).finish().subarray(3)));
    // 旧端 g2 无尾段（仅 hp/maxHp/deaths）
    room.handle(g2, Msg.PlayerLifeMana, new NetReader(new NetWriter(Msg.PlayerLifeMana)
      .u8(2).i16(280).i16(400).u16(0).u16(0).finish().subarray(3)));
    (room as unknown as { flushOutbox(): void }).flushOutbox();
    // 服务器中继保留尾段（g2 收到 g1 的帧;字节级验证而非重构造）
    const relays = framesRaw(wsSent(g2), Msg.PlayerLifeMana);
    expect(relays).toHaveLength(1);
    const rr = new NetReader(relays[0].subarray(3));
    expect(rr.u8()).toBe(1);
    expect(rr.i16()).toBe(300);
    expect(rr.i16()).toBe(400);
    expect(rr.u16()).toBe(2);
    expect(rr.u16()).toBe(1);
    expect(rr.i16()).toBe(88);       // mana 尾段原样透传
    expect(rr.i16()).toBe(200);
    expect(rr.f32()).toBeCloseTo(0.62);
    // 访客 ClientNet：先建 msg13 玩家表项,再回放中继帧 → RemotePlayerState 落位
    const net = mkNet({});
    net.mySlot = 0;
    for (const slot of [1, 2]) {
      feedNet(net, new NetWriter(Msg.PlayerState).u8(slot).u8(0).u8(0).u8(0)
        .f32(100).f32(200).u8(0).finish());
    }
    feedNet(net, relays[0]);
    const rp1 = net.players.get(1)!;
    expect(rp1.luck).toBeCloseTo(0.62);
    expect(rp1.mana).toBe(88);
    expect(rp1.manaMax).toBe(200);
    // 旧端无尾段：缺省 0（兼容语义,closest 结算按未满档退化）
    const oldFrame = framesRaw(wsSent(g1), Msg.PlayerLifeMana);
    expect(oldFrame).toHaveLength(1);
    feedNet(net, oldFrame[0]);
    const rp2 = net.players.get(2)!;
    expect(rp2.luck).toBe(0);
    expect(rp2.manaMax).toBe(0);
  });

  it('发送侧：syncHp 随包捎带 mana/manaMax/luck（客户端权威 vitals 上行）', () => {
    const net = mkNet({}, {
      hp: 320, maxHp: 400, deathsPve: 1, deathsPvp: 0, mana: 66, maxMana: 180, luck: -0.35,
    });
    net.mySlot = 3;
    (net as unknown as { lastHpSent: number }).lastHpSent = -1;   // 绕过差分基准
    (net as unknown as { syncHp(): void }).syncHp();
    const frames = framesRaw(wsSent(net), Msg.PlayerLifeMana);
    expect(frames).toHaveLength(1);
    const r = new NetReader(frames[0].subarray(3));
    expect(r.u8()).toBe(3);
    expect(r.i16()).toBe(320);
    expect(r.i16()).toBe(400);
    expect(r.u16()).toBe(1);          // deathsPve
    expect(r.u16()).toBe(0);          // deathsPvp
    expect(r.i16()).toBe(66);         // mana 尾段
    expect(r.i16()).toBe(180);        // manaMax
    expect(r.f32()).toBeCloseTo(-0.35);   // luck（负幸运也原样）
  });
});

describe('Enemy 死亡结算整合（per-client 发放 + closest 注入）', () => {
  it('专家 Queen Slime 击杀：Boss 袋按交互端逐个 grant（未交互端不发放）;单人路径不走 grant', async () => {
    const { Enemy } = await import('../src/entities/Enemy');
    const w = new World(80, 80, 7, 'loot-settle');
    w.groundLevel = 42; w.rockLevel = 60;
    w.difficulty = 1;                 // 专家（mainDifficulty ≥ EXPERT）
    const TILE = 16;
    const EX = 50 * TILE, EY = 50 * TILE;
    const mkHooks = (lootPlayers?: Array<{ slot: number; x: number; y: number; luck: number; interacting: boolean }>) => {
      const grants: Array<{ slot: number; key: string; stack: number }> = [];
      const worldDrops: string[] = [];
      return {
        grants, worldDrops,
        hooks: {
          world: w,
          player: {
            cx: 10 * TILE, cy: 50 * TILE, x: 10 * TILE - 8, y: 50 * TILE - 14,
            w: 16, h: 28, dead: false, hp: 100, maxHp: 100, mana: 20, maxMana: 200,
            luck: 0.15, addDPS: () => {},
          },
          playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
          damagePlayer: () => {}, spawnParticles: () => {}, spawnBurst: () => {},
          addDamageNumber: () => {},
          spawnDrop: (_x: number, _y: number, key: string) => { worldDrops.push(key); return null; },
          enemies: () => [] as unknown[], critters: () => [] as unknown[], npcs: () => [] as unknown[],
          entities: { add: () => {} },
          onEnemyKilled: () => {},
          lootPlayers: lootPlayers ? () => lootPlayers : undefined,
          grantInstancedLoot: (slot: number, _x: number, _y: number, key: string, stack: number) => {
            grants.push({ slot, key, stack });
          },
        } as never,
      };
    };
    // MP：3 端在场,slot0/1 交互过（interactionSlots）,slot2 旁观
    const { hooks, grants, worldDrops } = mkHooks([
      { slot: 0, x: 10 * TILE, y: 50 * TILE, luck: 0, interacting: true },
      { slot: 1, x: 12 * TILE, y: 50 * TILE, luck: 0, interacting: true },
      { slot: 2, x: 14 * TILE, y: 50 * TILE, luck: 0, interacting: false },
    ]);
    const e = Enemy.fromVanilla(657, EX, EY)!;
    e.applyNetInteraction(0, hooks);   // 交互登记（hurt fromPlayer/msg42 双源同门）
    e.applyNetInteraction(1, hooks);
    e.hurt(999999, 10, 0, hooks, 0, false, 0, true);
    const bags = grants.filter((g) => g.key === 'vi_4957_QueenSlimeBossBag');
    expect(bags.map((b) => b.slot).sort((a, b) => a - b)).toEqual([0, 1]);   // 各交互端一份
    expect(bags.every((b) => b.stack === 1)).toBe(true);
    // 世界掉落（药水/心/大师宠物等共享物）不经 grant——bag 不出现在 worldDrops
    expect(worldDrops).not.toContain('vi_4957_QueenSlimeBossBag');
    // 单人（无 lootPlayers 钩子）：bag 走世界掉落,grant 零调用——今日行为零变化
    const sp = mkHooks(undefined);
    const e2 = Enemy.fromVanilla(657, EX, EY)!;
    e2.hurt(999999, 10, 0, sp.hooks, 0, false, 0, true);
    expect(sp.grants).toHaveLength(0);
    expect(sp.worldDrops).toContain('vi_4957_QueenSlimeBossBag');
  });
});
