// mod 资产注入(2026-10-04):贴图 → SpriteAtlas 运行时注入。
// 三条通道(全部零改 SpriteAtlas/渲染面):
//   ① 物品图标:vimages['vanilla/Item_<stableId>.png'](vicon 资源包覆盖键整图直取,
//      SpriteAtlas.ts:510-512 现成缝——remaster 同款注入模式,main.ts:246 先例)
//   ② NPC 表:vimages['vanilla/NPC_<npcId>.png'](Renderer.ts:11929 模板键)
//   ③ tile 表:vanilla.tiles[<伪 sheet id>] 元数据注册 + vimages[<meta.sheet>]
//      (vmeta(sheetId) 读 vanilla.json 对象——运行时可写;伪 sheet≡stable id 恒等式,
//      registerModTile 落的 vanilla.sheet=stableId 在此闭环)
// 时序:loadAssets() 内 atlas.load() 之后、任何 chunk 烘焙之前(与 remaster/resourcepacks
// 同窗)。失败静默不阻断启动(单图坏只缺该图)。
import { getLoadedPacks, getModLoadResult } from './loader';
import { discoverPackJsonPaths, readPackJson } from './pack';
import type { VanillaTileMeta } from '../assets/SpriteAtlas';
import type { ModItemContent, ModNpcContent, ModTileContent } from './types';

/** mod 内容键 → 全键(与 register.ts 同式) */
const fullKeyOf = (modId: string, key: string): string => (key.startsWith('mod_') ? key : `mod_${modId}_${key}`);

async function decodePng(bytes: Uint8Array): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }));
  } catch { return null; }
}

function packTexBytes(pack: { files: Map<string, Uint8Array> }, texPath: string): Uint8Array | null {
  return pack.files.get(texPath.startsWith('textures/') ? texPath : `textures/${texPath}`)
    ?? pack.files.get(texPath) ?? null;
}

/** 构造 mod tile 的 VanillaTileMeta(仅 style 模式;竖排 style 帧表)。
 *  grid/stride 遵循 vanilla 图集纪律(16px 格×占格数 + 2px gutter = 18 步长);
 *  cols 由位图宽反推;rows=声明 styles(缺省按位图高反推)。 */
function buildModTileMeta(bmp: ImageBitmap, spec: ModTileContent): VanillaTileMeta {
  const fw = spec.frameWidth ?? 1;
  const fh = spec.frameHeight ?? 1;
  const gridW = fw * 16;
  const gridH = fh * 16;
  const cols = Math.max(1, Math.floor((bmp.width + 2) / (gridW + 2)));
  const rows = Math.max(1, Math.floor((bmp.height + 2) / (gridH + 2)));
  return {
    name: spec.name ?? spec.key,
    key: spec.key,
    sheet: '',               // 由调用方回填 fileKey
    solid: spec.solid ?? false,
    blend: false,            // mod tile 走 style 路径,不参与 8 向融合程序(tileframe-program 只覆盖原版)
    framed: false,
    light: false,
    color: spec.mapColor ?? '#808080',
    placement: null,
    grid: [gridW, gridH],
    stride: [gridW + 2, gridH + 2],
    frameSize: [[fw, fh]],
    cols,
    rows: spec.styles ?? rows,
  };
}

/** 注入全部已装载 mod 的贴图。幂等(重复调用覆盖同键)。 */
export async function applyModAssets(atlas: import('../assets/SpriteAtlas').SpriteAtlas): Promise<void> {
  const result = getModLoadResult();
  if (!result || result.allocation === null) return;
  const { items, tiles, npcs } = result.allocation;
  const tileMetaTable = atlas.vanilla.tiles as unknown as Record<string, unknown>;
  for (const pack of getLoadedPacks()) {
    const modId = pack.manifest.id;
    // —— 解码 textures/ 全量(按需:只解被引用的) ——
    const referenced = new Set<string>();
    for (const path of discoverPackJsonPaths(pack, 'items')) {
      const spec = readPackJson<ModItemContent>(pack, path);
      if (spec?.texture && items.has(fullKeyOf(modId, spec.key))) {
        referenced.add(spec.texture);
        inject(atlas, `vanilla/Item_${items.get(fullKeyOf(modId, spec.key))}.png`,
          await decodePngOrWarn(pack, modId, spec.texture));
      }
    }
    for (const path of discoverPackJsonPaths(pack, 'npcs')) {
      const spec = readPackJson<ModNpcContent>(pack, path);
      if (spec?.texture && npcs.has(fullKeyOf(modId, spec.key))) {
        referenced.add(spec.texture);
        inject(atlas, `vanilla/NPC_${npcs.get(fullKeyOf(modId, spec.key))}.png`,
          await decodePngOrWarn(pack, modId, spec.texture));
      }
    }
    for (const path of discoverPackJsonPaths(pack, 'tiles')) {
      const spec = readPackJson<ModTileContent>(pack, path);
      if (!spec?.texture) continue;
      const stableId = tiles.get(fullKeyOf(modId, spec.key));
      if (stableId === undefined) continue;
      referenced.add(spec.texture);
      const bmp = await decodePngOrWarn(pack, modId, spec.texture);
      if (bmp === null) continue;
      const fileKey = `mod/${modId}/${spec.texture.replace(/^textures\//, '').replace(/\.png$/i, '')}.png`;
      const meta = buildModTileMeta(bmp, spec);
      meta.sheet = fileKey;
      // 写元数据(vanilla.json 运行时对象;伪 sheet 键 = stable id=registerModTile 落的 vanilla.sheet)
      tileMetaTable[String(stableId)] = meta;
      inject(atlas, fileKey, bmp);
    }
    void referenced;   // 预留:未引用贴图懒注入(P1)
  }
}

async function decodePngOrWarn(
  pack: { files: Map<string, Uint8Array> }, modId: string, texPath: string,
): Promise<ImageBitmap | null> {
  const bytes = packTexBytes(pack, texPath);
  if (!bytes) { console.warn(`[mods] ${modId} 贴图缺失: ${texPath}`); return null; }
  const bmp = await decodePng(bytes);
  if (bmp === null) console.warn(`[mods] ${modId} 贴图解码失败: ${texPath}`);
  return bmp;
}

function inject(atlas: import('../assets/SpriteAtlas').SpriteAtlas, fileKey: string, bmp: ImageBitmap | null): void {
  if (bmp === null) return;
  atlas.vimages.set(fileKey, bmp);
}
