// 物块通行性双向对账（唯一真值源：src/data/vanilla-tilecollision.json ←
// tools/extract-tile-collision.mjs 自 Main.cs tileSolid/tileSolidTop 全量提取 +
// TileID.Sets.Platforms）。
//
// 映射模型（本仓引擎语义 ↔ 原版）：
//   原版 solid && !solidTop（完全实心）          → def.solid=true,  def.platform=false
//   原版 solidTop（顶行可站：平台/铁砧/钢琴/笼子…）→ def.platform=true, def.solid=false
//     （solidTop+solid 组合 19/239/380/427/435-439 在原版 X 拦截/上顶拦截处被
//      !tileSolidTop 全量豁免 ⇒ 碰撞等价于纯 platform；stand 顶行由
//      TileStore.isPlatform 的 frameY==0 门 + Platforms 集 PlatformProperTopFrame 承担）
//   Bubble(379)：tileSolid 每帧更新期置 false（DoUpdateInWorld 头置 false、尾置回
//     true 的三明治）——碰撞语义=非实心，特判豁免。
import { describe, expect, it } from 'vitest';
import collisionJson from '../src/data/vanilla-tilecollision.json';
import { TILE_DEFS, type TileDef } from '../src/data/tiles';

const VAN = (collisionJson as unknown as {
  tiles: Array<{ id: number; name: string; solid: boolean; solidTop: boolean; platform: boolean }>;
}).tiles;

/** sheet(=原版 tile id) → defs（同一原版类型可拆多个本地 def：Plants(3) 拆
 *  蘑菇/花/草丛三帧族——parity 要求该 sheet 全部 def 一致） */
const BY_SHEET = new Map<number, TileDef[]>();
for (const d of TILE_DEFS) {
  const sheet = (d as unknown as { vanilla?: { sheet?: number } }).vanilla?.sheet;
  if (sheet === undefined) continue;
  if (!BY_SHEET.has(sheet)) BY_SHEET.set(sheet, []);
  BY_SHEET.get(sheet)!.push(d);
}
const defOf = (sheet: number): TileDef | undefined => BY_SHEET.get(sheet)?.[0];

/** 运行时特殊语义豁免表（碰撞非纯数据可得） */
const RUNTIME_SPECIAL = new Map<number, string>([
  [379, 'Bubble：tileSolid 每帧更新期被置 false（Main.cs DoUpdateInWorld 头/尾三明治）→ 碰撞语义=非实心'],
]);

const oursSolid = (d: TileDef) => d.solid && !d.platform;
const oursStandTop = (d: TileDef) => d.platform;

describe('物块通行性对账（Main.cs tileSolid/tileSolidTop 全表）', () => {
  it('已注册 sheet 的双向 parity：solid↔solid、solidTop↔platform', () => {
    const mismatch: string[] = [];
    for (const v of VAN) {
      if (RUNTIME_SPECIAL.has(v.id)) continue;
      const defs = BY_SHEET.get(v.id);
      if (!defs?.length) continue;          // 未注册：下一个用例专门核对
      const wantSolid = v.solid && !v.solidTop;
      const wantTop = v.solidTop || v.platform;
      for (const d of defs) {
        if (oursSolid(d) !== wantSolid || oursStandTop(d) !== wantTop) {
          mismatch.push(`${v.id}=${v.name}: vanilla(solid=${+v.solid},top=${+v.solidTop}) vs ` +
            `${d.name}(solid=${+d.solid},platform=${+d.platform})`);
        }
      }
    }
    expect(mismatch.join('\n')).toBe('');
  });

  it('未注册但原版有标记的 tile 全清单（数量闸门：注册面只增不减）', () => {
    const unreg = VAN.filter((v) => !BY_SHEET.has(v.id) && !RUNTIME_SPECIAL.has(v.id));
    // 现状 = 全量注册（2026-08-14 审计基线 0）：原版 399 个有标记 tile 每个都有
    // 对应 def。闸门恒 0——新增原版标记 tile（版本升级）必须同步注册，否则
    // 导入世界可穿墙/挡死的静默漂移会被此测试拦下。
    if (unreg.length) {
      for (const u of unreg) console.error('  未注册:', u.id, u.name, `s=${+u.solid} top=${+u.solidTop}`);
    }
    expect(unreg.length).toBe(0);
  });

  it('关键通行语义 spot-check（对齐提取源逐项）', () => {
    // 完全实心
    for (const id of [1, 30, 48, 53, 226, 235, 446, 546]) {
      const d = defOf(id)!;
      expect(d && oursSolid(d), `tile ${id}`).toBe(true);
    }
    // 顶面可站（frameY==0）：平台/铁砧/秘银砧/钢琴/书架/梳妆台/篝火桌?/金属条/种植箱/笼子
    for (const id of [19, 16, 134, 87, 101, 88, 239, 380, 285, 710]) {
      const d = defOf(id)!;
      expect(d && oursStandTop(d), `tile ${id}`).toBe(true);
    }
    // 平台族（Platforms 集：PlatformProperTopFrame 消费）
    for (const id of [19, 427, 435, 436, 437, 438, 439]) {
      expect(BY_SHEET.has(id), `platform ${id} 注册`).toBe(true);
    }
    // 可通行（原版无标记）
    for (const id of [11, 386, 389]) {      // OpenDoor/TrapdoorOpen/TallGateOpen
      const d = defOf(id);
      if (!d) continue;
      expect(oursSolid(d) || oursStandTop(d), `tile ${id} 应可通行`).toBe(false);
    }
    // 门关闭=完全实心
    expect(oursSolid(defOf(10)!), 'ClosedDoor').toBe(true);
  });
});
