// 菜单/游戏流程编排（VUI 版）：主菜单 → 世界生成/读取 → 进游戏 → 退出回菜单。
// main.ts 只做启动装配；本模块持有 Game 生命周期与 VUI/背景的 rAF 驱动。
import { Game } from './core/Game';
import { UI } from './ui/UI';
import { AudioSystem } from './core/Audio';
import type { SpriteAtlas } from './assets/SpriteAtlas';
import { loadSave, loadSaveData } from './save/SaveFile';
import { saveClient } from './workers/SaveClient';
import { kvGet, kvHas } from './save/KvStore';
import { ITEM_BY_KEY } from './data/items';
import { parseWldToSave } from './wld/WldImport';
import { Inventory } from './items/Inventory';
import { VUI } from './vui/VUI';
import { TitleMenu } from './ui/TitleMenu';
import { MultiplayerSelect } from './ui/MultiplayerSelect';
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
import { Lang } from './i18n/Lang';
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
  (window as unknown as { __swAudio?: AudioSystem }).__swAudio = audio; // 探针调试桥
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
    // 物品图标后台预取(主菜单不载图标=省 6059 请求;进世界补齐,游戏内显示不变)
    atlas?.prefetchIcons();
    stopMenu();
    titleMenu?.destroy();
    titleMenu = null;
    ui.game = g;
    ui.initInGame(); // DOM 版游戏内 UI（道具栏/背包/合成/宝箱/Buff）——用户指定 web 技术路线
    g.start();
    audio.play('main');
    ui.toast(Lang.text('Mods.SandboxWorld.Toast.Welcome', g.world.name));
  }

  function maybeDev(g: Game) {
    if (!devMode) return;
    g.setupDevMode();
    g.world.explored.fill(1);
    g.world.exploredDirty = null; // 全图变化无脏信息 → 渲染端整幅重建
    g.world.exploredVersion++;
  }

  function makeGame(): Game {
    const g = new Game(root, {
      onWorldReady: () => { ui.hideProgress(); enterGame(g); maybeDev(g); applyAppearance(g); },
      onInventoryChanged: () => ui.refreshAll(),
      onBuffsChanged: () => ui.refreshBuffs(),
      onToast: (m) => ui.toast(m),
      // 原版 Main.NewText 消息列(Main.cs:64095 → LegacyChatMonitor)
      onChat: (t, r, g, b) => ui.chatMessage(t, r, g, b),
      // NPC 对话系统(SetTalkNPC + GetChat)
      onNpcDialog: (name, chat, buttons) => ui.showNpcDialog(name, chat, buttons),
      onNpcDialogClose: () => ui.closeNpcDialog(),
      onNpcShop: (title, items, copper) => ui.showNpcShop(title, items, copper),
      onReadSign: (text) => ui.showSign(text),
      onDayNight: (isDay) => audio.setDayNight(isDay),
      onMusic: (id) => audio.playMusic(id),
    }, atlas);
    return g;
  }

  // ---- 世界流程 ----

  async function newWorld(seed: string, w: number, h: number) {
    const g = makeGame();
    ui.showProgress(Lang.text('Mods.SandboxWorld.Progress.GeneratingWorld'), 0.05);
    await g.newWorld(seed || String(Date.now()), w, h, (label, p) => ui.showProgress(label, p));
  }

  /** 把选中角色的外观应用到玩家（进游戏后调用） */
  function applyAppearance(g: Game) {
    if (selectedAppearance) g.player.appearance = selectedAppearance;
  }

  async function quickLoad() {
    if (!quickSaveExists) { ui.toast(Lang.text('Mods.SandboxWorld.Toast.NoQuickSave')); return; }
    await loadFromKey(QUICK_SAVE_KEY);
  }

  /** 玩家状态回填（worker/主线程两路共用） */
  function applyPlayer(g: Game, player: ReturnType<typeof loadSaveData>['player']) {
    g.player.hp = player.hp;
    g.player.x = player.x;
    g.player.y = player.y;
    // 上限扩容进度（水晶之心/生命果/魔力水晶；旧档缺省 100/20/20）
    if (player.baseMaxHp !== undefined) g.player.baseMaxHp = player.baseMaxHp;
    if (player.baseMaxMana !== undefined) g.player.baseMaxMana = player.baseMaxMana;
    if (player.mana !== undefined) g.player.mana = player.mana;
    // 背包布局迁移（旧 54 槽自创布局 → 原版 58 槽+armor[20]；Inventory.migrateLegacy 判别）
    const mig = Inventory.migrateLegacy(player.inventory);
    g.player.inv.slots = mig.slots;
    if (player.armor) g.player.inv.armor = player.armor.map((it) => it ? { ...it } : null);
    if (player.dye) g.player.inv.dye = player.dye.map((it) => it ? { ...it } : null);
    if (player.trash) g.player.inv.trash = { ...player.trash };
    g.player.inv.selected = player.selected;
    // 玩家储物×4 回填（29/97/463/491；旧档缺省全空）
    if (player.banks) {
      for (let b = 0; b < 4; b++) {
        const src = player.banks[b] ?? [];
        g.player.banks[b] = src.concat(Array(Math.max(0, 40 - src.length)).fill(null)).slice(0, 40);
      }
    }
    // ★ 读档回填后必须刷 UI：HUD 快捷栏在 makeGame 时以空背包画过一次，
    //   此前不刷新 → 存档道具要等用户点工具栏/开背包才显示
    g.cb.onInventoryChanged();
  }

  /** 按 IDB key 读档：主路径 worker 内直读 IDB（免大 JSON 字符串结构化克隆到
   *  worker 的主线程序列化开销——大存档实测秒级 100% CPU）；worker 不可用时
   *  才在主线程 kvGet 走 fallback */
  async function loadFromKey(key: string) {
    try {
      // worker 路径：IDB 读取 + JSON 解析 + RLE 解码 + load 模式沉降全在后台
      const { WorldGenClient } = await import('./workers/WorldGenClient');
      const client = new WorldGenClient();
      if (await client.probe()) {
        try {
          const { world, player } = await client.loadSave({ key }, {
            onProgress: (phase, p) => ui.showProgress(phase === 'settle' ? Lang.text('Mods.SandboxWorld.Progress.SettleLiquids') : Lang.text('Mods.SandboxWorld.Progress.LoadingSave'), p),
          });
          const g = makeGame();
          await g.loadWorld(world, (label, p) => ui.showProgress(label, 0.8 + p * 0.2), { settled: true });
          applyPlayer(g, player as ReturnType<typeof loadSaveData>['player']);
          return;
        } catch (e) {
          if (!(e instanceof (await import('./workers/WorldGenClient')).WorldGenUnavailable)) throw e;
          // worker 失败 → 主线程 fallback
        }
      }
      const text = await kvGet(key);
      if (!text) { ui.toast(Lang.text('Mods.SandboxWorld.Toast.SaveLoadFailed', '存档数据缺失')); return; }
      await loadFromJson(text);
    } catch (e) {
      console.error(e);
      ui.hideProgress();
      alert(Lang.text('Mods.SandboxWorld.Toast.SaveLoadFailed', (e as Error).message));
    }
  }

  async function loadFromJson(text: string) {
    try {
      // worker 路径：JSON 解析 + RLE 解码 + load 模式沉降全在后台（json 源传入）
      const { WorldGenClient } = await import('./workers/WorldGenClient');
      const client = new WorldGenClient();
      if (await client.probe()) {
        try {
          const { world, player } = await client.loadSave({ json: text }, {
            onProgress: (phase, p) => ui.showProgress(phase === 'settle' ? Lang.text('Mods.SandboxWorld.Progress.SettleLiquids') : Lang.text('Mods.SandboxWorld.Progress.LoadingSave'), p),
          });
          const g = makeGame();
          await g.loadWorld(world, (label, p) => ui.showProgress(label, 0.8 + p * 0.2), { settled: true });
          applyPlayer(g, player as ReturnType<typeof loadSaveData>['player']);
          return;
        } catch (e) {
          if (!(e instanceof (await import('./workers/WorldGenClient')).WorldGenUnavailable)) throw e;
          // worker 失败 → 主线程 fallback
        }
      }
      const { world, player } = loadSave(text);
      const g = makeGame();
      ui.showProgress(Lang.text('Mods.SandboxWorld.Progress.LoadingSave'), 0.3);
      await g.loadWorld(world, (label, p) => ui.showProgress(label, 0.3 + p * 0.6));
      applyPlayer(g, player);
    } catch (e) {
      console.error(e);
      ui.hideProgress();
      alert(Lang.text('Mods.SandboxWorld.Toast.SaveLoadFailed', (e as Error).message));
    }
  }

  async function importWld(buf: Uint8Array) {
    ui.showProgress(Lang.text('Mods.SandboxWorld.Progress.ParsingWld'), 0.1);
    try {
      const { save, report, seedText, gameMode } = parseWldToSave(buf);
      (window as unknown as { __lastCompatReport?: unknown }).__lastCompatReport = report;
      ui.showProgress(Lang.text('Mods.SandboxWorld.Progress.ConvertingWld'), 0.7);
      const g = makeGame();
      // 直接消费内存 SaveData(2026-08 审计 #3:此前的 stringify→parse 双拷贝
      // 每次导入多出 2×20~50MB 峰值,且让 5 份全图副本并存更久)
      const { world } = loadSaveData(save);
      await g.loadWorld(world, (label, p) => ui.showProgress(label, 0.7 + p * 0.3));
      g.player.inv.add(ITEM_BY_KEY['copper_pickaxe'], 1);
      g.player.inv.add(ITEM_BY_KEY['copper_axe'], 1);
      g.player.inv.add(ITEM_BY_KEY['copper_sword'], 1);
      g.player.inv.add(ITEM_BY_KEY['torch'], 20);
      ui.toast(Lang.text('Mods.SandboxWorld.Toast.WldImported', save.header.name ?? '', save.header.wldVersion ?? 0));
      // 登记世界槽位并持久化：导入不再是一次性的，重进游戏可在世界列表中看到并继续游玩
      await worldStore.ensureLoaded();
      const names = new Set(worldStore.list().map((m) => m.name));
      let name = save.header.name;
      if (names.has(name)) {
        let i = 2;
        while (names.has(`${name} (${i})`)) i++;
        name = `${name} (${i})`;
      }
      currentWorld = await worldStore.register({
        name, seed: seedText || String(save.header.seed),
        w: save.header.width, h: save.header.height,
        difficulty: gameMode, evil: save.header.crimson ? 1 : 0,
      });
      doSave();
      // 兼容报告：有降级/跳过内容时弹窗
      const rpt = (window as unknown as { __lastCompatReport?: import('./ui/UI').CompatReport }).__lastCompatReport;
      if (rpt && (rpt.tilesDegraded.length || rpt.tilesCleared.length || rpt.itemsSkipped.length)) {
        ui.showCompatReport(rpt);
      }
    } catch (e) {
      console.error(e);
      ui.hideProgress();
      alert(Lang.text('Mods.SandboxWorld.Toast.WldImportFailed', (e as Error).message));
    }
  }

  // ---- 菜单 ----

  /** 帧回调注入 VUI 自愈循环（VUI.startLoop 持有 rAF，HMR 杀不死） */
  VUI.frameHook = (dt) => {
    menuBg?.tick(dt);
    if (menuBg) menuBg.lastDt = dt;
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

  /** 加入房间（探针桥 + UI 共用语义）：url = ws://host:port/<房间码>[?token=] */
  async function joinRoom(url: string, hostToken = ''): Promise<void> {
    await makeGame().joinNetGame(url, () => {}, hostToken);
  }

  /** 探针桥：当前世界序列化后向中央服务器建房（返回 {code, hostToken}） */
  async function createRoom(addr: string, opts: { name?: string; public?: boolean; protectTiles?: boolean; protectItems?: boolean } = {}): Promise<{ code: string; hostToken: string; error?: string }> {
    try {
      if (!game) return { error: 'no game', code: '', hostToken: '' };
      const { saveGame } = await import('./save/SaveFile');
      await worldStore.ensureLoaded();
      if (!currentWorld) {
        currentWorld = await worldStore.register({
          name: game.world.name, seed: String(game.world.seed), w: game.world.w, h: game.world.h,
          difficulty: 0, evil: game.world.crimson ? 1 : 0,
        });
      }
      const json = saveGame(game.world, game.player, Date.now() - playStart, game.townNpcsForSave());
      await worldStore.save(currentWorld, json, Date.now() - playStart);
      const lobbyPort = addr.includes(':') ? parseInt(addr.split(':')[1], 10) : 7778;
      const host = addr.includes(':') ? addr.split(':')[0] : addr;
      const r = await fetch(`http://${host}:${lobbyPort}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: opts.name ?? game.world.name,
          public: opts.public ?? true,
          protectTiles: !!opts.protectTiles,
          protectItems: !!opts.protectItems,
          save: json,
        }),
      });
      const data = await r.json() as { ok: boolean; code?: string; hostToken?: string; error?: string };
      if (!data.ok || !data.code || !data.hostToken) return { error: data.error ?? 'bad response', code: '', hostToken: '' };
      return { code: data.code, hostToken: data.hostToken };
    } catch (e) {
      return { error: String((e as Error).message ?? e), code: '', hostToken: '' };
    }
  }

  function showMultiplayerSelect() {
    ui.closeAll();
    titleMenu?.destroy();
    titleMenu = null;
    let panelRoot: HTMLElement | null = null;
    const closePanel = () => { panelRoot?.remove(); panelRoot = null; };
    const panel = new MultiplayerSelect({
      // v3 房间制：onJoinRoom(url, hostToken)——url 含 /<房间码>[?token=]
      onJoinRoom: (url, hostToken) => {
        closePanel();
        ui.showProgress(Lang.text('Mods.SandboxWorld.Progress.Connecting'), 0.1);
        makeGame().joinNetGame(url, (label, p) => {
          ui.showProgress(label, 0.1 + p * 0.8);
        }, hostToken).then(() => {
          // loadWorld 内部已 onWorldReady（enterGame 由 makeGame 回调完成）
        }, (e) => {
          ui.hideProgress();
          ui.toast(`联机失败：${(e as Error).message}`);
          showTitle();
        });
      },
      onBack: () => { closePanel(); showTitle(); },
      listSaves: async () => {
        // 列出世界槽位并读出存档 JSON（IndexedDB → 上传给中央服务器建房）
        await worldStore.ensureLoaded();
        return Promise.all(worldStore.list().map(async (m) => ({
          id: m.id,
          name: m.name,
          json: await worldStore.load(m),
        })));
      },
    });
    panelRoot = panel.root;
    root.appendChild(panelRoot);
  }

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

  /** 从世界槽位读取并进入游戏（worker 内直读 IDB：免大 JSON 字符串主线程读取
   *  + 结构化克隆双开销；fallback 时 worldStore.load 取回全文走 loadFromJson） */
  async function loadWorldFlow(meta: WorldMeta) {
    currentWorld = meta;
    await loadFromKey(`sandboxworld.world.${meta.id}`);
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
        onWorldPartial: (world) => loadState.attachWorld(world), // 主线程 fallback：列扫描预览
        onPreview: (f) => loadState.attachPreview(f),            // worker 路径：位图预览
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
    if (!menuBg) {
      menuBg = new MenuBackground(root);
      (window as unknown as { __swMenuBg?: MenuBackground }).__swMenuBg = menuBg; // 调试句柄
    }
    titleMenu?.destroy();
    titleMenu = new TitleMenu(root, {
      onSinglePlayer: () => showCharacterSelect(),
      onSettings: () => openSettings(false),
      onQuit: () => ui.toast(Lang.text('Mods.SandboxWorld.Toast.QuitUnsupported')),
      onCredits: () => ui.toast(Lang.text('Mods.SandboxWorld.CreditsLine')),
      onMultiplayer: () => showMultiplayerSelect(),
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
    // 存档序列化走后台 worker(RLE+base64+JSON 全套离主线程;主线程只付一次
    // 全图数组结构化克隆的 memcpy),不可用时 SaveClient 内部回退同步 saveGame
    saveClient.ensure();
    void saveClient.save(game.world, game.player, Date.now() - playStart, game.townNpcsForSave()).then((json) => {
      const mb = json.length / 1024 / 1024;
      void kvSetCompat(json).then((where) => {
        if (where === 'fail') ui.toast(Lang.text('Mods.SandboxWorld.Toast.SaveFailedStorage'));
        else {
          quickSaveExists = true; // 同会话存档后 quickLoad 立即可用（此前闭包标志只在建流时查一次）
          ui.toast(Lang.text('Mods.SandboxWorld.Toast.Saved', where === 'idb' ? mb.toFixed(1) + ' MB → IndexedDB' : Lang.text('Mods.SandboxWorld.Save.Local')));
        }
      }).catch((e) => {
        console.error('kvSet failed', e);
        ui.toast(Lang.text('Mods.SandboxWorld.Toast.SaveFailedStorage'));
      });
      // 多世界槽位（M3）：登记到 WorldStore
      if (currentWorld) {
        void worldStore.save(currentWorld, json, Date.now() - playStart).catch((e) => console.error('worldStore.save failed', e));
      }
    }).catch((e) => {
      // 回退同步 saveGame 也失败(异常世界状态)——如实报告,不留 unhandled rejection
      console.error('save failed', e);
      ui.toast(Lang.text('Mods.SandboxWorld.Toast.SaveFailedStorage'));
    });
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
    doSave,
    backToTitle: showTitle,
    devMode: () => devMode,
    joinGame: (ip: string) => joinRoom(ip.includes(':') ? `ws://${ip}` : `ws://${ip}:7777`), // 旧桥（直连 URL）
    joinRoom: (url: string, token: string) => joinRoom(url, token), // 探针桥：房间制加入
    createRoom: (addr: string, opts: Record<string, unknown>) => createRoom(addr, opts as never), // 探针桥：建房
    loadJson: (text: string) => loadFromJson(text), // 读自有 json 存档（探针）
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
