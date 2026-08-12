// 入口：加载素材/字体/文案 → VUI 主菜单 → 生成/加载世界 → 进入游戏
// 流程编排见 mainFlow.ts；本文件只做装配 + 游戏内键盘/开发者工具接线。
import { Game } from './core/Game';
import { UI } from './ui/UI';
import { kvHas } from './save/KvStore';
import { saveGame } from './save/SaveFile';
import { ITEM_BY_KEY } from './data/items';
import { TILE_BY_KEY, T, TILE_DEFS, WALL_DEFS } from './data/tiles';
import { parseWldToSave } from './wld/WldImport';
// 调试句柄：页面内直接测 .wld 转换
(window as unknown as { __parseWld?: (b: Uint8Array) => unknown }).__parseWld = parseWldToSave as unknown as (b: Uint8Array) => unknown;
import { SpriteAtlas } from './assets/SpriteAtlas';
import { AudioSystem } from './core/Audio';
import { setDebugPool } from './data/vanillaNpcs';
import { VUI } from './vui/VUI';
import { UITextures } from './vui/assets/UITextures';
import { UIFont } from './vui/draw/UIFont';
import { Lang } from './i18n/Lang';
import { options } from './core/Options';
import { VuiDemoState } from './vui/states/VuiDemoState';
import { createFlow } from './mainFlow';
import type { FlowHandle } from './mainFlow';
import { downloadDebugReport } from './debug/DebugReport';

const root = document.getElementById('game-root')!;
const ui = new UI(root);

// ---- 调试报告基础设施：错误 ring（F5 报告 errors 段唯一数据源）----
// kind: 0=pageerror 1=unhandledrejection 2=console.error；stack 取首行
interface SwErrorRecord { t: number; kind: number; msg: string; stack: string | null }
const ERR_RING_CAP = 50;
function pushSwError(kind: number, msg: unknown, stack: string | null | undefined) {
  const w = window as unknown as { __swErrors?: SwErrorRecord[] };
  if (!Array.isArray(w.__swErrors)) w.__swErrors = [];
  w.__swErrors.push({
    t: Date.now(), kind,
    msg: String(msg).slice(0, 500),
    stack: stack ? stack.split('\n')[0].slice(0, 300) : null,
  });
  if (w.__swErrors.length > ERR_RING_CAP) w.__swErrors.shift();
}
window.addEventListener('error', (e) => pushSwError(0, e.message, e.error instanceof Error ? e.error.stack : null));
window.addEventListener('unhandledrejection', (e) =>
  pushSwError(1, e.reason instanceof Error ? `${e.reason.name}: ${e.reason.message}` : e.reason, e.reason instanceof Error ? e.reason.stack : null));
{
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const err = args.find((a): a is Error => a instanceof Error);
    pushSwError(2, args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '), err ? err.stack : null);
    origError(...args);
  };
}
// 警告 ring（F5 报告 warnings 段数据源；与错误环分离——告警刷屏不能挤掉真错误）。
// 全量捕获 console.warn：渲染层的 warn-once（如 VanillaTiler 源矩形越界/取帧失败）
// 随手入环，任何模块无需单独接线
const WARN_RING_CAP = 50;
function pushSwWarn(msg: unknown) {
  const w = window as unknown as { __swWarns?: Array<{ t: number; msg: string }> };
  if (!Array.isArray(w.__swWarns)) w.__swWarns = [];
  w.__swWarns.push({ t: Date.now(), msg: String(msg).slice(0, 500) });
  if (w.__swWarns.length > WARN_RING_CAP) w.__swWarns.shift();
}
{
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    pushSwWarn(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '));
    origWarn(...args);
  };
}

ui.onBestiary = () => flow.openBestiary(); // 背包面板图鉴按钮（原版 BestiaryMenuButton）
const audio = new AudioSystem();
let atlas: SpriteAtlas | null = null;

let flow: FlowHandle;
let inGame = false;
let pausePanel: HTMLElement | null = null;

async function loadAssets() {
  atlas = new SpriteAtlas();
  try {
    await atlas.load();
    // 菜单首帧所需的 UI 贴图(面板/按钮/光标/logo,~100 张几 MB)在显示主菜单前
    // 就位——否则 vui 懒加载下首帧控件用兜底样式闪一帧
    await atlas.preloadUiPrefix(['UI_', 'Inventory_', 'logo', 'Logo']);
  } catch {
    atlas = null; // 素材缺失时回退程序化生成
  }
  (window as unknown as { __swAtlas?: SpriteAtlas | null }).__swAtlas = atlas; // 调试/探针句柄
}

function enterGameHooks() {
  const g = flow.game!;
  inGame = true;
  (window as unknown as { __swTiles: typeof TILE_BY_KEY }).__swTiles = TILE_BY_KEY;
  (window as unknown as { __swItems: typeof ITEM_BY_KEY }).__swItems = ITEM_BY_KEY;
  (window as unknown as { __swSetPool?: (p: number[] | null) => void }).__swSetPool = setDebugPool;
}

// ---- 键盘：背包/暂停/保存 ----
window.addEventListener('keydown', (e) => {
  const game = flow.game;
  if (!inGame || !game) return;
  // 输入框内打字不算操作键位（合成搜索框等）：除 Escape 外全部放行给输入框
  const tgt = e.target as HTMLElement | null;
  const typing = !!tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable);
  if (typing && e.code !== 'Escape') return;
  switch (e.code) {
    case 'KeyE':
    case 'Escape':
      e.preventDefault();
      if (game.renderer.fullMap.open) {
        game.renderer.fullMap.open = false;
        break;
      }
      if (pausePanel) {
        pausePanel.remove();
        pausePanel = null;
        game.paused = false;
        ui.closeInventory();
        game.input.uiBlocking = false;
      } else if (ui.invPanel && ui.invPanel.style.display === 'block') {
        ui.closeInventory();
      } else if (e.code === 'Escape') {
        game.paused = true;
        pausePanel = ui.showPause({
          onResume: () => {
            pausePanel?.remove();
            pausePanel = null;
            game!.paused = false;
          },
          onSave: () => flow.doSave(),
          onSettings: () => flow.openSettings(true),
          onBestiary: () => flow.openBestiary(),
          onQuit: () => {
            pausePanel = null;
            game!.paused = false;
            inGame = false;
            flow.quitToMenu();
          },
        });
      } else {
        ui.openInventory();
      }
      break;
    case 'F3':
      e.preventDefault();
      game.renderer.debugMode = !game.renderer.debugMode;
      ui.toast(game.renderer.debugMode ? '调试面板已开启（碰撞盒高亮）' : '调试面板已关闭');
      break;
    case 'F4':
      e.preventDefault();
      game.world.explored.fill(1);
      game.world.exploredDirty = null; // 全图变化无脏信息 → 渲染端整幅重建
      game.world.exploredVersion++; // 使迷雾缓存失效重建
      ui.toast('已消除全图迷雾');
      break;
    case 'F5': {
      // 一键调试报告（机器优先 JSON）：标注系统实现保留，仅解绑 F5（可另配键）
      e.preventDefault();
      const r = downloadDebugReport(game, {
        playTimeMs: (flow as FlowHandle & { playStartNow: number }).playStartNow,
      });
      ui.toast(r.triggered ? `调试报告已生成：${r.filename}` : '调试报告已生成（浏览器拦截下载，可从 __swDebugReport 取）');
      break;
    }
    case 'F6':
      e.preventDefault();
      flow.doSave();
      break;
    case 'F7':
      e.preventDefault();
      game.forceShowWires = !game.forceShowWires;
      ui.toast(game.forceShowWires ? '导线显示:强制开启' : '导线显示:手持电路工具时');
      break;
    case 'F8':
      e.preventDefault();
      game.enemySpawnEnabled = !game.enemySpawnEnabled;
      ui.toast(game.enemySpawnEnabled ? '怪物生成已开启' : '怪物生成已关闭（已有怪物不受影响）');
      break;
    case 'F9':
      e.preventDefault();
      game.renderer.fullbright = !game.renderer.fullbright;
      ui.toast(game.renderer.fullbright ? '已开灯：全画面无暗影' : '已关灯：恢复正常光照');
      break;
    case 'F10':
      e.preventDefault();
      game.teleportToMouse();
      break;
    case 'KeyM':
      if (game.renderer.fullMap.open) {
        game.renderer.fullMap.open = false;
      } else {
        ui.toast(audio.toggleMute() ? '音乐已关闭' : '音乐已开启');
      }
      break;
  }
});

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- 方块标注模式（F5）：标记问题方块，导出标注 + 地图给开发者 ----
function toggleAnnotate() {
  const game = flow.game;
  if (!game) return;
  game.annotateMode = !game.annotateMode;
  if (game.annotateMode) {
    ui.showAnnotatePanel({
      onExportMarks: exportMarks,
      onExportMap: exportMap,
      onClear: () => {
        if (!flow.game) return;
        flow.game.marks = [];
        ui.updateAnnotateCount(0);
      },
      onClose: () => toggleAnnotate(),
      onToggleFix: () => {
        if (!flow.game) return;
        flow.game.fixTexMode = !flow.game.fixTexMode;
        ui.setFixModeLabel(flow.game.fixTexMode);
        ui.toast(flow.game.fixTexMode ? '贴图纠错模式：点击方块打开其贴图表' : '已关闭贴图纠错模式');
      },
      onExportFixes: exportTexFixes,
    });
    ui.updateAnnotateCount(game.marks.length);
    ui.toast('标注模式已开启：点击方块标记，F5 关闭');
  } else {
    ui.closeAnnotatePanel();
    ui.toast('标注模式已关闭');
  }
}

function exportMarks() {
  const game = flow.game;
  if (!game) return;
  const g = game;
  const st = g.world.store;
  const marks = g.marks.map((m, i) => {
    const idx = st.idx(m.x, m.y);
    const t = st.type[idx];
    const def = TILE_DEFS[t];
    const nb: Record<string, { key: string | null; fx: number; fy: number } | null> = {};
    const dirs: Array<[string, number, number]> = [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0],
      ['nw', -1, -1], ['ne', 1, -1], ['sw', -1, 1], ['se', 1, 1]];
    for (const [tag, dx, dy] of dirs) {
      const nx = m.x + dx, ny = m.y + dy;
      if (!st.inBounds(nx, ny)) { nb[tag] = null; continue; }
      const ni = st.idx(nx, ny);
      const nt = st.type[ni];
      nb[tag] = nt === 0 ? null : { key: TILE_DEFS[nt]?.key ?? String(nt), fx: st.frameX[ni], fy: st.frameY[ni] };
    }
    let sheetInfo: { sheet: number; name: string; png: string; oob: boolean } | null = null;
    const sheetId = def?.vanilla?.sheet;
    if (sheetId !== undefined && g.renderer.atlas) {
      const meta = g.renderer.atlas.vmeta(sheetId);
      const img = meta ? g.renderer.atlas.vimages.get(meta.sheet) : null;
      if (meta && img) {
        const oob = def!.vanilla!.frame === 'style'
          && (st.frameX[idx] + meta.grid[0] > img.width || st.frameY[idx] + meta.grid[1] > img.height);
        sheetInfo = { sheet: sheetId, name: meta.name, png: `${img.width}×${img.height}`, oob };
      }
    }
    return {
      no: i + 1, x: m.x, y: m.y,
      typeId: t, typeKey: def?.key ?? null, typeName: def?.name ?? null,
      frameX: st.frameX[idx], frameY: st.frameY[idx],
      wall: st.wall[idx],
      liquid: st.liquid[idx], liquidType: st.liquidType[idx],
      wallName: WALL_DEFS[st.wall[idx]]?.name ?? null,
      neighbors: nb, sheetInfo,
    };
  });
  const out = {
    worldName: g.world.name, size: [g.world.w, g.world.h],
    player: { x: Math.floor(g.player.x / 16), y: Math.floor(g.player.y / 16) },
    exportedAt: new Date().toISOString(),
    marks,
  };
  downloadText(`marks-${g.world.name.replace(/\s+/g, '_')}.json`, JSON.stringify(out, null, 2));
  ui.toast(`已导出 ${marks.length} 处标注`);
}

function exportMap() {
  const game = flow.game;
  if (!game) return;
  const json = saveGameCompat(game);
  downloadText(`map-${game.world.name.replace(/\s+/g, '_')}.json`, json);
  ui.toast('已导出地图存档');
}

function exportTexFixes() {
  const game = flow.game;
  if (!game) return;
  const fixes = ui.texFixes;
  if (!fixes.length) { ui.toast('还没有记录任何贴图纠错'); return; }
  const out = {
    worldName: game.world.name, size: [game.world.w, game.world.h],
    exportedAt: new Date().toISOString(),
    note: '每条 = 地图坐标处应使用的正确帧偏移（对应 Tiles_N 表的像素偏移）',
    fixes,
  };
  downloadText(`texfix-${game.world.name.replace(/\s+/g, '_')}.json`, JSON.stringify(out, null, 2));
  ui.toast(`已导出 ${fixes.length} 处贴图纠错`);
}

function saveGameCompat(g: Game): string {
  return saveGame(g.world, g.player, (flow as FlowHandle & { playStartNow: number }).playStartNow, g.townNpcsForSave(), g.eventsForSave());
}

// 暴露 tile/key 常量给调试控制台
void TILE_BY_KEY; void T; void ITEM_BY_KEY;

// 观察进游戏事件（mainFlow 的 enterGame 发生在 Game 回调里，这里轮询 __swGame 变化）
let lastGameRef: Game | null = null;
setInterval(() => {
  const g = (window as unknown as { __swGame?: Game }).__swGame ?? null;
  if (g && g !== lastGameRef) {
    lastGameRef = g;
    inGame = true;
    enterGameHooks();
  } else if (!g && lastGameRef) {
    lastGameRef = null;
    inGame = false;
  }
}, 250);

// ---- 启动 ----
kvHas('sandboxworld.quicksave').then(async () => {
  await loadAssets();
  if (atlas) UITextures.setAtlas(atlas);
  // options 先行(语言设置在 options 里),Lang.init 按 options.data.lang 加载语言包;
  // mainFlow 内的 options.load() 幂等,此处已加载则直接返回
  await options.load();
  await Promise.all([UIFont.load(), Lang.init(options.data.lang)]);
  VUI.init(root);
  VUI.startLoop(); // 自愈帧循环（HMR 杀不死，看门狗 1s 内重启）
  flow = createFlow(root, atlas, ui, audio);

  // M0 验收入口：?vuidemo=1 只跑 VUI 框架演示
  if (new URLSearchParams(location.search).has('vuidemo')) {
    VUI.setState(new VuiDemoState());
    return;
  }

  // 旁路路由：?play[=small|medium|large] 跳过主菜单直接生成世界进游戏
  // （主菜单 UI 改造期间绕行用；也可 ?quickload 直接读快速存档）
  const bootParams = new URLSearchParams(location.search);
  if (bootParams.has('quickload')) {
    void flow.quickLoad();
    return;
  }
  if (bootParams.has('play')) {
    const sz = bootParams.get('play') || 'medium';
    const [w, h] = sz === 'small' ? [4200, 1200] : sz === 'large' ? [8400, 2400] : [6400, 1800];
    void flow.newWorld('', w, h);
    return;
  }

  flow.showTitle();
});
