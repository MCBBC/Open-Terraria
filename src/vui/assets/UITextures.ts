// UI 贴图语义封装：vanilla-ui 键名 → DrawRect。
// 键 = vanilla-ui-whitelist.json 的源路径下划线展平（UI/PanelBackground.png → UI_PanelBackground）。
import type { DrawRect } from '../../assets/SpriteAtlas';
import type { SpriteAtlas } from '../../assets/SpriteAtlas';

let atlas: SpriteAtlas | null = null;

export const UITextures = {
  setAtlas(a: SpriteAtlas) { atlas = a; },

  /** 按白名单键取贴图（自动补 .png 后缀），缺失返回 null（控件须自兜底） */
  get(name: string): DrawRect | null {
    return atlas?.vui(name) ?? atlas?.vui(`${name}.png`) ?? null;
  },
};
