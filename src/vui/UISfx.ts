// VUI 专用共享音效实例（菜单期 Game 尚不存在，Game.sfx 用不上）。
// AudioContext 首次播放时创建（需用户手势，与 Sfx.ensure 语义一致）。
import { Sfx } from '../core/Sfx';

let instance: Sfx | null = null;

export const UISfx = {
  /** 探针/测试观测面：各门面方法的调用计数（不含音量/成败语义） */
  counts: {} as Record<string, number>,
  _bump(n: string) { this.counts[n] = (this.counts[n] ?? 0) + 1; },
  get sfx(): Sfx {
    if (!instance) {
      instance = new Sfx();
      instance.dbgTag = 'ui';   // 音效录制（F5 窗）出身标记：事件类带 @ui 后缀
    }
    return instance;
  },
  /** 原版菜单音：hover=Menu_Tick(12)、主菜单点击=Menu_Open(10)、普通 UI 点击=Menu_Tick */
  hover() { this._bump('hover'); this.sfx.play('menuTick', 1); },
  click() { this._bump('click'); this.sfx.play('menuTick', 1); },
  menuOpen() { this._bump('menuOpen'); this.sfx.play('menuOpen', 1); },
  menuClose() { this._bump('menuClose'); this.sfx.play('menuClose', 1); },
  /** 秘种子解锁音（SoundID.MenuAccept="menu_accept"，WorldGen.SecretSeed.Enable :539——
   *  世界创建页录入秘种子一次性播放；★IIIII215b 生成界面彩蛋批接线） */
  menuAccept() { this._bump('menuAccept'); this.sfx.play('menuAccept', 1); },
  /** 特殊种子命中音（legacy PlaySound(24)=Chat，UIWorldCreation.cs:833——种子文本每次
   *  变更且命中特殊种子表时播放） */
  chat() { this._bump('chat'); this.sfx.play('chat', 1); },
};
