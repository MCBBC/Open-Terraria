// SandboxWorld 桌面壳 preload：最小暴露面。
// 页面用它识别桌面形态（诊断上报/状态栏角标），并查询壳版本。不做任何能力升级。
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sandboxDesktop', {
  isShell: true,
  version: '0.1.0',
  // 游戏菜单"退出"→ 原生退出应用
  quit: () => {
    ipcRenderer.send('sandbox-desktop-quit');
  },
  // 预留通道（当前壳内未主动使用）：页面 postMessage 上报诊断/进世界状态
  onShellMessage: (fn) => {
    if (typeof fn !== 'function') return () => {};
    const handler = (_e, data) => {
      try {
        fn(data);
      } catch {
        /* 诊断回调异常不影响游戏 */
      }
    };
    ipcRenderer.on('sandbox-shell-message', handler);
    return () => ipcRenderer.removeListener('sandbox-shell-message', handler);
  },
});
