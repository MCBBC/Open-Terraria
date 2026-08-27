// 音频开启拦截门（所有流程前置，2026-08-24 用户要求）：浏览器自动播放策略挂起
// AudioContext 时，先出纯黑幕——正中白色耳机图标 + 下方白色两行提示（戴耳机/
// 点击开始），点击或按键任意位置恢复音频并放行。未拦截（AC 已 running）或调试
// 旁路（?play/?quickload/?vuidemo/?nogate）与自动化探针（navigator.webdriver，
// puppeteer 置位——不豁免则全部浏览器探针挂死在门上）直接放行。
import { Lang } from '../i18n/Lang';
import { swTrace } from '../net/AssetCache';

/** 是否需要出音频门（旁路/探针豁免判定；拦截与否由调用方探测 AC 状态） */
export function shouldShowAudioGate(): boolean {
  if (typeof navigator !== 'undefined' && (navigator as { webdriver?: boolean }).webdriver) return false;
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  return !(q.has('nogate') || q.has('play') || q.has('quickload') || q.has('vuidemo'));
}

/**
 * 出音频门，resolve 于玩家点击/按键放行（黑幕移除后）。
 * @param resume 恢复音频的回调（AudioSystem.resumeNow；armUnlock 监听并行兜底）
 */
export function showAudioGate(resume: () => Promise<boolean>): Promise<void> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.id = 'sw-audio-gate';
    root.innerHTML = `
      <style>
        #sw-audio-gate { position: fixed; inset: 0; z-index: 10001; background: #000;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 34px; font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
          color: #fff; user-select: none; cursor: pointer; }
        #sw-audio-gate svg { display: block; }
        #sw-audio-gate .tip { font-size: 16px; text-align: center; line-height: 2.1;
          letter-spacing: 2px;
          text-shadow: 1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000; }
      </style>
      <svg width="96" height="96" viewBox="0 0 24 24" fill="none"
           stroke="#fff" stroke-width="1.4" stroke-linecap="round">
        <path d="M4 15v-3a8 8 0 0 1 16 0v3"/>
        <rect x="3" y="14" width="4.4" height="6.4" rx="2" fill="#fff" stroke="none"/>
        <rect x="16.6" y="14" width="4.4" height="6.4" rx="2" fill="#fff" stroke="none"/>
      </svg>
      <div class="tip">${Lang.text('Mods.SandboxWorld.AudioGate.Line1')}<br>${Lang.text('Mods.SandboxWorld.AudioGate.Line2')}</div>
    `;
    document.body.appendChild(root);
    let settled = false;
    const done = (e: Event) => {
      // ★只认真实用户手势(2026-08-27 手机实测"门显示1-2s自己消失但音乐没播"):
      //  页面内存在程序化派发的点击(存档下载 a.click() 等),合成事件 isTrusted=false,
      //  曾在门出现后 1-2s 误触 done → 无手势 resume 被拒 → 静音进游戏
      if (!e.isTrusted) { swTrace('音频门: 拒绝合成事件(非用户手势)'); return; }
      if (settled) return;
      settled = true;
      window.removeEventListener('pointerdown', done, true);
      window.removeEventListener('keydown', done, true);
      void resume();
      swTrace('音频门: 用户手势放行');
      root.remove();
      resolve();
    };
    window.addEventListener('pointerdown', done, true);
    window.addEventListener('keydown', done, true);
    swTrace('音频门: 显示');
  });
}
