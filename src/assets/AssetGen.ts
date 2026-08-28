// 素材总装：启动期一次性生成全部贴图
import { generateAllTileSheets, TileSheetEntry } from './TileSheetGen';
import { generateAllItemIcons } from './ItemIconGen';
import { generatePlayerSheet, generateEnemySprites, EnemySprite, PLAYER_FRAME_W, PLAYER_FRAME_H } from './CharacterSheetGen';

export interface AssetBundle {
  tileSheets: Map<number, TileSheetEntry>;
  /** #三开压测批 图标包 worker 化(懒物化):worker 图集一次 putImageData,
   *  逐图标 canvas 改【首次访问时从图集切片】——6059 张物化 drawImage(1.2s task)消失。
   *  兼容消费端:UI.toDataURL / Renderer.itemIcon 走 itemIcon(id) */
  itemIcon(id: number): HTMLCanvasElement | null;
  playerSheet: HTMLCanvasElement;
  enemySprites: Map<string, EnemySprite>;
  playerFrameW: number;
  playerFrameH: number;
}

/** worker 预生成载荷(#三开压测批 图标包 worker 化):startAssetPrewarm 注入,
 *  buildAssets 消费后清空。rgba 一次性 putImageData 进单张 SHM 图集画布,
 *  每图标 canvas 由图集 drawImage 物化(消费端契约不变) */
let iconAtlasPre: { rgba: ArrayBuffer; width: number; height: number; cols: number; ids: number[] } | null = null;
export function prepareIconAtlas(p: { rgba: ArrayBuffer; width: number; height: number; cols: number; ids: number[] }): void {
  iconAtlasPre = p;
}
export function buildAssets(): AssetBundle {
  // 全局单例:程序化生成是确定性的(每次内容完全相同),此前每个 Game 实例重建
  // ——物品图标 ~6700 张 canvas + 全部 tile 表/角色表/敌人贴图,进一次世界泄漏一套,
  // 多次读档累积显存最终 contextlost 风暴(2026-08-10 双 trace 实证)。生成一次全程复用
  // ★热命中先于一切生成(2026-08-28 重构曾丢失 ??= 首语句语义 → 每次 ctor 全量
  //  重新生成两遍 2.9s 白跑;用户实测点击派发之外的加载期也多一倍)
  if (shared) return shared;
  if (iconAtlasPre) {
    // worker 图集路径(#三开压测批):一次 putImageData 落 SHM 图集画布,
    // 逐图标 canvas 【懒物化】——物化循环 1.2s task 实测(t1639 RunTask drawImage 1171ms)
    // 改为首次访问切片,热身期零成本
    const pre = iconAtlasPre; iconAtlasPre = null;
    const atlas = document.createElement('canvas');
    atlas.width = pre.width; atlas.height = pre.height;
    const actx = atlas.getContext('2d', { willReadFrequently: true })!;
    actx.putImageData(new ImageData(new Uint8ClampedArray(pre.rgba), pre.width, pre.height), 0, 0);
    const slotById = new Map<number, number>();
    pre.ids.forEach((id, i) => slotById.set(id, i));
    const lazyCache = new Map<number, HTMLCanvasElement>();
    shared ??= {
      tileSheets: generateAllTileSheets(),
      itemIcon(id: number): HTMLCanvasElement | null {
        const hit = lazyCache.get(id);
        if (hit) return hit;
        const slot = slotById.get(id);
        if (slot === undefined) return null;
        const c = document.createElement('canvas');
        c.width = 16; c.height = 16;
        const cx = c.getContext('2d', { willReadFrequently: true })!;
        cx.drawImage(atlas, (slot % pre.cols) * 16, Math.floor(slot / pre.cols) * 16, 16, 16, 0, 0, 16, 16);
        lazyCache.set(id, c);
        return c;
      },
      playerSheet: generatePlayerSheet(),
      enemySprites: generateEnemySprites(),
      playerFrameW: PLAYER_FRAME_W,
      playerFrameH: PLAYER_FRAME_H,
    };
    return shared;
  }
  const legacyIcons = generateAllItemIcons();
  shared ??= {
    tileSheets: generateAllTileSheets(),
    itemIcon: (id: number) => legacyIcons.get(id) ?? null,   // 主线程同步回退:全量物化(旧行为)
    playerSheet: generatePlayerSheet(),
    enemySprites: generateEnemySprites(),
    playerFrameW: PLAYER_FRAME_W,
    playerFrameH: PLAYER_FRAME_H,
  };
  return shared;
}
let shared: AssetBundle | null = null;
