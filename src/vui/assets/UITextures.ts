// UI 贴图语义封装：vanilla-ui 键名 → DrawRect。
// 键 = vanilla-ui-whitelist.json 的源路径下划线展平（UI/PanelBackground.png → UI_PanelBackground）。
import type { DrawRect } from '../../assets/SpriteAtlas';
import type { SpriteAtlas } from '../../assets/SpriteAtlas';

let atlas: SpriteAtlas | null = null;

export const UITextures = {
  setAtlas(a: SpriteAtlas) { atlas = a; },

  /** 按白名单键取贴图（自动补 .png 后缀），缺失返回 null（控件须自兜底）。
   *  ★只探规范键（2026-08-26）：uiFiles 1509 键【全部】带 .png 后缀,裸键兜底
   *  探针 100% 落空且必误告——懒载 HUD（UI_InfoIcon 等在预载排除表,首帧图片
   *  未就绪）第一探针命中清单但 ensureUiImage 返回 null → 落到裸键探针 →
   *  vuiKeyMiss 误报"清单无此键"（2026-08-26 用户实报 UI_InfoIcon_4/12/13）。
   *  真缺失的键仍由规范键探针 warn-once 一次,诊断不受损 */
  get(name: string): DrawRect | null {
    if (!atlas) return null;
    return atlas.vui(name.endsWith('.png') ? name : `${name}.png`);
  },

  /** 串行懒载一批 UI 贴图(2026-08-25 用户要求"懒加载+串行"):await 返回时
   *  名单内【存在的】文件均已入 uiimages(可绘);不存在的文件跳过不悬挂。
   *  入参为 vanilla-ui 清单键(与 get() 同域,如 'Player_Hair_5.png'),
   *  ensureUiBatch 内部解析成磁盘路径 */
  ensure(names: string[]): Promise<void> {
    if (!atlas) return Promise.resolve();
    return atlas.ensureUiBatch(names);
  },
};
