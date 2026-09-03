// 音效录制（2026-09-03 用户需求：F5 长按录制窗增加音效播放序列，BGM 与 SFX 分开记）：
// "有时听到错误的音效"排查面——记录【何时】播了【什么】。两通道各持一个独立环：
//   sfx 环 ← Sfx.onEvent（静态钩，覆盖 Game.sfx 与 UISfx 共享单例——游戏内的
//            对话按钮/相机快门等菜单实例音同入账，事件类带 @ui 后缀区分）：
//     wav  = 触发面（一次触发一条；d.o=结局码 ok/q/sup/skip/mut/att/fail，
//            d.f=轮换后真文件名——Item_1 挥砍 2/3 概率换播 Item_18/19 直接可见）
//     out  = 补播实际出声（解码完成时刻；与 wav/o:q 成对，音频时钟延迟可判）
//     syn  = 合成兜底实际出声（wav 素材负缓存/缺档才达——"音色不对"直接证据）
//     loop/loopX = 循环轨起/停（引信/传送门/瀑布/天气循环）; loopF = 循环轨加载失败
//     cue  = 风·雨环境 cue 起停（Music_45/28，节流到状态翻转帧）
//   bgm 环 ← AudioSystem.onEvent：
//     sel  = 选曲切换（curMusic 变更；d.id=目标曲 MUSIC id，d.p=前曲）
//     start/stop = 轨解码完成实起 / 渐熄实停（选曲意图 vs 实际出声对账）
//     fail = 取曲失败（限时负缓存——"BGM 没声"根因）
//     mute = 静音开关
// 窗口语义与 BehaviorRecorder 完全一致（toggle 开关窗/关窗冻结 lastStart/lastEnd）——
// 直接复用 BehaviorRecorder 实例做通道环，环形淘汰/截断注记/快照尾段全继承。
// 环恒开（无窗也写）：短按 F5 报告的 audioTail 也能拿到事发前的音频序列。
import { BehaviorRecorder, type RecEvent, type RecExport, type RecWorldInfo } from './BehaviorRecorder';

/** 长按 F5 录制 dump 的 audio 段形状 */
export interface AudioRecExport {
  sfx: RecExport;
  bgm: RecExport;
}

/** 短按 F5 报告 audioTail 段形状（sfx/bgm 分列，各取最近 n 条） */
export interface AudioRecTail {
  sfx: RecEvent[] | null;
  bgm: RecEvent[] | null;
}

export class AudioRecorder {
  /** 音效通道（触发面+实际出声+合成兜底+循环轨+环境 cue） */
  readonly sfx = new BehaviorRecorder();
  /** BGM 通道（选曲/轨起停/取曲失败/静音） */
  readonly bgm = new BehaviorRecorder();

  /** tick/世界元信息源接线（Game 构造期调用；与主行为环共用同一闭包） */
  wire(tickSource: () => number, worldInfo: () => RecWorldInfo): void {
    this.sfx.tickSource = tickSource;
    this.sfx.worldInfo = worldInfo;
    this.bgm.tickSource = tickSource;
    this.bgm.worldInfo = worldInfo;
  }

  /** 录制窗开/关（两通道同步；返回切换后状态，true=录制中） */
  toggle(): boolean {
    const on = this.sfx.toggle();
    this.bgm.toggle();
    return on;
  }

  /** 当前是否在录制窗内（两通道同开同关，任一即代表整体） */
  get recording(): boolean { return this.sfx.recording; }

  /** 长按 F5 关窗导出：两通道各自独立窗/截断注记 */
  export(): AudioRecExport {
    return { sfx: this.sfx.export(), bgm: this.bgm.export() };
  }

  /** 短按 F5 报告尾段（各通道最近 n 条；无窗也有效） */
  tail(nSfx: number, nBgm: number): AudioRecTail {
    return { sfx: this.sfx.snapshotTail(nSfx), bgm: this.bgm.snapshotTail(nBgm) };
  }
}
