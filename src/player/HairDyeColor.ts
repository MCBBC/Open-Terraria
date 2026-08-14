// 发色剂渲染色（HairShaderDataSet.GetColor:39-46 → LegacyHairShaderData.GetColor:18-27
// → DyeInitializer.cs LoadLegacyHairdyes 逐委托 1:1 移植）。
//
// 原版链路：GetHairColor(Player.cs:54933-54937) 取头部格光照 →
//   Hair.GetColor(shaderId, player, lightColor) → 委托以 player.hairColor 为入参
//   newColor 改写返回；`lighting` 真（默认）时结果再乘光照（LegacyHairShaderData.cs:21-25）。
// 本仓纸娃娃路径不对玩家精灵乘光（与既有头发/衣着同一偏差面），故 useLighting 缺省
// false —— 登记见文件尾 DEVIATIONS。
import type { RGBColor } from './Appearance';
import { TEAM_COLORS } from '../stats/Pvp';

/** (byte) 强转语义：float 运算后截断（C# conv.u1），负值/超界钳 0-255 */
const b = (x: number): number => Math.max(0, Math.min(255, Math.trunc(x)));

/** 两色按 t 插值（DyeInitializer 各委托共用形态 `a*(1-t) + b*t`，float 后截断） */
function mix(c1: readonly number[], c2: readonly number[], t: number): RGBColor {
  const u = 1 - t;
  return { r: b(c1[0] * u + c2[0] * t), g: b(c1[1] * u + c2[1] * t), b: b(c1[2] * u + c2[2] * t) };
}

export interface HairDyeCtx {
  /** statLife / statLifeMax2（生命力染料 :155） */
  hp: number;
  maxHp: number;
  /** statMana / statManaMax2（魔力染料 :162-164） */
  mana: number;
  maxMana: number;
  /** 玩家中心世界 px（深度染料 center.Y :173） */
  centerX: number;
  centerY: number;
  /** velocity（速度染料 :397 |vx|+|vy|） */
  vx: number;
  vy: number;
  /** team 0-5（队伍染料 :334） */
  team: number;
  /** Main.netMode != 0（:334——单机恒 false → 队伍染料取 teamColor[0] 白） */
  netActive: boolean;
  /** player.hairColor（委托入参 newColor） */
  hairColor: RGBColor;
  /** 背包 0-53 槽钱币铜值（金钱染料 :220-247；71铜/72银/73金/74铂） */
  coins: number;
  /** Main.worldSurface / Main.rockLayer / Main.maxTilesY（tile；深度染料 :169-172） */
  worldSurface: number;
  rockLayer: number;
  maxTilesY: number;
  /** Main.dayTime / Main.time（昼夜染料 :293-329；time=当前昼夜段已流逝 tick） */
  isDay: boolean;
  /** 当前昼夜段已流逝 tick（昼 0-54000 / 夜 0-32400） */
  time: number;
  /** Main.waterStyle（群系染料 :346）/ player.ZoneShimmer（:344） */
  waterStyle: number;
  zoneShimmer: boolean;
  /** 微光火把色 0-1 浮点三元组（TorchID.TorchColor(23) :350-351） */
  shimmerTorch: [number, number, number];
  /** Main.DiscoR/G/B 0-255（彩虹染料 :392） */
  disco: [number, number, number];
  /** 头部格光照 0-255（火星染料 :415 Lighting.GetColor） */
  lightRgb: [number, number, number] | null;
  /** 动画时钟（秒；暮光近似用） */
  nowSec: number;
}

/** 群系水色表（DyeInitializer.cs:346 waterStyle → Color；11 与缺省同值走 default） */
const BIOME_WATER_COLORS: Record<number, readonly number[]> = {
  2: [124, 118, 242],   // 腐化
  3: [143, 215, 29],    // 丛林
  4: [78, 193, 227],    // 神圣
  5: [189, 231, 255],   // 雪原
  6: [230, 219, 100],   // 沙漠
  7: [151, 107, 75],    // 发光蘑菇/地下
  8: [128, 128, 128],   // 洞穴
  9: [200, 0, 0],       // 血月
  10: [208, 80, 80],    // 猩红
  12: [230, 219, 100],  // 地下沙漠
  13: [28, 216, 94],    // 地狱（显式分支与 default 同值）
};
const BIOME_WATER_DEFAULT: readonly number[] = [28, 216, 94];

/** 发色剂渲染色。shaderId 0/越界 → null（= 无染料，调用方回落 hairColor×光照） */
export function hairDyeColor(shaderId: number, ctx: HairDyeCtx): RGBColor | null {
  const hair = ctx.hairColor;
  switch (shaderId) {
    case 1: { // 1977 生命力（:153-159）：血量比例红
      return { r: b((ctx.hp / ctx.maxHp) * 235 + 20), g: 20, b: 20 };
    }
    case 2: { // 1978 魔力（:160-166）：缺蓝比例蓝
      const f = 1 - ctx.mana / ctx.maxMana;
      return { r: b(f * 200 + 50), g: b(f * 180 + 75), b: 255 };
    }
    case 3: { // 1979 深度（:167-216）：按中心 Y 五段渐变
      const n1 = ctx.worldSurface * 0.45 * 16;
      const n2 = (ctx.worldSurface + ctx.rockLayer) * 8;
      const n3 = (ctx.rockLayer + ctx.maxTilesY) * 8;
      const n4 = (ctx.maxTilesY - 150) * 16;
      const y = ctx.centerY;
      if (y < n1) return mix([116, 160, 249], [28, 216, 94], y / n1);
      if (y < n2) return mix([28, 216, 94], [151, 107, 75], (y - n1) / (n2 - n1));
      if (y < n3) return mix([151, 107, 75], [128, 128, 128], (y - n2) / (n3 - n2));
      if (y < n4) return mix([128, 128, 128], [255, 50, 15], (y - n3) / (n4 - n3));
      return { r: 255, g: 50, b: 10 };
    }
    case 4: { // 1980 金钱（:217-286）：三阈值四色阶（buyPrice :49014-49017）
      const m = Math.min(ctx.coins, 9999999999);
      const T1 = 50000;      // buyPrice(0,5) = 5 金
      const T2 = 500000;     // buyPrice(0,50) = 50 金
      const T3 = 2000000;    // buyPrice(2) = 2 铂
      if (m < T1) return mix([226, 118, 76], [174, 194, 196], m / T1);
      if (m < T2) return mix([174, 194, 196], [204, 181, 72], (m - T1) / (T2 - T1));
      if (m < T3) return mix([204, 181, 72], [161, 172, 173], (m - T2) / (T3 - T2));
      return { r: 161, g: 172, b: 173 };
    }
    case 5: { // 1981 昼夜（:287-331）：昼/夜各自两段四色环
      if (ctx.isDay) {
        return ctx.time < 27000
          ? mix([1, 142, 255], [255, 255, 0], ctx.time / 27000)
          : mix([255, 255, 0], [211, 45, 127], (ctx.time - 27000) / (54000 - 27000));
      }
      return ctx.time < 16200
        ? mix([211, 45, 127], [67, 44, 118], ctx.time / 16200)
        : mix([67, 44, 118], [1, 142, 255], (ctx.time - 16200) / (32400 - 16200));
    }
    case 6: { // 1982 队伍（:332-340）：Main.teamColor[netMode!=0 ? team : 0]
      const team = ctx.netActive ? ctx.team : 0;
      const c = TEAM_COLORS[Math.max(0, Math.min(TEAM_COLORS.length - 1, Math.trunc(team)))];
      return { r: c[0], g: c[1], b: c[2] };
    }
    case 7: { // 1983 群系（:341-384）：微光 → TorchColor(23)；否则 waterStyle 表
      if (ctx.zoneShimmer) {
        // Color(float,float,float) = 各通道钳 0-1 后 ×255 截断
        return {
          r: b(Math.min(1, ctx.shimmerTorch[0]) * 255),
          g: b(Math.min(1, ctx.shimmerTorch[1]) * 255),
          b: b(Math.min(1, ctx.shimmerTorch[2]) * 255),
        };
      }
      const c = BIOME_WATER_COLORS[ctx.waterStyle] ?? BIOME_WATER_DEFAULT;
      return { r: c[0], g: c[1], b: c[2] };
    }
    case 8:  // 1984 派对（:385-389）
      return { r: 244, g: 22, b: 175 };
    case 9:  // 1985 彩虹（:390-394）
      return { r: ctx.disco[0], g: ctx.disco[1], b: ctx.disco[2] };
    case 10: { // 1986 速度（:395-409）：hairColor → (75,255,200) 按速度比例
      const v = Math.min(Math.abs(ctx.vx) + Math.abs(ctx.vy), 10);
      const t = v / 10;
      return mix([75, 255, 200], [hair.r, hair.g, hair.b], 1 - t);
    }
    case 11: { // 2863 火星（:410-420）：lighting=false；头部光照与发色逐通道均值
      const l = ctx.lightRgb ?? [255, 255, 255];
      return {
        r: b((l[0] + hair.r) >> 1),
        g: b((l[1] + hair.g) >> 1),
        b: b((l[2] + hair.b) >> 1),
      };
    }
    case 12: { // 3259 暮光（:147）：ArmorTwilight 像素着色器——HLSL 不可得，近似
      // uColor=(0.5,0.1,1) 为基调；噪声图 + uTime 旋绕。近似 = 基色与白之间
      // 双相慢波（周期 ~7s/~11s），登记见 DEVIATIONS。
      const t = ctx.nowSec;
      const w1 = 0.5 + 0.5 * Math.sin(t * 0.9);
      const w2 = 0.5 + 0.5 * Math.sin(t * 0.57 + 2.1);
      return {
        r: b(127 + (255 - 127) * w1),
        g: b(25 + (255 - 25) * w1 * w2),
        b: b(255 - 40 * w2),
      };
    }
    default:
      return null;
  }
}

/* ==== 登记偏差（发色剂系统） ====
 * 1. 光照乘区跳过：原版 lighting=true 时染料色再乘头部格光照
 *    （LegacyHairShaderData.cs:21-25）；本仓玩家精灵整体不乘光（纸娃娃烘焙路径
 *    既有偏差面），发色剂取 useLighting=false 同面一致。
 * 2. 暮光 3259 近似：ArmorTwilight 是编译期 effect（HLSL 不在反编译 C# 内），
 *    与盔甲染料 3039 同属 effect 二进制缺口（vanillaDyes.ts 头注）；此处取
 *    uColor=(0.5,0.1,1) 基调的双相慢波近似。
 * 3. 群系 1983 平滑是原版死代码：player.hairDyeColor 全源码无赋值点
 *    （1405/1456 双版核对），A==0 → 每次从目标色起步 ±1 即回原值——等价于
 *    直接取目标色，本仓照此实现（不做平滑状态）。
 * 4. 派对 1984 彩纸尘/内脏 —— ✅ 已接（2026-08-14）：Player.fixedUpdate 头部
 *    UpdateHairDyeDust 1:1（尘 139-142 1/45、gore 276-282 1/225；VanillaDust/
 *    GorePiece 均通用无需扩表——旧注"需扩 5 型"系误判）。
 * 5. 多人 netMode 判定：原版 `Main.netMode != 0`（:334），本仓以 renderEnv.netActive
 *    （Game 每帧注入 net?.active）近似；单机恒 0 = 白发，与原版一致。
 */
