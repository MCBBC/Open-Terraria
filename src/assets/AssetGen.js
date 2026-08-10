// 素材总装：启动期一次性生成全部贴图
import { generateAllTileSheets } from './TileSheetGen';
import { generateAllItemIcons } from './ItemIconGen';
import { generatePlayerSheet, generateEnemySprites, PLAYER_FRAME_W, PLAYER_FRAME_H } from './CharacterSheetGen';
export function buildAssets() {
    return {
        tileSheets: generateAllTileSheets(),
        itemIcons: generateAllItemIcons(),
        playerSheet: generatePlayerSheet(),
        enemySprites: generateEnemySprites(),
        playerFrameW: PLAYER_FRAME_W,
        playerFrameH: PLAYER_FRAME_H,
    };
}
