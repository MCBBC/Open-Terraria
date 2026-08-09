// VUI 专用共享音效实例（菜单期 Game 尚不存在，Game.sfx 用不上）。
// AudioContext 首次播放时创建（需用户手势，与 Sfx.ensure 语义一致）。
import { Sfx } from '../core/Sfx';

let instance: Sfx | null = null;

export const UISfx = {
  get sfx(): Sfx {
    if (!instance) instance = new Sfx();
    return instance;
  },
  /** 原版菜单音：hover=Menu_Tick(12)、主菜单点击=Menu_Open(10)、普通 UI 点击=Menu_Tick */
  hover() { this.sfx.play('menuTick', 0.5); },
  click() { this.sfx.play('menuTick', 0.8); },
  menuOpen() { this.sfx.play('menuOpen', 0.9); },
  menuClose() { this.sfx.play('menuClose', 0.9); },
};
