// 设置面板（DOM，M6）：分栏 声音/界面/游戏/数据 + 返回。
// 主菜单与游戏内（暂停菜单）共用；数据栏仅主菜单显示。
import { options } from '../core/Options';
import { UIScale } from '../vui/draw/UIScale';
import { UISfx } from '../vui/UISfx';

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
  border-radius: 4px; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
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
`;

export class SettingsPanel {
  private panel: HTMLElement;
  private content: HTMLElement;
  private cat = 'sound';

  constructor(parent: HTMLElement, private flow: SettingsFlow) {
    if (!document.getElementById('sw-set-style')) {
      const style = document.createElement('style');
      style.id = 'sw-set-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.panel = document.createElement('div');
    this.panel.className = 'sw-set-panel';
    const cats: Array<[string, string]> = [
      ['sound', '声音'],
      ['ui', '界面'],
      ['game', '游戏'],
      ...(flow.onQuickLoad ? [['data', '数据'] as [string, string]] : []),
    ];
    this.panel.innerHTML = `
      <div class="sw-set-title">设置</div>
      <div class="sw-set-body">
        <div class="sw-set-cats">${cats.map(([k, l]) => `<div data-cat="${k}">${l}</div>`).join('')}</div>
        <div class="sw-set-content"></div>
      </div>
      <div class="sw-set-footer"><button class="sw-set-back">返回</button></div>
    `;
    this.content = this.panel.querySelector('.sw-set-content')!;
    this.panel.querySelectorAll('.sw-set-cats div').forEach((el) => {
      el.addEventListener('click', () => { this.cat = (el as HTMLElement).dataset.cat!; this.build(); });
    });
    this.panel.querySelector('.sw-set-back')!.addEventListener('click', () => this.close(flow.onBack));
    this.escHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') this.close(flow.onBack);
    };
    window.addEventListener('keydown', this.escHandler);
    parent.appendChild(this.panel);
    this.build();
    UISfx.click();
  }

  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  private close(fn: () => void) {
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler);
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

  private build() {
    this.panel.querySelectorAll('.sw-set-cats div').forEach((el) => {
      (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset.cat === this.cat);
    });
    this.content.innerHTML = '';
    const d = options.data;
    if (this.cat === 'sound') {
      this.content.append(
        this.slider('音乐音量', 0, 1, 0.05, () => d.musicVol, (v) => { d.musicVol = v; this.applySound(); void options.set('musicVol', v); }),
        this.slider('音效音量', 0, 1, 0.05, () => d.sfxVol, (v) => { d.sfxVol = v; this.applySound(); void options.set('sfxVol', v); }),
      );
    } else if (this.cat === 'ui') {
      this.content.append(
        this.slider('UI 缩放', 0.75, 1.5, 0.05, () => d.uiScale, (v) => void options.set('uiScale', v).then(() => this.applyUi())),
      );
      const hint = document.createElement('div');
      hint.style.cssText = 'color:#8a90b8; font-size:12px;';
      hint.textContent = '缩放影响角色选择/世界创建等画布界面的尺寸。';
      this.content.append(hint);
    } else if (this.cat === 'game') {
      this.content.append(
        this.toggle('开发者模式', () => d.devMode, (v) => void options.set('devMode', v)),
      );
      const hint = document.createElement('div');
      hint.style.cssText = 'color:#8a90b8; font-size:12px;';
      hint.textContent = '开发者模式：下次进入新世界时获得全部道具与图块展示区。';
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
      mk('继续上次存档', () => this.flow.onQuickLoad!());
      mk('读取存档文件… (.json)', () => this.flow.onLoadFile?.());
      mk('导入泰拉瑞亚地图 (.wld)…', () => this.flow.onImportWld?.());
      this.content.append(btns);
    }
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
