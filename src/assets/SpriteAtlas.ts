// Unity 素材图集运行时加载器
// 数据由 scripts/build-atlas.mjs 生成（public/sprites/atlas.json + resources.json）
// 注意：Unity 精灵 rect 的 y 轴原点在【左下】，Canvas 在【左上】，取用时要翻转。
import atlasJson from '../../public/sprites/atlas.json';
import resourcesJson from '../../public/sprites/resources.json';

export interface SpriteRect { name: string; x: number; y: number; w: number; h: number; }
export interface SpriteRef { file: string; sprite: string; }
export interface RuleDef {
  id: number;
  sprites: SpriteRef[];
  neighbors: number[];
  positions: Array<[number, number]>;
  transform: number;
  output: number;
}
export interface RuleTileDef { defaultSprite: SpriteRef | null; tilingRules: RuleDef[]; }

export interface AtlasFile { guid: string; sprites: SpriteRect[]; idToName: Record<string, string>; }
export interface AtlasData {
  files: Record<string, AtlasFile>;
  guidToFile: Record<string, string>;
}
export interface ResourcesData {
  items: Array<{ name: string; type: string; iconGuid: string | null; placeTile: string | null; funcList: string }>;
  tiles: Array<{ name: string; tileGuid: string; layer: string; digList: string; digTime: string; dropItemGuid: string }>;
  potions: Array<{ name: string; type: string; iconGuid: string | null; buffType: number | null; duration: number | null; isHealType: string }>;
  accessories: Array<{ name: string; type: string; iconGuid: string | null }>;
  buffs: Array<{ name: string; iconGuid: string | null }>;
  anims: Record<string, SpriteRef[]>;
  rules: Record<string, RuleTileDef>;
}

export interface DrawRect { img: HTMLImageElement | HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number; }

/** 整图硬 alpha：alpha ≥128 → 255，<128 → 0（并清零 RGB），消除提取 PNG 的半透明镶边 */
function hardAlpha(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] >= 128) px[i + 3] = 255;
    else {
      px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0;
    }
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

export class SpriteAtlas {
  data = atlasJson as unknown as AtlasData;
  resources = resourcesJson as unknown as ResourcesData;
  images = new Map<string, HTMLImageElement | HTMLCanvasElement>();
  /** 人工标注（annotator.html 导出）：sheet → spriteName → 方位标签 */
  annotations: Record<string, Record<string, string>> = {};

  async load(onProgress?: (p: number) => void): Promise<void> {
    const files = Object.keys(this.data.files);
    let done = 0;
    await Promise.all(files.map((f) => new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        // 根源处理：整图硬 alpha —— 抗锯齿半透明像素（提取 PNG 的灰/黑镶边来源）
        // 二值化为 0/255，所有消费方（tile/墙/图标/角色）统一获得干净像素
        this.images.set(f, hardAlpha(img));
        done++;
        onProgress?.(done / files.length);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = `sprites/${encodeURI(f)}`;
    })));
    // 人工标注（可选，缺失时回退）
    try {
      const r = await fetch('sprites/annotations.json');
      if (r.ok) this.annotations = await r.json();
    } catch { /* 无标注 */ }
  }

  has(file: string): boolean {
    return this.images.has(file);
  }

  /** 取精灵绘制矩形（Unity y 翻转已处理）。找不到返回 null。 */
  rect(file: string, sprite: string): DrawRect | null {
    const img = this.images.get(file);
    const entry = this.data.files[file];
    if (!img || !entry) return null;
    const s = entry.sprites.find((x) => x.name === sprite);
    if (!s) return null;
    return { img, sx: s.x, sy: img.height - s.y - s.h, sw: s.w, sh: s.h };
  }

  /** 按资源名取整图（物品/Buff 图标等单图资源） */
  byGuid(guid: string | null | undefined): DrawRect | null {
    if (!guid) return null;
    const file = this.data.guidToFile[guid];
    if (!file) return null;
    const img = this.images.get(file);
    if (!img) return null;
    return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
  }

  animFrames(anim: string): DrawRect[] {
    const frames = this.resources.anims[anim] ?? [];
    return frames.map((f) => this.rect(f.file, f.sprite)).filter(Boolean) as DrawRect[];
  }
}

// ---- 资源名（resources.json 的 name 字段是 \uXXXX 转义，JSON.parse 已还原）----
export function itemIconByType(atlas: SpriteAtlas, typeNum: number): DrawRect | null {
  const it = atlas.resources.items.find((x) => Number(x.type) === typeNum);
  return atlas.byGuid(it?.iconGuid ?? null);
}

export function findItem(atlas: SpriteAtlas, name: string) {
  return atlas.resources.items.find((x) => x.name === name);
}

// 我们的 item key → Maples 物品资源名（图标替换表）
export const ITEM_ICON_MAP: Record<string, string> = {
  dirt_block: '泥土', stone_block: '石头', wood: '木材', torch: '火把',
  workbench: '工作台', furnace: '熔炉', anvil: '铁砧',
  iron_sword: '铁剑', iron_pickaxe: '铁镐', iron_axe: '铁斧', iron_ore: '铁矿', iron_bar: '铁锭',
  heal_potion: '治疗药水', agility_potion: '敏捷药水', ironskin_potion: '铁皮药水',
  thorns_potion: '荆棘药水', regen_potion: '恢复药水',
  lucky_horseshoe: '幸运马掌', feral_claws: '猛爪手套',
};

// 特殊手动映射（无 .asset 登记的图标）
const ITEM_DIRECT_MAP: Record<string, { file: string; sprite: string }> = {
  acorn: { file: 'UI/工具/Item_62.png', sprite: 'Item_62_0' }, // 树种
};

/** 按我们的 item key 取 Maples 图标矩形（搜索 items + potions + accessories 三个来源） */
export function atlasIconForKey(atlas: SpriteAtlas, key: string): DrawRect | null {
  const direct = ITEM_DIRECT_MAP[key];
  if (direct) return atlas.rect(direct.file, direct.sprite);
  const resName = ITEM_ICON_MAP[key];
  if (!resName) return null;
  const r = atlas.resources;
  const res =
    r.items.find((x) => x.name === resName) ??
    (r.potions ?? []).find((x) => x.name === resName) ??
    (r.accessories ?? []).find((x) => x.name === resName);
  return atlas.byGuid(res?.iconGuid ?? null);
}
