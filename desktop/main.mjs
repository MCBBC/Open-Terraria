// SandboxWorld 桌面薄壳（Electron）。
//
// 架构决策见 docs/desktop-packaging-research.md §九：**自包含形态**——
// 游戏全量产物（代码+assets-zip 分片）随安装包分发，缺省经内嵌环回静态服务
// 本地加载；显式传 SANDBOX_DESKTOP_URL 时退化为远程加载（dev/对照场景）。
// 选环回 HTTP 而非自定义协议的原因：资产管线的 SW+CacheStorage 在
// http://127.0.0.1(secure context) 下是能力五断言验证过的绿色路径。
//
// 其余职责不变：
//   - 单实例锁（键=profile，先 setPath 再加锁——判例②）
//   - 窗口尺寸记忆、无边框菜单
//   - 性能旗集固化常量（★判例①：默认不带 frame-limit/vsync 解锁旗）
//   - 前台 powerSaveBlocker；DIAG 注入 remote-debugging-port

import { app, BrowserWindow, Menu, shell, powerSaveBlocker, dialog, ipcMain } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { statSync, existsSync, readdirSync, mkdirSync, readFileSync } from 'node:fs';
import { join, normalize as pathNormalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

// ---------------------------------------------------------------------------
// 常量区：性能旗集与解析（本仓铁律：改这里要过 _shell-capability 探针）
// ---------------------------------------------------------------------------

/**
 * Chromium 运行时旗集 —— 「比浏览器更优」的机制性收益来源。
 *
 * ⚠️ 判例①(2026-08-29,用户实机+CDP采样双证)：frame-limit/vsync 两旗不得默认开启!
 * 游戏菜单页此前无自身节流门(VUI.startLoop),解锁后 rAF ~930fps 空转烧满一核致整机
 * 卡顿。该缺口已由游戏侧补门修复(VUI 遵循 settings frameCap),但保守起见解锁仍走
 * 显式开关 SANDBOX_DESKTOP_UNCAPPED=1。其余各旗为纯增益,默认保留。
 */
const CHROMIUM_SWITCHES = [
  ['disable-background-timer-throttling'],
  ['disable-renderer-backgrounding'],
  ['disable-backgrounding-occluded-windows'],
  ['disable-features', 'CalculateNativeWinOcclusion,MemorySaver'],
];

/** 显式解锁帧率上限（高刷/低输入延迟诉求;架构上已安全,风险自负）。 */
if (process.env.SANDBOX_DESKTOP_UNCAPPED === '1') {
  CHROMIUM_SWITCHES.unshift(['disable-frame-rate-limit'], ['disable-gpu-vsync']);
}

const SHELL_VERSION = '0.1.0';

// ----- 显式外部目标（优先级最高;未设置则使用内嵌 dist） -----

function explicitUrlArg() {
  const i = process.argv.indexOf('--url');
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  for (const a of process.argv.slice(1)) if (a.startsWith('--url=')) return a.slice('--url='.length);
  return process.env.SANDBOX_DESKTOP_URL || '';
}
function normalizeUrl(u) {
  return /^https?:\/\//.test(u) ? u : `https://${u}`;
}
const EXPLICIT_URL = explicitUrlArg() ? normalizeUrl(explicitUrlArg()) : '';

for (const [sw, val] of CHROMIUM_SWITCHES) app.commandLine.appendSwitch(sw, val);

// 默认语言=中文(2026-08-29 用户定案)。★判例:Electron 37 无 app.setLocale(调用即
// "App threw an error during load"僵死:无窗无日志进程残留);macOS 也不吃 --lang。
// 故采用:--lang(Win/Linux 生效) + preload localeHint(三端兜底,Options 探测链
// 首位消费)。显式选过语言的用户(langExplicit 落盘)永久尊重其选择。
app.commandLine.appendSwitch('lang', 'zh-CN');

// 页面 → 壳 的退出通道（游戏菜单"退出"按钮走 preload 桥）
ipcMain.on('sandbox-desktop-quit', () => app.quit());

if (process.env.SW_DIAG || process.env.SANDBOX_DESKTOP_CDP_PORT) {
  const port = Number(process.env.SANDBOX_DESKTOP_CDP_PORT || 9333);
  app.commandLine.appendSwitch('remote-debugging-port', String(port));
  console.log(`[desktop] DIAG: remote debugging on :${port}`);
}

process.on('uncaughtException', (e) => console.error('[desktop] uncaughtException:', e));
process.on('unhandledRejection', (e) => console.error('[desktop] unhandledRejection:', e));

// 单实例锁以 profile(userData 路径)为键：必须先落 setPath 再加锁（判例②）。
// 探针/CI 传 SANDBOX_DESKTOP_USERDATA 时每个实例天然独立；普通用户共用默认
// profile ⇒ 保持"重复启动唤起既有窗口"的桌面语义。
if (process.env.SANDBOX_DESKTOP_USERDATA) {
  app.setPath('userData', process.env.SANDBOX_DESKTOP_USERDATA);
}

const gotLock = app.requestSingleInstanceLock();
console.log(`[desktop] single-instance lock=${gotLock}`);
if (!gotLock) {
  app.quit();
} else {
  boot();
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

let win = null;
let psbId = null;

function boot() {
  const winStatePath = join(app.getPath('userData'), 'window-state.json');

  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  Menu.setApplicationMenu(null);

  app.whenReady().then(async () => {
    let url;
    try {
      url = EXPLICIT_URL || (await startEmbeddedDist());
      console.log(`[desktop] loading ${url}`);
    } catch (e) {
      // 自动化环境(SW_DIAG/CDP 口存在)走无头失败通道,弹窗会永久阻塞探针
      if (process.env.SW_DIAG || process.env.SANDBOX_DESKTOP_CDP_PORT) {
        console.error('[desktop] 内嵌资源启动失败:', e?.stack ?? e);
        return app.quit();
      }
      dialog.showErrorBox('SandboxWorld 启动失败', `本地资源缺失或无法启动内嵌服务:\n${e?.stack ?? e}`);
      return app.quit();
    }
    createWindow(winStatePath, url);
  });

  app.on('activate', () => {
    if (!win && app.isReady()) {
      (async () => {
        const u = EXPLICIT_URL || (await startEmbeddedDist().catch(() => EXPLICIT_URL || ''));
        if (u) createWindow(join(app.getPath('userData'), 'window-state.json'), u);
      })();
    }
  });

  app.on('window-all-closed', () => app.quit());
}

async function createWindow(winStatePath, url) {
  let state = {};
  try {
    state = JSON.parse(await readFile(winStatePath, 'utf8'));
  } catch { /* 首启用默认值 */ }

  win = new BrowserWindow({
    width: clampInt(state.width, 1280),
    height: clampInt(state.height, 720),
    x: Number.isFinite(state.x) ? state.x : undefined,
    y: Number.isFinite(state.y) ? state.y : undefined,
    minWidth: 800,
    minHeight: 480,
    show: false,
    backgroundColor: '#000000',
    title: 'SandboxWorld',
    autoHideMenuBar: true,
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
      powerPreference: 'high-performance',
    },
  });
  win.once('ready-to-show', () => win.show());

  let saveTimer = null;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!win || win.isDestroyed() || win.isFullScreen() || win.isMaximized()) return;
      const b = win.getBounds();
      writeFile(winStatePath, JSON.stringify(b)).catch(() => {});
    }, 400);
  };
  for (const ev of ['resize', 'move']) win.on(ev, scheduleSave);

  // 外链一律交系统浏览器（<a download> 导出不受影响）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3 /* ABORTED */) return;
    dialog.showMessageBox(win, {
      type: 'warning',
      title: '无法加载',
      message: `加载失败（${code} ${desc}）\n${url}\n\n请检查网络后重启应用。`,
    });
  });

  win.on('focus', () => {
    if (psbId === null) psbId = powerSaveBlocker.start('prevent-display-sleep');
  });
  win.on('blur', () => {
    if (psbId !== null && powerSaveBlocker.isStarted(psbId)) powerSaveBlocker.stop(psbId);
    psbId = null;
  });

  win.on('closed', () => (win = null));
  await win.loadURL(url);
}

function clampInt(v, dflt) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 200 ? n : dflt;
}

// ---------------------------------------------------------------------------
// 内嵌 dist 静态服务（自包含加载核心）
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.zip': 'application/zip',
  '.sbw': 'application/octet-stream',
};

let embedServerUrl = null;

/** 解析内嵌 dist 根目录：打包态=resources/dist；开发态回退 ../dist-release。 */
function locateEmbeddedDist() {
  const candidates = [];
  if (app.isPackaged) candidates.push(join(process.resourcesPath, 'dist'));
  const here = fileURLToPath(new URL('.', import.meta.url)); // .../game/desktop/
  candidates.push(join(here, '..', 'dist-release'));         // → game/dist-release
  candidates.push(join(here, '..', 'dist'));
  for (const c of candidates) {
    try {
      if (existsSync(join(c, 'index.html')) && existsSync(join(c, 'assets-zip'))) return c;
    } catch { /* 忽略不可读候选 */ }
  }
  throw new Error([
    '未找到内嵌游戏产物(index.html + assets-zip):',
    ...candidates.map((c) => `  - ${c}`),
    '正式发布前需先在 game/ 执行 `npm run build:release`。',
  ].join('\n'));
}

/** 启动 127.0.0.1 环回静态服务,返回可 loadURL 的根地址(幂等)。 */
async function startEmbeddedDist() {
  if (embedServerUrl) return embedServerUrl;
  const root = pathNormalize(locateEmbeddedDist());

  // --- 缓存头策略对齐生产 _headers:内容寻址面 immutable,入口面 no-cache ---
  const cacheControl = (p) => {
    if (/^\/assets\/.+\.(js|css|woff2)$/.test(p)) return 'public, max-age=31536000, immutable';
    if (/^\/assets-zip\/p\d+-[0-9a-f]+\.zip$/.test(p)) return 'public, max-age=31536000, immutable';
    if (p === '/' || p === '/sw.js' || p.startsWith('/l10n/') || p.endsWith('.json')) return 'no-cache';
    return 'no-cache'; // 缺省保守:SW CacheStorage 才是主缓存层,HTTP 层不做次级缓存
  };

  const server = createServer((req, res) => {
    // 守卫①Host:仅本机环回名可用(阻断局域网内其他进程借用端口)
    const host = String(req.headers.host || '');
    if (!(host.startsWith('127.0.0.1:') || host === '127.0.0.1')) {
      res.writeHead(403).end(); return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }

    let urlPath;
    try {
      urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch { res.writeHead(400).end(); return; }
    if (urlPath === '/') urlPath = '/index.html';

    // ---- ★mods 目录路由（2026-10-04 P3）：GET /mods/index.json 列 *.swmod；
    //      GET /mods/<file>.swmod 回包字节。目录=<userData>/mods（用户拖入即装，
    //      引擎启动链自动发现启用;只读服务,写面归用户/CLI）。preload 零升级——
    //      网页端同源 fetch,与 web 版 zip 导入通道天然合流。 ----
    if (urlPath === '/mods/index.json' || urlPath.startsWith('/mods/')) {
      const modsDir = pathNormalize(join(app.getPath('userData'), 'mods'));
      try { mkdirSync(modsDir, { recursive: true }); } catch { /* 只读盘也放行空列表 */ }
      if (urlPath === '/mods/index.json') {
        let list = [];
        try {
          list = readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith('.swmod')).sort();
        } catch { /* 目录不可读=空列表 */ }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
        res.end(JSON.stringify({ mods: list }));
        return;
      }
      const name = urlPath.slice('/mods/'.length);
      if (!/^[A-Za-z0-9._-]+\.swmod$/i.test(name)) { res.writeHead(403).end(); return; }  // 文件名白名单(防穿越)
      const filePath = pathNormalize(join(modsDir, name));
      if (!filePath.startsWith(modsDir + sep)) { res.writeHead(403).end(); return; }
      let data;
      try { data = readFileSync(filePath); } catch { res.writeHead(404).end('404'); return; }
      res.writeHead(200, { 'Content-Type': 'application/zip', 'Cache-Control': 'no-cache' });
      res.end(data);
      return;
    }

    // 守卫②路径穿越:归一化后必须仍落在 root 内
    const filePath = pathNormalize(join(root, urlPath));
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      res.writeHead(403).end(); return;
    }

    let st;
    try { st = statSync(filePath); } catch { res.writeHead(404); res.end('404'); return; }
    if (st.isDirectory()) { res.writeHead(404); res.end('404'); return; }

    const type = MIME[urlPath.slice(urlPath.lastIndexOf('.')).toLowerCase()] || 'application/octet-stream';
    const baseHeaders = { 'Content-Type': type, 'Cache-Control': cacheControl(urlPath) };
    const range = req.headers.range;

    if (range && /^bytes=\d*-\d*$/.test(range)) {
      // 音频拖动/断点类请求:最小 Range 支持
      let start = 0, end = st.size - 1;
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m[1]) start = parseInt(m[1], 10);
      if (m[2]) end = Math.min(end, parseInt(m[2], 10));
      if (isNaN(start) || start > end || end < 0) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end(); return;
      }
      res.writeHead(206, {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });
      if (req.method === 'HEAD') return res.end();
      createStreamPipe(filePath, res, { start, end });
      return;
    }

    res.writeHead(200, { ...baseHeaders, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    if (req.method === 'HEAD') return res.end();
    createStreamPipe(filePath, res, null);
  });

  function createStreamPipe(fp, res, range) {
    import('node:fs').then(({ createReadStream }) => {
      const s = range ? createReadStream(fp, range) : createReadStream(fp);
      s.on('error', () => { try { res.destroy(); } catch {} });
      s.pipe(res);
    });
  }

  // ★origin 稳定性(2026-08-29 黑屏反馈定罪):CacheStorage/IndexedDB/存档按
  // origin(含端口)分区——随机口=每次启动换 origin=缓存与存档全丢,且每次启动
  // 都要重新解包 365MB 分片(用户"打开黑屏很久"的反复成因)。固定首选端口,
  // 被占则顺延;单实例锁已保证同 profile 唯一,冲突只可能来自其它软件。
  const PREFERRED_PORT = 41890; // 避开常用 dev 段(5199/52xx/77xx)
  let boundPort = null;
  for (let p = PREFERRED_PORT; p <= PREFERRED_PORT + 50; p++) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (e) => reject(e);
        server.once('error', onError);
        server.once('listening', resolve);
        server.listen(p, '127.0.0.1', () => {
          server.removeListener('error', onError);
          resolve();
        });
      });
      boundPort = p;
      break;
    } catch (e) {
      if (e?.code !== 'EADDRINUSE') throw e;
      try { server.close(); } catch { /* 未曾监听 */ }
      server.removeAllListeners('listening');
    }
  }
  if (boundPort === null) throw new Error(`内嵌服务无可用端口(${PREFERRED_PORT}..${PREFERRED_PORT + 50} 全被占)`);
  embedServerUrl = `http://127.0.0.1:${boundPort}/`;
  console.log(`[desktop] embedded dist at ${embedServerUrl} (root=${root})`);
  return embedServerUrl;
}
