// 素材总装：启动期一次性生成全部贴图
import { generateAllTileSheets, TileSheetEntry } from './TileSheetGen';
import { generateAllItemIcons } from './ItemIconGen';
import { generatePlayerSheet, generateEnemySprites, EnemySprite, PLAYER_FRAME_W, PLAYER_FRAME_H } from './CharacterSheetGen';

export interface AssetBundle {
  tileSheets: Map<number, TileSheetEntry>;
  itemIcons: Map<number, HTMLCanvasElement>;
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
  if (iconAtlasPre) {
    // worker 图集路径:一次 putImageData + 逐图标 drawImage 物化(SHM)——
    // 相比逐图标 createCanvas+putImageData,主线程成本 ~0.9s → ~0.1-0.2s
    const pre = iconAtlasPre; iconAtlasPre = null;
    const atlas = document.createElement('canvas');
    atlas.width = pre.width; atlas.height = pre.height;
    const actx = atlas.getContext('2d', { willReadFrequently: true })!;
    actx.putImageData(new ImageData(new Uint8ClampedArray(pre.rgba), pre.width, pre.height), 0, 0);
    const icons = new Map<number, HTMLCanvasElement>();
    pre.ids.forEach((id, i) => {
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      const cx = c.getContext('2d', { willReadFrequently: true })!;
      cx.drawImage(atlas, (i % pre.cols) * 16, Math.floor(i / pre.cols) * 16, 16, 16, 0, 0, 16, 16);
      icons.set(id, c);
    });
    shared ??= {
      tileSheets: generateAllTileSheets(),
      itemIcons: icons,
      playerSheet: generatePlayerSheet(),
      enemySprites: generateEnemySprites(),
      playerFrameW: PLAYER_FRAME_W,
      playerFrameH: PLAYER_FRAME_H,
    };
    return shared;
  }
  shared ??= {
    tileSheets: generateAllTileSheets(),
    itemIcons: generateAllItemIcons(),
    playerSheet: generatePlayerSheet(),
    enemySprites: generateEnemySprites(),
    playerFrameW: PLAYER_FRAME_W,
    playerFrameH: PLAYER_FRAME_H,
  };
  return shared;
}
let shared: AssetBundle | null = null;
