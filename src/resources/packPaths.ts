// 资源包路径映射（M13）：原版 Content 路径 → 本仓 SpriteAtlas/Sfx 键。
// 权威依据（1456 反编译）：
//   - ResourcePack.GetContentSource() 以 zip/目录内 "Content" 为根（ResourcePack.cs:87-106）；
//     pack.json / icon.png 在【包根】（LoadManifest/OpenStream :118-156）。
//   - 光标贴图 = Images/UI/Cursor_{0..17}（AssetInitializer.cs:796-799 循环注册
//     TextureAssets.Cursors，"Images\\UI\\Cursor_" + num59）——1456 已无独立
//     Content/Cursors/ 目录，任务假设的 "Cursors/ 分支" 以反编译源码为准修正。
//   - 全量素材路径清单 = Terraria.IO.Data.ResourcePacksDefaultInfo.tsv（15010 条），
//     家族分布逐一与本仓产物核对（vanilla/ 9195 张 + vanilla-ui/ 1779 张）：
//       Images/<根>            → vanilla/<X>.png          （vimages；Tiles_/NPC_/Wall_/
//                                 Projectile_/Gore_/Acc_ 等全部根级散件）
//       Images/UI/**           → vanilla-ui/UI_<展平>.png （uiimages；含 Cursor_0..17）
//       Images/Armor/**        → vanilla-ui/Armor_<展平>.png（纸娃娃 vui 消费侧）
//       Images/Armor_Head_N /
//       Images/Armor_Legs_N    → vanilla-ui/Armor_{Head,Legs}_N.png（根级但消费在 vui）
//       Images/{TownNPCs,Misc,Backgrounds,Accessories,SplashScreens}/**
//                             → vanilla/<族前缀>_<展平>.png
//       Sounds/**              → Sfx 覆盖键（Custom/ 子目录按本仓提取管线拍平到根）
//       Fonts/**               → Web 字体（@font-face 族名；XNB 字体不可译，跳过）
//   展平规则 = scripts/vanilla-atlas.mjs 的 rel.replace(/\//g, '_') 同款（子目录
//   下划线展平，含 UI/ 前缀保留）。
// 纯函数，node 单测与浏览器双端可用。

/** 映射目标 */
export type MappedAsset =
  | { kind: 'image'; file: string }   // 形如 'vanilla/<X>.png' | 'vanilla-ui/<X>.png'（按 vanilla-ui/ 前缀分流注入目标）
  | { kind: 'sound'; file: string }   // Sfx 键（sounds/<file>.wav 的 file 部分）
  | { kind: 'font'; family: string }; // FontFace 族名（SWRP:<基名>）

/** 根级图片但消费侧在 vui 的族（vanilla-atlas.mjs 盔甲段：根级 Armor_Head/Legs
 *  同时拷入 vanilla-ui/；PaperDoll 走 vui）。映射产出双写目标。 */
const ROOT_VUI_RE = /^Armor_(?:Head|Legs)_\d+\.png$/;
/** 子目录 → vanilla/（族前缀展平）的家族（vanilla-atlas.mjs SUBDIRS_MISC；小写比较） */
const SUBDIR_TO_VANILLA = ['townnpcs', 'misc', 'backgrounds', 'accessories', 'splashscreens'];
/** 子目录 → vanilla-ui/ 的家族（SUBDIRS_UI；Armor 特判双写，见下；小写比较） */
const SUBDIR_TO_UI = ['ui'];
/** 图片扩展名（.xnb/.rawimg 原版可替换，web 端不可解码——登记跳过，不入映射） */
const IMG_EXT = ['.png'];
/** 音频扩展名（decodeAudioData 三格式全可解；原版 SoundResource 支持同集） */
const AUDIO_EXT = ['.wav', '.mp3', '.ogg'];
/** 字体扩展名（web 字体；.xnb 字体跳过） */
const FONT_EXT = ['.ttf', '.otf', '.woff', '.woff2'];

const lower = (s: string): string => s.toLowerCase();
const hasExt = (name: string, exts: string[]): string | null => {
  for (const e of exts) if (lower(name).endsWith(e)) return name.slice(0, -e.length);
  return null;
};

/** zip 条目是否包根 pack.json（ResourcePack.PACK_FILE_NAME；大小写不敏感，
 *  Ionic.Zip ContainsEntry 同为不敏感比较） */
export function isPackManifest(entry: string): boolean {
  return lower(entry) === 'pack.json';
}

/** zip 条目是否包根 icon.png（ResourcePack.ICON_FILE_NAME） */
export function isPackIcon(entry: string): boolean {
  return lower(entry) === 'icon.png';
}

/** 剥 "Content/" 根（ResourcePack.GetContentSource 的 ZipContentSource(FullPath,"Content")）。
 *  返回 Content 内相对路径（分隔符归一为 /）；不在 Content 下返回 null。
 *  大小写不敏感（Content/ 与 content/ 等价）。目录条目（尾 /）返回 null。 */
export function stripContentRoot(entry: string): string | null {
  const norm = entry.replace(/\\/g, '/').replace(/^\.?\//, '');
  if (norm.endsWith('/')) return null;
  const slash = norm.indexOf('/');
  if (slash < 0) return null;
  if (lower(norm.slice(0, slash)) !== 'content') return null;
  const rel = norm.slice(slash + 1);
  return rel === '' ? null : rel;
}

/** Content 内相对路径（如 'Images/UI/Cursor_0.png'）→ 映射目标（0..n 条；多目标 = 双写镜像）。
 *  未识别（未知子目录/不支持扩展名）返回空数组，调用方按 skipped 计数。 */
export function mapPackAsset(rel: string): MappedAsset[] {
  const segs = rel.split('/');
  const head = segs[0];
  const rest = segs.slice(1);   // Images 之后的段（根级图片 = 恰 1 段文件名）
  // Sounds/Custom/<x>.<ext> → 前缀丢弃拍平到根（本仓提取管线同款：public/sounds
  // 根目录无 Custom_ 前缀——dd2_flameburst_tower_shot_0.wav 等）；其余子层不预期
  if (lower(head) === 'sounds') {
    const drop = rest.length > 1 && lower(rest[0]) === 'custom' ? rest.slice(1) : rest;
    const file = drop.join('_');
    if (hasExt(file, AUDIO_EXT) === null) return [];
    return [{ kind: 'sound', file: file.slice(0, file.lastIndexOf('.')) }];
  }
  if (lower(head) === 'fonts') {
    const name = rest[rest.length - 1] ?? '';
    const base = hasExt(name, FONT_EXT);
    if (base === null) return [];
    return [{ kind: 'font', family: `SWRP:${base}` }];
  }
  if (lower(head) !== 'images') return [];
  // ---- Images 家族 ----
  if (rest.length === 1) {
    // 根级：vanilla/<X>.png；Armor_Head/Legs 双写 vui 消费侧
    const name = rest[0];
    if (hasExt(name, IMG_EXT) === null) return [];
    const out: MappedAsset[] = [{ kind: 'image', file: `vanilla/${name}` }];
    if (ROOT_VUI_RE.test(name)) out.push({ kind: 'image', file: `vanilla-ui/${name}` });
    return out;
  }
  const sub = lower(rest[0]);
  const flat = rest.slice(1).join('_');
  if (hasExt(flat, IMG_EXT) === null) return [];
  if (SUBDIR_TO_UI.includes(sub)) return [{ kind: 'image', file: `vanilla-ui/${rest[0]}_${flat}` }];
  if (sub === 'armor') {
    // Armor/Armor_N → vui 消费(PaperDoll) + vanilla/ 镜像(bulk 拷贝同键)
    return [
      { kind: 'image', file: `vanilla-ui/Armor_${flat}` },
      { kind: 'image', file: `vanilla/Armor_${flat}` },
    ];
  }
  if (SUBDIR_TO_VANILLA.includes(sub)) return [{ kind: 'image', file: `vanilla/${rest[0]}_${flat}` }];
  return [];
}
