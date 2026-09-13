// ============================================================================
// SW-FX52 联机域协议面收口（2026-09-13，FX42 登记册 R6/R11/R12 三笔）回归测试：
//   R12 箱改名 msg69（ChestName）——编解码字节级往返 / Room 改名段受理门
//      （施加对象=在用箱 / 未开箱静默丢 / 255 清名 / 旧端无尾段零扰动）/
//      msg69 广播镜像 / 授予名断言随发 / ClientNet 分发 / Game 消费面结构锁
//   R11 serverAuth 房拓展位（SimHost 侧）——dawnRolls 挂 anglerQuestSwapInto
//      （与 Game.anglerQuestSwap 单源）+ module15 sub0 权威断言（msg74 等价）+
//      Room 记账联动（anglerQuest/今日交付集清空）+ 进房补发携带
//   R6 超级矿车 msg4 位免接线结构锁（8quater.3-B 判例维持——跨端消费面=零,
//      死码位禁入 protocol 线格式）
// 标杆行号全部 1457（Terarria1457）；传输层 mock 同 sw-fx42-mp-faces 先例。
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { NetWriter, NetReader, Msg, NetModule,
  writeChestName, readChestName, readChestRenameTail,
  CHEST_NAME_MAX, CHEST_NAME_CLEAR } from '../src/net/protocol';
import { AnglerQuestSub } from '../src/net/syncModules';
import { ClientNet } from '../src/net/ClientNet';
import { World } from '../src/world/World';
import { rollAnglerQuest, seededRng, ANGLER_QUEST_ITEMS } from '../src/data/vanillaFishing';

/** 假 ws（sw-fx42 同款） */
function fakeWs() {
  const sent: Uint8Array[] = [];
  const ws = {
    sent, readyState: 1, bufferedAmount: 0,
    send: (data: ArrayBuffer | Uint8Array) => { sent.push(new Uint8Array(data as ArrayBuffer)); },
    close: () => { ws.readyState = 3; },
    onopen: null, onmessage: null, onclose: null, onerror: null,
  };
  return ws;
}

/** 帧流切分（sw-fx42 同款） */
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

function feedNet(net: ClientNet, frame: Uint8Array): void {
  (net as unknown as { handle(msgId: number, r: NetReader): void })
    .handle(frame[2], new NetReader(frame.subarray(3)));
}

// ---------------- Room 夹具（sw-fx42 同款） ----------------

interface RcStub {
  ws: { sent: Uint8Array[]; readyState: number };
  slot: number; state: number; isHost: boolean;
  lastX: number; lastY: number; lastPosAt: number;
  [k: string]: unknown;
}
interface RoomStub {
  handle(c: RcStub, msgId: number, r: NetReader): void;
  flushOutbox(): void;
  newClient(ws: unknown): RcStub;
  disconnect(c: RcStub): void;
  readonly clients: Set<RcStub>;
  anglerQuest: number | null;
  anglerFinishedSlots: Set<number>;
  chestUserBySlot: Map<number, number>;
  chestUserOf(idx: number): number;
}

async function mkRoom(): Promise<{ room: RoomStub; mkClient(s: number, h?: boolean): RcStub }> {
  const { Room } = await import('../../server/src/room');
  const worldMod = await import('../src/world/World');
  const room = new Room(new worldMod.World(64, 32, 42, 'fx52-room')) as unknown as RoomStub;
  const mkClient = (slot: number, isHost = false): RcStub => {
    const c = room.newClient(fakeWs());
    c.slot = slot; c.state = 10; c.isHost = isHost;
    room.clients.add(c);
    c.lastX = 100; c.lastY = 100; c.lastPosAt = Date.now();
    return c;
  };
  return { room, mkClient };
}

async function relay(room: RoomStub, c: RcStub, msgId: number, frame: Uint8Array): Promise<void> {
  room.handle(c, msgId, new NetReader(frame.subarray(3)));
  room.flushOutbox();
}

/** msg33 帧（本仓线格式 {i16 idx, i32 x, i32 y[, u8 nameLen, [str name]]}）。
 *  rename='' → nameLen=255（清名）；undefined → 无尾段（旧端形状） */
function msg33(idx: number, x: number, y: number, rename?: string | ''): Uint8Array {
  const w = new NetWriter(Msg.ChestOpenState).i16(idx).i32(x).i32(y);
  if (rename !== undefined) {
    if (rename === '') w.u8(CHEST_NAME_CLEAR);
    else { w.u8(rename.length); w.str(rename); }
  }
  return w.finish();
}

interface ChestRec { x: number; y: number; items: unknown[]; name?: string }

function seedChest(room: RoomStub, x: number, y: number, name?: string): number {
  const chests = (room as unknown as { world: { chests: ChestRec[] } }).world.chests;
  chests.push({ x, y, items: [], ...(name !== undefined ? { name } : {}) });
  return chests.length - 1;
}
function worldChests(room: RoomStub): ChestRec[] {
  return (room as unknown as { world: { chests: ChestRec[] } }).world.chests;
}

/** 采集 sent 中 msg69 帧 */
function chestNameFrames(frames: Uint8Array[]): Array<{ idx: number; x: number; y: number; name: string }> {
  const out: Array<{ idx: number; x: number; y: number; name: string }> = [];
  for (const f of parseFrames(frames)) {
    if (f.msgId !== Msg.ChestName) continue;
    const idx = f.payload.i16(), x = f.payload.i16(), y = f.payload.i16();
    out.push({ idx, x, y, name: f.payload.str() });
  }
  return out;
}

/** 采集 sent 中 module15 帧（sw-fx42 同款字节重扫） */
function module15Subs(frames: Uint8Array[]): Array<{ sub: number; value: number }> {
  const out: Array<{ sub: number; value: number }> = [];
  for (const f of parseFrames(frames)) {
    if (f.msgId !== Msg.NetModules) continue;
    const r = f.payload;
    if (r.u16() === NetModule.AnglerQuest) {
      const sub = r.u8();
      out.push({ sub, value: r.remaining > 0 ? r.u8() : -1 });
    }
  }
  return out;
}

// ============================================================================
// 1. R12 编解码：msg69 ChestName + msg33 改名尾段
// ============================================================================

describe('SW-FX52-R12 msg69 ChestName 编解码（NetMessage.cs:1119-1126 / MessageBuffer.cs:3053-3074）', () => {
  it('字节级往返：{i16 idx, i16 x, i16 y, str name}，帧头 msgId=69；\'\'=清名同样成帧', () => {
    const f = writeChestName(7, 120, 55, '宝箱A');
    expect(f[2]).toBe(69);
    expect(readChestName(new NetReader(f.subarray(3)))).toEqual({ chestIdx: 7, x: 120, y: 55, name: '宝箱A' });

    const f2 = writeChestName(0, -1, -1, '');
    expect(readChestName(new NetReader(f2.subarray(3)))).toEqual({ chestIdx: 0, x: -1, y: -1, name: '' });
  });

  it('门面：idx∈[0,8000)（:3056/:3078）+ 截断拒收', () => {
    expect(readChestName(new NetReader(writeChestName(7999, 1, 1, 'a').subarray(3)))).not.toBeNull();
    expect(readChestName(new NetReader(writeChestName(8000, 1, 1, 'a').subarray(3)))).toBeNull();
    expect(readChestName(new NetReader(writeChestName(-1, 1, 1, 'a').subarray(3)))).toBeNull();
    expect(readChestName(new NetReader(new Uint8Array([3, 0, 1, 0])))).toBeNull(); // 剩余 <8
  });

  it('msg33 改名尾段 num24 语义（NetMessage.cs:895-905 / MessageBuffer.cs:1928-1937）', () => {
    // readChestRenameTail 合约=读完已知段后调用——本测试直接喂尾段字节
    const tail = (...b: Array<number | string>): Uint8Array => {
      const w = new NetWriter(Msg.ChestOpenState);
      for (const v of b) (typeof v === 'number' ? w.u8(v) : w.str(v));
      return w.finish().subarray(3);
    };
    // 无尾段（旧端帧,idx/x/y 消费后 remaining=0）→ null
    expect(readChestRenameTail(new NetReader(new Uint8Array(0)))).toBeNull();
    // 1..20 → 名串（'宝箱A'=3 字符,nameLen=字符数,NetMessage.cs:900 text3.Length 同口径）
    expect(readChestRenameTail(new NetReader(tail(3, '宝箱A')))).toBe('宝箱A');
    expect(readChestRenameTail(new NetReader(tail(20, 'x'.repeat(20))))).toBe('x'.repeat(20));
    // 255 → 清名（收端 :1948-1952 num24!=0 即写 string.Empty 同款）
    expect(readChestRenameTail(new NetReader(tail(CHEST_NAME_CLEAR)))).toBe('');
    // 21..254 非原版产出（原版写面 len==0||len>20 → 恒写 255）→ 无名
    expect(readChestRenameTail(new NetReader(tail(30)))).toBeNull();
    // 20 字符钳常量（ChestUI.RenameChestSubmit 面 → NetMessage.cs:899-903 钳位）
    expect(CHEST_NAME_MAX).toBe(20);
    expect(CHEST_NAME_CLEAR).toBe(255);
  });
});

// ============================================================================
// 2. R12 Room 面：改名受理门 + msg69 广播 + 授予名断言
// ============================================================================

describe('SW-FX52-R12 Room 改名受理（MessageBuffer.cs:1962-1969 等价）', () => {
  it('改名广播：施加在用箱 + 广播排除改名者（:1969 TrySendData(69,-1,whoAmI,...)）', async () => {
    const { room, mkClient } = await mkRoom();
    const host = mkClient(0, true);
    const guest = mkClient(1);
    const idx = seedChest(room, 20, 10);
    await relay(room, guest, Msg.RequestChestOpen, new NetWriter(Msg.RequestChestOpen).i32(20).i32(10).finish());
    expect(room.chestUserBySlot.get(1)).toBe(idx);
    host.ws.sent.length = 0;
    guest.ws.sent.length = 0;   // 授予阶段（含名断言）已验,清缓冲隔离改名阶段
    await relay(room, guest, Msg.ChestOpenState, msg33(idx, 20, 10, '秘密基地'));
    expect(worldChests(room)[idx].name).toBe('秘密基地');
    expect(chestNameFrames(host.ws.sent)).toEqual([{ idx, x: 20, y: 10, name: '秘密基地' }]);
    // 改名者自己不收（本地已落地；原版广播排除 whoAmI）
    expect(chestNameFrames(guest.ws.sent)).toEqual([]);
  }, 20000);

  it('施加对象=发送者当前在用箱（Main.player[whoAmI].chest :1962），非本帧 idx', async () => {
    const { room, mkClient } = await mkRoom();
    mkClient(0, true);
    const guest = mkClient(1);
    const idxA = seedChest(room, 20, 10);
    const idxB = seedChest(room, 40, 10);
    await relay(room, guest, Msg.RequestChestOpen, new NetWriter(Msg.RequestChestOpen).i32(20).i32(10).finish());
    // 本帧 idx 指向箱 B，改名仍落在在用箱 A（换箱流：改名先于 chest 更新）
    await relay(room, guest, Msg.ChestOpenState, msg33(idxB, 40, 10, '错不了'));
    expect(worldChests(room)[idxA].name).toBe('错不了');
    expect(worldChests(room)[idxB].name).toBeUndefined();
  }, 20000);

  it('未开箱改名 → 静默丢（原版此处读 Main.chest[chest3] 即 NRE；合法流恒先开后改名）', async () => {
    const { room, mkClient } = await mkRoom();
    const host = mkClient(0, true);
    const guest = mkClient(1);
    const idx = seedChest(room, 20, 10);
    await relay(room, guest, Msg.ChestOpenState, msg33(idx, 20, 10, '没开就要改'));
    expect(worldChests(room)[idx].name).toBeUndefined();
    expect(chestNameFrames(host.ws.sent)).toEqual([]);
  }, 20000);

  it('255 清名 + 关箱后在用箱已清 → 改名静默丢（施加对象门随断线/关箱语义收敛）', async () => {
    const { room, mkClient } = await mkRoom();
    mkClient(0, true);
    const guest = mkClient(1);
    const idx = seedChest(room, 20, 10, '旧名');
    await relay(room, guest, Msg.RequestChestOpen, new NetWriter(Msg.RequestChestOpen).i32(20).i32(10).finish());
    await relay(room, guest, Msg.ChestOpenState, msg33(idx, 20, 10, ''));
    expect(worldChests(room)[idx].name).toBeUndefined();
    // 关箱（无尾段旧端形状照常记账）→ 在用箱清 → 再改名静默丢
    await relay(room, guest, Msg.ChestOpenState, msg33(-1, -1, -1));
    expect(room.chestUserBySlot.has(1)).toBe(false);
    await relay(room, guest, Msg.RequestChestOpen, new NetWriter(Msg.RequestChestOpen).i32(20).i32(10).finish());
    await relay(room, guest, Msg.ChestOpenState, msg33(-1, -1, -1));   // 关箱清占用
    await relay(room, guest, Msg.ChestOpenState, msg33(idx, 20, 10, '迟到的改名'));
    expect(worldChests(room)[idx].name).toBeUndefined();
  }, 20000);

  it('授予名断言随发：msg31 应答序=chestFrame → msg69（存档名投递位,原版进端箱表名域等价）', async () => {
    const { room, mkClient } = await mkRoom();
    mkClient(0, true);
    const guest = mkClient(1);
    const idx = seedChest(room, 20, 10, '沉船宝箱');
    await relay(room, guest, Msg.RequestChestOpen, new NetWriter(Msg.RequestChestOpen).i32(20).i32(10).finish());
    const guestFrames = parseFrames(guest.ws.sent);
    const chestIdxPos = guestFrames.findIndex((f) => f.msgId === Msg.SyncChestItem);
    const namePos = guestFrames.findIndex((f) => f.msgId === Msg.ChestName);
    expect(chestIdxPos).toBeGreaterThanOrEqual(0);
    expect(namePos).toBe(chestIdxPos + 1);   // 名帧紧随内容帧（登记→落名序）
    const nf = guestFrames[namePos].payload;
    expect(nf.i16()).toBe(idx);
    expect(nf.i16()).toBe(20);
    expect(nf.i16()).toBe(10);
    expect(nf.str()).toBe('沉船宝箱');
    // 未命名箱：''（本地本就无名,清名语义无害）
    const idx2 = seedChest(room, 44, 10);
    await relay(room, guest, Msg.RequestChestOpen, new NetWriter(Msg.RequestChestOpen).i32(44).i32(10).finish());
    const n2 = chestNameFrames(guest.ws.sent);
    expect(n2[n2.length - 1]).toEqual({ idx: idx2, x: 44, y: 10, name: '' });
  }, 20000);
});

// ============================================================================
// 3. R12 客户端镜像：ClientNet 分发 + Game 消费面结构锁
// ============================================================================

describe('SW-FX52-R12 ClientNet msg69 镜像 + 消费面', () => {
  it('msg69 → onChestName 钩（MessageBuffer.cs:3053-3074 读面）；越界 idx 编解码层拒收', () => {
    const got: Array<{ idx: number; x: number; y: number; name: string }> = [];
    const net = new ClientNet(
      { player: { appearance: null, hostile: false, team: 0, inv: { slots: [] } } } as never,
      { onChestName: (idx: number, x: number, y: number, name: string) => got.push({ idx, x, y, name }) } as never,
    );
    feedNet(net, writeChestName(3, 44, 55, '改名了'));
    expect(got).toEqual([{ idx: 3, x: 44, y: 55, name: '改名了' }]);
    feedNet(net, writeChestName(8000, 1, 1, 'x'));
    expect(got).toHaveLength(1);
  });

  it('Game 消费面结构锁：netApplyChestName（索引域 netChestWatch + 位置 break 面）接线在位', () => {
    const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
    // 消费方法存在且按 netChestWatch 索引域 + 位置校验定位（原版 :3068-3070 break 同款）
    expect(src).toMatch(/netApplyChestName\(chestIdx: number, x: number, y: number, name: string\)/);
    expect(src).toMatch(/netChestWatch\.find\(\(wch\) => wch\.idx === chestIdx\)/);
    // 钩注册接线（死码守卫：钩在 ClientNet 分发,Game 必须消费）
    expect(src).toMatch(/onChestName: \(chestIdx, x, y, name\) => this\.netApplyChestName/);
    // 开箱公告 idx 域修正（chestIndexByPos=服务器域优先,本地 indexOf 回退）
    expect(src).toMatch(/chestIndexByPos\.get\(`\$\{cxyOpen\.x\},\$\{cxyOpen\.y\}`\)/);
  });
});

// ============================================================================
// 4. R11 SimHost 黎明拓展位：渔夫任务重掷 + module15 sub0 断言
// ============================================================================

describe('SW-FX52-R11 SimHost.dawnRolls 渔夫任务（UpdateTime_StartDay Main.cs:66352 → AnglerQuestSwap）', () => {
  interface SimLike { dawnRolls(): void }

  async function mkSimRoom(seed: number, dayCount: number) {
    const { Room } = await import('../../server/src/room');
    const { SimHost } = await import('../../server/src/sim/SimHost');
    const w = new World(64, 32, seed, 'fx52-sim');
    w.clock.dayCount = dayCount;
    const room = new Room(w) as unknown as RoomStub & { world: World };
    const sim = new (SimHost as unknown as new (r: unknown, o: { peaceMode: boolean }) => SimLike)(room, { peaceMode: false });
    return { room, sim, w };
  }

  it('黎明重掷：world.anglerQuest=单源 swap 终值 + Room 记账联动 + sub0 广播（simStub isHost 放行）', async () => {
    const { room, sim, w } = await mkSimRoom(4242, 7);
    const host = room.newClient(fakeWs());
    host.slot = 0; host.state = 10; host.isHost = false;
    room.clients.add(host);
    host.lastX = 100; host.lastY = 100; host.lastPosAt = Date.now();
    // 预置昨日交付记账 → swap 后必须清空（AnglerQuestSwap :3805-3806 信号面）
    room.anglerQuest = 3;
    room.anglerFinishedSlots.add(0);
    w.anglerWhoFinishedToday.push('someone');

    sim.dawnRolls();

    // 单源终值（与 Game.anglerQuestSwap 同式：门旗 + seed^dayCount 播种）
    const expected = rollAnglerQuest({
      hardMode: false, evil: w.crimson ? 'crimson' : 'corrupt', anyBoss: false,
      hasWorldSurface: w.groundLevel > 50,
    }, seededRng((w.seed ^ Math.imul(w.clock.dayCount, 0x9E3779B1)) | 0));
    expect(w.anglerQuest).toBe(expected);
    expect(w.anglerQuestFinished).toBe(false);            // :3806
    expect(w.anglerWhoFinishedToday).toEqual([]);          // :3805
    expect(room.anglerQuest).toBe(expected);               // Room 权威记账（handleFromSim 管线）
    expect(room.anglerFinishedSlots.size).toBe(0);
    // sub0 断言全房（msg74 等价下行）
    const subs = module15Subs(host.ws.sent).filter((p) => p.sub === AnglerQuestSub.Quest);
    expect(subs.length).toBeGreaterThan(0);
    expect(subs[0].value).toBe(expected);
  }, 20000);

  it('确定性：同 seed 同 dayCount 两次黎明 → 同任务鱼；任务号在 41 表值域内', async () => {
    const a = await mkSimRoom(777, 3);
    const b = await mkSimRoom(777, 3);
    a.sim.dawnRolls();
    b.sim.dawnRolls();
    expect(a.w.anglerQuest).toBe(b.w.anglerQuest);
    expect(a.w.anglerQuest).toBeGreaterThanOrEqual(0);
    expect(a.w.anglerQuest).toBeLessThan(ANGLER_QUEST_ITEMS.length);
  }, 20000);

  it('进房补发携带权威任务号（R11 前 SimHost 不 swap → Room.anglerQuest 恒 null=补发空）', async () => {
    const { room, sim } = await mkSimRoom(999, 2);
    sim.dawnRolls();
    expect(room.anglerQuest).not.toBeNull();
    const joiner = room.newClient(fakeWs());
    joiner.slot = 3; joiner.state = 10; joiner.isHost = false;
    room.clients.add(joiner);
    joiner.lastX = 100; joiner.lastY = 100; joiner.lastPosAt = Date.now();
    room.handle(joiner, Msg.SpawnTileData, new NetReader(new NetWriter(Msg.SpawnTileData).i32(100).i32(100).finish().subarray(3)));
    room.flushOutbox();
    const subs = module15Subs(joiner.ws.sent).filter((p) => p.sub === AnglerQuestSub.Quest);
    expect(subs.length).toBeGreaterThan(0);
    expect(subs[0].value).toBe(room.anglerQuest);
  }, 20000);

  // ★SW-RB15d stopEvents 门（Main.cs:66399-66402，Game.ts:9655-9658 同式）：
  //  月总/天界柱黎明压制日食+入侵 roll，swap 不随门短路（:66352 前置兄弟段）。
  //  变异证红：拆门 → dawnRolls 至少消耗一次 Math.random（日食/哥布林 roll 可达）。
  it('stopEvents 门：天界柱黎明 swap 照跑 + 事件 roll 整段短路（零 Math.random 消费）', async () => {
    const { sim, w } = await mkSimRoom(4242, 7);
    w.flags.hardMode = true;
    w.flags['downed_134'] = true;          // downedMechBossAny（毁灭者）
    w.flags.shadowOrbSmashed = true;       // 哥布林 roll 可达（原 1/3）
    w.lunarEvent.active = true;            // ShouldNormalEventsBeAbleToStart → true
    const rndSpy = vi.spyOn(Math, 'random');
    const expected = rollAnglerQuest({
      hardMode: true, evil: w.crimson ? 'crimson' : 'corrupt', anyBoss: true,
      hasWorldSurface: w.groundLevel > 50,
    }, seededRng((w.seed ^ Math.imul(w.clock.dayCount, 0x9E3779B1)) | 0));
    sim.dawnRolls();
    expect(rndSpy).not.toHaveBeenCalled();           // 门在日食/哥布林 roll 之前
    rndSpy.mockRestore();
    expect(w.anglerQuest).toBe(expected);            // swap 前置不随门短路（:66352）
    expect(w.clock.eclipse).toBe(false);             // :66409 日食 roll 不可达
    expect(w.invasionType).toBe(0);                  // :66427-66444 入侵 roll 不可达
  }, 20000);

  it('stopEvents 门结构锁：SimHost.dawnRolls 门表达式与 swap 置顶序（防静默回退）', () => {
    const src = readFileSync(new URL('../../server/src/sim/SimHost.ts', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('private dawnRolls()'), src.indexOf('updateWeather') > 0 ? src.indexOf('// ================= 天气') : undefined);
    expect(fn).toContain('anglerQuestSwapInto(w);');
    const swapPos = fn.indexOf('anglerQuestSwapInto(w);');
    const gatePos = fn.indexOf('if (stopEvents) return;');
    expect(gatePos).toBeGreaterThan(swapPos);        // 门在 swap 之后（:66352 → :66399）
    expect(fn).toContain('w.lunarEvent.active || w.lunarEvent.moonLordCountdown > 0');
    expect(fn).toContain('vanillaId === 398');       // AnyNPCs(398)（Main.cs:66446）
  });
});

// ============================================================================
// 5. R6 免接线结构锁（8quater.3-B 判例维持）
// ============================================================================

describe('SW-FX52-R6 超级矿车 msg4 位免接线（NetMessage.cs:185-186 / MessageBuffer.cs:346-347）', () => {
  it('线格式零位面：protocol.ts 不得出现 superCart 位（跨端消费面=零,死码位禁入）', () => {
    const src = readFileSync(new URL('../src/net/protocol.ts', import.meta.url), 'utf8');
    expect(src.match(/superCart/i)).toBeNull();
    // vanilla 锚仍在位（判例定性非「原版无此机制」而是「本仓零跨端消费面」：
    // msg4 bitsByte16[3]/[4]=unlocked/enabledSuperCart 写/读面真实存在；
    // UsingSuperCart 消费=Mount.cs:4851 / LegacyPlayerRenderer.cs:150 / Player.cs:29512
    // 全部 own-player 域,移动权威=本端自报（msg13 模型）,远端坐骑渲染不同步）
  });
});
