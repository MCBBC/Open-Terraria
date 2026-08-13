// UI 贴图语义封装：vanilla-ui 键名 → DrawRect。
// 键 = vanilla-ui-whitelist.json 的源路径下划线展平（UI/PanelBackground.png → UI_PanelBackground）。
import type { DrawRect } from '../../assets/SpriteAtlas';
import type { SpriteAtlas } from '../../assets/SpriteAtlas';

let atlas: SpriteAtlas | null = null;

export const UITextures = {
  setAtlas(a: SpriteAtlas) { atlas = a; },

  /** 按白名单键取贴图（自动补 .png 后缀），缺失返回 null（控件须自兜底）。
   *  ★探测顺序：先带 .png 的规范键再裸键（2026-08-13 修）——uiFiles 1509 键
   *  全部带 .png 后缀,旧序先探裸键 100% 落空 → UI_Cursor_0 类必刷警告;
   *  带后缀调用方（PaperDoll Player_0_10.png）旧序还会二补成 .png.png 警告 */
  get(name: string): DrawRect | null {
    if (!atlas) return null;
    const withPng = name.endsWith('.png') ? name : `${name}.png`;
    return atlas.vui(withPng) ?? atlas.vui(name);
  },
};
