// BJ326（2026-09-24）BJ311 登记债两件清偿（掉落域）：
//   件 1 固定初速 spawnDrop ~20 站同族对拍——逐站判谳结论（反编译锚）：
//     · 原版 velocity=null（→NewItem 随机初速掷 Item.cs:49746-49756）= 压倒性多数：
//       KillTile_DropItems/KillWall_DropItems/DropDoorItem/TE*DropItem/Wiring 雕像
//       (:2390/:2409/:2589)/ToggleGemLock(:46921)/ShakeTree/Pigronata(:53339+)/
//       金币雨(WorldGen.cs:72378 GetItemSource_FromCoinRain)/暗影珠(KillTile case 31)/
//       仙人掌(KillTile_DropItems case 80→276)/RequestNewItem 族（Extractinator
//       Player.cs:42409、Moss :42187、Hay :45062、Digesting :19054、TorchGod :17988、
//       QuickSpawnItem→GetOrDropItem 尾 :7202（染料商 :57355/渔夫 :56963/钓鱼捕获
//       Projectile.cs:54904/沼泽棉花糖 :50976/合成溢出 CraftingRequests.cs:340）、
//       橡实弹 :80271、蜂巢湿灭 :76626、沙枪兜底 :79295/:79300、坠星 :79349）——
//       本仓全部改走 spawnDrop 缺省随机掷（dropVelocity 通道）。
//     · 原版显式速度=固定面（登记本相,未动）：DropSelectedItem(Player.cs:5191
//       (4·dir+vel.X,-2))、LuckyCoin(:44919 Next(10,31)×0.2·dir, Next(-20,1)×0.2)、
//       ClassyCane(:44729 (2+NextFloat×2)·dir,-2-NextFloat×2)、TryDroppingSingleItem
//       死亡掉落(:55027 Next(-20,21)×0.2, Next(-20,1)×0.2——本仓旧 vy 分布不符已修)、
//       SpawnShimmeredItem(WorldItem.cs:631 ±num7)、金币喷泉(CoinPortalProj
//       UnitY.RotatedByRandom)、1.4.5 横幅=claimable 光标认领制（BannerSystem.cs:255
//       FakeCursorItem,无世界掉落锚→本仓 (0,-3) 自有近似）、BigMimic 物品炮
//       (NPC.cs:45326 不映射本仓站)。
//   件 2 掉落物盒 12×12 → 原版按 vid（Item.width/height,tools/extract-itemdims.mjs
//     → vanilla-itemdims.json,6170/6196=99.6% 覆盖;25 vid 流分析形态缺口回落 12×12）。
//     任务书"vanilla-itemstats 已有"系误记（实测 1024 条全盔甲/配饰档零 width 键）——
//     数据面由本件新建提取器落库。
// 测试三层：①数据金标（12 vid 逐值手校 Item.cs 行号）+ItemDrop 盒接线+同中心
//   拾取判别（18×18 触拾而 12×12 不触）②dropVelocity 代表站分布+掷序 ③静态闸
//   （签名缺省翻转/掷块在位/固定面 keep-list census 钉死）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { ItemDrop } from '../src/entities/ItemDrop';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } from '../src/data/items';
import { RNG } from '../src/core/rng';
import { dropVelocity } from '../src/drops/NpcDrops';
import type { Player } from '../src/entities/Player';
import type { GameHooks } from '../src/entities/types';

const internalIdOf = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;

describe('BJ326-件2① vanilla-itemdims 数据金标（12 vid 逐值手校 Item.cs 终值）', () => {
  // 手校行号（1457）：58 :2078-2080 / 71 :2219-2220 / 75 :2302-2304 / 27 :1698-1712 /
  // 8=DefaultToTorch 工厂体 / 969 :48233 DefaultToFood(12,12) / 15 :1579
  // DefaultToInfoAccessory(24,28) / 206 :3970-3975 / 4957 :40021-40026 /
  // 2222 :22416-22422（BJ311 商贩帽）/ 3351 :31983-31992 width=(height=28) 联合赋值 /
  // 1479 :18300-18316 区间 if / 520 :7609-7611
  const GOLDEN: Array<[vid: number, w: number, h: number, note: string]> = [
    [58, 12, 12, '心（pickup 类）'],
    [71, 10, 10, '铜币'],
    [75, 18, 18, '坠落星'],
    [27, 18, 18, '橡实'],
    [8, 10, 12, '火把（DefaultToTorch 定值工厂）'],
    [969, 12, 12, '熟棉花糖（DefaultToFood 参化工厂）'],
    [15, 24, 28, '信息配饰（DefaultToInfoAccessory(24,28) 参化）'],
    [206, 20, 20, 'Muramasa'],
    [4957, 24, 24, '旅行商帽（专家袋族）'],
    [2222, 18, 18, '商贩帽（BJ311 用户实报 vid,18×18 非 12×12）'],
    [3351, 28, 28, 'ClassyCane（SetDefaults3(4) 委托+width=(height=28) 覆盖）'],
    [1479, 30, 30, '旗幡族（if(type>=1479&&type<=1494) 区间块）'],
  ];
  it.each(GOLDEN)('vid %i = %i×%i（%s）', (vid, w, h) => {
    const id = internalIdOf(vid);
    expect(id).toBeGreaterThan(0);
    expect(ITEM_DEFS[id]?.vid).toBe(vid);
    const d = new ItemDrop(0, 0, id, 1);
    expect(d.w).toBe(w);   // 盒接线 = 表值（构造期注入）
    expect(d.h).toBe(h);
  });

  it('表外/SW 物品回落 12×12（旧统一盒）', () => {
    const d = new ItemDrop(0, 0, 99999, 1);   // 未注册内部 id → vid=-1
    expect(d.w).toBe(12);
    expect(d.h).toBe(12);
  });
});

describe('BJ326-件2② 盒尺寸拾取判别（同一中心,18×18 触拾而 12×12 不触）', () => {
  /** 岸地世界（无液体面）+ 玩家桩（vanilla 盒 20×42 于原点） */
  function hooks(w: World, box: { x: number; y: number; w: number; h: number }): GameHooks {
    const player = {
      dead: false, x: box.x, y: box.y, w: box.w, h: box.h,
      cx: box.x + box.w / 2, cy: box.y + box.h / 2,
      inv: { add: () => 0 },        // 首探即整堆入包（拾取成功路径）
    } as unknown as Player;
    return {
      world: w, player,
      enemies: () => [], critters: () => [], npcs: () => [], drops: [],
      damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
      onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
      showPickupLabel: () => {}, recLog: () => {},
      achievements: { notifyItemPickup: () => {} },
    } as unknown as GameHooks;
  }

  it('商贩帽 2222（18×18）与 12×12 物同中心摆放:帽触拾,12×12 不触（判别面）', () => {
    const w = new World(60, 256, 11, 'bj326-dims-pickup');
    w.groundLevel = 60;
    // 摆位远离开界 20 格余量（出界 despawn 先于判别干扰）。相对几何同前:
    // 中心锚 = 玩家盒右上外 7px:18×18 盒与玩家 [0,20)×[0,42) 沿 x 交叠 2px;
    // 12×12 盒全在 x≥21 → 与玩家盒零交。
    const PX = 600, PY = 2100;                       // 玩家盒左上（世界腹地）
    const cx = PX + 27, cy = PY + 6;                 // 掉落中心
    const hat = new ItemDrop(cx - 9, cy - 9, internalIdOf(2222), 1, 0, 0);
    expect(hat.w).toBe(18); expect(hat.h).toBe(18);
    expect(hat.x).toBe(cx - 9);   // 盒左上 = 中心-9
    const sw = new ItemDrop(cx - 6, cy - 6, 99999, 1, 0, 0);   // 表外 id → 12×12 回落
    expect(sw.w).toBe(12); expect(sw.h).toBe(12);
    const hHat = hooks(w, { x: PX, y: PY, w: 20, h: 42 });
    hat.fixedUpdate(1 / 60, hHat);
    expect(hat.dead).toBe(true);                    // 18×18 → 触拾
    const hSw = hooks(w, { x: PX, y: PY, w: 20, h: 42 });
    sw.fixedUpdate(1 / 60, hSw);
    expect(sw.dead).toBe(false);                    // 12×12 同中心 → 不触（仅拉取档）
    expect(sw.grabbed).toBe(true);                  // 拉取臂仍受理（±42px 扩展盒内）
  });
});

describe('BJ326-件1③ dropVelocity 代表站初速分布（NewItem velocity=null 随机掷语义）', () => {
  it('默认族:vx∈[-3,3]/vy∈[-4.0,-1.6] 上开区间(RB30b-F4 口径),2000 掷统计居中', () => {
    let vxMin = 99, vxMax = -99, vyMin = 99, vyMax = -99, vySum = 0, vxSum = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const v = dropVelocity(new RNG((Math.random() * 0x7fffffff) | 0), 206);
      vxMin = Math.min(vxMin, v.vx); vxMax = Math.max(vxMax, v.vx);
      vyMin = Math.min(vyMin, v.vy); vyMax = Math.max(vyMax, v.vy);
      vxSum += v.vx; vySum += v.vy;
      expect(v.vx).toBeGreaterThanOrEqual(-3);
      expect(v.vx).toBeLessThanOrEqual(3);
      expect(v.vy).toBeLessThanOrEqual(-1.6);   // 上界开:Next(-40,-15)→[-40,-16]×0.1
      expect(v.vy).toBeGreaterThanOrEqual(-4.0);
      expect(v.vy).not.toBe(-1.5);              // 旧 int(-40,-15) 多含档
    }
    expect(vxMax).toBeGreaterThan(2.5);          // 分布两端可达
    expect(vxMin).toBeLessThan(-2.5);
    expect(vyMin).toBeLessThanOrEqual(-3.9);
    expect(Math.abs(vxSum / N)).toBeLessThan(0.15);       // vx 居中 0
    expect(vySum / N).toBeLessThan(-2.6);                 // vy 居中 -2.8
  });

  it('ItemNoGravity 族(520):双向 Next(-30,31)×0.1——vy 可正可负', () => {
    let posVy = 0;
    for (let i = 0; i < 400; i++) {
      const v = dropVelocity(new RNG((Math.random() * 0x7fffffff) | 0), 520);
      expect(v.vy).toBeGreaterThanOrEqual(-3);
      expect(v.vy).toBeLessThanOrEqual(3);
      if (v.vy > 0) posVy++;
    }
    expect(posVy).toBeGreaterThan(20);   // 近半数上抛（居中 0）
  });

  it('掷序纪律:单次调用恰两掷,X 先于 Y（X=Next(-30,31) 取 lo=-30,Y=Next(-40,-16) 取 lo=-40）', () => {
    const his: number[] = [];
    const rng = {
      int: (lo: number, hi: number) => { his.push(hi); return lo; },
    } as unknown as RNG;
    const v = dropVelocity(rng, 206);
    expect(his).toEqual([30, -16]);      // 第 1 掷 X 上界 30、第 2 掷 Y 上界 -16
    expect(v.vx).toBe(-3);               // X=-30×0.1
    expect(v.vy).toBe(-4.0);             // Y=-40×0.1
  });
});

describe('BJ326-④ 静态闸（缺省翻转钉死+固定面 keep-list census）', () => {
  const game = readFileSync('src/core/Game.ts', 'utf8');
  /** spawnDrop 调用行 census（剥行注释;块注行以 * 开头天然含前缀被剥不动——
   *  只按「剥注后含 spawnDrop(」收集） */
  const spawnDropLines = (src: string): string[] =>
    src.split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .filter((l) => l.includes('spawnDrop('));

  it('spawnDrop 签名=vx?/vy?（缺省 undefined→随机掷,旧 (0,-2) 缺省翻转钉死;★BJ390 尾参 placeStyle?+prefix? 顺延钉死）', () => {
    expect(game).toMatch(/spawnDrop\(x: number, y: number, itemKey: string, count = 1, vx\?: number, vy\?: number, placeStyle\?: number,\s*\n\s*prefix\?: number\)/);
    expect(game).not.toMatch(/spawnDrop\(x: number, y: number, itemKey: string, count = 1, vx = 0, vy = -2/);
    expect(game).toContain('dropVelocity(new RNG(');   // 掷块在位
    expect(game).toContain('drop.x = x - drop.w / 2'); // 件 2 中心锚回退在位
    expect(game).toContain('drop.y = y - drop.h / 2');
  });

  it('固定面 keep-list:显式初速站恰为登记清单（多一少一即红=强制过闸复核）', () => {
    const lines = spawnDropLines(game);
    // ★BJ-C9-SP（2026-10-09）登记 1→2：34324 DestroyChest 有物拒拆兜底（"保 12×12
    //  旧缺省"站,BJ377 批落刀漏过闸;域外补登记,非 C9 域内改动）
    expect(lines.filter((l) => /,\s*0,\s*-2\)/.test(l)).length).toBe(2);   // dumpChest + DestroyChest 兜底（SW 兜底面×2）
    expect(lines.filter((l) => /,\s*0,\s*0\)/.test(l)).length).toBe(1);    // 展示区溢出（SW 面）
    expect(lines.filter((l) => l.includes('0, -3, banner')).length).toBe(1); // 横幅（1.4.5 认领制近似）
    expect(lines.filter((l) => l.includes('coin.vx, coin.vy')).length).toBe(1); // LuckyCoin :44919
    // 死亡掉落=TryDroppingSingleItem 逐字（Player.cs:55027,两站:背包+钱币）
    expect((game.match(/\(Math\.floor\(Math\.random\(\) \* 41\) - 20\) \* 0\.2/g) ?? []).length).toBe(2);
    // 钓鱼捕获/沼泽棉花糖旧 (0,-1) 退役
    expect(lines.filter((l) => /,\s*0,\s*-1\)/.test(l)).length).toBe(0);
  });

  it('UI 丢弃面=DropSelectedItem 显式速度保持（Player.cs:5191 (4·dir+vel.X,-2);★BJ390 词缀随行尾参）', () => {
    const ui = readFileSync('src/ui/UI.ts', 'utf8');
    expect(ui).toMatch(/p\.facing \* 4 \+ p\.vx, -2, undefined, this\.heldStack\.prefix\)/);
  });
});
