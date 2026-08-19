// 热补丁应用核心(RemasterRuntime):把素材包的混合 sheet 注入运行时贴图注册表。
// 注入矩阵(经代码逐一核实):
//   vanilla/*      → atlas.vimages.set(消费方每帧现查,下一帧生效)
//   vanilla-ui/*   → atlas.uiimages.set
//   Projectile_N   → 双写 vimages + setProjSpriteOverride(Arrow 独立缓存)
//   Buff_N         → buffIconUrl(objectURL;UI.ts 钩子消费——直链 <img src> 不经 atlas)
//   Item_Atlas_*   → vimages.set;应用事件带 hasItemAtlas(main.ts 装配清 UI.iconCache)
// 派生失效:texId WeakMap/cloudTint/_tintCache/GLSpriteLayer 换对象自动新键;
// tile/wall sheet → onSheetReplaced(ChunkCache 消费登记重烘,★禁 invalidateAll);
// BestiaryPanel.bstTintCache/弹幕 frameCache/UI.iconCache 经事件或钩子清。
// 卸载 = 重拉原版 sprites/ 原路径 + 按安装序重放其余 pack(Manager 负责)。
import { SpriteAtlas, upgradeToBitmap } from '../assets/SpriteAtlas';
import { setProjSpriteOverride } from '../entities/Arrow';
import type { LoadedPack } from './types';

export interface AppliedInfo {
  files: string[];
  /** 是否涉及 Item_Atlas(调用方据此清 UI 物品图标 dataURL 缓存) */
  hasItemAtlas: boolean;
  /** 涉及的 tile/wall sheet(调用方可观测重烘) */
  tileWallSheets: string[];
}

/** 应用结果(hash 校验等不阻断注入——混合 sheet 是整图,校验在导入侧)。 */
export interface ApplyResult { applied: string[]; failed: Array<{ file: string; reason: string }> }

const TILE_WALL_RE = /^vanilla\/(Tiles|Wall)_\d+(_\d+)?\.png$/;
const PROJ_RE = /^vanilla\/Projectile_(\d+)\.png$/;
const BUFF_RE = /^vanilla\/Buff_(\d+)\.png$/;
const ITEM_ATLAS_RE = /^vanilla\/Item_Atlas_\d+\.png$/;

/** blob → ImageBitmap(失败回退 Image;tryBitmapUpgrade 同款桥,尊重 ?bitmap=0)。 */
export async function decodeSheet(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('png 解码失败'));
      img.src = url;
    });
    if (!SpriteAtlas.USE_BITMAP) return img;
    try {
      return await createImageBitmap(img);
    } catch {
      return img;   // GPU 压力窗失败:退 Image(可绘制,仅无自持像素)
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 原版 sheet 重拉(sprites/ 原路径;缺文件返回 null 留现状)。 */
export function loadVanillaSheet(file: string): Promise<ImageBitmap | HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const land = (src: ImageBitmap | HTMLImageElement) => resolve(src);
      // ★upgradeToBitmap 在 USE_BITMAP=false 时两个回调都不调——先判再走
      if (SpriteAtlas.USE_BITMAP) upgradeToBitmap(img, (b) => land(b), () => land(img));
      else land(img);
    };
    img.onerror = () => resolve(null);
    img.src = `sprites/${encodeURI(file)}`;
  });
}

export class RemasterRuntime {
  /** tile/wall sheet 替换回调(Game 装配 → chunks.onSheetReplaced 精确重烘) */
  onSheetReplaced: ((file: string) => void) | null = null;
  /** 应用完成回调(main.ts 装配:清 UI.iconCache/注册 buff 钩子;工作台:刷新预览) */
  onApplied: ((info: AppliedInfo) => void) | null = null;

  private buffIcons = new Map<number, string>();
  private objectUrls: string[] = [];

  constructor(
    private atlas: SpriteAtlas,
    /** 解码注入点(node 单测无 Image/createImageBitmap,注入 stub) */
    private decode: (blob: Blob) => Promise<ImageBitmap | HTMLImageElement> = decodeSheet,
    /** 原版重拉注入点(同上) */
    private loadVanilla: (file: string) => Promise<ImageBitmap | HTMLImageElement | null> = loadVanillaSheet,
  ) {}

  /** 应用一个 pack(混合 sheet 已是完整图,解码即注入)。 */
  async apply(pack: LoadedPack): Promise<ApplyResult> {
    const applied: string[] = [];
    const failed: Array<{ file: string; reason: string }> = [];
    const tileWall: string[] = [];
    let hasItemAtlas = false;
    for (const [file, blob] of pack.sheets) {
      try {
        const img = await this.decode(blob);
        if (file.startsWith('vanilla-ui/')) {
          this.atlas.uiimages.set(file, img);
        } else {
          this.atlas.vimages.set(file, img);
        }
        if (TILE_WALL_RE.test(file)) { tileWall.push(file); this.onSheetReplaced?.(file); }
        const proj = PROJ_RE.exec(file);
        if (proj) setProjSpriteOverride(Number(proj[1]), img);
        const buff = BUFF_RE.exec(file);
        if (buff) this.setBuffIcon(Number(buff[1]), blob);
        if (ITEM_ATLAS_RE.test(file)) hasItemAtlas = true;
        applied.push(file);
      } catch (e) {
        failed.push({ file, reason: (e as Error).message });
      }
    }
    const info: AppliedInfo = { files: applied, hasItemAtlas, tileWallSheets: tileWall };
    if (applied.length) {
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('sw:remaster-applied', { detail: info }));
      }
      this.onApplied?.(info);
    }
    return { applied, failed };
  }

  private setBuffIcon(buffId: number, blob: Blob): void {
    const old = this.buffIcons.get(buffId);
    if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(blob);
    this.buffIcons.set(buffId, url);
    this.objectUrls.push(url);
  }

  /** UI.ts buff 栏钩子查询(override 源;null=用原版直链)。 */
  buffIconUrl(vanillaBuffId: number): string | null {
    return this.buffIcons.get(vanillaBuffId) ?? null;
  }

  /** 恢复一批文件为原版(sprites/ 原路径重拉;卸载/重放的基底)。
   *  清 Buff 覆盖 + 弹幕 override 回原版 + tile/wall 重烘。 */
  async restoreVanilla(files: Iterable<string>): Promise<void> {
    const list = [...new Set(files)];
    const restored: string[] = [];
    await Promise.all(list.map(async (file) => {
      const src = await this.loadVanilla(file);
      if (!src) return;   // 原版缺文件(本就不存在):留现状
      if (file.startsWith('vanilla-ui/')) this.atlas.uiimages.set(file, src);
      else this.atlas.vimages.set(file, src);
      const proj = PROJ_RE.exec(file);
      if (proj) setProjSpriteOverride(Number(proj[1]), src);
      restored.push(file);
    }));
    // 清 buff 覆盖
    for (const url of this.buffIcons.values()) URL.revokeObjectURL(url);
    this.buffIcons.clear();
    // tile/wall 重烘
    for (const f of restored) if (TILE_WALL_RE.test(f)) this.onSheetReplaced?.(f);
    if (restored.length) {
      const info: AppliedInfo = {
        files: restored,
        hasItemAtlas: restored.some((f) => ITEM_ATLAS_RE.test(f)),
        tileWallSheets: restored.filter((f) => TILE_WALL_RE.test(f)),
      };
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('sw:remaster-applied', { detail: info }));
      }
      this.onApplied?.(info);
    }
  }

  /** 释放全部 objectURL(进程退出前;日常 apply/restore 自管理)。 */
  dispose(): void {
    for (const u of this.objectUrls) URL.revokeObjectURL(u);
    this.objectUrls = [];
    for (const u of this.buffIcons.values()) URL.revokeObjectURL(u);
    this.buffIcons.clear();
  }
}
