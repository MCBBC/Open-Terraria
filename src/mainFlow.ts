// 菜单/游戏流程编排（VUI 版）：主菜单 → 世界生成/读取 → 进游戏 → 退出回菜单。
// main.ts 只做启动装配；本模块持有 Game 生命周期与 VUI/背景的 rAF 驱动。
import { Game } from './core/Game';
import { UI } from './ui/UI';
import { MobileControls, isTouchDevice, tryFullscreenLandscape } from './ui/MobileControls';
import { AudioSystem } from './core/Audio';
import type { SpriteAtlas } from './assets/SpriteAtlas';
import { loadSave, loadSaveData } from './save/SaveFile';
import { saveClient } from './workers/SaveClient';
import { TILE_BY_KEY, TILE_DEFS } from './data/tiles';
import { setupLiquidLab as liquidLab } from '../scripts/liquidlab';
import { kvGet, kvHas } from './save/KvStore';
import { ITEM_BY_KEY } from './data/items';
import { VI_KEY } from './data/itemKeys';
import { parseWldToSave } from './wld/WldImport';
import { Inventory } from './items/Inventory';
import { VUI } from './vui/VUI';
import { warmAllAssets } from './net/AssetCache';
import { gateAssetsOrRun, mountAssetBadge } from './ui/AssetDownloadUI';
import { TitleMenu } from './ui/TitleMenu';
import { MultiplayerSelect } from './ui/MultiplayerSelect';
import { SettingsPanel } from './ui/Settings';
import { BestiaryPanel } from './ui/BestiaryPanel';
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
import { ITEM_DEFS } from './data/items';

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
  /** 导出存档为文件(自有 JSON 格式,与 __swFlow.loadJson 闭环) */
  doExportSave(): void;
  openSettings(inGame: boolean): void;
  openBestiary(): void;
  /** 住房面板（背包房屋按钮 B 方案,2026-08-15） */
  openHousing?(): void;
  game: Game | null;
  playStart: number;
}

export function createFlow(root: HTMLElement, atlas: SpriteAtlas | null, ui: UI, audio: AudioSystem): FlowHandle {
  let game: Game | null = null;
  let mobile: MobileControls | null = null;
  // GOING_OLDSCHOOL B1 收口：菜单级成就句柄（标题屏日月拖拽首访即达——
  // 曾只挂 Game.achOnWorldEnter，直载标题屏拿不到句柄）
  {
    const w = window as unknown as { __swAchievements?: unknown };
    if (!w.__swAchievements) {
      import('./core/Achievements').then(({ Achievements }) => {
        (window as unknown as { __swAchievements?: unknown }).__swAchievements
          = new Achievements(typeof localStorage !== 'undefined'
            ? { load: () => localStorage.getItem('sbw.achievements.v1'), save: (x: string) => localStorage.setItem('sbw.achievements.v1', x) }
            : null);
      });
    }
  }
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
    UISfx.sfx.ambient = d.ambientVol;   // Ambient 环境音轨（Main.ambientVolume）
    UIScale.userScale = d.uiScale;
    devMode = d.devMode;
  });
  let quickSaveExists = false;
  let selectedAppearance: Appearance | null = null;
  /** 当前角色槽位 id（硬核消亡时回写 CharacterStore 用；直载存档/无角色时为 null） */
  let selectedCharId: number | null = null;
  let currentWorld: WorldMeta | null = null;
  const charStore = new CharacterStore();
  const worldStore = new WorldStore();

  // 隐藏文件输入（DOM 能力，VUI 按钮触发）
  // E2E/控制台调试:直接加载存档 JSON 文本(菜单阶段可用,绕过设置面板 file input)
  (window as unknown as { __swLoadJson?: (t: string) => Promise<void> }).__swLoadJson = (t: string) => loadFromJson(t);
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
    // 指针图标门桥(DrawInterface_40 :44476 MouseDisplayItem 非空 → 图层隐藏;
    // DrawInterface_38 :44628 拖拽物出现 → 住房光标取消)
    g.uiHeldStack = () => !!ui.heldStack;
    (window as unknown as { __swGame: Game }).__swGame = g;
    (window as unknown as { __swUI: UI }).__swUI = ui; // 探针/控制台直调(成就弹窗预览等)
    (window as unknown as { __swITEMS?: typeof ITEM_DEFS }).__swITEMS = ITEM_DEFS; // 信息饰品探针:vi_ key → 内部 id
    // 移动端：虚拟控件层（触屏设备启用；桌面零渲染零影响）——在世界触摸的
    // 用户手势内尝试全屏+横屏锁定（ⓞ 进世界点击即手势；失败静默，⛶ 按钮兜底）
    if (isTouchDevice()) {
      mobile?.destroy();
      mobile = new MobileControls(g, ui.root);
      void tryFullscreenLandscape();
    }
    // HMR 双实例检测（F5 调试报告 instance 段）：每次挂载计数 +1，>1 即模块分叉
    (window as unknown as { __swInstanceCount?: number }).__swInstanceCount =
      ((window as unknown as { __swInstanceCount?: number }).__swInstanceCount ?? 0) + 1;
    // E2E/控制台调试:tile key → 内部 id 反查(测试脚本放置图块用)
    (window as unknown as { __swTileByKey?: (k: string) => number }).__swTileByKey = (k: string) =>
      (TILE_BY_KEY as Record<string, number>)[k] ?? -1;
    // E2E 调试:内部 id → def 关键字段(注册表漂移排查)
    (window as unknown as { __swTileDefById?: (id: number) => unknown }).__swTileDefById = (id: number) => {
      const d = (TILE_DEFS as Array<{ key: string; vanilla?: { sheet: number; frame: string; fw?: number; fh?: number } }>)[id];
      return d ? { key: d.key, sheet: d.vanilla?.sheet, frame: d.vanilla?.frame, fw: d.vanilla?.fw, fh: d.vanilla?.fh } : null;
    };
    // E2E/控制台调试:直接加载存档 JSON 文本(绕过设置面板的 file input)
    // (挂模块级而非 enterGame:菜单阶段测试脚本就要用)
    // 液体浸润实验台:?liquidlab 参数 / window.__swLiquidLab() 控制台命令
    (window as unknown as { __swLiquidLab?: () => void }).__swLiquidLab = () => {
      liquidLab(g);
    };
    if (new URLSearchParams(location.search).has('liquidlab')) {
      setTimeout(() => (window as unknown as { __swLiquidLab?: () => void }).__swLiquidLab?.(), 1500);
    }
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
      onInventoryChanged: () => { g.prefetchInvProjectiles(); ui.refreshAll(); },
      onBuffsChanged: () => ui.refreshBuffs(),
      onToast: (m) => ui.toast(m),
      onAchievementPopup: (name, title) => ui.achievementPopup(name, title),
      onHousingCursor: (m) => {
        // Game 单发完成/取消 → 面板同步（m=null 自毁）
        const p = (window as unknown as { __swHousingPanel?: { cursorChanged: (m: unknown) => void } | undefined }).__swHousingPanel;
        p?.cursorChanged(m);
      },
      // 原版 Main.NewText 消息列(Main.cs:64095 → LegacyChatMonitor)；
      // width = NewTextMultiline WidthLimit（广播盒 460px 折行，-1 不限）
      onChat: (t, r, g, b, width) => ui.chatMessage(t, r, g, b, width),
      // 观战启动关全 UI（IngameUIWindows.CloseAll :43017）
      onCloseAllUI: () => ui.closeAll(),
      // NPC 对话系统(SetTalkNPC + GetChat)
      onNpcDialog: (name, chat, buttons, portrait) => ui.showNpcDialog(name, chat, buttons, portrait),
      onNpcDialogClose: () => ui.closeNpcDialog(),
      onReforgeOpen: () => ui.showReforge(),
      onNpcShop: (title, items, copper, happinessMul) => ui.showNpcShop(title, items, copper, happinessMul),
      // NPC 快乐度详情浮层（ReportHappiness.Interact）
      onNpcHappiness: (info) => ui.showNpcHappiness(info),
      onReadSign: (text) => ui.showSign(text),
      onEditSign: (x, y, text) => ui.editSign(x, y, text),
      onDayNight: (isDay) => audio.setDayNight(isDay),
      onMusic: (id) => audio.playMusic(id),
      // 硬核角色死亡消亡（Player.cs:38255 HardcoreDeathPenalty）：标记回写角色存档，
      // 重进角色列表即灰显禁入（原版 KillMeForGood :38173+ 直接删 .plr 档）
      onHardcoreDeath: async (appearance) => {
        selectedAppearance = appearance;
        if (selectedCharId != null) await charStore.update(selectedCharId, appearance);
      },
      // 梳妆台更衣窗（Main.OpenClothesWindow Main.cs:43568）：确认后回写角色档 +
      // 在线外观（原版外观随 .plr 档，CancelClothesWindow 取消则回退六色快照）
      onClothesWindow: (appearance) => {
        ui.showClothesWindow(appearance, async (a) => {
          selectedAppearance = a;
          g.player.appearance = a;
          if (typeof a.team === 'number') g.player.team = a.team;
          g.net?.resendAppearance();
          if (selectedCharId != null) await charStore.update(selectedCharId, a);
          ui.toast(Lang.text('Mods.SandboxWorld.ClothesWindow.Changed'));
        });
      },
    }, atlas);
    // 纸娃娃贴图预载按当前角色外观收窄(545 张全量 → ~30 张);外观本体在
    // onWorldReady 的 applyAppearance 才落位,预载期间读这里
    g.preloadAppearance = selectedAppearance;
    return g;
  }

  // ---- 世界流程 ----

  async function newWorld(seed: string, w: number, h: number) {
    const g = makeGame();
    ui.showProgress(Lang.text('Mods.SandboxWorld.Progress.GeneratingWorld'), 0.05);
    await g.newWorld(seed || String(Date.now()), w, h, (label, p) => ui.showProgress(Lang.worldgenText(label), p));
  }

  /** 把选中角色的外观应用到玩家（进游戏后调用）。联机时补发 SyncPlayer——
   *  初始两发（PlayerSlot/PlayerSpawn 时刻）都在外观应用前，远端只见默认皮肤 */
  function applyAppearance(g: Game) {
    if (selectedAppearance) {
      g.player.appearance = selectedAppearance;
      if (typeof selectedAppearance.team === 'number') g.player.team = selectedAppearance.team;
      g.net?.resendAppearance();
    }
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
    // 永久升级族（旧档缺省全 false）
    const pu = player.permanentUpgrades;
    if (pu) {
      if (pu.extraAccessory !== undefined) g.player.inv.extraAccessory = pu.extraAccessory;
      if (pu.usedAegisCrystal !== undefined) g.player.usedAegisCrystal = pu.usedAegisCrystal;
      if (pu.usedAegisFruit !== undefined) g.player.usedAegisFruit = pu.usedAegisFruit;
      if (pu.usedArcaneCrystal !== undefined) g.player.usedArcaneCrystal = pu.usedArcaneCrystal;
      if (pu.usedGummyWorm !== undefined) g.player.usedGummyWorm = pu.usedGummyWorm;
      if (pu.usedAmbrosia !== undefined) g.player.usedAmbrosia = pu.usedAmbrosia;
    }
    if (player.baseMaxHp !== undefined) g.player.baseMaxHp = player.baseMaxHp;
    if (player.baseMaxMana !== undefined) g.player.baseMaxMana = player.baseMaxMana;
    if (player.mana !== undefined) g.player.mana = player.mana;
    // 背包布局迁移（旧 54 槽自创布局 → 原版 58 槽+armor[20]；Inventory.migrateLegacy 判别）
    const mig = Inventory.migrateLegacy(player.inventory);
    g.player.inv.slots = mig.slots;
    if (player.armor) g.player.inv.armor = player.armor.map((it) => it ? { ...it } : null);
    if (player.dye) g.player.inv.dye = player.dye.map((it) => it ? { ...it } : null);
    if (player.trash) g.player.inv.trash = { ...player.trash };
    // 杂项装备/染料 + 三套 Loadout 回填（旧档缺省全空）
    if (player.miscEquips) g.player.inv.miscEquips = player.miscEquips.map((it) => it ? { ...it } : null);
    if (player.miscDyes) g.player.inv.miscDyes = player.miscDyes.map((it) => it ? { ...it } : null);
    if (player.loadouts) {
      for (let k = 0; k < 3; k++) {
        const src = player.loadouts[k];
        if (!src) continue;
        g.player.inv.loadouts[k] = {
          armor: src.armor.map((it) => it ? { ...it } : null),
          dye: src.dye.map((it) => it ? { ...it } : null),
        };
      }
    }
    if (player.currentLoadout !== undefined) g.player.inv.currentLoadout = player.currentLoadout;
    g.player.inv.selected = player.selected;
    // 玩家储物×4 回填（29/97/463/491；旧档缺省全空）
    if (player.banks) {
      for (let b = 0; b < 4; b++) {
        const src = player.banks[b] ?? [];
        g.player.banks[b] = src.concat(Array(Math.max(0, 40 - src.length)).fill(null)).slice(0, 40);
      }
    }
    // Buff 槽（PL:53913-53925;Main.buffNoSave 已在序列化侧过滤）
    g.player.buffs.applySaved(player.buffs);
    if (player.taxMoney !== undefined) g.player.taxMoney = player.taxMoney;   // PL:53839
    if (player.golferScoreAccumulated) g.player.golferScoreAccumulated = player.golferScoreAccumulated; // PL:1792
    if (player.deathsPve !== undefined) g.player.deathsPve = player.deathsPve; // PL:53840
    if (player.anglerQuestsFinished !== undefined) g.player.anglerQuestsFinished = player.anglerQuestsFinished; // PL:1790
    // 旅程力量·玩家侧（IPersistentPerPlayerContent）已在 loadSaveData 内合并进
    // world.journeyPowers（SaveFile.ts 统一路径），此处无需重复回填
    if (Array.isArray(player.hideInfo)) g.player.hideInfo = player.hideInfo; // PL:776 hideInfo[13]
    if (player.hairDye !== undefined) g.player.hairDye = player.hairDye;   // PL:53805-53808 发色剂 byte（旧档缺省 0）
    // ★ 读档回填后必须刷 UI：HUD 快捷栏在 makeGame 时以空背包画过一次，
    //   此前不刷新 → 存档道具要等用户点工具栏/开背包才显示
    g.cb.onInventoryChanged();
  }

  /** 旧档无 header.difficulty（本次修复前创建的专家/大师世界）→ 以槽位
   *  WorldMeta.difficulty 回填 world.difficulty；新档以 header 为权威跳过 */
  let difficultyFallback: number | null = null;
  /** 原版 loadWorld 进度文案(WorldFile.cs):tiles=gen[51] "正在加载世界数据: X%"
   *  按列(:2514-2518);settle=gen[27] "正在安置液体 X%" 收敛比例 50-100%(:762);
   *  其余阶段保持自定义 LoadingSave */
  function loadProgressLabel(phase: string, rawP: number): string {
    const p = Number.isFinite(rawP) ? rawP : 0;   // NaN 防御(worker 瞬断/旧缓存事件)
    if (phase === 'tiles') {
      return Lang.text('LegacyWorldGen.51') + ' ' + Math.min(100, Math.floor(p * 100) + 1) + '%';
    }
    if (phase === 'settle') {
      return Lang.text('LegacyWorldGen.27') + ' ' + Math.min(100, Math.floor(50 + p * 50)) + '%';
    }
    return Lang.text('Mods.SandboxWorld.Progress.LoadingSave');
  }

  function applyDifficultyFallback(world: import('./world/World').World, save?: { header?: { difficulty?: number } }) {
    if (difficultyFallback == null || save?.header?.difficulty !== undefined) return;
    world.difficulty = difficultyFallback;
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
          // ★与创建世界同款 VUI 加载页(原版风 UIWorldLoadState;用户报"读档 UI 还是旧的")
          const loadState = new UIWorldLoadState();
          VUI.setState(loadState);
          const { world, player, save } = await client.loadSave({ key }, {
            onProgress: (phase, p) => loadState.setProgress(loadProgressLabel(phase, p), p),
          });
          const g = makeGame();
          applyDifficultyFallback(world, save as { header?: { difficulty?: number } } | undefined);
          await g.loadWorld(world, (label, p) => loadState.setProgress(label, 0.8 + p * 0.2), { settled: true, playerAt: { x: (player as { x?: number }).x ?? world.spawnX * 16, y: (player as { y?: number }).y ?? world.spawnY * 16 } });
          applyPlayer(g, player as ReturnType<typeof loadSaveData>['player']);
          g.eventsApplySave((save as { events?: never } | undefined)?.events as never);
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
      VUI.setState(null);   // 加载页退场(失败回菜单)
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
          const loadState = new UIWorldLoadState();
          VUI.setState(loadState);
          const { world, player, save } = await client.loadSave({ json: text }, {
            onProgress: (phase, p) => loadState.setProgress(loadProgressLabel(phase, p), p),
          });
          const g = makeGame();
          applyDifficultyFallback(world, save as { header?: { difficulty?: number } } | undefined);
          await g.loadWorld(world, (label, p) => loadState.setProgress(label, 0.8 + p * 0.2), { settled: true, playerAt: { x: (player as { x?: number }).x ?? world.spawnX * 16, y: (player as { y?: number }).y ?? world.spawnY * 16 } });
          applyPlayer(g, player as ReturnType<typeof loadSaveData>['player']);
          g.eventsApplySave((save as { events?: never } | undefined)?.events as never);
          return;
        } catch (e) {
          if (!(e instanceof (await import('./workers/WorldGenClient')).WorldGenUnavailable)) throw e;
          // worker 失败 → 主线程 fallback
        }
      }
      const { world, player, data } = loadSave(text);
      applyDifficultyFallback(world, data);
      const g = makeGame();
      const loadState = new UIWorldLoadState();
      VUI.setState(loadState);
      loadState.setProgress(Lang.text('Mods.SandboxWorld.Progress.LoadingSave'), 0.3);
      await g.loadWorld(world, (label, p) => loadState.setProgress(label, 0.3 + p * 0.6));
      applyPlayer(g, player);
      g.eventsApplySave(data.events);
    } catch (e) {
      console.error(e);
      ui.hideProgress();
      VUI.setState(null);   // 加载页退场(失败回菜单)
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
      g.player.inv.add(ITEM_BY_KEY[VI_KEY.STARTER.PICK], 1);
      g.player.inv.add(ITEM_BY_KEY[VI_KEY.STARTER.AXE], 1);
      g.player.inv.add(ITEM_BY_KEY[VI_KEY.STARTER.SHORTSWORD], 1);
      g.player.inv.add(ITEM_BY_KEY[VI_KEY.TORCH], 20);
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

  /** 探针桥：当前世界序列化后向中央服务器建房（返回 {code, hostToken}）。
   *  v8 rules 透传（serverAuth=true = 服务器权威房,世界由 SimHost 计算,建房者亦为访客） */
  async function createRoom(addr: string, opts: { name?: string; public?: boolean; protectTiles?: boolean; protectItems?: boolean; maxPlayers?: number; rules?: Partial<import('./net/protocol').RoomRules> } = {}): Promise<{ code: string; hostToken: string; gmToken?: string; error?: string }> {
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
      const json = saveGame(game.world, game.player, Date.now() - playStart, game.townNpcsForSave(), game.eventsForSave());
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
          maxPlayers: opts.maxPlayers,
          rules: opts.rules,
          save: json,
        }),
      });
      const data = await r.json() as { ok: boolean; code?: string; hostToken?: string; gmToken?: string; error?: string };
      if (!data.ok || !data.code || !data.hostToken) return { error: data.error ?? 'bad response', code: '', hostToken: '' };
      return { code: data.code, hostToken: data.hostToken, gmToken: data.gmToken };
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
        const g = makeGame();
        // 连接前应用选中角色：Hello 的玩家名（加入公告"X已加入。"）需要早于世界数据。
        // ★g.player 要到 loadWorld（世界数据到达）才创建——曾在此直接 g.player.appearance=
        // 踩 undefined 崩溃（生产构建加入房间即卡死）。预置联机名供 Hello 兜底,
        // 外观本体由 onWorldReady 的 applyAppearance 落位（含 resendAppearance 补发）
        if (selectedAppearance) {
          (g as unknown as { pendingJoinName?: string }).pendingJoinName
            = (selectedAppearance as { name?: string }).name;
        }
        g.joinNetGame(url, (label, p) => {
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
      // 角色选择（需求："可以选择一个角色加入房间"）——选中后 applyAppearance 补发外观
      listCharacters: async () => {
        await charStore.ensureLoaded();
        return charStore.list().map((c) => ({ id: c.id, name: c.name }));
      },
      onPickCharacter: async (id: number) => {
        selectedAppearance = await charStore.get(id);
        selectedCharId = id;
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
      onPlay: (a, id) => {
        selectedAppearance = a;
        selectedCharId = id ?? null;
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
    // 旧档（无 header.difficulty）以槽位 meta 回填世界难度；finally 清防泄漏到
    // 后续 quickLoad/文件导入路径（那些场景 fallback=null 不生效）
    difficultyFallback = meta.difficulty;
    try {
      await loadFromKey(`sandboxworld.world.${meta.id}`);
    } finally {
      difficultyFallback = null;
    }
  }

  /** 创建新世界：原版生成页（双进度条+实时地图预览）→ 注册槽位 → 进游戏 */
  async function createWorldFlow(cfg: { name: string; seed: string; w: number; h: number; size: number; difficulty: number; evil: -1 | 0 | 1 }) {
    const loadState = new UIWorldLoadState(cfg.evil);
    VUI.setState(loadState);
    const g = makeGame();
    await g.newWorld(cfg.seed || String(Date.now()), cfg.w, cfg.h,
      (label, p) => loadState.setProgress(label, p),
      {
        name: cfg.name,
        evil: cfg.evil,
        size: cfg.size as import('./world/World').WorldSize, // 尺寸档 0/1/2（generateWorld 按 SIZE_DIMS 派生 W/H）
        difficulty: cfg.difficulty,   // 世界难度 = Main.GameMode（Main.cs:2677；创建 UI 四档）
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
    // 已开守卫(2026-08-13 泄露 review):无守卫时暂停菜单里重复点"设置"
    // 叠面板,每层多 1 个 window Esc + 1 个 Lang 订阅
    if (document.querySelector('.sw-set-panel')) return;
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

  /** 图鉴面板（UIBestiaryTest 1:1 结构：网格分页/筛选排序/条目卡/完成度条）。
   *  打开期间暂停世界并阻断输入；Esc/E 关闭后恢复先前的暂停/阻断态
   *  （从暂停菜单进入时其面板仍叠在下层，关闭即回暂停菜单）。 */
  function openBestiary() {
    if (document.querySelector('.sw-bst')) return;  // 已开守卫(2026-08-13 泄露 review:叠层累积 Esc 捕获)
    const g = game;
    if (!g) return;
    const wasPaused = g.paused;
    const wasBlocking = g.input.uiBlocking;
    g.paused = true;
    g.input.uiBlocking = true;
    new BestiaryPanel(root, {
      getTracker: () => g.world.bestiary,
      atlas,
      isCrimson: () => g.world.crimson,
      onBack: () => {
        if (!wasPaused) g.paused = false;
        if (!wasBlocking) g.input.uiBlocking = false;
      },
    });
  }

  /** 住房面板（原版背包房屋界面 B 方案）：不暂停世界（要点击世界分配/查询）；
   *  光标态双向同步（面板选择 → game.housingMode;Game 单发完成 → onHousingCursor
   *  → 面板自毁）。Esc/再点按钮 = 取消光标并关面板。 */
  async function openHousing() {
    const g = game;
    if (!g) return;
    document.querySelector('.sw-housing-panel')?.remove();
    const { HousingPanel } = await import('./ui/HousingPanel');
    const panel = new HousingPanel(g,
      (m) => { g.housingMode = m; },
      () => { /* onClosed: 仅自毁 */ });
    panel.canvas.classList.add('sw-housing-panel');
    (window as unknown as { __swHousingPanel?: unknown }).__swHousingPanel = panel;
  }

  function showTitle() {
    audio.play('title');
    ui.closeAll();
    // SW 资产预载(仅生产构建):进菜单即按优先级全量后台下载 + 挂右下角进度徽标
    // (warmAll 幂等,SW 侧 keys() 过滤已下载;被系统清理只补缺=自愈)
    warmAllAssets();
    mountAssetBadge();
    if (!menuBg) {
      menuBg = new MenuBackground(root);
      (window as unknown as { __swMenuBg?: MenuBackground }).__swMenuBg = menuBg; // 调试句柄
    }
    titleMenu?.destroy();
    titleMenu = new TitleMenu(root, {
      onSinglePlayer: () => gateAssetsOrRun(() => showCharacterSelect()),
      onSettings: () => openSettings(false),
      onQuit: () => ui.toast(Lang.text('Mods.SandboxWorld.Toast.QuitUnsupported')),
      onCredits: () => ui.toast(Lang.text('Mods.SandboxWorld.CreditsLine')),
      onMultiplayer: () => showMultiplayerSelect(),
      // GOING_OLDSCHOOL B2：日月拖拽 → 菜单时钟跟手（Main.cs:62434-62446 反算 t01）
      onSunMoonGrab: (info) => menuBg?.setClockT(info.time01),
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
    mobile?.destroy();
    mobile = null;
    game?.destroy();
    game = null;
    // 外部持有者同步摘引用(2026-08-13 泄露 review):__swGame 不清=旧 Game(整个
    // 世界 store 数十 MB typed array)被 window 挂到下次进游戏才释放;ui.game
    // 由 closeAll→detachGame 摘
    (window as unknown as { __swGame?: Game | null }).__swGame = null;
    currentWorld = null;
    ui.closeAll();
    showTitle();
  }

  function doSave() {
    if (!game) return;
    // 存档序列化走后台 worker(RLE+base64+JSON 全套离主线程;主线程只付一次
    // 全图数组结构化克隆的 memcpy),不可用时 SaveClient 内部回退同步 saveGame
    saveClient.ensure();
    void saveClient.save(game.world, game.player, Date.now() - playStart, game.townNpcsForSave(), game.eventsForSave()).then((json) => {
      const mb = json.length / 1024 / 1024;
      void kvSetCompat(json).then((where) => {
        if (where === 'fail') ui.toast(Lang.text('Mods.SandboxWorld.Toast.SaveFailedStorage'));
        else {
          quickSaveExists = true; // 同会话存档后 quickLoad 立即可用（此前闭包标志只在建流时查一次）
          // ui.toast(Lang.text('Mods.SandboxWorld.Toast.Saved', where === 'idb' ? mb.toFixed(1) + ' MB → IndexedDB' : Lang.text('Mods.SandboxWorld.Save.Local')));
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

  /** 导出存档:同一序列化链(saveClient),产物落盘为 .sbw.json 下载——
   *  与 __swFlow.loadJson / 世界槽位导入互为闭环,便于备份与跨机迁移 */
  function doExportSave() {
    if (!game) return;
    saveClient.ensure();
    void saveClient.save(game.world, game.player, Date.now() - playStart, game.townNpcsForSave(), game.eventsForSave()).then((json) => {
      const name = (game!.world.name ?? 'world').replace(/\s+/g, '_');
      const d = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const filename = `${name}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.sbw.json`;
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      ui.toast(Lang.text('Mods.SandboxWorld.Toast.Exported', filename));
    }).catch((e) => {
      console.error('export save failed', e);
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
    doExportSave,
    backToTitle: showTitle,
    devMode: () => devMode,
    joinGame: (ip: string) => joinRoom(ip.includes(':') ? `ws://${ip}` : `ws://${ip}:7777`), // 旧桥（直连 URL）
    joinRoom: (url: string, token: string) => joinRoom(url, token), // 探针桥：房间制加入
    createRoom: (addr: string, opts: Record<string, unknown>) => createRoom(addr, opts as never), // 探针桥：建房
    loadJson: (text: string) => loadFromJson(text), // 读自有 json 存档（探针）
    itemByKey: (key: string) => ITEM_BY_KEY[key] ?? -1, // 探针桥：物品 id（生产构建也可用——页内 import('/src/...') 仅 dev 可达）
    spawnVanillaEnemy: async (id: number, x: number, y: number) => {
      const { Enemy } = await import('./entities/Enemy');
      if (!game) return null;
      const e = Enemy.fromVanilla(id, x, y);
      if (!e) return null;
      game.entities.add(e, 'enemies');
      return { id: e.id, x: e.x, y: e.y, hp: e.hp };
    },
    /** 探针桥：敌对弹幕（原版 Projectile.hostile）——v5 msg27 bit7 链路 + 访客 Damage_EVP 本地结算的 E2E 验证。
     *  grav 默认 0（直飞激光语义；Arrow 类默认 0.3 抛物线会让探针弹坠离目标） */
    spawnHostileProj: async (x: number, y: number, vx: number, vy: number, dmg: number, projId = 9, grav = 0) => {
      const { Arrow } = await import('./entities/Arrow');
      if (!game) return null;
      const p = new Arrow(x, y, vx, vy, dmg, 0, projId, null, { hostile: true, grav });
      game.entities.add(p, 'projectiles');
      return { id: p.id };
    },
  };

  return {
    showTitle,
    newWorld,
    quickLoad,
    importWld,
    quitToMenu,
    doSave,
    doExportSave,
    openSettings,
    openBestiary,
    openHousing,
    get game() { return game; },
    playStart: 0,
    get playStartNow() { return Date.now() - playStart; },
  } as FlowHandle & { playStartNow: number };
}
