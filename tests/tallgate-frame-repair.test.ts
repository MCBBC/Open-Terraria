// ★M-2（2026-09-02 九批）迁移与放置帧约定单测：
//  1) 放置面 framedCellFrame 行步进=原版 TileObject.Place heights+padding 累进
//     （TileObject.cs:96-108）——388/389 高门 0/20/38/56/74（heights{18,16,16,16,18}+
//     pad2,TileObjectData.cs:2301-2303）、567 侏儒 0/20（heights{18,18}+pad2 :4222-4224）。
//  2) 存量自放旧帧迁移（world/tallgateFrameRepair.ts）：18/36/54/72 → 20/38/56/74,
//     顶行 0 不动;幂等（二次运行零改动）;非目标件 frameY=18 合法帧不误伤。
//  3) 行归一 tallGateRowOf（CheckTallGate :52129-52133 heights 递减）与
//     shiftTallGate/devices 行解码同源（Door.ts 唯一权威）。
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { framedCellFrame } from '../src/world/FurnitureStyle';
import { repairTallGateFramesInStore } from '../src/world/tallgateFrameRepair';
import { TALL_GATE_ROW_FY, TALL_GATE_CFH, TALL_GATE_HEIGHTS, tallGateRowOf } from '../src/world/Door';
import { DoorOpeningHelper } from '../src/world/DoorOpeningHelper';

// 高门右键交互回归锁（Player.cs:32552-32560 右键 388→开/389→关;怪物攻开的 389
//  玩家可右键复原——DoorOpeningHelper 只自动关【helper 自己开的】门,vanilla 同）
describe('高门右键切换（toggleTallGate 行为锁）', () => {
  it('389 右键 → 388 关闭复原;388 右键 → 389 开启;非门格/结构残缺不动', () => {
    const w = new World(60, 120, 1, 'tg');
    const st = w.store;
    // sheet 389 有 decor 别名 def(v_389_tallgateopen),idOfSheet 首中会错——
    // 用 TILE_BY_KEY 权威键(Door.shiftTallGate 写入同源)
    const T388 = TILE_BY_KEY['v_388_tall_gate_closed'] ?? -1;
    const T389 = TILE_BY_KEY['v_389_tall_gate_open'] ?? -1;
    const g = Object.create(Game.prototype) as unknown as {
      world: World; sfx: { play(n: string): void }; input: { rightDown: boolean };
      overlapsEntity(x: number, y: number): boolean;
      toggleTallGate(x: number, y: number, closing: boolean): void;
    };
    g.world = w;
    const played: string[] = [];
    g.sfx = { play: (n: string) => played.push(n) };
    g.input = { rightDown: true };
    g.overlapsEntity = () => false;   // ★BJ322：blocked 臂注入（无实体桩）

    // 布一扇右开向高门:锚 (30, 40),388 五行
    for (let dy = 0; dy < 5; dy++) st.setTileSilent(30, 40 + dy, T388, 0, TALL_GATE_ROW_FY[dy]);   // 行帧 0/20/38/56/74
    // ★BJ322：顶/底锚行（CheckTallGate :52142 双行 StrictSolid;afterWrite 扫面对
    //  无锚门=原版毁门本相,行为锁场景须合法锚定）
    st.setTileSilent(30, 39, TILE_BY_KEY['stone']!, 0, 0);
    st.setTileSilent(30, 45, TILE_BY_KEY['stone']!, 0, 0);
    // 帧面:走 shiftTallGate 开→关 自循环生成合法帧（构造期直接手写帧易错,用产物）
    g.toggleTallGate(30, 40, false);                       // 右键闭态=开
    expect(st.get(30, 40)).toBe(T389);
    expect(g.input.rightDown).toBe(false);                 // 成功消费右键
    g.input.rightDown = true;
    g.toggleTallGate(30, 41, true);                        // 点中段格同样命中（锚归一）
    expect(st.get(30, 40)).toBe(T388);                     // 复原关闭态
    expect(st.get(30, 41)).toBe(T388);
    expect(g.input.rightDown).toBe(false);
    // 非门格:失败不消费
    g.input.rightDown = true;
    g.toggleTallGate(31, 40, true);
    expect(g.input.rightDown).toBe(true);
    expect(played.length).toBeGreaterThan(0);              // 开/关音经回调发生
  });
});

// 门悬停图标回归锁(tileInteractionsMouseOver:Player.cs:34038-34064 普通门/34148 高门)
describe('门悬停图标（tileInteractionsMouseOver）', () => {
  it('普通门:样式0=木门25、fx=54 列段=style36、神庙锁门 fy594=神庙钥匙1141;高门=3240', () => {
    const w = new World(60, 120, 1, 'hover');
    const st = w.store;
    const T10 = TILE_BY_KEY['door_closed'] ?? -1;
    const T11 = TILE_BY_KEY['door_open'] ?? -1;
    const T388 = TILE_BY_KEY['v_388_tall_gate_closed'] ?? -1;
    const T389 = TILE_BY_KEY['v_389_tall_gate_open'] ?? -1;
    const g = Object.create(Game.prototype) as unknown as {
      world: World; player: unknown; input: { rightDown: boolean };
      inTileRange(x: number, y: number, tb?: number): boolean;
      tileInteractionsMouseOver(tx: number, ty: number, p: unknown): void;
    };
    g.world = w;
    g.inTileRange = () => true;                        // 射程门桩(单独覆盖面已由 r24 锁)
    const p = {
      cursorItemIconEnabled: false, cursorItemIconID: 0,
      cursorItemIconPush: 0, cursorItemIconText: '', cursorItemIconReversed: false,
    };
    const hover = (tx: number, ty: number) => {
      p.cursorItemIconEnabled = false; p.cursorItemIconID = 0;
      g.tileInteractionsMouseOver(tx, ty, p);
      return p.cursorItemIconID;
    };
    // 闭态木门:fy=0,fx=0 → style 0 → 25
    st.setTileSilent(30, 40, T10, 0, 0);
    expect(hover(30, 40)).toBe(25);
    // 闭态列段 1:fx=54 → style 36(Items 33 档:Doors 表域内)
    st.setTileSilent(31, 40, T10, 54, 0);
    expect(hover(31, 40)).toBeGreaterThan(0);
    // 神庙锁门:fy=594(行段 11) → 神庙钥匙 1141(:34056-34058 覆写)
    st.setTileSilent(32, 40, T10, 0, 594);
    expect(hover(32, 40)).toBe(1141);
    // 开态:fx=0 → style 0 → 25
    st.setTileSilent(33, 40, T11, 0, 0);
    expect(hover(33, 40)).toBe(25);
    // 高门 388/389 → 3240(:34148-34152)
    st.setTileSilent(34, 40, T388, 0, 0);
    st.setTileSilent(35, 40, T389, 0, 0);
    expect(hover(34, 40)).toBe(3240);
    expect(hover(35, 40)).toBe(3240);
  });
});

// 站定门回归锁(DoorOpeningHelper.cs:302-305 LookForDoorsToOpen 入口门):
// 无方向输入且 vx==0 → 自动开扫描整帧跳过(右键关门后站门口不被立即弹开);
// 持方向键/滑速 → 照常自动开。★SW-AS1 2026-09-05:旧 updateTallGateAuto 简化面退役,
// 改驱动 Game.updateDoorHelperAuto(DoorOpeningHelper 全量移植),行为锁保留。
describe('高门自动开站定门', () => {
  it('关门后站门口(无输入+vx=0)保持 388;持 Right 键 → 自动开 389', () => {
    const w = new World(60, 120, 1, 'tg2');
    const st = w.store;
    const T388 = TILE_BY_KEY['v_388_tall_gate_closed'] ?? -1;
    const T389 = TILE_BY_KEY['v_389_tall_gate_open'] ?? -1;
    const g = Object.create(Game.prototype) as unknown as {
      world: World; sfx: { play(n: string): void };
      doorHelper: DoorOpeningHelper; player: unknown; overlapsEntity(x: number, y: number): boolean;
      updateDoorHelperAuto(): void;
    };
    g.world = w;
    g.sfx = { play: () => {} };
    g.doorHelper = new DoorOpeningHelper();   // 壳不跑字段初始化,手动补
    g.overlapsEntity = () => false;
    const player = { x: 30 * 16 - 2, y: 40 * 16, w: 20, h: 42, vx: 0, gravDir: 1,
      inputLeft: false, inputRight: false, getAutoDoorVelocityContribution: () => 0 };
    g.player = player;
    for (let dy = 0; dy < 5; dy++) st.setTileSilent(30, 40 + dy, T388, 0, TALL_GATE_ROW_FY[dy]);
    // ★BJ322：顶/底锚行（afterWrite 扫面对无锚门=原版毁门本相）
    st.setTileSilent(30, 39, TILE_BY_KEY['stone']!, 0, 0);
    st.setTileSilent(30, 45, TILE_BY_KEY['stone']!, 0, 0);
    g.updateDoorHelperAuto();                            // 站定:不重开
    expect(st.get(30, 40)).toBe(T388);
    player.inputRight = true; player.vx = 1;
    g.updateDoorHelperAuto();                            // 持输入:自动开
    expect(st.get(30, 40)).toBe(T389);
  });
});

const idOfSheet = (s: number) => {
  const id = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
  expect(id, `sheet ${s} 应有 def`).toBeGreaterThan(0);
  return id;
};

describe('M-2a 放置面行帧（framedCellFrame PLACE_ROW_FY）', () => {
  it('389/388 行帧 = 0/20/38/56/74（原版 heights+padding 累进）', () => {
    const T388 = idOfSheet(388), T389 = idOfSheet(389);
    for (const tid of [T388, T389]) {
      const sh = TILE_DEFS[tid].vanilla!.sheet;
      expect([0, 20, 38, 56, 74].map((_, dy) => framedCellFrame(sh, 1, 0, 0, dy)[1]))
        .toEqual([0, 20, 38, 56, 74]);
    }
    expect(TALL_GATE_ROW_FY).toEqual([0, 20, 38, 56, 74]);
    expect(TALL_GATE_CFH).toBe(94);                     // TileObjectData.cs:1805-1820 Calculate
    expect(TALL_GATE_HEIGHTS).toEqual([18, 16, 16, 16, 18]);   // :2301
  });

  it('567 侏儒行帧 = 0/20（heights{18,18}+pad2;CheckGnome :54419 完整性同口径）', () => {
    const GN = idOfSheet(567);
    expect(framedCellFrame(567, 1, 0, 0, 0)[1]).toBe(0);
    expect(framedCellFrame(567, 1, 0, 0, 1)[1]).toBe(20);
    expect(GN).toBeGreaterThan(0);
  });

  it('普通 18px 族不漂移（对照:宝箱 21 行帧仍 dy*18）', () => {
    const CHEST = idOfSheet(21);
    expect(framedCellFrame(21, 2, 0, 0, 1)[1]).toBe(18);
  });
});

describe('M-2b 存量旧帧迁移（repairTallGateFramesInStore）', () => {
  it('388/389/567 旧 18px 步进帧 → 原版帧;vanilla 帧与带基帧不动;幂等', () => {
    const w = new World(40, 40, 7, 'tallgate-frame-repair');
    const st = w.store;
    const T388 = idOfSheet(388), T389 = idOfSheet(389), GN = idOfSheet(567);
    // 旧自放门（0/18/36/54/72）
    for (let dy = 0; dy < 5; dy++) st.setTileSilent(10, 9 + dy, T388, 0, 18 * dy);
    // 旧自放侏儒（0/18）
    st.setTileSilent(12, 9, GN, 0, 0);
    st.setTileSilent(12, 10, GN, 0, 18);
    // 已是原版帧的 389（0/20/38/56/74——wld 导入形,不得再动）
    for (let dy = 0; dy < 5; dy++) st.setTileSilent(14, 9 + dy, T389, 0, TALL_GATE_ROW_FY[dy]);
    // 带基帧（style band 94）不得被误映射
    st.setTileSilent(16, 9, T389, 0, 94);

    const fixed1 = repairTallGateFramesInStore(st);
    expect(st.frameY[st.idx(10, 9)]).toBe(0);
    expect(st.frameY[st.idx(10, 10)]).toBe(20);
    expect(st.frameY[st.idx(10, 11)]).toBe(38);
    expect(st.frameY[st.idx(10, 12)]).toBe(56);
    expect(st.frameY[st.idx(10, 13)]).toBe(74);
    expect(st.frameY[st.idx(12, 10)]).toBe(20);
    for (let dy = 0; dy < 5; dy++) expect(st.frameY[st.idx(14, 9 + dy)]).toBe(TALL_GATE_ROW_FY[dy]);
    expect(st.frameY[st.idx(16, 9)]).toBe(94);
    expect(fixed1).toBe(5);   // 4 门格 + 1 侏儒格（顶行 0 两端同值不计）

    const fixed2 = repairTallGateFramesInStore(st);   // 幂等
    expect(fixed2).toBe(0);
  });

  it('非目标件 frameY=18 合法帧不误伤（绳 213/椅 15 族对照）', () => {
    const w = new World(40, 40, 7, 'tallgate-frame-repair-others');
    const st = w.store;
    const ROPE = TILE_BY_KEY['v_213_rope'];
    expect(ROPE).toBeDefined();
    st.setTileSilent(10, 10, ROPE!, 0, 18);
    st.setTileSilent(10, 11, ROPE!, 0, 36);
    expect(repairTallGateFramesInStore(st)).toBe(0);
    expect(st.frameY[st.idx(10, 10)]).toBe(18);
    expect(st.frameY[st.idx(10, 11)]).toBe(36);
  });
});

describe('M-2c 行归一（tallGateRowOf = CheckTallGate :52129-52133 heights 递减）', () => {
  it('原版行帧 → 行序号 0..4;带基帧取模后同值', () => {
    for (let row = 0; row < 5; row++) {
      expect(tallGateRowOf(TALL_GATE_ROW_FY[row])).toBe(row);
      expect(tallGateRowOf(94 + TALL_GATE_ROW_FY[row])).toBe(row);   // band 1
    }
    expect(tallGateRowOf(188 + 56)).toBe(3);                          // band 2
  });
});

// ★2026-09-03 红蓝对抗批:补 TallGateOpeningInfoProvider.TryOpenDoor 几何门
//  (DoorOpeningHelper.cs:172-192)——曾缺此门=扫描(玩家盒±2px)命中 388 即开:
//  站门顶脚下被开洞/悬空半身对门也误开。vanilla 门盒=(锚X*16,锚Y*16,16,80),
//  gravDir=1 → 高度+16(底外延一格);须与收缩盒(hitbox.Y+1/H-2,:322-324)相交
//  (严格不等式)且玩家垂直全含。
describe('高门自动开几何门（TryOpenDoor :172-192 行为锁）', () => {
  const mkGate = () => {
    const w = new World(60, 120, 1, 'tg3');
    const st = w.store;
    const T388 = TILE_BY_KEY['v_388_tall_gate_closed'] ?? -1;
    const T389 = TILE_BY_KEY['v_389_tall_gate_open'] ?? -1;
    const g = Object.create(Game.prototype) as unknown as {
      world: World; sfx: { play(n: string): void };
      doorHelper: DoorOpeningHelper; player: unknown; overlapsEntity(x: number, y: number): boolean;
      updateDoorHelperAuto(): void;
    };
    g.world = w;
    g.sfx = { play: () => {} };
    g.doorHelper = new DoorOpeningHelper();
    g.overlapsEntity = () => false;
    const player = { x: 30 * 16 + 4, y: 44 * 16, w: 20, h: 42, vx: 1, gravDir: 1,
      inputLeft: false, inputRight: true, getAutoDoorVelocityContribution: () => 0 };   // 持输入(过站定门)
    g.player = player;
    for (let dy = 0; dy < 5; dy++) st.setTileSilent(30, 40 + dy, T388, 0, TALL_GATE_ROW_FY[dy]);
    // ★BJ322：顶/底锚行（afterWrite 扫面对无锚门=原版毁门本相）
    st.setTileSilent(30, 39, TILE_BY_KEY['stone']!, 0, 0);
    st.setTileSilent(30, 45, TILE_BY_KEY['stone']!, 0, 0);
    return { g, st, player, T388, T389 };
  };

  it('玩家垂直全含于门盒(640..736) → 开', () => {
    const { g, st, player, T389 } = mkGate();
    player.y = 45 * 16 - player.h;          // 脚=门底(720),盒 678..720 → 收缩 679..719 ⊆ 640..736
    g.updateDoorHelperAuto();
    expect(st.get(30, 40)).toBe(T389);
  });

  it('站门顶(脚=门顶 640)不开——vanilla 不开脚下门(相交门失败)', () => {
    const { g, st, player, T388 } = mkGate();
    player.y = 40 * 16 - player.h;          // 盒 598..640,收缩 599..639:与门盒不相交(639 < 640)
    g.updateDoorHelperAuto();
    expect(st.get(30, 40)).toBe(T388);
  });

  it('脚在门底+16 以下(752)不开——垂直全含失败(751 > 736)', () => {
    const { g, st, player, T388 } = mkGate();
    player.y = 47 * 16 - player.h;
    g.updateDoorHelperAuto();
    expect(st.get(30, 40)).toBe(T388);
  });

  it('贴边不算相交(Rectangle.Intersects 严格):玩家左缘=门右缘(496)不开', () => {
    const { g, st, player, T388 } = mkGate();
    player.x = 31 * 16;                     // 盒 496..516(+num3=1 → 497..517):左缘贴/越门右缘(496)
    player.y = 45 * 16 - player.h;
    g.updateDoorHelperAuto();
    expect(st.get(30, 40)).toBe(T388);
  });
});

// ★2026-09-03 R6/R7（红蓝台账尾差,DoorOpeningHelper.TryCloseDoor :189-213 行为锁）：
//  R6 贴边带=Rectangle.Intersect(:200)+「Width>0||Height>0」(:201-204)——单轴零宽
//  接触(贴边)交 0×n 矩形仍算 StillInDoorArea 不关;曾用严格 AABB(<)把贴边帧判为
//  已离开=提前关门。
//  R7 失败档=非 StillInDoorArea 一律自 _ongoingOpenDoors 移除(:281-288):
//  FailedToCloseDoor(结构残缺/闭足印被堵)=放弃跟踪不重试;DoorIsInvalidated(门被拆)
//  同;曾对 shiftTallGate null 保持跟踪=重试语义,与原版不符。
describe('高门自动关 R6 贴边带 + R7 失败放弃跟踪（TryCloseDoor :189-213）', () => {
  const mkOpenGate = () => {
    const w = new World(60, 120, 1, 'tg4');
    const st = w.store;
    const T388 = TILE_BY_KEY['v_388_tall_gate_closed'] ?? -1;
    const T389 = TILE_BY_KEY['v_389_tall_gate_open'] ?? -1;
    const g = Object.create(Game.prototype) as unknown as {
      world: World; sfx: { play(n: string): void };
      doorHelper: DoorOpeningHelper; player: unknown; overlapsEntity(x: number, y: number): boolean;
      updateDoorHelperAuto(): void;
    };
    g.world = w;
    const played: string[] = [];
    g.sfx = { play: (n: string) => played.push(n) };
    g.doorHelper = new DoorOpeningHelper();
    g.overlapsEntity = () => false;
    // 闭态门 + 玩家贴门持输入 → 走真实开路径入跟踪（替代旧手工 openTallGates.set）
    const player = { x: 30 * 16 - 2, y: 44 * 16 - 42, w: 20, h: 42, vx: 0, gravDir: 1,
      inputLeft: false, inputRight: true, getAutoDoorVelocityContribution: () => 0 };
    g.player = player;
    for (let dy = 0; dy < 5; dy++) st.setTileSilent(30, 40 + dy, T388, 0, TALL_GATE_ROW_FY[dy]);
    // ★BJ322：顶/底锚行（afterWrite 扫面对无锚门=原版毁门本相）
    st.setTileSilent(30, 39, TILE_BY_KEY['stone']!, 0, 0);
    st.setTileSilent(30, 45, TILE_BY_KEY['stone']!, 0, 0);
    g.updateDoorHelperAuto();                        // 自动开 → 389 + 跟踪
    expect(st.get(30, 40)).toBe(T389);
    return { g, st, player, T388, T389, played };
  };

  it('R6 贴边:玩家右缘=门区左缘(479)零宽接触不关;再远 1px 才关', () => {
    const { g, st, player, T388, T389, played } = mkOpenGate();
    player.inputRight = false; player.vx = 0;
    player.x = 479 - player.w;              // 盒 459..479:右缘贴门区左缘(门区 479..497)
    player.y = 44 * 16;                     // 盒 704..746 与门区 640..720 正重叠(另一轴正宽)
    g.updateDoorHelperAuto();
    expect(st.get(30, 40)).toBe(T389);      // 贴边=仍算在门区 → 不关
    expect(g.doorHelper.isTrackingOpenDoor(30, 40)).toBe(true);
    player.x -= 1;                          // 右缘 478 < 479 → 双轴分离 → 关
    g.updateDoorHelperAuto();
    expect(st.get(30, 40)).toBe(T388);
    expect(g.doorHelper.isTrackingOpenDoor(30, 40)).toBe(false);   // ClosedDoor 移除跟踪
    expect(played.length).toBe(2);          // 开/关各 1 次(ShiftTallGate :52213 不分开关恒播)
  });

  it('R7 失败档:结构残缺 shiftTallGate null → 放弃跟踪不重试;门被拆(DoorIsInvalidated)同', () => {
    const { g, st, player, T388, T389, played } = mkOpenGate();
    const STONE = idOfSheet(1);
    st.setTileSilent(30, 42, STONE, 0, 0);  // 中行换石 → ValidateTileSquare 失败(:52201)
    player.x = 0; player.y = 0; player.inputRight = false;   // 移远(足印外) → 触发关尝试
    g.updateDoorHelperAuto();
    expect(g.doorHelper.isTrackingOpenDoor(30, 40)).toBe(false);   // FailedToCloseDoor → 放弃(曾重试)
    expect(st.get(30, 40)).toBe(T389);      // 残门保持开门态未强行关成(原版同)
    // DoorIsInvalidated:再走真实开路径开一扇(34 列)→锚格被拆 → 同样移除跟踪
    for (let dy = 0; dy < 5; dy++) st.setTileSilent(34, 40 + dy, T388, 0, TALL_GATE_ROW_FY[dy]);
    st.setTileSilent(34, 39, TILE_BY_KEY['stone']!, 0, 0);   // ★BJ322：顶/底锚行
    st.setTileSilent(34, 45, TILE_BY_KEY['stone']!, 0, 0);
    player.x = 34 * 16 - 2; player.y = 44 * 16 - 42; player.inputRight = true;
    g.updateDoorHelperAuto();
    expect(g.doorHelper.isTrackingOpenDoor(34, 40)).toBe(true);
    st.setTileSilent(34, 40, 0, 0, 0);      // 锚格被拆
    player.x = 0; player.y = 0; player.inputRight = false;
    g.updateDoorHelperAuto();
    expect(g.doorHelper.isTrackingOpenDoor(34, 40)).toBe(false);
    expect(played.filter((n) => n === 'door_open').length).toBe(2);   // 两次成功开门音;失败档不播(:52213 前置)
  });
});
