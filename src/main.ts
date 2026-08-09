// 入口：加载素材 → 菜单 → 生成/加载世界 → 进入游戏
import { Game } from './core/Game';
import { UI } from './ui/UI';
import { saveGame, loadSave } from './save/SaveFile';
import { kvGet, kvSet, kvHas } from './save/KvStore';
import { ITEM_BY_KEY } from './data/items';
import { TILE_BY_KEY, T, TILE_DEFS, WALL_DEFS } from './data/tiles';
import { parseWldToSave } from './wld/WldImport';
import { INV_SIZE } from './items/Inventory';
// 调试句柄：页面内直接测 .wld 转换
(window as unknown as { __parseWld?: (b: Uint8Array) => unknown; __lastCompatReport?: unknown }).__parseWld = parseWldToSave as unknown as (b: Uint8Array) => unknown;
import { SpriteAtlas } from './assets/SpriteAtlas';
import { AudioSystem } from './core/Audio';
import { setDebugPool } from './data/vanillaNpcs';
import { VUI } from './vui/VUI';
import { UITextures } from './vui/assets/UITextures';
import { UIFont } from './vui/draw/UIFont';
import { Lang } from './i18n/Lang';
import { VuiDemoState } from './vui/states/VuiDemoState';

const root = document.getElementById('game-root')!;
const ui = new UI(root);
const audio = new AudioSystem();
let atlas: SpriteAtlas | null = null;

let game: Game | null = null;
let inGame = false;
let pausePanel: HTMLElement | null = null;
let playStart = 0;

const QUICK_SAVE_KEY = 'sandboxworld.quicksave';

async function loadAssets() {
  atlas = new SpriteAtlas();
  try {
    await atlas.load();
  } catch {
    atlas = null; // 素材缺失时回退程序化生成
  }
}

function enterGame(g: Game) {
  game = g;
  (window as unknown as { __swGame: Game }).__swGame = g;
  (window as unknown as { __swTiles: typeof TILE_BY_KEY }).__swTiles = TILE_BY_KEY;
  (window as unknown as { __swItems: typeof ITEM_BY_KEY }).__swItems = ITEM_BY_KEY;
  // 探针调试：强制原版生成池（确定性验证生成路径；传 null 恢复环境池）
  (window as unknown as { __swSetPool?: (p: number[] | null) => void }).__swSetPool = setDebugPool;
  inGame = true;
  playStart = Date.now();
  ui.game = g;
  ui.initInGame();
  ui.refreshAll();
  g.start();
  audio.play('main');
  ui.toast(`欢迎来到 ${g.world.name}！A/D 移动，空格跳跃，E 背包，Esc 暂停`);
}

function maybeDev(g: Game) {
  if (!ui.devMode) return;
  g.setupDevMode();
  // 开发者模式：全图迷雾点亮（小地图/大地图不再有未探索黑区）
  g.world.explored.fill(1);
  g.world.exploredVersion++; // 使 Renderer 的迷雾缓存失效重建
}

function quitToMenu() {
  inGame = false;
  pausePanel = null;
  game?.destroy();
  game = null;
  ui.closeAll();
  audio.play('title');
  showMenu();
}

function showMenu() {
  audio.play('title');
  ui.showMainMenu({
    onNew: async (seed, w, h) => {
      const g = new Game(root, {
        onWorldReady: () => {
          ui.hideProgress();
          enterGame(g);
          maybeDev(g);
        },
        onInventoryChanged: () => ui.refreshAll(),
        onBuffsChanged: () => ui.refreshBuffs(),
        onToast: (m) => ui.toast(m),
        onDayNight: (isDay) => audio.setDayNight(isDay),
      }, atlas);
      (window as unknown as { __swGame: Game }).__swGame = g;
      (window as unknown as { __swTiles: typeof TILE_BY_KEY }).__swTiles = TILE_BY_KEY;
      (window as unknown as { __swItems: typeof ITEM_BY_KEY }).__swItems = ITEM_BY_KEY;
  (window as unknown as { __swTiles: typeof TILE_BY_KEY }).__swTiles = TILE_BY_KEY;
  (window as unknown as { __swItems: typeof ITEM_BY_KEY }).__swItems = ITEM_BY_KEY;
      ui.showProgress('正在生成世界…', 0.05);
      await g.newWorld(seed || String(Date.now()), w, h, (label, p) => ui.showProgress(label, p));
    },
    onLoadFile: async (file) => {
      const text = await file.text();
      try {
        const { world, player } = loadSave(text);
        const g = new Game(root, {
          onWorldReady: () => { ui.hideProgress(); enterGame(g); },
          onInventoryChanged: () => ui.refreshAll(),
        onBuffsChanged: () => ui.refreshBuffs(),
          onToast: (m) => ui.toast(m),
        }, atlas);
        ui.showProgress('读取存档…', 0.3);
        await g.loadWorld(world, (label, p) => ui.showProgress(label, 0.3 + p * 0.6));
        // 恢复玩家状态（旧存档 45 长度 → 补齐到当前 INV_SIZE，防止 UI 越界）
        g.player.hp = player.hp;
        g.player.x = player.x;
        g.player.y = player.y;
        g.player.inv.slots = player.inventory.concat(Array(Math.max(0, INV_SIZE - player.inventory.length)).fill(null));
        g.player.inv.selected = player.selected;
        maybeDev(g);
        ui.refreshAll();
      } catch (e) {
        console.error(e);
        alert('存档读取失败：' + (e as Error).message);
        showMenu();
      }
    },
    onImportWld: async (file) => {
      ui.showProgress('正在解析 .wld 地图…', 0.1);
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const { save, report } = parseWldToSave(buf);
        (window as unknown as { __lastCompatReport?: import('./ui/UI').CompatReport }).__lastCompatReport = report;
        ui.showProgress('正在转换世界…', 0.7);
        const g = new Game(root, {
          onWorldReady: () => {
            ui.hideProgress();
            enterGame(g);
            maybeDev(g);
            ui.toast(`成功导入「${save.header.name}」(v${save.header.wldVersion})`);
            // 兼容报告：有降级/跳过内容时弹窗 + 支持导出
            const rpt = (window as unknown as { __lastCompatReport?: import('./ui/UI').CompatReport }).__lastCompatReport;
            if (rpt && (rpt.tilesDegraded.length || rpt.tilesCleared.length || rpt.itemsSkipped.length)) {
              ui.showCompatReport(rpt);
            }
          },
          onInventoryChanged: () => ui.refreshAll(),
        onBuffsChanged: () => ui.refreshBuffs(),
          onToast: (m) => ui.toast(m),
        }, atlas);
        const { world } = loadSave(JSON.stringify(save));
        await g.loadWorld(world, (label, p) => ui.showProgress(label, 0.7 + p * 0.3));
        // wld 导入给基础工具
        g.player.inv.add(ITEM_BY_KEY['copper_pickaxe'], 1);
        g.player.inv.add(ITEM_BY_KEY['copper_axe'], 1);
        g.player.inv.add(ITEM_BY_KEY['copper_sword'], 1);
        g.player.inv.add(ITEM_BY_KEY['torch'], 20);
      } catch (e) {
        console.error(e);
        ui.hideProgress();
        alert('.wld 导入失败：' + (e as Error).message);
        showMenu();
      }
    },
    onQuickLoad: quickSaveExists
      ? async () => {
          const text = await kvGet(QUICK_SAVE_KEY);
          if (!text) return;
          const { world, player } = loadSave(text);
          const g = new Game(root, {
            onWorldReady: () => { ui.hideProgress(); enterGame(g); },
            onInventoryChanged: () => ui.refreshAll(),
        onBuffsChanged: () => ui.refreshBuffs(),
            onToast: (m) => ui.toast(m),
          }, atlas);
          ui.showProgress('读取存档…', 0.3);
          // 必须 await：预沉降完成后 player 才存在（否则恢复状态时 undefined 崩溃）
          await g.loadWorld(world, (label, p) => ui.showProgress(label, 0.3 + p * 0.6));
          g.player.hp = player.hp;
          g.player.x = player.x;
          g.player.y = player.y;
          g.player.inv.slots = player.inventory.concat(Array(Math.max(0, INV_SIZE - player.inventory.length)).fill(null));
          g.player.inv.selected = player.selected;
          maybeDev(g);
        }
      : null,
  });
}

// ---- 键盘：背包/暂停/保存 ----
window.addEventListener('keydown', (e) => {
  if (!inGame || !game) return;
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
          onSave: () => doSave(),
          onQuit: () => {
            pausePanel = null;
            game!.paused = false;
            quitToMenu();
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
      game.world.exploredVersion++; // 使迷雾缓存失效重建
      ui.toast('已消除全图迷雾');
      break;
    case 'F5':
      e.preventDefault();
      toggleAnnotate();
      break;
    case 'F6':
      e.preventDefault();
      doSave();
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
    case 'KeyM':
      if (game.renderer.fullMap.open) {
        game.renderer.fullMap.open = false;
      } else {
        ui.toast(audio.toggleMute() ? '音乐已关闭' : '音乐已开启');
      }
      break;
  }
});

function doSave() {
  if (!game) return;
  const json = saveGame(game.world, game.player, Date.now() - playStart);
  // 大地图存档可能超 localStorage 5MB 限制 → 优先 IndexedDB（数百 MB）
  const mb = json.length / 1024 / 1024;
  kvSet(QUICK_SAVE_KEY, json).then((where) => {
    if (where === 'fail') ui.toast('保存失败：存储不可用');
    else ui.toast(`已保存（${where === 'idb' ? mb.toFixed(1) + ' MB → IndexedDB' : '本地'}）`);
  });
}

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
  if (!game) return;
  game.annotateMode = !game.annotateMode;
  if (game.annotateMode) {
    ui.showAnnotatePanel({
      onExportMarks: exportMarks,
      onExportMap: exportMap,
      onClear: () => {
        if (!game) return;
        game.marks = [];
        ui.updateAnnotateCount(0);
      },
      onClose: () => toggleAnnotate(),
      onToggleFix: () => {
        if (!game) return;
        game.fixTexMode = !game.fixTexMode;
        ui.setFixModeLabel(game.fixTexMode);
        ui.toast(game.fixTexMode ? '贴图纠错模式：点击方块打开其贴图表' : '已关闭贴图纠错模式');
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
  if (!game) return;
  const g = game;
  const st = g.world.store;
  const marks = g.marks.map((m, i) => {
    const idx = st.idx(m.x, m.y);
    const t = st.type[idx];
    const def = TILE_DEFS[t];
    // 诊断增强：8 邻居（类型+帧）、液体、贴图表尺寸与帧越界检测
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
    // 贴图表元数据 + 越界检测（style 帧超出 PNG = 素材包版本旧）
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
  if (!game) return;
  const json = saveGame(game.world, game.player, Date.now() - playStart);
  downloadText(`map-${game.world.name.replace(/\s+/g, '_')}.json`, json);
  ui.toast('已导出地图存档');
}

function exportTexFixes() {
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

// 暴露 tile/key 常量给调试控制台
void TILE_BY_KEY; void T;
void game;

// 快速存档存在性（IndexedDB 异步）——查完再进菜单
let quickSaveExists = false;
kvHas(QUICK_SAVE_KEY).then((v) => {
  quickSaveExists = v;
  return loadAssets();
}).then(async () => {
  // M0 验收：?vuidemo=1 只跑 VUI 框架演示（M1 主菜单接管后移除）
  if (new URLSearchParams(location.search).has('vuidemo')) {
    if (atlas) UITextures.setAtlas(atlas);
    await Promise.all([UIFont.load(), Lang.load()]);
    VUI.init(root);
    VUI.setState(new VuiDemoState());
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      VUI.frame(now - last);
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return;
  }
  showMenu();
});

// 供 showMenu 引用的存在性（初次菜单在 Promise 完成后才弹出，值已就绪）
void 0;
