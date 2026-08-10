// 设置面板（DOM，M6）：分栏 声音/界面/游戏/数据 + 返回。
// 主菜单与游戏内（暂停菜单）共用；数据栏仅主菜单显示。
// 文案全部走 Lang（M8 语言系统）：原版键（LegacyMenu.*）+ 自有键（Mods.SandboxWorld.*）。
// 语言切换：网格按钮（原版语义=用当前语言显示所有语言名，Language.* 类别），
// 点击后 Lang.setLanguage → 本面板经 Lang.onChange 重建（保留当前分栏）。
import { options } from '../core/Options';
import { UIScale } from '../vui/draw/UIScale';
import { UISfx } from '../vui/UISfx';
import { Lang } from '../i18n/Lang';

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
      style.textContent = CSS;
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
      case 'data': return Lang.text('Mods.SandboxWorld.Settings.Data');
      default: return cat;
    }
  }

  private buildCats() {
    const cats = document.createElement('div');
    cats.className = 'sw-set-cats';
    const list = ['sound', 'ui', 'game', ...(this.flow.onQuickLoad ? ['data'] : [])];
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
      );
    } else if (this.cat === 'ui') {
      this.content.append(
        this.slider(Lang.text('Mods.SandboxWorld.Settings.UiScale'), 0.75, 1.5, 0.05, () => d.uiScale, (v) => void options.set('uiScale', v).then(() => this.applyUi())),
        this.langGrid(),
      );
      const hint = document.createElement('div');
      hint.className = 'sw-set-hint';
      hint.textContent = Lang.text('Mods.SandboxWorld.Settings.UiScaleHint');
      this.content.append(hint);
    } else if (this.cat === 'game') {
      this.content.append(
        this.toggle(Lang.text('Mods.SandboxWorld.Settings.DevMode'), () => d.devMode, (v) => void options.set('devMode', v)),
      );
      const hint = document.createElement('div');
      hint.className = 'sw-set-hint';
      hint.textContent = Lang.text('Mods.SandboxWorld.Settings.DevModeHint');
      this.content.append(hint);
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
    // UISfx 共享实例的 master
    (UISfx as unknown as { sfx: { master: number } }).sfx.master = options.data.sfxVol;
  }

  private applyUi() {
    UIScale.userScale = options.data.uiScale;
    UIScale.recompute();
  }
}
