// 入口：加载素材 → 菜单 → 生成/加载世界 → 进入游戏
import { Game } from './core/Game';
import { UI } from './ui/UI';
import { saveGame, loadSave } from './save/SaveFile';
import { kvGet, kvSet, kvHas } from './save/KvStore';
import { ITEM_BY_KEY } from './data/items';
import { TILE_BY_KEY, T } from './data/tiles';
import { parseWldToSave } from './wld/WldImport';
// 调试句柄：页面内直接测 .wld 转换
(window as unknown as { __parseWld?: (b: Uint8Array) => unknown; __lastCompatReport?: unknown }).__parseWld = parseWldToSave as unknown as (b: Uint8Array) => unknown;
import { SpriteAtlas } from './assets/SpriteAtlas';
import { AudioSystem } from './core/Audio';

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
  if (ui.devMode) g.setupDevMode();
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
        // 恢复玩家状态
        g.player.hp = player.hp;
        g.player.x = player.x;
        g.player.y = player.y;
        g.player.inv.slots = player.inventory;
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
          g.player.inv.slots = player.inventory;
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
    case 'F5':
      e.preventDefault();
      doSave();
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

// 暴露 tile/key 常量给调试控制台
void TILE_BY_KEY; void T;
void game;

// 快速存档存在性（IndexedDB 异步）——查完再进菜单
let quickSaveExists = false;
kvHas(QUICK_SAVE_KEY).then((v) => {
  quickSaveExists = v;
  return loadAssets();
}).then(() => showMenu());

// 供 showMenu 引用的存在性（初次菜单在 Promise 完成后才弹出，值已就绪）
void 0;
