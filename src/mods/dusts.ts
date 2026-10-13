// mod 尘埃运行时(★第四批,2026-10-13)。
// 形态:content/dusts/*.json {key,texture,...} → dust type 400+ 段(原版 VanillaDust
// ~355 type;400 留缓冲)→ per-type 贴图 alias vanilla/Dust_<type>.png(Renderer
// drawVanillaDustPass 分支)。运动/碰撞/池=vanilla dust 管线全复用(6000 池;
// dustFrameOf 对 mod type 越界=per-type 贴图分支接管)。
// tML 对应:ModDust 4 钩(PreDraw/OnSpawn/Update/GetAlpha)——本批声明面覆盖
// 贴图+spawn;Update 自定义运动=L2(sw.spawnDust 生成后 mod 持 VDust 引用自管)。
import { MOD_DUST_TYPE_BASE, MOD_DUST_TYPE_MAX } from './types';

export interface ModDustContent {
  key: string;
  /** 独立贴图(textures/ 相对路径;per-type 非 Dust.png 帧) */
  texture: string;
  /** 原版 dust type 运动复用(如 6=火苗/15=星尘/31=烟;缺省=15 档) */
  motionType?: number;
  /** 发光(fullbright pass 而非 lit pass) */
  fullbright?: boolean;
  /** ★R-C-D12-F1(2026-10-13):关运动档光贡献——motionType 重写后 update 链按原版
   *  type 走(含烟雾族/火把族 AddLight 光贡献,tML 同域 mod dust 不发光);本字面
   *  置 d.noLight=true 关闭(spawn 期写,noLightEmittance 同置) */
  noLight?: boolean;
  scale?: number;
  alpha?: number;
}

/** dust type → 贴图 path(alias 用) */
const dustTexById = new Map<number, string>();
/** dust type → 运动复用原版 type(0=不做运动映射,用 vanilla 缺省) */
const dustMotionById = new Map<number, number>();
/** dust type → fullbright */
const dustFullbrightById = new Map<number, boolean>();
/** ★R-C-D12-F1:noLight 声明(运动档光贡献 opt-out) */
const dustNoLightById = new Map<number, boolean>();

export function registerModDustData(
  type: number, texPath: string, motionType: number, fullbright: boolean, noLight = false,
): void {
  if (!(type >= MOD_DUST_TYPE_BASE && type <= MOD_DUST_TYPE_MAX)) {
    throw new Error(`[mod-dust] dust type 须在 ${MOD_DUST_TYPE_BASE}..${MOD_DUST_TYPE_MAX}: ${type}`);
  }
  if (dustTexById.has(type)) throw new Error(`[mod-dust] dust type 重复注册: ${type}`);
  dustTexById.set(type, texPath);
  dustMotionById.set(type, motionType);
  dustFullbrightById.set(type, fullbright);
  dustNoLightById.set(type, noLight);
}

/** mod dust 贴图 path(null=原版域) */
export function modDustTexOf(type: number): string | null {
  return dustTexById.get(type) ?? null;
}

/** mod dust 运动复用原版 type(0=vanilla 缺省) */
export function modDustMotionOf(type: number): number {
  return dustMotionById.get(type) ?? 0;
}

/** mod dust fullbright */
export function modDustFullbright(type: number): boolean {
  return dustFullbrightById.get(type) ?? false;
}

/** mod dust type 判定 */
export function isModDustType(type: number): boolean {
  return type >= MOD_DUST_TYPE_BASE;
}

/** mod dust noLight(R-C-D12-F1) */
export function modDustNoLight(type: number): boolean {
  return dustNoLightById.get(type) ?? false;
}

export function _resetModDustsForTests(): void {
  dustTexById.clear();
  dustMotionById.clear();
  dustFullbrightById.clear();
  dustNoLightById.clear();
}
