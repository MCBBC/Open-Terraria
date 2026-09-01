/**
 * ★★对抗修复批⑤B 2026-09-01 回归锁（housing-seed-selfcheck）。
 * 覆盖蓝本验证底线三项：
 *  (A) B2|R1-F2 宽松墙证据窗【逐格】执行——active 家具格不再整段豁免
 *      （vanilla CheckRoom cs:6139-6159 对每个被处理格无条件双向窗,:6160-6174 判决）。
 *      差分样本：梁下"无证据悬空火把"房在旧实现（纯空气格才跑窗）会被受理,
 *      新实现在火把格即以漏墙出局。
 *  (B) B3|R1-F3 种子帧自检——种子入栈前过邻居侧同一谓词(vanilla StartRoomCheck
 *      cs:6016-6023 种子直弹首检 CheckRoom 全分支：实心 :6108-6112/开门锚帧
 *      :6113-6117/389/:6118-6122/386 边界帧 :6123-6127)。锚帧开门列当种子必拒;
 *      开门【中段】帧(门洞)当种子仍放行=vanilla 穿透语义。
 *  (C) B3a snapSavedHome 容错——legacy 存档 home 锚在开门铰链列时向上重试
 *      有界不死锁:室内候选命中或全体失败优雅返 null（调用方转 homeless）。
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  queryRoom, snapSavedHome, dedupeHomes,
} from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';

const DOOR_C = TILE_BY_KEY['door_closed']!;   // sheet 10
const DOOR_O = TILE_BY_KEY['door_open']!;     // sheet 11
const TORCH = TILE_BY_KEY['torch']!;
const CHAIR = TILE_BY_KEY['chair']!;
const TABLE = TILE_BY_KEY['table']!;

/**
 * 「厚壳盒」：外壳双排厚 wood（roof/floor 左右各两排,保证任意内室格横竖 ±2 窗口
 * 都能摸到壳）,内室 hollow 无任何背景墙。返回内室区间。
 */
function buildThickShellBox(
  w: World, ox: number, oy: number,
): { hx0: number; hx1: number; hy0: number; hy1: number } {
  const st = w.store;
  const outerW = 15, outerH = 16;                 // 外沿含壳: ox..ox+outerW-1
  // 内室 5 宽 × 4 高：ox+3..ox+7 × oy+5..oy+8（壳左右各 3 排、上下各 5 排）
  const hx0 = ox + 5, hx1 = ox + 9, hy0 = oy + 6, hy1 = oy + 9;
  for (let x = ox; x < ox + outerW; x++) {
    for (let y = oy; y < oy + outerH; y++) {
      const inHollow = x >= hx0 && x <= hx1 && y >= hy0 && y <= hy1;
      if (!inHollow) st.setTileSilent(x, y, TILE_BY_KEY['wood']!, 0, 0);
    }
  }
  return { hx0, hx1, hy0, hy1 };
}

describe('(A) B2 宽松墙证据窗逐格执行（家具格不再豁免,R1-F2）', () => {
  /**
   * 房间布局：15×16 厚壳盒,内室 5×4 全裸（wall=0）。四件套齐全（门/桌/椅/光）
   * —— 除光源是「横竖向都无法取得证据的悬空火把」：
   *   · 横向 ±2 列全在内室（最近壳距 3）且沿途只有非实心家具=零横向证据；
   *   · 纵向 ±2 行可达厚壳=纵向证据成立；
   * 两向须都命中才过窗 → 该火把格必拒。旧实现（仅空气格跑窗、家具格整段跳过）
   * 会一路跑完泛洪并受理此房（内室处理格全是会过的空气/家具）＝单向偏松实证。
   */
  function furnishDeadTorchHouse(w: World, ox: number, oy: number, mode: 'deadTorch' | 'walled'): void {
    const st = w.store;
    const r = buildThickShellBox(w, ox, oy);
    let hyX = r.hy1;
    if (mode === 'walled') {
      // 对照组扩舱：向下多清五排壳体（floodRoom 闭包=处理格+一圈边界格,小内室
      // 达不到 MIN_TILES=60 终检）,再满铺房墙（wallHouse 自证,窗口恒真）且不放
      // 死火把——证明壳体/门廊/家具几何本身可围合,拒收只归因于死火把窗判定。
      for (let y = r.hy1 + 1; y <= r.hy1 + 5 && y < st.h - 10; y++) {
        for (let x = r.hx0; x <= r.hx1; x++) st.setTileSilent(x, y, 0, 0, 0);
      }
      hyX = r.hy1 + 5;
    }
    if (mode === 'walled') {
      for (let y = r.hy0; y <= hyX; y++) {
        for (let x = r.hx0; x <= r.hx1; x++) st.wall[st.idx(x, y)] = 4;
      }
    }
    // 门：左壳开三格竖门（空心列替换壳体两处,内外连通由开门负责）
    for (let y = r.hy0; y <= r.hy0 + 2; y++) {
      st.setTileSilent(r.hx0 - 3, y, DOOR_C, 0, (y - r.hy0) * 18);   // 左壳外表面镶门列
      for (let dx = 1; dx <= 2; dx++) st.setTileSilent(r.hx0 - 3 + dx, y, 0, 0, 0); // 壳体穿孔(清为空气)
    }
    // 四件套位置：桌贴新底双行三列、椅左上、火把正中悬空（仅 A 组）
    for (let dx = 0; dx <= 2; dx++) {
      st.setTileSilent(r.hx0 + 1 + dx, hyX, TABLE, dx * 18, 0);
      st.setTileSilent(r.hx0 + 1 + dx, hyX - 1, TABLE, dx * 18, 18);
    }
    st.setTileSilent(r.hx0, r.hy0 + 1, CHAIR, 0, 0);
    if (mode === 'deadTorch') st.setTileSilent(r.hx0 + 2, r.hy0 + 2, TORCH, 22, 0);
  }

  it('梁下悬空火把（自身无墙+横向证据缺失）→ 整房拒（修复前该结构被受理）', () => {
    const w = new World(4200, 1200, 91, 'open');
    furnishDeadTorchHouse(w, 1200, 300, 'deadTorch');
    const q = queryRoom(w.store, 1206, 307, { ignoreNeeds: true });   // 内室顶部作种子
    expect(q.room).toBeNull();                    // 逐格窗：火把格证据不全 → 整房判负
  });

  it('同几何全壁纸无火把对照 → 围合成立（拒收面隔离到火把窗判定而非基础结构）', () => {
    const w = new World(4200, 1200, 92, 'open');
    furnishDeadTorchHouse(w, 1200, 300, 'walled');
    const st = w.store;
    // 正控叠加：壁挂火把（自带墙背靠）在同房中自证两轴恒过——k=0 自身即证据
    st.setTileSilent(1208, 308, TORCH, 22, 0);
    const q = queryRoom(st, 1206, 307, { ignoreNeeds: true });
    expect(q.room).not.toBeNull();
    expect(q.reason).toBe('ok');                                     // ignoreNeeds 只看围合
    expect(q.flags.light).toBe(true);
  });
});

describe('(B) B3 种子帧自检（锚帧开门列当种子必拒,中段门洞照旧穿透）', () => {
  /** 双间连排房（同 nearplayer 样式缩小版）：共享隔墙列铺给定的开门帧组 */
  function buildTwins(w: World, ox: number, oy: number, frames: number[]): number {
    const st = w.store;
    const W = 24;
    for (let x = ox; x <= ox + W; x++) {
      st.setTileSilent(x, oy, TILE_BY_KEY['wood']!, 0, 0);
      st.setTileSilent(x, oy + 6, TILE_BY_KEY['wood']!, 0, 0);
    }
    for (let y = oy + 1; y <= oy + 5; y++) {
      st.setTileSilent(ox, y, TILE_BY_KEY['wood']!, 0, 0);
      st.setTileSilent(ox + W, y, TILE_BY_KEY['wood']!, 0, 0);
    }
    for (let y = oy; y <= oy + 6; y++) for (let x = ox; x <= ox + W; x++) st.wall[st.idx(x, y)] = 4;
    const cx = ox + 12;
    for (let y = oy + 1; y <= oy + 5; y++) st.setTileSilent(cx, y, TILE_BY_KEY['wood']!, 0, 0);
    for (const dy of [0, 1, 2]) st.setTileSilent(cx, oy + 2 + dy, DOOR_O, frames[dy] ?? 90, dy * 18);
    for (const dy of [0, 1, 2]) st.setTileSilent(ox, oy + 2 + dy, DOOR_C, 0, dy * 18);
    st.setTileSilent(ox + 2, oy + 1, TORCH, 22, 0);
    st.setTileSilent(ox + 4, oy + 4, CHAIR, 0, 0);
    for (let dx = 0; dx <= 2; dx++) {
      st.setTileSilent(ox + 5 + dx, oy + 4, TABLE, dx * 18, 0);
      st.setTileSilent(ox + 5 + dx, oy + 5, TABLE, dx * 18, 18);
    }
    return cx;
  }

  it('锚帧开门格直接作种子（UI 点门柱/housingQuery 同路径）→ 拒（room=null,hole 档）', () => {
    for (const f of [0, 54, 72, 126]) {
      const w = new World(4200, 1200, 94, 'open');
      const cx = buildTwins(w, 1800, 300, [f, f, f]);
      const q = queryRoom(w.store, cx, 303, { ignoreNeeds: true });   // 种子=开门硬边帧格
      expect(q.room).toBeNull();                                       // B3 内核级拒绝（此前会粘连泛起）
      expect(['hole', 'needs']).toContain(q.reason);                   // 失败档合理化（任务书授权任一）
    }
  });

  it('开门【中段】帧格作种子（门洞非边界）→ 照旧放行并把两室粘连成一间（穿透语义）', () => {
    const w = new World(4200, 1200, 95, 'open');
    const cx = buildTwins(w, 1900, 300, [18, 36, 90]);
    const q = queryRoom(w.store, cx, 303, { ignoreNeeds: true });     // 种子=门洞中段格
    expect(q.room).not.toBeNull();
    expect(q.room!.tiles.has(w.store.idx(cx + 6, 305))).toBe(true);   // 右室内空气并入
  });

  it('同型几何从普通内室格起扫 → 合并判定与既有 (iii) 锁语义一致（防止内核预检误伤邻格路）', () => {
    const w = new World(4200, 1200, 96, 'open');
    buildTwins(w, 2000, 300, [18, 36, 90]);
    const q = queryRoom(w.store, 2004, 303, { ignoreNeeds: true });
    expect(q.room).not.toBeNull();
  });
});

describe('(C) B3a snapSavedHome 向上重试容错（铰链列存档不死锁,优雅转 homeless）', () => {
  function buildSingle(w: World, ox: number, oy: number, doorFrames: number[]): number {
    const st = w.store;
    const W = 20;
    for (let x = ox; x <= ox + W; x++) {
      st.setTileSilent(x, oy, TILE_BY_KEY['wood']!, 0, 0);
      st.setTileSilent(x, oy + 6, TILE_BY_KEY['wood']!, 0, 0);
    }
    for (let y = oy + 1; y <= oy + 5; y++) {
      st.setTileSilent(ox, y, TILE_BY_KEY['wood']!, 0, 0);
      st.setTileSilent(ox + W, y, TILE_BY_KEY['wood']!, 0, 0);
    }
    for (let y = oy; y <= oy + 6; y++) for (let x = ox; x <= ox + W; x++) st.wall[st.idx(x, y)] = 4;
    const dx = ox + 6;
    for (const dy of [0, 1, 2]) st.setTileSilent(dx, oy + 2 + dy, DOOR_O, doorFrames[dy] ?? 0, dy * 18);
    st.setTileSilent(ox + 2, oy + 1, TORCH, 22, 0);
    st.setTileSilent(ox + 4, oy + 4, CHAIR, 0, 0);
    for (let d = 0; d <= 2; d++) {
      st.setTileSilent(ox + 8 + d, oy + 4, TABLE, d * 18, 0);
      st.setTileSilent(ox + 8 + d, oy + 5, TABLE, d * 18, 18);
    }
    return dx;
  }

  it('legacy home 锚在开门铰链列（硬边帧列）→ 上方内室格命中,有界步数内 snap 成功', () => {
    const w = new World(4200, 1200, 97, 'open');
    const dx = buildSingle(w, 2200, 300, [0, 0, 0]);          // 三行全硬边帧=铰链列
    const snapped = snapSavedHome(w.store, dx, 303);          // 存档原值落在门柱格
    expect(snapped).toEqual([dx, 301]);                       // 上探到门顶上方第一内室格
  });

  it('上方无可居候选（门顶紧贴天花板吊顶带）→ 返 null 优雅转 homeless,不许空转', () => {
    const w = new World(4200, 1200, 98, 'open');
    const st = w.store;
    const dx = buildSingle(w, 2300, 300, [0, 0, 0]);
    // 把门顶以上三格换成实体地板（唯一可能上探方向被封死）
    st.setTileSilent(dx, 301, TILE_BY_KEY['wood']!, 0, 0);
    st.setTileSilent(dx, 300, TILE_BY_KEY['wood']!, 0, 0);
    const snapped = snapSavedHome(st, dx, 303);
    expect(snapped).toBeNull();                               // 有界失败 → homeless 路径
  });

  it('(b) 配套守护:同型房内两点 dedupeHomes 仍按围合面配对（queryRoom 仅求围合语义不变）', () => {
    const w = new World(4200, 1200, 99, 'open');
    const st = w.store;
    buildSingle(w, 2400, 300, [0, 0, 0]);
    const homes = [
      { key: 'guide', x: 2404, y: 305, npcId: 22 },
      { key: 'merchant', x: 2410, y: 305, npcId: 17 },
    ];
    const { kept, dropped } = dedupeHomes(st, homes);
    expect(kept.length + dropped.length).toBe(2);             // 桶覆盖全量
    expect(kept.some((h) => h.key === 'merchant')).toBe(true); // 距包围盒中心更近者保家
    expect(dropped.every((h) => h.key === 'guide')).toBe(true);
  });
});
