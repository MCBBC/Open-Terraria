/**
 * 满足房屋条件时 NPC 自动入住全链验证（2026-08-31 用户检查项）。
 * 覆盖 findFreeHouse 完整入住流（Game.updateTownNpcArrival ①/①'' 的 Housing 侧
 * 全部判据）：±10 锚窗发现（QuickFindHome WorldGen.cs:5684-5691 窗语义）→
 * 门/平台入口枚举 → 围合 + RoomNeeds 四件套门 → ScoreRoom 占用/同住 →
 * 站立点产出（非实心+脚下有界+在房 tiles 内）。
 * Game tick 门（7200）与优先链序（Main.cs num42）此前已对齐（housing-ui.test.ts
 * 头注,2026-08-15 定案）；本文件锁"房合格 ⇒ 入得进 / 缺件或窗外 ⇒ 进不去"。
 */
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import {
  findFreeHouse, housingCheckAt, validateSavedHome, tileSolidLike,
} from '../src/world/Housing';
import { TILE_BY_KEY } from '../src/data/tiles';

const DOOR = 17;   // 本仓闭合门 tile id(housing-ui.test 同源)
const T = TILE_BY_KEY;

type Home = { x: number; y: number; npcId?: number };

/** 参数化标准房：ox..ox+10 × oy..oy+5（interior 9×4;11×6≈75 格 ≥MIN_TILES 60）
 *  结构抄 housing-ui.test buildHouse:双侧竖门(17)×3 高、木墙、3 火把、桌椅。 */
function buildHouse(w: World, ox: number, oy: number, drop?: 'table' | 'chair' | 'light' | 'door'): void {
  const st = w.store;
  for (let x = ox; x <= ox + 10; x++) {
    st.setTileSilent(x, oy, T['wood'], 0, 0);
    st.setTileSilent(x, oy + 5, T['wood'], 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) {
    st.setTileSilent(ox, y, T['wood'], 0, 0);
    st.setTileSilent(ox + 10, y, T['wood'], 0, 0);
  }
  for (let y = oy + 1; y <= oy + 4; y++) for (let x = ox + 1; x <= ox + 9; x++) st.wall[st.idx(x, y)] = 4;
  if (drop !== 'door') {
    for (const dx of [ox, ox + 10]) for (let y = oy + 2; y <= oy + 4; y++) st.setTileSilent(dx, y, DOOR, 0, (y - oy - 2) * 18);
  }
  if (drop !== 'light') {
    st.setTileSilent(ox + 1, oy + 1, T['torch'], 22, 0);
    st.setTileSilent(ox + 9, oy + 1, T['torch'], 44, 0);
    st.setTileSilent(ox + 6, oy + 2, T['torch'], 0, 0);
  }
  if (drop !== 'chair') {
    st.setTileSilent(ox + 4, oy + 3, T['chair'], 0, 0);
    st.setTileSilent(ox + 4, oy + 4, T['chair'], 0, 18);
  }
  if (drop !== 'table') {
    for (let dx = 0; dx <= 2; dx++) {
      st.setTileSilent(ox + 5 + dx, oy + 3, T['table'], dx * 18, 0);
      st.setTileSilent(ox + 5 + dx, oy + 4, T['table'], dx * 18, 18);
    }
  }
}

/** 平台入口房：无门，地板中段挖口铺平台（R21 平台入口语义） */
function buildPlatformHouse(w: World, ox: number, oy: number): void {
  buildHouse(w, ox, oy, 'door');
  const st = w.store;
  for (const x of [ox + 5, ox + 6]) st.setTileSilent(x, oy + 5, T['platform'], 0, 0);
}

describe('入住链：合格房 ⇒ 可入住', () => {
  it('正控:完整房自房内锚立即可发现', () => {
    const w = new World(4200, 1200, 31, 'open');
    buildHouse(w, 2100, 300);
    expect(findFreeHouse(w.store, [], 2104, 304, 22)).not.toBeNull();
  });

  it('±10 锚窗内发现空闲邻房 → 站立位合法且不落已占房', () => {
    const w = new World(4200, 1200, 30, 'open');
    // 房1 2100..2110(A 已占),房2 2112..2122:左门列 2112 在 A@(2103) 的 ±10 窗内
    buildHouse(w, 2100, 300);
    buildHouse(w, 2112, 300);
    const homes: Home[] = [{ x: 2103, y: 304, npcId: 22 }];
    const house = findFreeHouse(w.store, homes, 2103, 304, 17);   // 商人 17 申请
    expect(house).not.toBeNull();
    const h = house!;
    expect(h.standX).toBeGreaterThanOrEqual(2112);                // 落在右单元
    const standIdx = w.store.idx(h.standX, h.standY);
    expect(h.tiles.has(standIdx)).toBe(true);                          // 在本泛洪房间集内
    expect(!(w.store.flags[standIdx] && tileSolidLike(w.store.type[standIdx]))).toBe(true);  // 非实心
    expect(tileSolidLike(w.store.type[w.store.idx(h.standX, h.standY + 1)])).toBe(true);     // 脚下有房界
    // 分配后 home 点通过读档校验(同引擎口径);分配前手动查询 UI 判该房 ok
    expect(validateSavedHome(w.store, h.standX, h.standY)).toBe(true);
    expect(housingCheckAt(w.store, homes, 2116, 303).reason).toBe('ok');
  });

  it('四件套逐件拆除 → 全部拒绝入住(RoomNeeds 门对称性;各 case 带正控防 vacuous)', () => {
    for (const part of ['table', 'chair', 'light', 'door'] as const) {
      const w = new World(4200, 1200, 32, 'open');
      buildHouse(w, 2100, 300, part);
      const homes: Home[] = [{ x: 2090, y: 304, npcId: 22 }];
      const house = findFreeHouse(w.store, homes, 2090, 304, 38);
      if (part === 'door') {
        // 无竖门:仅平台族可作入口探针,纯封闭土墙房不可达=null(QuickFindHome 枚举语义)
        expect(house, `drop=${part} 应不可发现`).toBeNull();
      } else {
        expect(house, `drop=${part} 应拒入住`).toBeNull();
      }
      void part;
    }
    // 正控:同一几何下齐装四件套必可发现(防上面 null 全来自其他判据)
    const wc = new World(4200, 1200, 32, 'open');
    buildHouse(wc, 2100, 300);
    expect(findFreeHouse(wc.store, [{ x: 2090, y: 304, npcId: 22 }], 2090, 304, 38)).not.toBeNull();
  });

  it('占用抑制:同类 NPC 已占 → score -1 拒绝;异类宠物不占坑', () => {
    const w = new World(4200, 1200, 33, 'open');
    buildHouse(w, 2100, 300);
    const occTown: Home[] = [{ x: 2103, y: 304, npcId: 22 }];
    expect(findFreeHouse(w.store, occTown, 2103, 304, 17)).toBeNull();       // 商人申请被占
    expect(findFreeHouse(w.store, [{ x: 2103, y: 304, npcId: 637 }], 2103, 304, 17)).not.toBeNull(); // 猫占用,城镇可共住
  });

  it('±10 锚窗外:远房不可自动入住(原版 QuickFindHome 窗语义;远程正路=住房 UI 手动分配)', () => {
    const w = new World(4200, 1200, 34, 'open');
    buildHouse(w, 2200, 300);
    const house = findFreeHouse(w.store, [], 2100, 304, 22);   // 相距 100 格
    expect(house).toBeNull();
    // 手动分配正路不受距离限制
    expect(housingCheckAt(w.store, [], 2205, 303).reason).toBe('ok');
  });
});

describe('入住链：特殊房型', () => {
  it('平台入口房(无竖门):左端探针可发现并入住', () => {
    const w = new World(4200, 1200, 35, 'open');
    buildPlatformHouse(w, 2100, 300);
    const house = findFreeHouse(w.store, [], 2100, 304, 22);
    expect(house).not.toBeNull();
    expect(validateSavedHome(w.store, house!.standX, house!.standY)).toBe(true);
  });
});

describe('入住链：房况失效复核(updateTownNpcArrival 步骤一撇的 Housing 侧)', () => {
  it('入住后拆桌:以旧 home 为锚复查失败 → 收回房回收入池(vanilla QuickFindHome 失败尾置 homeless)', () => {
    const w = new World(4200, 1200, 37, 'open');
    buildHouse(w, 2100, 300);
    const homes: Home[] = [];
    const first = findFreeHouse(w.store, homes, 2103, 304, 22);
    expect(first).not.toBeNull();
    const hx = first!.standX, hy = first!.standY;
    homes.push({ x: hx, y: hy, npcId: 22 });
    // 复核路径:同 anchor/剔除自占后再跑必须还命中(①''重锚语义)
    const rehouse = findFreeHouse(w.store, homes.filter((h) => !(h.x === hx && h.y === hy)), hx, hy, 22);
    expect(rehouse).not.toBeNull();
    // 拆桌子 → 复核 null → 调用方置 homeless+回收占位
    for (let dx = 0; dx <= 2; dx++) {
      w.store.setTileSilent(2105 + dx, 303, 0, 0, 0);
      w.store.setTileSilent(2105 + dx, 304, 0, 0, 0);
    }
    expect(findFreeHouse(w.store, [], hx, hy, 22)).toBeNull();
  });
});
