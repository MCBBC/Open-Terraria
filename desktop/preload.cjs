// SandboxWorld 桌面壳 preload：最小暴露面。
// 页面用它识别桌面形态（诊断上报/状态栏角标），并查询壳版本。不做任何能力升级。
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sandboxDesktop', {
  isShell: true,
  version: '0.1.0',
  // 默认语言提示(macOS 的 --lang 开关不可靠,Options 自动探测链优先吃这里)
  localeHint: 'zh-CN',
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

// 退出按钮点击捕获(2026-08-29)：不依赖包体内 onQuit 是否接桥——旧 bundle 的退出
// 钮仍会走到 toast 分支，这里在捕获段直接认领 data-act="quit" 的点击发退出 IPC。
// 新 bundle 原生路径与本捕获并存,quit 幂等无害。
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t && typeof t.closest === 'function' && t.closest('[data-act="quit"]')) {
    ipcRenderer.send('sandbox-desktop-quit');
  }
}, true);

// 首启语言预置(2026-08-29 默认中文)：bundle 内的 localeHint 探测链要等下一次
// game build:release 才进包,macOS 的 --lang 又被忽略——这里在页面脚本运行前
// 直接预置语言档（与 save/KvStore 同 schema：DB 'sandboxworld' v2 / store 'kv' /
// 值=JSON 字符串）。★只写"从未有设置"的首启；用户显式选过语言(langExplicit)
// 或已有任何设置则永不触碰。失败静默降级为旧行为。
try {
  const req = indexedDB.open('sandboxworld', 2);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    if (!db.objectStoreNames.contains('remaster')) db.createObjectStore('remaster');
  };
  req.onsuccess = () => {
    let db = null;
    try {
      db = req.result;
      if (!db.objectStoreNames.contains('kv')) return;
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      const get = store.get('sandboxworld.options');
      get.onsuccess = () => {
        try {
          if (!get.result) {
            // 全新首启：直接预置中文
            store.put(JSON.stringify({ lang: 'zh-Hans', langExplicit: true }), 'sandboxworld.options');
          } else {
            // 存量安装：从未显式选过语言(langExplicit 假)但被旧探测写成非中文的,
            // 归位到中文;显式选择过的一律尊重。其余字段原样保留。
            try {
              const o = JSON.parse(get.result);
              if (typeof o === 'object' && o && !o.langExplicit && o.lang !== 'zh-Hans') {
                o.lang = 'zh-Hans';
                store.put(JSON.stringify(o), 'sandboxworld.options');
              }
            } catch { /* 值损坏:不动 */ }
          }
        } catch { /* 忽略 */ }
      };
    } finally {
      try { if (db) db.close(); } catch { /* 忽略 */ }
    }
  };
  req.onerror = () => { /* IDB 不可用,降级 */ };
} catch { /* 忽略 */ }
