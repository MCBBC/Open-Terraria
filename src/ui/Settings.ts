// 设置面板（DOM，M6）：分栏 声音/界面/游戏/数据 + 返回。
// 主菜单与游戏内（暂停菜单）共用；数据栏仅主菜单显示。
// 文案全部走 Lang（M8 语言系统）：原版键（LegacyMenu.*）+ 自有键（Mods.SandboxWorld.*）。
// 语言切换：网格按钮（原版语义=用当前语言显示所有语言名，Language.* 类别），
// 点击后 Lang.setLanguage → 本面板经 Lang.onChange 重建（保留当前分栏）。
import { options, cycleMinimapFrame } from '../core/Options';
import {
  KEYBIND_ACTIONS, bindsOf, assignBinding, resetBinding, resetAllKeybinds,
  keybindActionLabel, keybindCodeLabel, type KeybindAction,
} from '../core/Keybinds';
import { TEAM_COLORS } from '../stats/Pvp';
import { UIScale } from '../vui/draw/UIScale';
import { UISfx } from '../vui/UISfx';
import { Lang } from '../i18n/Lang';
// M13 资源包页（UIResourcePackSelectionMenu/InfoMenu 复刻）
import { buildResourcePackPage, RESOURCE_PACK_PAGE_CSS } from './ResourcePackPage';

export interface SettingsFlow {
  /** 主菜单专属：继续存档 / 读档 / 导入 .wld / 开发者模式 */
  onQuickLoad?(): void;
  onLoadFile?(): void;
  onImportWld?(): void;
  onBack(): void;
}

const CSS = `
.sw-set-panel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 560px; max-width: 96vw; z-index: 25; cursor: auto;
  background: linear-gradient(160deg, #2b3664, #1c2444);
  border: 2px solid #7d92d6; border-radius: 6px; padding: 14px 16px; color: #e8e8f4;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 40px rgba(0,0,0,.6);
}
.sw-set-title { text-align: center; font-size: 18px; color: #ffe8a0; margin-bottom: 10px;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-set-body { display: flex; gap: 12px; min-height: 260px; }
.sw-set-cats { display: flex; flex-direction: column; gap: 6px; width: 96px; }
.sw-set-cats div {
  padding: 8px 10px; background: #232c52; border: 1px solid #3a4680;
  border-radius: 4px; cursor: pointer; text-align: center;
}
.sw-set-cats div.active { background: #5a6ac0; color: #fff; outline: 1px solid #ffd76e; }
.sw-set-content { flex: 1; background: #1a2140; border: 1px solid #3a4680;
  border-radius: 4px; padding: 12px; display: flex; flex-direction: column; gap: 12px;
  overflow-y: auto; max-height: 60vh; }
.sw-set-row { display: flex; align-items: center; gap: 10px; }
.sw-set-row > span:first-child { width: 88px; color: #c8d0f0; }
.sw-set-row input[type=range] { flex: 1; accent-color: #7d92d6; }
.sw-set-row .val { width: 40px; text-align: right; color: #ffe8a0; }
.sw-set-row input[type=checkbox] { width: 18px; height: 18px; accent-color: #7d92d6; }
.sw-set-btns { display: flex; flex-direction: column; gap: 8px; }
.sw-set-btns button, .sw-set-back {
  background: #3a4680; color: #e8e8f4; border: 1px solid #7d92d6; border-radius: 4px;
  padding: 8px 12px; cursor: pointer; font-family: inherit; text-align: left;
}
.sw-set-btns button:hover, .sw-set-back:hover { background: #4a5aa0; }
.sw-set-footer { display: flex; justify-content: flex-end; margin-top: 12px; }
.sw-set-back { padding: 6px 22px; }
/* 语言选择网格（M8,视觉对齐 sw-wc-opts 互斥选项模式） */
.sw-set-lang-title { color: #ffe8a0; font-size: 14px; }
.sw-set-lang-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.sw-set-lang-grid button {
  background: #232c52; color: #e8e8f4; border: 1px solid #3a4680; border-radius: 4px;
  padding: 7px 10px; cursor: pointer; font-family: inherit; text-align: left;
}
.sw-set-lang-grid button:hover { background: #4a5aa0; }
.sw-set-lang-grid button.active { outline: 1px solid #ffd76e; background: #5a6ac0; }
.sw-set-hint { color:#8a90b8; font-size:12px; }
/* 键位行（M5）：action 名列宽 + 键按钮等宽 + 监听/未绑定态 */
.sw-set-row.sw-kb-row > span:first-child { width: 118px; }
.sw-kb-btn { min-width: 118px; text-align: center; flex: 1; }
.sw-kb-reset { padding: 4px 10px; flex: none; }
.sw-kb-unbound { color: #8a90b8; }
.sw-kb-listening { color: #ffe8a0; outline: 1px solid #ffd76e; }
`;

export class SettingsPanel {
  private panel: HTMLElement;
  private content: HTMLElement;
  private cat = 'sound';
  private unsubLang: (() => void) | null = null;

  constructor(parent: HTMLElement, private flow: SettingsFlow) {
    if (!document.getElementById('sw-set-style')) {
      const style = document.createElement('style');
      style.id = 'sw-set-style';
      style.textContent = CSS + RESOURCE_PACK_PAGE_CSS;
      document.head.appendChild(style);
    }
    this.panel = document.createElement('div');
    this.panel.className = 'sw-set-panel';
    this.panel.innerHTML = `
      <div class="sw-set-title">${Lang.text('LegacyMenu.14')}</div>
      <div class="sw-set-body">
        <div class="sw-set-cats"></div>
        <div class="sw-set-content"></div>
      </div>
      <div class="sw-set-footer"><button class="sw-set-back">${Lang.text('LegacyMenu.6')}</button></div>
    `;
    this.content = this.panel.querySelector('.sw-set-content')!;
    this.buildCats();
    this.panel.querySelector('.sw-set-back')!.addEventListener('click', () => this.close(flow.onBack));
    this.escHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') this.close(flow.onBack);
    };
    window.addEventListener('keydown', this.escHandler);
    // 语言切换 → 整面板重建(标题/分栏/内容全部重取文案;保留当前分栏)
    this.unsubLang = Lang.onChange(() => this.rebuild());
    parent.appendChild(this.panel);
    this.build();
    UISfx.click();
  }

  private catLabel(cat: string): string {
    switch (cat) {
      case 'sound': return Lang.text('LegacyMenu.65'); // 音量
      case 'ui': return Lang.text('Mods.SandboxWorld.Settings.Interface');
      case 'game': return Lang.text('Mods.SandboxWorld.Settings.Gameplay');
      case 'controls': return Lang.menu(222);          // 按键绑定（UIManageControls）
      case 'packs': return Lang.text('UI.ResourcePacks'); // 资源包（原版同键）
      case 'data': return Lang.text('Mods.SandboxWorld.Settings.Data');
      default: return cat;
    }
  }

  private buildCats() {
    const cats = document.createElement('div');
    cats.className = 'sw-set-cats';
    const list = ['sound', 'ui', 'game', 'controls', 'packs', ...(this.flow.onQuickLoad ? ['data'] : [])];
    for (const c of list) {
      const div = document.createElement('div');
      div.dataset.cat = c;
      div.textContent = this.catLabel(c);
      div.addEventListener('click', () => { this.cat = c; this.build(); });
      cats.appendChild(div);
    }
    this.panel.querySelector('.sw-set-cats')!.replaceWith(cats);
  }

  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  private close(fn: () => void) {
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler);
    this.cancelRebindListen();
    this.unsubLang?.();
    this.panel.remove();
    fn();
  }

  private slider(label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void) {
    const row = document.createElement('div');
    row.className = 'sw-set-row';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min); input.max = String(max); input.step = String(step);
    input.value = String(get());
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = String(Math.round(get() * 100));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      set(v);
      val.textContent = String(Math.round(v * 100));
    });
    row.append(span, input, val);
    return row;
  }

  private toggle(label: string, get: () => boolean, set: (v: boolean) => void) {
    const row = document.createElement('label');
    row.className = 'sw-set-row';
    const span = document.createElement('span');
    span.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = get();
    input.addEventListener('change', () => set(input.checked));
    row.append(span, input);
    return row;
  }

  /** 双态枚举行（点击在两态间切换；智能光标 Toggle/Hold 模式用） */
  private modeRow(label: string, _get: () => string, value: () => string, cycle: () => void) {
    const row = document.createElement('div');
    row.className = 'sw-set-row';
    const span = document.createElement('span');
    span.textContent = label;
    const btn = document.createElement('button');
    btn.className = 'sw-set-back';
    btn.style.padding = '4px 14px';
    btn.textContent = value();
    btn.addEventListener('click', () => { cycle(); btn.textContent = value(); });
    row.append(span, btn);
    return row;
  }

  /** 键位行（UIKeybindingListItem：action 名 + 当前键；点击进入监听，↺ 单项回默认） */
  private keybindRow(action: KeybindAction): HTMLElement {
    const row = document.createElement('div');
    row.className = 'sw-set-row sw-kb-row';
    const span = document.createElement('span');
    span.textContent = keybindActionLabel(action);
    const btn = document.createElement('button');
    btn.className = 'sw-set-back sw-kb-btn';
    const render = (): void => {
      const codes = bindsOf(action);
      btn.textContent = codes.length ? codes.map(keybindCodeLabel).join('/') : Lang.menu(195);
      btn.classList.toggle('sw-kb-unbound', codes.length === 0);
      btn.classList.toggle('sw-kb-listening', false);
    };
    btn.addEventListener('click', () => this.listenRebind(action, btn, render));
    const reset = document.createElement('button');
    reset.className = 'sw-set-back sw-kb-reset';
    reset.textContent = '↺';
    reset.addEventListener('click', () => {
      void options.set('keybinds', resetBinding(options.data.keybinds, action));
      render();
    });
    render();
    row.append(span, btn, reset);
    return row;
  }

  /** 监听下一键（PlayerInput.ListenFor + CheckRebindingProcessKeyboard :1495-1513：
   *  键已在列表→移除（反选解绑）；否则整表替换为该键。Esc 取消。
   *  capture 阶段拦截：面板 escHandler/main.ts 键盘链全不让位（含 F1-F12 防浏览器快捷） */
  private rebindListener: ((e: KeyboardEvent) => void) | null = null;
  private listenRebind(action: KeybindAction, btn: HTMLElement, refresh: () => void): void {
    this.cancelRebindListen();
    btn.textContent = Lang.text('Mods.SandboxWorld.Settings.ListeningKey');
    btn.classList.add('sw-kb-listening');
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;                       // 系统重发不算新键
      this.cancelRebindListen();
      if (e.code === 'Escape') { refresh(); return; }   // 取消
      void options.set('keybinds', assignBinding(options.data.keybinds, action, e.code));
      UISfx.click();                              // 原版绑定成功 SoundID 12 menuTick
      refresh();
    };
    this.rebindListener = onKey;
    window.addEventListener('keydown', onKey, true);
  }

  private cancelRebindListen(): void {
    if (this.rebindListener) {
      window.removeEventListener('keydown', this.rebindListener, true);
      this.rebindListener = null;
    }
  }

  /** 语言选择网格:显示名取各语言包自带的 Language.* 键(原版语义) */
  private langGrid() {
    const wrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'sw-set-lang-title';
    title.textContent = Lang.text('LegacyMenu.102'); // 选择语言
    const grid = document.createElement('div');
    grid.className = 'sw-set-lang-grid';
    const current = options.data.lang;
    for (const c of Lang.cultures) {
      const b = document.createElement('button');
      const name = Lang.text(c.displayNameKey);
      b.textContent = Lang.has(c.displayNameKey) ? name : c.name;
      if (c.name === current) b.classList.add('active');
      b.addEventListener('click', async () => {
        if (c.name === options.data.lang) return;
        const prev = options.data.lang;
        b.disabled = true;
        // 先写内存值:Lang.setLanguage 的 emit 会触发 rebuild 重建本网格,
        // 高亮读 options.data.lang——后写会拿到旧值,激活态留在上一语言
        options.data.lang = c.name;
        const ok = await Lang.setLanguage(c.name);
        b.disabled = false;
        if (ok) {
          await options.set('lang', c.name); // 持久化(值已同步,仅落盘)
        } else {
          options.data.lang = prev; // 失败回滚
          this.rebuild();
        }
      });
      b.dataset.lang = c.name;
      grid.appendChild(b);
    }
    wrap.append(title, grid);
    const hint = document.createElement('div');
    hint.className = 'sw-set-hint';
    hint.textContent = Lang.text('Mods.SandboxWorld.Settings.FontHint');
    wrap.append(hint);
    return wrap;
  }

  private build() {
    this.panel.querySelectorAll('.sw-set-cats div').forEach((el) => {
      (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.cat === this.cat);
    });
    this.content.innerHTML = '';
    const d = options.data;
    if (this.cat === 'sound') {
      this.content.append(
        this.slider(Lang.text('LegacyMenu.99'), 0, 1, 0.05, () => d.musicVol, (v) => { d.musicVol = v; this.applySound(); void options.set('musicVol', v); }),
        this.slider(Lang.text('LegacyMenu.98'), 0, 1, 0.05, () => d.sfxVol, (v) => { d.sfxVol = v; this.applySound(); void options.set('sfxVol', v); }),
        // Ambient 环境音轨（Main.ambientVolume，config 键 VolumeAmbient；雷声/滴水/
        // 瀑布岩浆流/小动物鸣叫/暴风雪循环等 13+ 环境音独立音量，LegacySoundPlayer.cs:1443）
        // 标签 = LegacyMenu.119（Main.cs:50914 音量三杆同族 98/99/119,原版 12 语言官译;
        // 旧自造 Mods.SandboxWorld.Settings.AmbientVol 仅 zh/en 两译,他语言落英文兜底）
        this.slider(Lang.text('LegacyMenu.119'), 0, 1, 0.05, () => d.ambientVol, (v) => { d.ambientVol = v; this.applySound(); void options.set('ambientVol', v); }),
      );
    } else if (this.cat === 'ui') {
      this.content.append(
        this.slider(Lang.text('Mods.SandboxWorld.Settings.UiScale'), 0.75, 1.5, 0.05, () => d.uiScale, (v) => void options.set('uiScale', v).then(() => this.applyUi())),
        // 资源条样式（原版 PlayerResourcesDisplaySet 两主样式：'New'=FancyClassic
        // 金框分格（1.4.4+ 默认）/ 'Default'=Classic 朴素心星）。样式名 = 原版键
        // UI.HealthManaStyle_*（Main.cs:49379 同源;旧硬编码中文 12 语言不可译）
        this.modeRow(
          Lang.text('UI.SelectHealthStyle').replace(/:.*/, ''),
          () => d.resourceBarStyle,
          () => Lang.text(d.resourceBarStyle === 'fancy' ? 'UI.HealthManaStyle_New' : 'UI.HealthManaStyle_Default'),
          () => void options.set('resourceBarStyle', d.resourceBarStyle === 'fancy' ? 'classic' : 'fancy'),
        ),
        // 小地图边框皮肤（MinimapFrameManager 9 款；config.json "MinimapFrame" 字符串键；
        // 循环方向 = SelectionHolder.CycleSelection 倒序回绕，cycleMinimapFrame 纯函数）
        this.modeRow(
          Lang.text('UI.SelectMapBorder').replace(/:.*/, ''),
          () => d.minimapFrame,
          () => Lang.text(`UI.MinimapFrame_${d.minimapFrame}`),
          () => { void options.set('minimapFrame', cycleMinimapFrame(d.minimapFrame)); },
        ),
        this.langGrid(),
        // ---- M14 杂项（界面组；IngameOptions.cs:705/846/823）----
        // 拾取提示（:705 Main.showItemText 默认 true；PopupText 拾取飘名链已接）
        this.modeRow(
          Lang.menu(71).replace(/[:：].*$/, ''),
          () => String(d.showItemText),
          () => Lang.menu(d.showItemText ? 71 : 72),
          () => void options.set('showItemText', !d.showItemText),
        ),
        // 悬停文本框（:846 Main.SettingsEnabled_OpaqueBoxBehindTooltips 默认 true；
        // 关=tooltip 无底板纯文字，已接 .sw-tooltip-nobox）
        this.modeRow(
          Lang.text('GameUI.HoverTextBoxesOn').replace(/[:：].*$/, ''),
          () => String(d.opaqueBoxBehindTooltips),
          () => Lang.text(d.opaqueBoxBehindTooltips ? 'GameUI.HoverTextBoxesOn' : 'GameUI.HoverTextBoxesOff'),
          () => void options.set('opaqueBoxBehindTooltips', !d.opaqueBoxBehindTooltips),
        ),
        // 对话头像（:823 Main.DialoguePortraitPreference；CycleNPCPortraitMode :39724
        // 序 Detailed→CloseUp→FullBodyRetro→Disabled。Disabled 已接；中间两态贴图
        // 变体未导入暂渲染 Detailed 形）
        this.modeRow(
          Lang.text('UI.PortraitsDetailed').replace(/[:：].*$/, ''),
          () => d.dialoguePortraitMode,
          () => Lang.text(`UI.Portraits_${d.dialoguePortraitMode === 'detailed' ? 'Detailed'
            : d.dialoguePortraitMode === 'closeUp' ? 'CloseUp'
              : d.dialoguePortraitMode === 'fullBodyRetro' ? 'FullBodyRetro' : 'Disabled'}`),
          () => void options.set('dialoguePortraitMode',
            d.dialoguePortraitMode === 'detailed' ? 'closeUp'
              : d.dialoguePortraitMode === 'closeUp' ? 'fullBodyRetro'
                : d.dialoguePortraitMode === 'fullBodyRetro' ? 'disabled' : 'detailed'),
        ),
      );
      const hint = document.createElement('div');
      hint.className = 'sw-set-hint';
      hint.textContent = Lang.text('Mods.SandboxWorld.Settings.UiScaleHint');
      this.content.append(hint);
    } else if (this.cat === 'game') {
      this.content.append(
        this.toggle(Lang.text('Mods.SandboxWorld.Settings.DevMode'), () => d.devMode, (v) => void options.set('devMode', v)),
        // 背景 开/关（Main.BackgroundEnabled Main.cs:790，原版视频设置项 Lang.menu[100/101]；
        // 天气阴天渐变 cloudBGAlpha 的门，Game.updateWeather 注入 WeatherCtx.backgroundEnabled）
        this.toggle(Lang.menu(100).replace(/[:：].*$/, ''), () => d.backgrounds, (v) => void options.set('backgrounds', v)),
        // 图块在风中摆动（原版视频设置 SettingsEnabled_TilesSwayInWind；WindSway 系统总门）。
        // 原版行文案 = UI.TilesSwayInWindOn/Off 融合串（IngameOptions.cs:1055），
        // 取 On 支去冒号做标签（同背景开关的 Lang.menu(100) 处理法）
        this.toggle(Lang.text('UI.TilesSwayInWindOn').replace(/[:：].*$/, ''), () => d.swayInWind, (v) => void options.set('swayInWind', v)),
        // 水波质量四档（Main.WaveQuality，IngameOptions.cs:1040-1055：`(q+1)%4` 循环，
        // 文案 = 原版 GameUI.WaveQuality 融合串 + GameUI.QualityOff/Low/Medium/High 官译）
        this.modeRow(
          Lang.text('GameUI.WaveQuality').replace(/[:：].*$/, ''),
          () => String(d.waveQuality),
          () => Lang.text(d.waveQuality === 0 ? 'GameUI.QualityOff'
            : d.waveQuality === 1 ? 'GameUI.QualityLow'
              : d.waveQuality === 2 ? 'GameUI.QualityMedium' : 'GameUI.QualityHigh'),
          () => void options.set('waveQuality', (d.waveQuality + 1) % 4),
        ),
        // 渲染帧率上限(2026-08-18 原版对齐:原版锁 60fps;60/120/不锁 三档循环。
        // 逻辑 tick 恒 60Hz 不变——仅 gate 渲染,高分屏省一半渲染/GPU 负载)
        this.modeRow(
          Lang.text('Mods.SandboxWorld.Settings.FrameCap'),
          () => String(d.frameCap),
          () => d.frameCap === 0 ? Lang.text('Mods.SandboxWorld.Settings.FrameCapOff')
            : d.frameCap === 120 ? '120 FPS' : '60 FPS',
          () => void options.set('frameCap', d.frameCap === 60 ? 120 : d.frameCap === 120 ? 0 : 60),
        ),
        // 渲染模式三档(2026-08-18):GPU 加速(默认)/CPU 软渲染(零 GPU 预算,
        // 多开稳定)/自动(GPU 优先,崩溃自动切 CPU,稳定回切)
        this.modeRow(
          Lang.text('Mods.SandboxWorld.Settings.RenderMode'),
          () => d.renderMode,
          () => d.renderMode === 'gpu' ? Lang.text('Mods.SandboxWorld.Settings.RenderModeGpu')
            : d.renderMode === 'cpu' ? Lang.text('Mods.SandboxWorld.Settings.RenderModeCpu')
            : Lang.text('Mods.SandboxWorld.Settings.RenderModeAuto'),
          () => void options.set('renderMode', d.renderMode === 'gpu' ? 'cpu' : d.renderMode === 'cpu' ? 'auto' : 'gpu'),
        ),
        // 帧模式三态(原版 FrameSkipMode,Main.cs:16950-16975):温和=超前帧节流
        // (高刷屏绘制压回逻辑帧率;慢机永不触发——原版"落后跳帧"是死代码 num3=0)
        this.modeRow(
          Lang.text('Mods.SandboxWorld.Settings.FrameSkip'),
          () => d.frameSkipMode,
          () => d.frameSkipMode === 'off' ? Lang.text('Mods.SandboxWorld.Settings.FrameSkipOff')
            : d.frameSkipMode === 'subtle' ? Lang.text('Mods.SandboxWorld.Settings.FrameSkipSubtle')
            : Lang.text('Mods.SandboxWorld.Settings.FrameSkipOn'),
          () => void options.set('frameSkipMode', d.frameSkipMode === 'off' ? 'subtle' : d.frameSkipMode === 'subtle' ? 'on' : 'off'),
        ),
        // 智能光标（原版 IngameOptions :1418 Smart Cursor 段）：模式 Toggle/Hold + 三开关
        this.modeRow(
          Lang.text('Mods.SandboxWorld.Settings.SmartCursorMode'),
          () => d.smartCursorMode,
          () => Lang.text(d.smartCursorMode === 'toggle'
            ? 'Mods.SandboxWorld.Settings.SmartCursorToggle'
            : 'Mods.SandboxWorld.Settings.SmartCursorHold'),
          () => void options.set('smartCursorMode', d.smartCursorMode === 'toggle' ? 'hold' : 'toggle'),
        ),
        this.toggle(Lang.text('Mods.SandboxWorld.Settings.SmartAxeAfterPickaxe'), () => d.smartAxeAfterPickaxe, (v) => void options.set('smartAxeAfterPickaxe', v)),
        this.toggle(Lang.text('Mods.SandboxWorld.Settings.SmartBlocks'), () => d.smartBlocksEnabled, (v) => void options.set('smartBlocksEnabled', v)),
        this.toggle(Lang.text('Mods.SandboxWorld.Settings.SmartHoldRelease'), () => d.smartHoldCanReleaseMidUse, (v) => void options.set('smartHoldCanReleaseMidUse', v)),
        // 玩家对决（Player.hostile;原版仅联机显示该 UI——Main.cs:2982 ShouldPVPDraw,
        // 单机常驻为调试便利,联机语义由协议同步压制）。显示态读【实时 player.hostile】
        // （原版会话语义:进服恒 false,与 options 上次设置无关——勿用 options 回显）
        this.toggle(Lang.text('Mods.SandboxWorld.Settings.Pvp'), () => {
          const p = (window as unknown as { __swGame?: { player: { hostile: boolean } } }).__swGame?.player;
          return p ? p.hostile : d.pvpEnabled;
        }, (v) => {
          void options.set('pvpEnabled', v);
          const p = (window as unknown as { __swGame?: { player: import('../entities/Player').Player } }).__swGame?.player;
          if (p) p.hostile = v;
        }),
        // 队伍 0-5（Player.team;点击循环切换,显示色块+序号）
        (() => {
          const row = document.createElement('div');
          row.className = 'sw-set-row';
          const span = document.createElement('span');
          span.textContent = Lang.text('Mods.SandboxWorld.Settings.PvpTeam');
          const btn = document.createElement('button');
          const render = () => {
            const t = Math.max(0, Math.min(5, (window as unknown as { __swGame?: { player: { team: number } } }).__swGame?.player.team ?? d.pvpTeam));
            btn.textContent = `${t} ▮`;
            btn.style.color = TEAM_COLORS[t] ? `rgb(${TEAM_COLORS[t][0]},${TEAM_COLORS[t][1]},${TEAM_COLORS[t][2]})` : '#fff';
          };
          btn.addEventListener('click', () => {
            const gp = (window as unknown as { __swGame?: { player: import('../entities/Player').Player } }).__swGame;
            const next = (((gp?.player.team ?? d.pvpTeam) + 1) % 6);
            void options.set('pvpTeam', next);
            if (gp) gp.player.team = next;
            render();
          });
          render();
          row.append(span, btn);
          return row;
        })(),
        // ---- M14 IngameOptions 杂项（IngameOptions.cs:647-848 逐项；行文案=原版官译）----
        // 自动保存（:619 Main.autoSave 默认 true；DoUpdate_AutoSave :19589 墙钟触发）
        this.modeRow(
          Lang.menu(67).replace(/[:：].*$/, ''),
          () => String(d.autoSave),
          () => Lang.menu(d.autoSave ? 67 : 68),
          () => void options.set('autoSave', !d.autoSave),
        ),
        // 自动保存间隔（原版恒 600000ms=10min 不可调；任务要求的 Web 便利扩展档）
        this.modeRow(
          Lang.text('Mods.SandboxWorld.Settings.AutoSaveInterval'),
          () => String(d.autoSaveIntervalMin),
          () => Lang.text('Mods.SandboxWorld.Settings.AutoSaveIntervalMin', d.autoSaveIntervalMin),
          () => {
            const steps = [5, 10, 20, 30];
            void options.set('autoSaveIntervalMin', steps[(steps.indexOf(d.autoSaveIntervalMin) + 1) % steps.length] ?? 10);
          },
        ),
        // 自动暂停（:628 Main.autoPause 默认 false；Web 语义=切 tab 暂停）
        this.modeRow(
          Lang.menu(69).replace(/[:：].*$/, ''),
          () => String(d.autoPause),
          () => Lang.menu(d.autoPause ? 69 : 70),
          () => void options.set('autoPause', !d.autoPause),
        ),
        // 激活套装奖励键上下反转（:647 Main.ReversedUpDownArmorSetBonuses；
        // 消费=Lang 替换键 ToggleArmorSetBonusKey）
        this.modeRow(
          Lang.menu(220).replace(/[:：].*$/, ''),
          () => String(d.reversedUpDownArmorSetBonuses),
          () => Lang.menu(d.reversedUpDownArmorSetBonuses ? 220 : 221),
          () => void options.set('reversedUpDownArmorSetBonuses', !d.reversedUpDownArmorSetBonuses),
        ),
        // 智能门（:656 DoorOpeningHelper.PreferenceSettings；CyclePreferences :262
        // 序 Enabled→GamepadOnly→Disabled。行为 N-A：玩家智能门系统未移植）
        this.modeRow(
          Lang.text('UI.SmartDoorsEnabled').replace(/[:：].*$/, ''),
          () => d.doorOpeningPreference,
          () => Lang.text(d.doorOpeningPreference === 'enabled' ? 'UI.SmartDoorsEnabled'
            : d.doorOpeningPreference === 'gamepadOnly' ? 'UI.SmartDoorsGamepad' : 'UI.SmartDoorsDisabled'),
          () => void options.set('doorOpeningPreference',
            d.doorOpeningPreference === 'enabled' ? 'gamepadOnly'
              : d.doorOpeningPreference === 'gamepadOnly' ? 'disabled' : 'enabled'),
        ),
        // 全物品自动连用（:689 Main.SettingsEnabled_AutoReuseAllItems；Player.cs:24182
        // autoReuseAllWeapons——本仓挥击 canChain 门）
        this.modeRow(
          Lang.text('UI.AutoReuseAllOn').replace(/[:：].*$/, ''),
          () => String(d.autoReuseAllItems),
          () => Lang.text(d.autoReuseAllItems ? 'UI.AutoReuseAllOn' : 'UI.AutoReuseAllOff'),
          () => void options.set('autoReuseAllItems', !d.autoReuseAllItems),
        ),
        // 事件进度条（:714 Main.invasionProgressMode 0/1/2；menu[124+mode] 官译）
        this.modeRow(
          Lang.menu(123).replace(/[:：].*$/, ''),
          () => String(d.invasionProgressMode),
          () => Lang.menu(124 + d.invasionProgressMode),
          () => void options.set('invasionProgressMode', ((d.invasionProgressMode + 1) % 3) as 0 | 1 | 2),
        ),
        // 放置预览（:727 Main.placementPreview；行为 N-A：对象放置幽灵预览未移植）
        this.modeRow(
          Lang.menu(128).replace(/[:：].*$/, ''),
          () => String(d.placementPreview),
          () => Lang.menu(d.placementPreview ? 128 : 129),
          () => void options.set('placementPreview', !d.placementPreview),
        ),
        // 突出显示新物品（:736 ItemSlot.Options.HighlightNewItems；行为 N-A：
        // 背包 newAndShiny 追踪未移植）
        this.modeRow(
          Lang.inter(117).replace(/[:：].*$/, ''),
          () => String(d.highlightNewItems),
          () => Lang.inter(d.highlightNewItems ? 117 : 116),
          () => void options.set('highlightNewItems', !d.highlightNewItems),
        ),
        // 图格网格（:745 Main.MouseShowBuildingGrid；DrawInterface_6_TileGridOption
        // 已接——Renderer.drawBuildingGrid CursorRadial 十字）
        this.modeRow(
          Lang.menu(229).replace(/[:：].*$/, ''),
          () => String(d.mouseShowBuildingGrid),
          () => Lang.menu(d.mouseShowBuildingGrid ? 229 : 230),
          () => void options.set('mouseShowBuildingGrid', !d.mouseShowBuildingGrid),
        ),
      );
      const hint = document.createElement('div');
      hint.className = 'sw-set-hint';
      hint.textContent = Lang.text('Mods.SandboxWorld.Settings.DevModeHint');
      this.content.append(hint);
      const scHint = document.createElement('div');
      scHint.className = 'sw-set-hint';
      scHint.textContent = Lang.text('Mods.SandboxWorld.Settings.SmartCursorHint');
      this.content.append(scHint);
    } else if (this.cat === 'controls') {
      // ---- 键位重映射（M5：UIKeybindingListItem 模式——点击监听下一键；
      //      已绑定键反选解绑；Esc 取消；↺ 单项回默认）----
      for (const a of KEYBIND_ACTIONS) this.content.append(this.keybindRow(a));
      const btns = document.createElement('div');
      btns.className = 'sw-set-btns';
      const b = document.createElement('button');
      b.className = 'sw-set-back';
      b.style.textAlign = 'center';
      b.textContent = Lang.text('Mods.SandboxWorld.Settings.ResetKeybinds');
      b.addEventListener('click', () => {
        void options.set('keybinds', resetAllKeybinds());
        this.build();
      });
      btns.appendChild(b);
      this.content.append(btns);
      const hint = document.createElement('div');
      hint.className = 'sw-set-hint';
      hint.textContent = Lang.text('Mods.SandboxWorld.Settings.KeybindsHint');
      this.content.append(hint);
      const devHint = document.createElement('div');
      devHint.className = 'sw-set-hint';
      devHint.textContent = Lang.text('Mods.SandboxWorld.Settings.DevKeysHint');
      this.content.append(devHint);
    } else if (this.cat === 'packs') {
      // ---- 资源包（M13）：双列启停/调序/信息 + zip 上传（ResourcePackPage）----
      this.content.append(buildResourcePackPage());
    } else if (this.cat === 'data' && this.flow.onQuickLoad) {
      const btns = document.createElement('div');
      btns.className = 'sw-set-btns';
      const mk = (label: string, fn: () => void) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', () => this.close(fn));
        btns.appendChild(b);
      };
      mk(Lang.text('Mods.SandboxWorld.Data.ContinueSave'), () => this.flow.onQuickLoad!());
      mk(Lang.text('Mods.SandboxWorld.Data.LoadFile'), () => this.flow.onLoadFile?.());
      mk(Lang.text('Mods.SandboxWorld.Data.ImportWld'), () => this.flow.onImportWld?.());
      this.content.append(btns);
    }
  }

  /** 语言已切换:重建标题/分栏/内容(保留 this.cat) */
  private rebuild() {
    (this.panel.querySelector('.sw-set-title') as HTMLElement).textContent = Lang.text('LegacyMenu.14');
    (this.panel.querySelector('.sw-set-back') as HTMLElement).textContent = Lang.text('LegacyMenu.6');
    this.buildCats();
    this.build();
  }

  /** 音量下发（Audio 实例由 main.ts 注入过 options.onChange，这里同步 UISfx） */
  private applySound() {
    // UISfx 共享实例的 master + ambient 双轨
    (UISfx as unknown as { sfx: { master: number; ambient: number } }).sfx.master = options.data.sfxVol;
    (UISfx as unknown as { sfx: { master: number; ambient: number } }).sfx.ambient = options.data.ambientVol;
  }

  private applyUi() {
    UIScale.userScale = options.data.uiScale;
    UIScale.recompute();
  }
}
