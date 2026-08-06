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
  return {
    tileSheets: generateAllTileSheets(),
    itemIcons: generateAllItemIcons(),
    playerSheet: generatePlayerSheet(),
    enemySprites: generateEnemySprites(),
    playerFrameW: PLAYER_FRAME_W,
    playerFrameH: PLAYER_FRAME_H,
  };
}
