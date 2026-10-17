// mod 资产注入(2026-10-04):贴图 → SpriteAtlas 运行时注入。
// 三条通道(全部零改 SpriteAtlas/渲染面):
//   ① 物品图标:vimages['vanilla/Item_<stableId>.png'](vicon 资源包覆盖键整图直取,
//      SpriteAtlas.ts:510-512 现成缝——remaster 同款注入模式,main.ts:246 先例)
//   ② NPC 表:vimages['vanilla/NPC_<npcId>.png'](Renderer.ts:11929 模板键)
//   ③ tile 表:vanilla.tiles[<伪 sheet id>] 元数据注册 + vimages[<meta.sheet>]
//      (vmeta(sheetId) 读 vanilla.json 对象——运行时可写;伪 sheet≡stable id 恒等式,
//      registerModTile 落的 vanilla.sheet=stableId 在此闭环)
// 时序:loadAssets() 内 UI 贴图预载之后、任何 chunk 烘焙之前(与 remaster/resourcepacks
// 同窗;原「atlas.load() 之后」锚已随 Maples 域退役删除,2026-10-17)。失败静默不阻断
// 启动(单图坏只缺该图)。
import { getLoadedPacks, getModLoadResult } from './loader';
import { discoverPackJsonPaths, readPackJson } from './pack';
import { registerModWavData, modProjRegs } from './hooks';
import { modBuffRegs, registerModBuffIcon } from './buffs';
import { modAchIconJobs, registerModAchIcon, purgeModAchIcons } from './modAchievements';   // ★成就域
import { modItemGlowMaskId } from './drawspecs';   // ★刀2-C1:物品 glowmask 伪 id
import { modTownNpcHeadIndex } from '../data/vanillaNpcs';
import { registerModPortraitUrl } from '../data/npcPortraits';
import type { VanillaTileMeta } from '../assets/SpriteAtlas';

import type { ModItemContent, ModNpcContent, ModTileContent } from './types';

/** ★三百十一/十二:mod 资源 SW 同路线——pack 内文件 → 独立缓存 sw-mods-v1
 *  (稳定 URL sprites/mods/<id>/<path>;SW fetch 早支 cache-first)。独立名与本体
 *  版本缓存解耦:本体换代 gc 不触及、scrub/warm keys() 不并入(1.2 万条目曾暖进
 *  版本缓存=Cache.keys 'Operation too large' AbortError 事故根因)。消费键经
 *  SpriteAtlas 别名表改指此 URL,ensureVImage 自然 fetch 命中(零特判渲染面)。 */
const MODS_CACHE = 'sw-mods-v1';
/** 缓存键路径(页侧 put/删用,带 sprites/ 前缀;SW 早支 MODS_RE 按 /sprites/mods/ 命中) */
const modCachePath = (modId: string, packPath: string): string => `sprites/mods/${modId}/${packPath}`;
/** 别名值(ensureVImage 恒前置 `sprites/`——三百十三探针定谳:别名值再带 sprites/
 *  = sprites/sprites/ 双前缀 404 负缓存,vnpc 恒 null 事故根因) */
const modSpritePath = (modId: string, packPath: string): string => `mods/${modId}/${packPath}`;
const CT_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg',
  json: 'application/json', txt: 'text/plain',
};

/** pack 全量文件暖进 mod 独立缓存(页侧直 put——与 zip-warm :946 同款,页面与 SW
 *  共用 CacheStorage)。幂等:marker(sprites/mods/<id>/__ver__.json)记版本,同
 *  版本跳过;mod 更新=版本不符=重暖覆盖。失败(无 SW/配额)返回 false=调用方
 *  回退内存解码路径。 */
async function warmModAssetsCache(pack: import('./types').ModPack): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false;
    // ★D8 定谳(2026-10-13):SW 不在控(controller=null)时暖存字节无人接应——
    //  dev 默认关 SW(AssetCache:611),别名 fetch 落 dev server SPA fallback
    //  (200 text/html)=mod 纹理全断的死支;controller 在位才走 SW 别名支,
    //  否则内存解码支(decodeBatch 直注入,全环境正确;prod 首访未 claim 同样安全回退)
    if (typeof navigator !== 'undefined' && !navigator.serviceWorker?.controller) return false;
    const cache = await caches.open(MODS_CACHE);
    const markerPath = modCachePath(pack.manifest.id, '__ver__.json');
    const marker = await cache.match(markerPath);
    if (marker) {
      const j = await marker.json().catch(() => null) as { version?: string } | null;
      if (j?.version === pack.manifest.version) return true;
    }
    // 逐文件 put(CT 按扩展名;与 sw.js CT_BY_EXT 同族口径)
    for (const [path, bytes] of pack.files) {
      const ext = (/\.([a-z0-9]+)$/.exec(path)?.[1] ?? '').toLowerCase();
      const ct = CT_BY_EXT[ext];
      if (!ct) continue;   // 未登记类型不暖(仅资源文件)
      const body = new Blob([bytes.slice()], { type: ct });
      await cache.put(`/${modCachePath(pack.manifest.id, path)}`, new Response(body, { headers: { 'Content-Type': ct } }));
    }
    await cache.put(`/${markerPath}`, new Response(JSON.stringify({ version: pack.manifest.version }), { headers: { 'Content-Type': 'application/json' } }));
    // ★三百十二善后:三百十一首版曾把本 mod 全量暖进【本体版本缓存】(keys()
    // 'Operation too large' 事故)——按已知 URL 精确驱逐(免 keys() 全扫,同名
    // 错误复现也不炸);本体换代 gc 会兜掉残余
    try {
      const version = (await import('../net/AssetCache')).assetCacheState().version;
      if (version) {
        const verCache = await caches.open('sw-assets-v' + version);
        for (const path of pack.files.keys()) {
          await verCache.delete(`/${modCachePath(pack.manifest.id, path)}`);
        }
        await verCache.delete(`/${modCachePath(pack.manifest.id, '__ver__.json')}`);
      }
    } catch { /* 版本缓存不可用/keys 事故=容缺(本体 gc 兜底) */ }
    return true;
  } catch { return false; }
}

/** mod 内容键 → 全键(与 register.ts 同式) */
const fullKeyOf = (modId: string, key: string): string => (key.startsWith('mod_') ? key : `mod_${modId}_${key}`);

/** 别名注册:消费键 → mod SW URL(替代原 decode+inject) */
function aliasJob(atlas: import('../assets/SpriteAtlas').SpriteAtlas, modId: string, j: { fileKey: string; texPath: string }): void {
  atlas.setAssetAlias(j.fileKey, modSpritePath(modId, j.texPath.startsWith('textures/') ? j.texPath : `textures/${j.texPath}`));
}
/** tile 键的 pack 路径(fileKey 逆向——mod/<modId>/textures/xxx.png) */
function tilePackPath(fileKey: string): string {
  return fileKey.replace(/^mod\/[a-z0-9]+\//, '');
}

async function decodePng(bytes: Uint8Array): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }));
  } catch { return null; }
}

function packTexBytes(pack: { files: Map<string, Uint8Array> }, texPath: string): Uint8Array | null {
  return pack.files.get(texPath.startsWith('textures/') ? texPath : `textures/${texPath}`)
    ?? pack.files.get(texPath) ?? null;
}

/** ★刀3-墙/R-A-C2:mod 墙贴图台账(bake worker ship 源——SW 别名支墙贴图不在
 *  主线程 vimages,BakeClient 须按 pack 字节补解码;bytes=pack 文件引用零拷贝) */
const modWallTexById = new Map<number, { modId: string; texPath: string; bytes: Uint8Array }>();
function recordModWallTex(wallId: number, modId: string, texPath: string, bytes: Uint8Array | null): void {
  if (!bytes) return;
  modWallTexById.set(wallId, { modId, texPath, bytes });
}
/** bake worker ship 源(键=引擎 fileKey;去重由消费方按 file 判) */
export function modWallShipEntries(): Array<{ file: string; bytes: Uint8Array }> {
  const out: Array<{ file: string; bytes: Uint8Array }> = [];
  for (const [id, e] of modWallTexById) {
    out.push({ file: `vanilla/Wall_${id}.png`, bytes: e.bytes });
  }
  return out;
}

/** 构造 mod tile 的 VanillaTileMeta(纯声明几何;SW 支零位图依赖——rows 依
 *  声明 styles,缺省按 w/h 与贴图常规比例推 1;位图精确反推走回退支) */
function buildModTileMetaSpec(spec: ModTileContent): VanillaTileMeta {
  const fw = spec.w ?? 1;
  const fh = spec.h ?? 1;
  const gridW = fw * 16;
  const gridH = fh * 16;
  return {
    name: spec.name ?? spec.key,
    key: spec.key,
    sheet: '',               // 由调用方回填 fileKey
    solid: spec.solid ?? false,
    blend: false,
    framed: false,
    light: false,
    color: spec.mapColor ?? '#808080',
    placement: null,
    grid: [gridW, gridH],
    stride: [gridW + 2, gridH + 2],
    frameSize: [[fw, fh]],
    cols: 1,
    rows: spec.styles ?? 1,
  };
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
  // ★R-A-F5(2026-10-13):并发上界池(32)——灾厄级单域 job 数千,无界 Promise.all
  //  =一拍内全部 slice+Blob 分配(百 MB 级瞬时峰值);分批跑=峰值钳常量级
  const BATCH = 32;
  for (let i = 0; i < jobs.length; i += BATCH) {
    await Promise.all(jobs.slice(i, i + BATCH).map(async (j) => {
      const bmp = await decodePngOrWarn(pack, modId, j.texPath);
      if (bmp !== null) inject(atlas, j.fileKey, bmp);
    }));
  }
}

/** 注入全部已装载 mod 的贴图。幂等(重复调用覆盖同键)。
 *  ★三百十一:SW 同路线——先暖 pack 进 SW 缓存,成功→全部纹理 job 改别名注册
 *  (消费键 ensureVImage 自然 fetch=与本体同管线,零解码);失败(无 SW/配额/
 *  非浏览器)→回退原内存解码注入路径(本函数以下原实现整体保留)。 */
export async function applyModAssets(atlas: import('../assets/SpriteAtlas').SpriteAtlas): Promise<void> {
  const result = getModLoadResult();
  if (!result || result.allocation === null) return;
  const { items, tiles, npcs, gores, walls, mounts, hairs, dusts } = result.allocation;
  const tileMetaTable = atlas.vanilla.tiles as unknown as Record<string, unknown>;
  for (const pack of getLoadedPacks()) {
    const modId = pack.manifest.id;
    const swOk = await warmModAssetsCache(pack);
    if (swOk) {
      // ---- SW 别名支(主路线) ----
      for (const path of discoverPackJsonPaths(pack, 'items')) {
        const spec = readPackJson<ModItemContent>(pack, path);
        if (spec?.texture && items.has(fullKeyOf(modId, spec.key))) {
          aliasJob(atlas, modId, { fileKey: `vanilla/Item_${items.get(fullKeyOf(modId, spec.key))}.png`, texPath: spec.texture });
        }
      }
      for (const path of discoverPackJsonPaths(pack, 'npcs')) {
        const spec = readPackJson<ModNpcContent>(pack, path);
        if (spec?.texture && npcs.has(fullKeyOf(modId, spec.key))) {
          aliasJob(atlas, modId, { fileKey: `vanilla/NPC_${npcs.get(fullKeyOf(modId, spec.key))}.png`, texPath: spec.texture });
        }
        if (spec?.key && npcs.has(fullKeyOf(modId, spec.key))) {
          const headTexPath = `textures/npcs/${spec.key}_head_boss.png`;
          if (packTexBytes(pack, headTexPath)) {
            aliasJob(atlas, modId, { fileKey: `vanilla/NPC_Head_Boss_${npcs.get(fullKeyOf(modId, spec.key))}.png`, texPath: headTexPath });
          }
          if (spec.head) {
            aliasJob(atlas, modId, { fileKey: `vanilla/NPC_Head_${modTownNpcHeadIndex(npcs.get(fullKeyOf(modId, spec.key)) ?? -1)}.png`, texPath: spec.head });
          }
          // ★R-A-F8(2026-10-13):SW 支补 portrait(blob objectURL 通道,与内存支同源;
          //  旧=内存支单腿,SW 在控生产态 mod 对话头像全缺)
          if (spec.portrait) {
            const bytes = packTexBytes(pack, spec.portrait);
            if (bytes && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
              registerModPortraitUrl(npcs.get(fullKeyOf(modId, spec.key))!,
                URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/png' })));
            }
          }
        }
      }
      for (const path of discoverPackJsonPaths(pack, 'tiles')) {
        const spec = readPackJson<ModTileContent>(pack, path);
        if (!spec?.texture) continue;
        const stableId = tiles.get(fullKeyOf(modId, spec.key));
        if (stableId === undefined) continue;
        const fileKey = `mod/${modId}/${spec.texture.replace(/^textures\//, '').replace(/\.png$/i, '')}.png`;
        atlas.setAssetAlias(fileKey, modSpritePath(modId, spec.texture));
        // ★三百十六:tile meta 恢复位图精确反推(decode-based)——SW 支省的是
        //  【渲染位图注入】;tile 元数据的 cols/rows 必须与位图逐像素一致
        //  (HalfBrickPass 帧循环消费;纯声明构造曾致帧循环不收敛=栈溢出)。
        //  689 张 tile 位图解码 ~百 ms 级,成本可接受。
        const bmp = await decodePngOrWarn(pack, modId, spec.texture);
        if (bmp === null) continue;
        const meta = buildModTileMeta(bmp, spec);
        meta.sheet = fileKey;
        tileMetaTable[String(stableId)] = meta;
      }
      for (const reg of modProjRegs()) {
        if (reg.modId !== modId) continue;
        aliasJob(atlas, modId, { fileKey: `vanilla/Projectile_${reg.projId}.png`, texPath: reg.spec.texture });
      }
      // ★刀3-3(2026-10-13):mod gore 贴图(SW 别名支;消费=atlas.ensureVImage
      //  `vanilla/Gore_<id>.png` 同原版键形;尺寸已在 register 期 IHDR 头解析)
      for (const path of discoverPackJsonPaths(pack, 'gores')) {
        const spec = readPackJson<import('./types').ModGoreContent>(pack, path);
        const goreId = gores.get(fullKeyOf(modId, spec?.key ?? ''));
        if (spec?.texture && goreId !== undefined) {
          aliasJob(atlas, modId, { fileKey: `vanilla/Gore_${goreId}.png`, texPath: spec.texture });
        }
      }
      // ★刀3-墙(2026-10-13):mod 墙贴图(SW 别名支;Wall_N 同构 TEdit 13 列×36px;
      //  vmeta 注入 atlas.vanilla.walls=VanillaWallTiler 消费面,rows 缺省 5)
      for (const path of discoverPackJsonPaths(pack, 'walls')) {
        const spec = readPackJson<import('./types').ModWallContent>(pack, path);
        const wallId = walls.get(fullKeyOf(modId, spec?.key ?? ''));
        if (!spec?.texture || wallId === undefined) continue;
        const fileKey = `vanilla/Wall_${wallId}.png`;
        aliasJob(atlas, modId, { fileKey, texPath: spec.texture });
        recordModWallTex(wallId, modId, spec.texture, packTexBytes(pack, spec.texture));
        (atlas.vanilla.walls as unknown as Record<string, unknown>)[String(wallId)] = {
          name: spec.name ?? spec.key, key: spec.key, sheet: fileKey,
          color: spec.mapColor ?? '#808080',
          grid: [32, 32], stride: [36, 36], cols: 13,
          rows: spec.rows ?? (spec.largeFrame ? 7 : 5),   // ★R-A-M4:largeFrame 变体必用行 5-6,5 行表=越表空洞
          ...(spec.largeFrame !== undefined ? { largeFrame: spec.largeFrame } : {}),
        };
      }
      // ★第三批:mod 坐骑/发型贴图(SW 别名支)
      for (const path of discoverPackJsonPaths(pack, 'mounts')) {
        const spec = readPackJson<import('./types').ModMountContent>(pack, path);
        const mountId = mounts.get(fullKeyOf(modId, spec?.key ?? ''));
        if (spec?.texture && mountId !== undefined) {
          aliasJob(atlas, modId, { fileKey: `vanilla/Mount_${mountId}.png`, texPath: spec.texture });
        }
      }
      for (const path of discoverPackJsonPaths(pack, 'hairs')) {
        const spec = readPackJson<import('./types').ModHairContent>(pack, path);
        const hairId = hairs.get(fullKeyOf(modId, spec?.key ?? ''));
        if (spec?.texture && hairId !== undefined) {
          aliasJob(atlas, modId, { fileKey: `vanilla/Player_Hair_${hairId + 1}.png`, texPath: spec.texture });
        }
      }
      // ★第四批:mod 尘埃贴图(SW 别名支;per-type vanilla/Dust_<type>.png)
      for (const path of discoverPackJsonPaths(pack, 'dusts')) {
        const spec = readPackJson<import('./types').ModDustContent>(pack, path);
        const dustType = dusts.get(fullKeyOf(modId, spec?.key ?? ''));
        if (spec?.texture && dustType !== undefined) {
          aliasJob(atlas, modId, { fileKey: `vanilla/Dust_${dustType}.png`, texPath: spec.texture });
        }
      }
      // ★D15(2026-10-13):mod UI 贴图(textures/ui/*.png 约定目录;键=vanilla/ModUI_
      //  <modId>_<相对路径扁平化>.png;sw.ui.panel addImage 消费。子目录防撞=路径扁平;
      //  ★R-A-F11:扁平化可碰撞('a/b'≡'a_b')——碰撞 warn(静默覆盖=随机赢家,内存支
      //  decodeBatch 完成序非确定))
      {
        const seenFlat = new Map<string, string>();
        for (const [path] of pack.files) {
          if (!path.startsWith('textures/ui/') || !path.endsWith('.png')) continue;
          const flat = path.slice('textures/ui/'.length, -'.png'.length).replace(/[^A-Za-z0-9]+/g, '_');
          const prev = seenFlat.get(flat);
          if (prev !== undefined) console.warn(`[mods] ${modId} UI 贴图扁平键碰撞: ${prev} ≈ ${path}(后者覆盖,请改名)`);
          seenFlat.set(flat, path);
          aliasJob(atlas, modId, { fileKey: `vanilla/ModUI_${modId}_${flat}.png`, texPath: path });
        }
      }
      // ★刀2-C1(2026-10-13):NPC glowmask/物品 glowmask 贴图(SW 别名支;
      //  NPC=vanilla/NPC_Glow_<id>.png;物品=vanilla/Glow_<伪 GlowMaskID>.png)
      for (const path of discoverPackJsonPaths(pack, 'npcs')) {
        const spec = readPackJson<import('./types').ModNpcContent>(pack, path);
        const npcId = npcs.get(fullKeyOf(modId, spec?.key ?? ''));
        if (spec?.glowmask?.texture && npcId !== undefined) {
          aliasJob(atlas, modId, { fileKey: `vanilla/NPC_Glow_${npcId}.png`, texPath: spec.glowmask.texture });
        }
      }
      for (const path of discoverPackJsonPaths(pack, 'items')) {
        const spec = readPackJson<import('./types').ModItemContent>(pack, path);
        const st = items.get(fullKeyOf(modId, spec?.key ?? ''));
        if (spec?.glowmask?.texture && st !== undefined) {
          aliasJob(atlas, modId, { fileKey: `vanilla/Glow_${modItemGlowMaskId(st)}.png`, texPath: spec.glowmask.texture });
        }
      }
      // ★四百九十七:mod 盔甲渲染链(hs/bs/ls→Armor_Head_/Armor_Armor_/Armor_Legs_;
      //  贴图=pack textures/armor/<key>_<Part>.png(extract-armor-textures 产);
      //  别名走 SW cache(三百十一通道)+运行期清单键注入(vanilla-ui.json 零扰动))
      // ★608:manifest.visualSheets(变身视觉表——伪槽别名,消费=Renderer 覆写臂)
      for (const vs of (pack.manifest as { visualSheets?: Array<{ head?: number; body?: number; legs?: number; headTex?: string; bodyTex?: string; legsTex?: string }> }).visualSheets ?? []) {
        const triples = [
          [vs.head, vs.headTex, 'Head'],
          [vs.body, vs.bodyTex, 'Body'],
          [vs.legs, vs.legsTex, 'Legs'],
        ] as const;
        for (const [idx, texPath, part] of triples) {
          if (idx === undefined || !texPath) continue;
          const fileKey = `vanilla-ui/Armor_${part === 'Body' ? 'Armor' : part}_${idx}.png`;
          if (!packTexBytes(pack, texPath)) continue;
          aliasJob(atlas, modId, { fileKey, texPath });
          atlas.registerUiFile(fileKey.replace(/^vanilla-ui\//, ''), fileKey);
        }
      }
      for (const path of discoverPackJsonPaths(pack, 'items')) {
        const spec = readPackJson<ModItemContent>(pack, path);
        if (!spec?.key) continue;
        const st = (spec as { stats?: { hs?: number; bs?: number; ls?: number } }).stats;
        if (!st) continue;
        const armorTriples = [
          [st.hs, 'Head', `vanilla-ui/Armor_Head_${st.hs}.png`],
          [st.bs, 'Body', `vanilla-ui/Armor_Armor_${st.bs}.png`],
          [st.ls, 'Legs', `vanilla-ui/Armor_Legs_${st.ls}.png`],
        ] as const;
        for (const [idx, part, fileKey] of armorTriples) {
          if (idx === undefined) continue;
          const texPath = `textures/armor/${spec.key}_${part}.png`;
          if (!packTexBytes(pack, texPath)) continue;
          aliasJob(atlas, modId, { fileKey, texPath });
          atlas.registerUiFile(fileKey.replace(/^vanilla-ui\//, ''), fileKey);
        }
      }
      // 音频(B6):pack sounds/*.ogg 已在暖存;modWavData 字节路径保留
      // (decodeAudioData 需 ArrayBuffer,字节已在 IDB=双份成本可接受,登记)
      for (const sf of Array.from(pack.files.keys()).filter((k) => k.startsWith('sounds/') && k.endsWith('.ogg'))) {
        const key = sf.replace('sounds/', '').replace(/\.ogg$/, '');
        registerModWavData(key, pack.files.get(sf)!.slice().buffer);
      }
      for (const reg of modBuffRegs()) {
        if (reg.modId !== modId) continue;
        const bytes = packTexBytes(pack, reg.texture);
        if (!bytes) { console.warn(`[mods] ${modId} buff 图标缺失: ${reg.texture}`); continue; }
        registerModBuffIcon(reg.modId, reg.key, bytes, (png) => URL.createObjectURL(new Blob([png], { type: 'image/png' })));
      }
      // ★成就域(2026-10-14):mod 成就图标(blob URL 通道=全环境一致,与 buff 图标同构)
      for (const job of modAchIconJobs()) {
        if (job.modId !== modId) continue;
        const bytes = packTexBytes(pack, job.texPath);
        if (!bytes) { console.warn(`[mods] ${modId} 成就图标缺失: ${job.texPath}`); continue; }
        registerModAchIcon(job.fullKey, URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/png' })));
      }
      continue;   // SW 支完成,跳过内存解码支
    }
    // ---- 回退:内存解码注入(无 SW/暖存失败;原路径不动) ----
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
    // ★D12(2026-10-13):mod 尘埃贴图内存回退支(旧仅 SW 别名支=无 SW 环境全缺;
    //  R-A C2 bake worker 零墙桥同族判例「两支必成对」)
    const dustJobs: Array<{ fileKey: string; texPath: string }> = [];
    for (const path of discoverPackJsonPaths(pack, 'dusts')) {
      const spec = readPackJson<import('./types').ModDustContent>(pack, path);
      const dustType = dusts.get(fullKeyOf(modId, spec?.key ?? ''));
      if (spec?.texture && dustType !== undefined) {
        referenced.add(spec.texture);
        dustJobs.push({ fileKey: `vanilla/Dust_${dustType}.png`, texPath: spec.texture });
      }
    }
    await decodeBatch(atlas, pack, modId, dustJobs);
    // ★D15:mod UI 贴图内存回退支(与 SW 别名支同键;两支必成对判例)
    const uiJobs: Array<{ fileKey: string; texPath: string }> = [];
    {
      const seenFlat = new Map<string, string>();
      for (const [path] of pack.files) {
        if (!path.startsWith('textures/ui/') || !path.endsWith('.png')) continue;
        const flat = path.slice('textures/ui/'.length, -'.png'.length).replace(/[^A-Za-z0-9]+/g, '_');
        const prev = seenFlat.get(flat);
        if (prev !== undefined) console.warn(`[mods] ${modId} UI 贴图扁平键碰撞: ${prev} ≈ ${path}(后者覆盖,请改名)`);
        seenFlat.set(flat, path);
        uiJobs.push({ fileKey: `vanilla/ModUI_${modId}_${flat}.png`, texPath: path });
      }
    }
    await decodeBatch(atlas, pack, modId, uiJobs);
    // ★R-A-F7(2026-10-13):内存回退支补 mounts/hairs/visualSheets/armor 四族注入
    //  (「两支必成对」判例第三发;与 SW 别名支同键,decodeBatch 直注入位图)
    const famJobs: Array<{ fileKey: string; texPath: string }> = [];
    for (const path of discoverPackJsonPaths(pack, 'mounts')) {
      const spec = readPackJson<import('./types').ModMountContent>(pack, path);
      const mountId = mounts.get(fullKeyOf(modId, spec?.key ?? ''));
      if (spec?.texture && mountId !== undefined) {
        referenced.add(spec.texture);
        famJobs.push({ fileKey: `vanilla/Mount_${mountId}.png`, texPath: spec.texture });
      }
    }
    for (const path of discoverPackJsonPaths(pack, 'hairs')) {
      const spec = readPackJson<import('./types').ModHairContent>(pack, path);
      const hairId = hairs.get(fullKeyOf(modId, spec?.key ?? ''));
      if (spec?.texture && hairId !== undefined) {
        referenced.add(spec.texture);
        famJobs.push({ fileKey: `vanilla/Player_Hair_${hairId + 1}.png`, texPath: spec.texture });
      }
    }
    // ★四百九十七:盔甲双族(visualSheets 变身表+stats.hs/bs/ls 三槽;与 SW 支同键)
    for (const vs of (pack.manifest as { visualSheets?: Array<{ head?: number; body?: number; legs?: number; headTex?: string; bodyTex?: string; legsTex?: string }> }).visualSheets ?? []) {
      for (const [idx, texPath, part] of [[vs.head, vs.headTex, 'Head'], [vs.body, vs.bodyTex, 'Body'], [vs.legs, vs.legsTex, 'Legs']] as const) {
        if (idx === undefined || !texPath) continue;
        const fileKey = `vanilla-ui/Armor_${part === 'Body' ? 'Armor' : part}_${idx}.png`;
        if (!packTexBytes(pack, texPath)) continue;
        referenced.add(texPath);
        famJobs.push({ fileKey, texPath });
        atlas.registerUiFile(fileKey.replace(/^vanilla-ui\//, ''), fileKey);
      }
    }
    for (const path of discoverPackJsonPaths(pack, 'items')) {
      const spec = readPackJson<ModItemContent>(pack, path);
      if (!spec?.key) continue;
      const st = (spec as { stats?: { hs?: number; bs?: number; ls?: number } }).stats;
      if (!st) continue;
      for (const [idx, part, fileKey] of [
        [st.hs, 'Head', `vanilla-ui/Armor_Head_${st.hs}.png`],
        [st.bs, 'Body', `vanilla-ui/Armor_Armor_${st.bs}.png`],
        [st.ls, 'Legs', `vanilla-ui/Armor_Legs_${st.ls}.png`],
      ] as const) {
        if (idx === undefined) continue;
        const texPath = `textures/armor/${spec.key}_${part}.png`;
        if (!packTexBytes(pack, texPath)) continue;
        referenced.add(texPath);
        famJobs.push({ fileKey, texPath });
        atlas.registerUiFile(fileKey.replace(/^vanilla-ui\//, ''), fileKey);
      }
    }
    await decodeBatch(atlas, pack, modId, famJobs);
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
    // —— ★刀3-3(2026-10-13):mod gore 贴图(内存回退支;SW 支=上方 aliasJob) ——
    const goreJobs: Array<{ fileKey: string; texPath: string }> = [];
    for (const path of discoverPackJsonPaths(pack, 'gores')) {
      const spec = readPackJson<import('./types').ModGoreContent>(pack, path);
      const goreId = gores.get(fullKeyOf(modId, spec?.key ?? ''));
      if (spec?.texture && goreId !== undefined) {
        referenced.add(spec.texture);
        goreJobs.push({ fileKey: `vanilla/Gore_${goreId}.png`, texPath: spec.texture });
      }
    }
    await decodeBatch(atlas, pack, modId, goreJobs);
    // —— ★刀3-墙(2026-10-13):mod 墙贴图(内存回退支;SW 支=上方 aliasJob+vmeta) ——
    const wallMetaTable = atlas.vanilla.walls as unknown as Record<string, unknown>;
    const wallJobs: Array<{ fileKey: string; texPath: string; wallId: number; spec: import('./types').ModWallContent }> = [];
    for (const path of discoverPackJsonPaths(pack, 'walls')) {
      const spec = readPackJson<import('./types').ModWallContent>(pack, path);
      const wallId = walls.get(fullKeyOf(modId, spec?.key ?? ''));
      if (!spec?.texture || wallId === undefined) continue;
      referenced.add(spec.texture);
      wallJobs.push({ fileKey: `vanilla/Wall_${wallId}.png`, texPath: spec.texture, wallId, spec });
    }
    await Promise.all(wallJobs.map(async (j) => {
      const bmp = await decodePngOrWarn(pack, modId, j.texPath);
      if (bmp !== null) {
        inject(atlas, j.fileKey, bmp);
        recordModWallTex(j.wallId, modId, j.texPath, packTexBytes(pack, j.texPath));   // ★R-A-C2:ship 源
        wallMetaTable[String(j.wallId)] = {
          name: j.spec.name ?? j.spec.key, key: j.spec.key, sheet: j.fileKey,
          color: j.spec.mapColor ?? '#808080',
          grid: [32, 32], stride: [36, 36], cols: 13,
          rows: j.spec.rows ?? (j.spec.largeFrame ? 7 : 5),   // ★R-A-F10:largeFrame 变体必用行 5-6(与 SW 支 M4 对齐,旧=5 越表空洞)
          ...(j.spec.largeFrame !== undefined ? { largeFrame: j.spec.largeFrame } : {}),
        };
      }
    }));
    // ★R-A-C2:内存支墙贴图台账(位图已在 atlas.vimages=ship regex 覆盖,此处仅记 bytes)
    // —— ★刀2-C1(2026-10-13):NPC/物品 glowmask(内存回退支;SW 支=上方 aliasJob) ——
    const glowJobs: Array<{ fileKey: string; texPath: string }> = [];
    for (const path of discoverPackJsonPaths(pack, 'npcs')) {
      const spec = readPackJson<import('./types').ModNpcContent>(pack, path);
      const npcId = npcs.get(fullKeyOf(modId, spec?.key ?? ''));
      if (spec?.glowmask?.texture && npcId !== undefined) {
        referenced.add(spec.glowmask.texture);
        glowJobs.push({ fileKey: `vanilla/NPC_Glow_${npcId}.png`, texPath: spec.glowmask.texture });
      }
    }
    for (const path of discoverPackJsonPaths(pack, 'items')) {
      const spec = readPackJson<import('./types').ModItemContent>(pack, path);
      const st = items.get(fullKeyOf(modId, spec?.key ?? ''));
      if (spec?.glowmask?.texture && st !== undefined) {
        referenced.add(spec.glowmask.texture);
        glowJobs.push({ fileKey: `vanilla/Glow_${modItemGlowMaskId(st)}.png`, texPath: spec.glowmask.texture });
      }
    }
    await decodeBatch(atlas, pack, modId, glowJobs);
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
      // ★成就域:mod 成就图标 blob URL(内存回退支;R-A-F1 两支必成对第四发——
      //  旧=SW 支单腿,dev/SW 未 claim 态图标全灭)
      for (const job of modAchIconJobs()) {
        if (job.modId !== modId) continue;
        const bytes = packTexBytes(pack, job.texPath);
        if (!bytes) { console.warn(`[mods] ${modId} 成就图标缺失: ${job.texPath}`); continue; }
        registerModAchIcon(job.fullKey, URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/png' })));
      }
    void referenced;   // 预留:未引用贴图懒注入(P1)
  }
}

/** mod 卸载资源清理(独立缓存前缀删;幂等 best-effort) */
export async function purgeModAssetsCache(modId: string): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(MODS_CACHE);
    const keys = await cache.keys().catch(() => []);
    for (const req of keys) {
      if (new URL(req.url).pathname.startsWith(`/sprites/mods/${modId}/`)) await cache.delete(req);
    }
    // ★成就域:mod 图标 blob URL 清账(SW 缓存外的 blob 面)
    purgeModAchIcons(modId);
  } catch { /* 清理失败不阻断卸载 */ }
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
