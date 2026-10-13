// mod 墙运行时(★刀3-墙,2026-10-13;工坊普查五刀战役,锚点见
// docs/mod-five-knives-recon-2026-10-13.md 刀3 节/第二批)。
// 形态:content/walls/*.json {key,texture,...} → wall id 367+ 段(原版 WALL_DEFS
// 0-366 共 367 条实测)→ WALL_DEFS/WALL_BY_KEY 直追加(墙 id=internal=stable,
// 零恒等表;TileStore.wall u16 通道原生兼容)+ 本表 meta(dropItem/unbreakable/
// dungeonGate——wallDrops 两函数+canPlayerSmashWall 消费)。
// 贴图=Wall_N 同构 TEdit 13 列×36px 整表(vanilla/Wall_<id>.png alias+vmeta 注入,
// assets 两支同接);无贴图/解码失败→mapColor 色块(引擎既有兜底)。
// tML 对应:ModWall 7 钩(Drop/KillWall/AnimateWall/WallFrame/CanBeTeleportedTo/
// OnWallConverted/RegisterItemDrop)——本批声明面覆盖 Drop/KillWall(fail 门),
// AnimateWall/OnWallConverted=登记债(recon doc D 台账)。
import { WALL_DEFS, WALL_BY_KEY } from '../data/tiles';
import { MOD_WALL_STABLE_BASE, MOD_WALL_STABLE_MAX } from './types';

export interface ModWallContent {
  key: string;
  name?: string;
  /** '#RRGGBB'(贴图缺失兜底色;小地图同源) */
  mapColor?: string;
  /** 0-1 缺省 1 */
  opacity?: number;
  /** 大墙框变体(Phlebas/Lazure 三变体;缺省 0=标准 13 列) */
  largeFrame?: 0 | 1 | 2;
  /** Wall_N 同构 TEdit 整表(textures/ 相对路径) */
  texture: string;
  /** 整表行数(缺省 5=180px/36;非常规墙高声明) */
  rows?: number;
  /** 锤墙掉落:本 mod 物品键/`mod_<modid>_<key>` 全键(注册期解析;缺省=不掉) */
  dropItem?: string;
  /** 锤墙恒拒(原版 350 地牢 unsafe 墙同款) */
  unbreakable?: boolean;
  /** killWall fail 门扩展(skeletron=需骷髅王已斩/golem=需石巨人已斩) */
  dungeonGate?: 'skeletron' | 'golem';
}

export interface ModWallMeta {
  dropItemVid?: number;
  unbreakable: boolean;
  dungeonGate?: 'skeletron' | 'golem';
}

/** wall id → meta(锤墙链消费) */
const metaById = new Map<number, ModWallMeta>();

export function registerModWall(
  id: number, fullKey: string,
  def: { name: string; mapColor: string; opacity: number; largeFrame?: 0 | 1 | 2 },
  meta: ModWallMeta,
): void {
  if (!(id >= MOD_WALL_STABLE_BASE && id <= MOD_WALL_STABLE_MAX)) {
    throw new Error(`[mod-wall] wall id 须在 ${MOD_WALL_STABLE_BASE}..${MOD_WALL_STABLE_MAX}: ${id}(${fullKey})`);
  }
  if (WALL_DEFS[id]) throw new Error(`[mod-wall] wall id 已被占用: ${id}(${fullKey} vs ${WALL_DEFS[id]!.key})`);
  if (WALL_BY_KEY[fullKey] !== undefined) throw new Error(`[mod-wall] 重复注册: ${fullKey}`);
  WALL_DEFS[id] = { id, key: fullKey, name: def.name, mapColor: def.mapColor, opacity: def.opacity, largeFrame: def.largeFrame };
  WALL_BY_KEY[fullKey] = id;
  metaById.set(id, meta);
}

/** dropItem 解析(物品注册完成后二段调用;plan.allocation.items 解析面) */
export function registerModWallMeta(id: number, meta: ModWallMeta): void {
  if (!metaById.has(id)) throw new Error(`[mod-wall] meta 前置注册缺失: ${id}`);
  metaById.set(id, meta);
}

/** wall id → meta(非 mod 墙=null) */
export function modWallMetaOf(id: number): ModWallMeta | null {
  return metaById.get(id) ?? null;
}

/** mod 墙段已注册 id 簿(gs.mods.wallIdByKey 装配用;bare 键由调用方剥前缀) */
export function modWallKeyEntries(): Array<{ fullKey: string; id: number }> {
  const out: Array<{ fullKey: string; id: number }> = [];
  for (let i = MOD_WALL_STABLE_BASE; i < WALL_DEFS.length; i++) {
    const d = WALL_DEFS[i];
    if (d?.key.startsWith('mod_')) out.push({ fullKey: d.key, id: i });
  }
  return out;
}

/** 测试清账(WALL_DEFS/WALL_BY_KEY 为引擎全局表——只回收 mod 段占用) */
export function _resetModWallsForTests(): void {
  for (let i = MOD_WALL_STABLE_BASE; i < WALL_DEFS.length; i++) {
    const d = WALL_DEFS[i];
    if (d?.key.startsWith('mod_')) {
      delete WALL_BY_KEY[d.key];
      delete WALL_DEFS[i];
    }
  }
  metaById.clear();
}
