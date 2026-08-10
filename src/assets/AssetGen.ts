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

export function buildAssets(): AssetBundle {
  // 全局单例:程序化生成是确定性的(每次内容完全相同),此前每个 Game 实例重建
  // ——物品图标 ~6700 张 canvas + 全部 tile 表/角色表/敌人贴图,进一次世界泄漏一套,
  // 多次读档累积显存最终 contextlost 风暴(2026-08-10 双 trace 实证)。生成一次全程复用
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
