// 菜单/游戏流程编排（VUI 版）：主菜单 → 世界生成/读取 → 进游戏 → 退出回菜单。
// main.ts 只做启动装配；本模块持有 Game 生命周期与 VUI/背景的 rAF 驱动。
import { Game } from './core/Game';
import { UI } from './ui/UI';
import { AudioSystem } from './core/Audio';
import type { SpriteAtlas } from './assets/SpriteAtlas';
import { saveGame, loadSave } from './save/SaveFile';
import { kvGet, kvHas } from './save/KvStore';
import { ITEM_BY_KEY } from './data/items';
import { parseWldToSave } from './wld/WldImport';
import { INV_SIZE } from './items/Inventory';
import { VUI } from './vui/VUI';
import { TitleMenu } from './ui/TitleMenu';
import { SettingsPanel } from './ui/Settings';
import { CharSelectPanel } from './ui/CharSelect';
import { WorldSelectPanel } from './ui/WorldSelect';
import { WorldCreationPanel } from './ui/WorldCreation';
import { CharCreation } from './ui/CharCreation';
import { UIWorldLoadState } from './vui/states/UIWorldLoadState';
import { MenuBackground } from './render/MenuBackground';
import { CharacterStore } from './save/CharacterStore';
import { WorldStore, type WorldMeta } from './save/WorldStore';
import { options } from './core/Options';
import { UIScale } from './vui/draw/UIScale';
import { UISfx } from './vui/UISfx';
import type { Appearance } from './player/Appearance';

const QUICK_SAVE_KEY = 'sandboxworld.quicksave';
/** 脚本兼容垫片：旧 puppeteer 脚本点 select+button 建世界（M7 清理） */
let legacyShim: HTMLElement | null = null;

export interface FlowHandle {
  showTitle(): void;
  newWorld(seed: string, w: number, h: number): Promise<void>;
  quickLoad(): Promise<void>;
  importWld(buf: Uint8Array): Promise<void>;
  quitToMenu(): void;
  doSave(): void;
  openSettings(inGame: boolean): void;
  game: Game | null;
  playStart: number;
}

export function createFlow(root: HTMLElement, atlas: SpriteAtlas | null, ui: UI, audio: AudioSystem): FlowHandle {
  let game: Game | null = null;
  let playStart = 0;
  let menuBg: MenuBackground | null = null;
  let menuRunning = false;
  let titleMenu: TitleMenu | null = null;
  let devMode = false;
  // 设置项加载 + 下发（M6）
  void options.load();
  options.onChange((d) => {
    audio.setVolume(d.musicVol);
    UISfx.sfx.master = d.sfxVol;
    UIScale.userScale = d.uiScale;
    devMode = d.devMode;
  });
  let quickSaveExists = false;
  let selectedAppearance: Appearance | null = null;
  let currentWorld: WorldMeta | null = null;
  const charStore = new CharacterStore();
  const worldStore = new WorldStore();

  // 隐藏文件输入（DOM 能力，VUI 按钮触发）
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  root.appendChild(fileInput);
  const wldInput = document.createElement('input');
  wldInput.type = 'file';
  wldInput.accept = '.wld';
  wldInput.style.display = 'none';
  root.appendChild(wldInput);

  // ---- 游戏进入/退出（沿用 main.ts 既有逻辑） ----

  function enterGame(g: Game) {
    game = g;
    (window as unknown as { __swGame: Game }).__swGame = g;
    playStart = Date.now();
    stopMenu();
    titleMenu?.destroy();
    titleMenu = null;
    ui.game = g;
    ui.initInGame(); // DOM 版游戏内 UI（道具栏/背包/合成/宝箱/Buff）——用户指定 web 技术路线
    g.start();
    audio.play('main');
    ui.toast(`欢迎来到 ${g.world.name}！A/D 移动，空格跳跃，E 背包，Esc 暂停`);
  }

  function maybeDev(g: Game) {
    if (!devMode) return;
    g.setupDevMode();
    g.world.explored.fill(1);
    g.world.exploredVersion++;
  }

  function makeGame(): Game {
    const g = new Game(root, {
      onWorldReady: () => { ui.hideProgress(); enterGame(g); maybeDev(g); applyAppearance(g); },
      onInventoryChanged: () => ui.refreshAll(),
      onBuffsChanged: () => ui.refreshBuffs(),
      onToast: (m) => ui.toast(m),
      onDayNight: (isDay) => audio.setDayNight(isDay),
    }, atlas);
    return g;
  }

  // ---- 世界流程 ----

  async function newWorld(seed: string, w: number, h: number) {
    const g = makeGame();
    ui.showProgress('正在生成世界…', 0.05);
    await g.newWorld(seed || String(Date.now()), w, h, (label, p) => ui.showProgress(label, p));
  }

  /** 把选中角色的外观应用到玩家（进游戏后调用） */
  function applyAppearance(g: Game) {
    if (selectedAppearance) g.player.appearance = selectedAppearance;
  }

  async function quickLoad() {
    if (!quickSaveExists) { ui.toast('没有可用的快速存档'); return; }
    const text = await kvGet(QUICK_SAVE_KEY);
    if (!text) return;
    await loadFromJson(text);
  }

  async function loadFromJson(text: string) {
    try {
      const { world, player } = loadSave(text);
      const g = makeGame();
      ui.showProgress('读取存档…', 0.3);
      await g.loadWorld(world, (label, p) => ui.showProgress(label, 0.3 + p * 0.6));
      g.player.hp = player.hp;
      g.player.x = player.x;
      g.player.y = player.y;
      g.player.inv.slots = player.inventory.concat(Array(Math.max(0, INV_SIZE - player.inventory.length)).fill(null));
      g.player.inv.selected = player.selected;
    } catch (e) {
      console.error(e);
      ui.hideProgress();
      alert('存档读取失败：' + (e as Error).message);
    }
  }

  async function importWld(buf: Uint8Array) {
    ui.showProgress('正在解析 .wld 地图…', 0.1);
    try {
      const { save, report } = parseWldToSave(buf);
      (window as unknown as { __lastCompatReport?: unknown }).__lastCompatReport = report;
      ui.showProgress('正在转换世界…', 0.7);
      const g = makeGame();
      const { world } = loadSave(JSON.stringify(save));
      await g.loadWorld(world, (label, p) => ui.showProgress(label, 0.7 + p * 0.3));
      g.player.inv.add(ITEM_BY_KEY['copper_pickaxe'], 1);
      g.player.inv.add(ITEM_BY_KEY['copper_axe'], 1);
      g.player.inv.add(ITEM_BY_KEY['copper_sword'], 1);
      g.player.inv.add(ITEM_BY_KEY['torch'], 20);
      ui.toast(`成功导入「${save.header.name}」(v${save.header.wldVersion})`);
      // 兼容报告：有降级/跳过内容时弹窗
      const rpt = (window as unknown as { __lastCompatReport?: import('./ui/UI').CompatReport }).__lastCompatReport;
      if (rpt && (rpt.tilesDegraded.length || rpt.tilesCleared.length || rpt.itemsSkipped.length)) {
        ui.showCompatReport(rpt);
      }
    } catch (e) {
      console.error(e);
      ui.hideProgress();
      alert('.wld 导入失败：' + (e as Error).message);
    }
  }

  // ---- 菜单 ----

  /** 帧回调注入 VUI 自愈循环（VUI.startLoop 持有 rAF，HMR 杀不死） */
  VUI.frameHook = (dt) => {
    menuBg?.tick(dt);
  };

  function stopMenu() {
    menuBg?.destroy();
    menuBg = null;
    legacyShim?.remove();
    legacyShim = null;
    // 进游戏前清空 VUI（游戏内 UI 走 DOM，生成页仍用 VUI）
    VUI.setState(null);
    VUI.clear();
  }

  /** 角色列表（DOM）。切页前清 VUI 防穿透 */
  function showCharacterSelect() {
    VUI.setState(null);
    VUI.clear();
    titleMenu?.destroy();
    titleMenu = null;
    new CharSelectPanel(root, charStore, {
      onPlay: (a) => {
        selectedAppearance = a;
        showWorldSelect();
      },
      onNew: () => {
        new CharCreation(root, {
          onCreate: async (a) => {
            await charStore.create(a);
            showCharacterSelect();
          },
          onCancel: () => showCharacterSelect(),
        });
      },
      onBack: () => showTitle(),
    });
  }

  /** 世界列表（DOM） */
  function showWorldSelect() {
    VUI.setState(null);
    VUI.clear();
    new WorldSelectPanel(root, worldStore, {
      onPlay: (meta) => void loadWorldFlow(meta),
      onNew: () => {
        // 世界创建页（DOM）
        VUI.setState(null);
        VUI.clear();
        new WorldCreationPanel(root, {
          onCreate: (cfg) => void createWorldFlow(cfg),
          onCancel: () => showWorldSelect(),
        });
      },
      onBack: () => showCharacterSelect(),
    });
  }

  /** 从世界槽位读取并进入游戏 */
  async function loadWorldFlow(meta: WorldMeta) {
    const text = await worldStore.load(meta);
    if (!text) { ui.toast('世界数据缺失或损坏'); return; }
    currentWorld = meta;
    await loadFromJson(text);
  }

  /** 创建新世界：原版生成页（双进度条+实时地图预览）→ 注册槽位 → 进游戏 */
  async function createWorldFlow(cfg: { name: string; seed: string; w: number; h: number; difficulty: number; evil: -1 | 0 | 1 }) {
    const loadState = new UIWorldLoadState(cfg.evil);
    VUI.setState(loadState);
    const g = makeGame();
    await g.newWorld(cfg.seed || String(Date.now()), cfg.w, cfg.h,
      (label, p) => loadState.setProgress(label, p),
      {
        name: cfg.name,
        evil: cfg.evil,
        onWorldPartial: (world) => loadState.attachWorld(world),
      });
    // onWorldReady 已进游戏；登记世界槽位并保存初始数据
    const meta = await worldStore.register({
      name: cfg.name, seed: cfg.seed, w: cfg.w, h: cfg.h,
      difficulty: cfg.difficulty, evil: cfg.evil,
    });
    currentWorld = meta;
    doSave();
  }

  /** 设置面板（主菜单含数据栏；游戏内不显示数据栏） */
  function openSettings(inGame: boolean) {
    new SettingsPanel(root, {
      ...(inGame ? {} : {
        onQuickLoad: () => void quickLoad(),
        onLoadFile: () => {
          fileInput.onchange = () => {
            const f = fileInput.files?.[0];
            if (f) void f.text().then(loadFromJson);
            fileInput.value = '';
          };
          fileInput.click();
        },
        onImportWld: () => {
          wldInput.onchange = () => {
            const f = wldInput.files?.[0];
            if (f) void f.arrayBuffer().then((ab) => importWld(new Uint8Array(ab)));
            wldInput.value = '';
          };
          wldInput.click();
        },
      }),
      onBack: () => { /* 面板自毁 */ },
    });
  }

  function showTitle() {
    audio.play('title');
    ui.closeAll();
    if (!menuBg) menuBg = new MenuBackground(root);
    titleMenu?.destroy();
    titleMenu = new TitleMenu(root, {
      onSinglePlayer: () => showCharacterSelect(),
      onSettings: () => openSettings(false),
      onQuit: () => ui.toast('网页版暂不支持退出，直接关闭标签页即可'),
      onCredits: () => ui.toast('SandboxWorld · 泰拉瑞亚 UI 复刻'),
    });
    installLegacyShim();
  }

  /** 旧 puppeteer 脚本兼容垫片：select(尺寸)+button(创建) 隐藏 DOM（M7 移除）。
   *  挂 root 末尾（在天空画布之上）；标题页按钮在屏幕中央不与垫片（左上角）重叠，
   *  querySelector('button') 仍命中垫片——旧探针脚本零修改。 */
  function installLegacyShim() {
    if (legacyShim) return;
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;left:0;top:0;width:2px;height:2px;opacity:0.01;z-index:1;';
    const sel = document.createElement('select');
    sel.innerHTML = '<option value="4200x1200">小</option><option value="6400x1800" selected>中</option><option value="8400x2400">大</option>';
    const btn = document.createElement('button');
    btn.textContent = '创建新世界';
    btn.addEventListener('click', () => {
      const [w, h] = (sel.value || '6400x1800').split('x').map(Number);
      void newWorld('', w, h);
    });
    div.append(sel, btn);
    root.appendChild(div);
    legacyShim = div;
  }

  function quitToMenu() {
    game?.destroy();
    game = null;
    currentWorld = null;
    ui.closeAll();
    showTitle();
  }

  function doSave() {
    if (!game) return;
    const json = saveGame(game.world, game.player, Date.now() - playStart);
    const mb = json.length / 1024 / 1024;
    void kvSetCompat(json).then((where) => {
      if (where === 'fail') ui.toast('保存失败：存储不可用');
      else ui.toast(`已保存（${where === 'idb' ? mb.toFixed(1) + ' MB → IndexedDB' : '本地'}）`);
    });
    // 多世界槽位（M3）：登记到 WorldStore
    if (currentWorld) {
      void worldStore.save(currentWorld, json, Date.now() - playStart);
    }
  }

  // KvStore 延迟引入避免顶层副作用顺序问题
  async function kvSetCompat(json: string): Promise<string> {
    const { kvSet } = await import('./save/KvStore');
    return kvSet(QUICK_SAVE_KEY, json);
  }

  // 快速存档存在性预查
  void kvHas(QUICK_SAVE_KEY).then((v) => { quickSaveExists = v; });

  // 调试桥（puppeteer 脚本用）
  (window as unknown as { __swFlow?: unknown }).__swFlow = {
    newWorld: (seed: string, w: number, h: number) => newWorld(seed, w, h),
    quickLoad,
    importWld,
    quitToMenu,
    backToTitle: showTitle,
    devMode: () => devMode,
  };

  return {
    showTitle,
    newWorld,
    quickLoad,
    importWld,
    quitToMenu,
    doSave,
    openSettings,
    get game() { return game; },
    playStart: 0,
    get playStartNow() { return Date.now() - playStart; },
  } as FlowHandle & { playStartNow: number };
}
