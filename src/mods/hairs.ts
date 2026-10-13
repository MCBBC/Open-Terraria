// mod 发型运行时(★第三批,2026-10-13)。
// 形态:content/hairs/*.json {key,texture,...} → hair id 228-255 段(原版
// HAIR_COUNT=228,ids 0-227;byte 存档域顶 255=28 个 mod 槽)→ _hairCountMax 可变顶
// (validateAppearance/CHAR_CREATION_HAIRS 消费)+贴图 alias
// vanilla/Player_Hair_<id+1>.png(PaperDoll 消费)。
// 首刀覆盖:纯视觉声明(贴图+back/female/creation 旗);tML ModHair 的
// GetUnlockConditions/AltTexture=登记债。
import { MOD_HAIR_BASE, MOD_HAIR_MAX } from './types';

export interface ModHairContent {
  key: string;
  /** Player_Hair_N 同构贴图(textures/ 相对路径;N=hairId+1) */
  texture: string;
  /** 后发层(缺省=按原版 backHairDraw 域外默认 true) */
  back?: boolean;
  /** 女性随机性别校正 */
  female?: boolean;
  /** 捏人可选(缺省 true) */
  creation?: boolean;
}

/** hair id → 贴图 path(alias 用;PaperDoll 消费面间接经 ensureVImage) */
const hairTexById = new Map<number, string>();
/** hair id → back 旗 */
const hairBackById = new Map<number, boolean>();
/** hair id → female 旗 */
const hairFemaleById = new Map<number, boolean>();
/** 可变顶(=max registered hair id+1;原版 228) */
let _hairCountMax = 228;

export function registerModHairData(id: number, texPath: string, back: boolean, female: boolean): void {
  if (!(id >= MOD_HAIR_BASE && id <= MOD_HAIR_MAX)) {
    throw new Error(`[mod-hair] hair id 须在 ${MOD_HAIR_BASE}..${MOD_HAIR_MAX}: ${id}`);
  }
  hairTexById.set(id, texPath);
  hairBackById.set(id, back);
  hairFemaleById.set(id, female);
  if (id + 1 > _hairCountMax) _hairCountMax = id + 1;
}

/** 可变 HAIR_COUNT(validateAppearance/CHAR_CREATION_HAIRS 消费) */
export function hairCountMax(): number { return _hairCountMax; }

/** mod 发型贴图 path(alias 用;null=原版域) */
export function modHairTexOf(id: number): string | null {
  return hairTexById.get(id) ?? null;
}

/** mod 发型 back 旗(原版域=false→走 backHairDraw 原版表) */
export function modHairBack(id: number): boolean {
  return hairBackById.get(id) ?? false;
}

/** mod 发型 female 旗 */
export function modHairFemale(id: number): boolean {
  return hairFemaleById.get(id) ?? false;
}

export function _resetModHairsForTests(): void {
  hairTexById.clear();
  hairBackById.clear();
  hairFemaleById.clear();
  _hairCountMax = 228;
}
