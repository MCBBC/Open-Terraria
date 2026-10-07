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
import { registerModWavData, modProjRegs } from './hooks';
import { modBuffRegs, registerModBuffIcon } from './buffs';
import { modTownNpcHeadIndex } from '../data/vanillaNpcs';
import { registerModPortraitUrl } from '../data/npcPortraits';
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
 *  ★fw/fh=【占格数】(spec.w/h;B5b 真机探针定谳——曾误用 frameWidth(px)×16
 *  =grid 256×256,整图当单格=vframe 区域全错=分块烘天空色)。
 *  cols 由位图宽反推;rows=声明 styles(缺省按位图高反推)。 */
function buildModTileMeta(bmp: ImageBitmap, spec: ModTileContent): VanillaTileMeta {
  const fw = spec.w ?? 1;
  const fh = spec.h ?? 1;
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

/** ★B6 用户实报修复:5,700+ 张 PNG 串行 await 必超 8s 护栏 → boot 放行时 NPC 贴图
 *  注入未完成 → ensureVImage 负缓存 404 = 召唤 NPC 永久隐形。改为【域内并行解码】
 *  (Promise.all,解码吞吐 ×核数)+ 注入顺序 = npcs 优先(玩家最先看到的实体)。 */
async function decodeBatch(
  atlas: import('../assets/SpriteAtlas').SpriteAtlas,
  pack: { files: Map<string, Uint8Array> }, modId: string,
  jobs: Array<{ fileKey: string; texPath: string }>,
): Promise<void> {
  await Promise.all(jobs.map(async (j) => {
    const bmp = await decodePngOrWarn(pack, modId, j.texPath);
    if (bmp !== null) inject(atlas, j.fileKey, bmp);
  }));
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
    const itemJobs: Array<{ fileKey: string; texPath: string }> = [];
    for (const path of discoverPackJsonPaths(pack, 'items')) {
      const spec = readPackJson<ModItemContent>(pack, path);
      if (spec?.texture && items.has(fullKeyOf(modId, spec.key))) {
        referenced.add(spec.texture);
        itemJobs.push({ fileKey: `vanilla/Item_${items.get(fullKeyOf(modId, spec.key))}.png`, texPath: spec.texture });
      }
    }
    await decodeBatch(atlas, pack, modId, itemJobs);
    const npcJobs: Array<{ fileKey: string; texPath: string }> = [];
    for (const path of discoverPackJsonPaths(pack, 'npcs')) {
      const spec = readPackJson<ModNpcContent>(pack, path);
      if (spec?.texture && npcs.has(fullKeyOf(modId, spec.key))) {
        referenced.add(spec.texture);
        npcJobs.push({ fileKey: `vanilla/NPC_${npcs.get(fullKeyOf(modId, spec.key))}.png`, texPath: spec.texture });
      }
      // ★二百八十四刀:mod Boss 头像注入(<key>_head_boss.png 约定 →
      //   vanilla/NPC_Head_Boss_<npcId>.png;Boss 血条 Common 条 headTex 消费;
      //   62 张 1457 权威 _Head_Boss 贴图已落 textures/npcs/)
      if (spec?.key && npcs.has(fullKeyOf(modId, spec.key))) {
        const headTexPath = `textures/npcs/${spec.key}_head_boss.png`;
        const headBytes = packTexBytes(pack, headTexPath);
        if (headBytes) {
          referenced.add(headTexPath);
          const bmpHead = await decodePngOrWarn(pack, modId, headTexPath);
          if (bmpHead) {
            inject(atlas, `vanilla/NPC_Head_Boss_${npcs.get(fullKeyOf(modId, spec.key))}.png`, bmpHead);
          }
        }
      }
      // ★G2③ 头贴注入(GLM娘实验批):townNPC 注册面已自增分配 head 索引,
      //   贴图落 vanilla/NPC_Head_{idx}.png(住房UI行/地图图标/旗帜消费)
      if (spec?.head && npcs.has(fullKeyOf(modId, spec.key))) {
        const npcId = npcs.get(fullKeyOf(modId, spec.key))!;
        const headIdx = modTownNpcHeadIndex(npcId);
        if (headIdx >= 0) {
          referenced.add(spec.head);
          inject(atlas, `vanilla/NPC_Head_${headIdx}.png`,
            await decodePngOrWarn(pack, modId, spec.head));
        }
      }
      // ★G6 对话头像注入(登记债补齐 2026-10-04):Detailed 模式走 url <img>,
      //   mod 包内 png 转 blob objectURL 登记注册面(npcPortraits.portraitUrl
      //   对 mod id 优先查表);非浏览器环境(测试)无 objectURL 时跳过。
      if (spec?.portrait && npcs.has(fullKeyOf(modId, spec.key))) {
        const bytes = packTexBytes(pack, spec.portrait);
        if (bytes && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
          referenced.add(spec.portrait);
          registerModPortraitUrl(npcs.get(fullKeyOf(modId, spec.key))!,
            URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/png' })));
        }
      }
    }
    await decodeBatch(atlas, pack, modId, npcJobs);   // ★NPC 贴图并行(实报隐形修复)
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
    // —— mod 弹幕贴图(P2):vanilla/Projectile_<projId>.png 覆盖键(ModProj 自绘消费) ——
    const projJobs: Array<{ fileKey: string; texPath: string }> = [];
    for (const reg of modProjRegs()) {
      if (reg.modId !== modId) continue;
      projJobs.push({ fileKey: `vanilla/Projectile_${reg.projId}.png`, texPath: reg.spec.texture });
    }
    await decodeBatch(atlas, pack, modId, projJobs);
    // —— mod 音频(B6):pack sounds/*.ogg → decodeAudioData → Sfx.buffers ——
    for (const path of discoverPackJsonPaths(pack, 'sounds') ?? []) { /* ogg 不走 json */ }
    // mod 音频(B6):pack sounds/*.ogg → modWavData(main.ts 在 game 创建后 decodeAudioData 注入 Sfx.buffers)
    for (const sf of Array.from(pack.files.keys()).filter((k) => k.startsWith('sounds/') && k.endsWith('.ogg'))) {
      const key = sf.replace('sounds/', '').replace(/\.ogg$/, '');
      registerModWavData(key, pack.files.get(sf)!.slice().buffer);
    }
    // —— mod buff 图标(P2):objectURL 登记(buff 栏 remasterBuffIcon 覆盖链消费) ——
    for (const reg of modBuffRegs()) {
      if (reg.modId !== modId) continue;
      const bytes = packTexBytes(pack, reg.texture);
      if (!bytes) { console.warn(`[mods] ${modId} buff 图标缺失: ${reg.texture}`); continue; }
      registerModBuffIcon(reg.modId, reg.key, bytes, (png) => URL.createObjectURL(new Blob([png], { type: 'image/png' })));
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
