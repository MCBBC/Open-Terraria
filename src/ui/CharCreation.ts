// 角色创建页（DOM 版，M2.5 重写）：交互全部用原生控件（input/range/按钮网格），
// 纸娃娃预览用 canvas。替代原 VUI 手绘版 UICharacterCreationState（命中/交互脆弱）。
// 布局精神对齐原版：左预览 + 右分类内容 + 底部返回/创建。
import {
  type Appearance, type RGBColor, randomAppearance, DIFFICULTY_INFO,
  VALID_CLOTH_STYLES, CHAR_CREATION_HAIRS, hslToRgb,
} from '../player/Appearance';
import { compositePaperDoll, dollFrame, walkFrame, IDLE_FRAME } from '../player/PaperDoll';
import { Lang } from '../i18n/Lang';
import { randomPlayerName } from '../i18n/RandomText';

export interface CharCreationCallbacks {
  onCreate(a: Appearance): void;
  onCancel(): void;
}

/** 面板形态：
 *  - 默认 = 角色创建（LegacyMenu.16 标题 + 信息/外观/发型/颜色四页签）；
 *  - dresser = 梳妆台更衣窗（Main.OpenClothesWindow Main.cs:43568——只改衣服样式与
 *    六色，不含姓名/难度/发型；发型原版归造型师）。initial 必填（以现外观为底稿）。 */
export interface CharCreationOptions {
  initial?: Appearance;
  dresser?: boolean;
}

const COLOR_ROWS: Array<{ key: keyof Appearance; labelKey: string; dresser?: boolean }> = [
  { key: 'hairColor', labelKey: 'UI.PlayerCreateCategoryHairColor' },   // 发型颜色=造型师域，梳妆台不提供
  { key: 'eyeColor', labelKey: 'UI.PlayerCreateCategoryEyeColor', dresser: true },
  { key: 'skinColor', labelKey: 'UI.PlayerCreateCategorySkinColor', dresser: true },
  { key: 'shirtColor', labelKey: 'UI.PlayerCreateCategoryShirtColor', dresser: true },
  { key: 'undershirtColor', labelKey: 'UI.PlayerCreateCategoryUndershirtColor', dresser: true },
  { key: 'pantsColor', labelKey: 'UI.PlayerCreateCategoryPantsColor', dresser: true },
  { key: 'shoeColor', labelKey: 'UI.PlayerCreateCategoryShoesColor', dresser: true },
];

const CSS = `
.sw-char-panel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 620px; max-width: 96vw; z-index: 20; cursor: auto;
  background: linear-gradient(160deg, #2b3664, #1c2444);
  border: 2px solid #7d92d6; border-radius: 6px;
  padding: 14px 16px; color: #e8e8f4;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  box-shadow: 0 8px 40px rgba(0,0,0,.6);
}
.sw-char-title { text-align: center; font-size: 18px; color: #ffe8a0; margin-bottom: 10px;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-char-body { display: flex; gap: 14px; }
.sw-char-left { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.sw-char-preview { background: #10142c; border: 2px solid #4a5aa0; border-radius: 4px; image-rendering: pixelated; }
.sw-char-leftbtns { display: flex; gap: 6px; }
.sw-char-leftbtns button, .sw-char-footer button, .sw-char-diffs button {
  background: #3a4680; color: #e8e8f4; border: 1px solid #7d92d6; border-radius: 4px;
  padding: 4px 10px; cursor: pointer; font-family: inherit;
}
.sw-char-leftbtns button:hover, .sw-char-footer button:hover, .sw-char-diffs button:hover { background: #4a5aa0; }
.sw-char-right { flex: 1; min-width: 0; }
.sw-char-tabs { display: flex; gap: 6px; margin-bottom: 8px; }
.sw-char-tabs button {
  background: #232c52; color: #c8c8e0; border: 1px solid #4a5aa0; border-radius: 4px;
  padding: 4px 12px; cursor: pointer; font-family: inherit;
}
.sw-char-tabs button.active { background: #5a6ac0; color: #fff; }
.sw-char-content { height: 320px; overflow-y: auto; background: #1a2140; border: 1px solid #3a4680;
  border-radius: 4px; padding: 10px; }
.sw-char-section { display: flex; flex-direction: column; gap: 8px; }
.sw-char-row { display: flex; align-items: center; gap: 10px; }
.sw-char-row span { width: 52px; }
.sw-char-row input[type=text] {
  flex: 1; background: #10142c; border: 1px solid #4a5aa0; color: #fff;
  padding: 6px 8px; border-radius: 4px; font-family: inherit;
}
.sw-char-row input[type=color] { width: 60px; height: 30px; border: none; background: none; cursor: pointer; }
.sw-char-subtitle { color: #b8c0e8; font-size: 13px; margin-top: 4px; }
.sw-char-diffs { display: flex; gap: 8px; }
.sw-char-diffs button.active { outline: 2px solid #ffd76e; }
.sw-char-styles, .sw-char-hairs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.sw-char-hairs { grid-template-columns: repeat(6, 1fr); }
.sw-char-stylebtn, .sw-char-hairbtn {
  background: #232c52; border: 1px solid #3a4680; border-radius: 4px;
  padding: 4px; cursor: pointer; display: flex; justify-content: center;
}
.sw-char-stylebtn.active, .sw-char-hairbtn.active { outline: 2px solid #ffd76e; }
.sw-char-stylebtn canvas, .sw-char-hairbtn canvas { image-rendering: pixelated; width: 40px; height: auto; }
.sw-char-hairbtn canvas { height: 44px; }
.sw-char-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
.sw-char-footer .primary { background: #5a6ac0; color: #fff; }
`;

function hex(c: RGBColor): string {
  return '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function fromHex(s: string): RGBColor {
  const v = parseInt(s.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

export class CharCreation {
  private panel: HTMLElement;
  private appearance: Appearance;
  private clipboard: Appearance | null = null;
  private previewCanvas: HTMLCanvasElement;
  private previewCtx: CanvasRenderingContext2D;
  private raf = 0;
  private time = 0;
  private content: HTMLElement;
  private tab = 'info';
  private dresser = false;   // 梳妆台更衣窗形态（无信息/发型页签，确认=更改）
  private colorInputs = new Map<keyof Appearance, HTMLInputElement>();

  constructor(private root: HTMLElement, private cb: CharCreationCallbacks, opts: CharCreationOptions = {}) {
    this.dresser = opts.dresser === true;
    this.appearance = opts.initial
      ? { ...structuredClone(opts.initial) }        // 更衣窗：现外观为底稿（确认才生效）
      : randomAppearance();

    if (!document.getElementById('sw-char-style')) {
      const style = document.createElement('style');
      style.id = 'sw-char-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    this.panel = document.createElement('div');
    this.panel.className = 'sw-char-panel';
    const tabs = this.dresser
      ? `<button data-tab="look">${Lang.text('Mods.SandboxWorld.CharCreate.Appearance')}</button>`
        + `<button data-tab="color">${Lang.text('Mods.SandboxWorld.CharCreate.Colors')}</button>`
      : `<button data-tab="info">${Lang.text('UI.PlayerCreateCategoryInfo')}</button>`
        + `<button data-tab="look">${Lang.text('Mods.SandboxWorld.CharCreate.Appearance')}</button>`
        + `<button data-tab="hair">${Lang.text('UI.PlayerCreateCategoryHairStyle')}</button>`
        + `<button data-tab="color">${Lang.text('Mods.SandboxWorld.CharCreate.Colors')}</button>`;
    this.panel.innerHTML = `
      <div class="sw-char-title">${this.dresser ? Lang.text('Mods.SandboxWorld.ClothesWindow.Title') : Lang.text('LegacyMenu.16')}</div>
      <div class="sw-char-body">
        <div class="sw-char-left">
          <canvas class="sw-char-preview" width="120" height="150"></canvas>
          <div class="sw-char-leftbtns">
            <button data-act="copy" title="${Lang.text('Mods.SandboxWorld.CharCreate.CopyTemplate')}">📋</button>
            <button data-act="paste" title="${Lang.text('Mods.SandboxWorld.CharCreate.PasteTemplate')}">📎</button>
            <button data-act="random" title="${Lang.text('Mods.SandboxWorld.CharCreate.Random')}">🎲</button>
          </div>
        </div>
        <div class="sw-char-right">
          <div class="sw-char-tabs">${tabs}</div>
          <div class="sw-char-content"></div>
        </div>
      </div>
      <div class="sw-char-footer">
        <button data-act="back">${this.dresser ? Lang.text('GameUI.Cancel') : Lang.text('UI.Back')}</button>
        <button data-act="create" class="primary">${this.dresser ? Lang.text('GameUI.Change') : Lang.text('UI.Create')}</button>
      </div>
    `;
    this.root.appendChild(this.panel);
    this.previewCanvas = this.panel.querySelector('.sw-char-preview')!;
    this.previewCtx = this.previewCanvas.getContext('2d')!;
    this.previewCtx.imageSmoothingEnabled = false;
    this.content = this.panel.querySelector('.sw-char-content')!;
    this.tab = this.dresser ? 'look' : 'info';

    // 事件
    this.panel.querySelectorAll('.sw-char-tabs button').forEach((b) => {
      b.addEventListener('click', () => { this.tab = (b as HTMLElement).dataset.tab!; this.buildContent(); });
    });
    this.panel.querySelector('[data-act=back]')!.addEventListener('click', () => this.close(this.cb.onCancel));
    this.panel.querySelector('[data-act=create]')!.addEventListener('click', () => {
      // 更衣窗不改姓名/难度/发型：以 initial 为底稿时保留这三项原值
      if (this.dresser && opts.initial) {
        this.appearance.name = opts.initial.name;
        this.appearance.difficulty = opts.initial.difficulty;
        this.appearance.hair = opts.initial.hair;
      } else {
        this.appearance.name = (this.appearance.name || '').trim() || Lang.text('Mods.SandboxWorld.CharCreate.Unnamed');
      }
      const a = this.appearance;
      this.close(() => this.cb.onCreate(a));
    });
    this.panel.querySelector('[data-act=random]')!.addEventListener('click', () => {
      if (this.dresser) {
        // 更衣窗的🎲只掷衣服样式+六色（发型/难度保持不动——发型归造型师）
        const r = randomAppearance(this.appearance.name);
        this.appearance.skinVariant = r.skinVariant;
        this.appearance.shirtColor = r.shirtColor;
        this.appearance.undershirtColor = r.undershirtColor;
        this.appearance.pantsColor = r.pantsColor;
        this.appearance.shoeColor = r.shoeColor;
        this.appearance.eyeColor = r.eyeColor;
        this.appearance.skinColor = r.skinColor;
      } else {
        this.appearance = randomAppearance(this.appearance.name);
      }
      this.buildContent();
    });
    this.panel.querySelector('[data-act=copy]')!.addEventListener('click', () => {
      this.clipboard = { ...this.appearance };
    });
    this.panel.querySelector('[data-act=paste]')!.addEventListener('click', () => {
      if (!this.clipboard) return;
      this.appearance = { ...this.clipboard, name: this.appearance.name };
      this.buildContent();
    });

    this.buildContent();
    this.loop();
    // Esc 返回
    this.escHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') this.close(this.cb.onCancel);
    };
    window.addEventListener('keydown', this.escHandler);
    this.unsubLang = Lang.onChange(() => this.refreshTexts());
  }

  private unsubLang: (() => void) | null = null;

  /** 语言切换:静态框架文案重取 + 内容区重建(保留 appearance 与页签) */
  private refreshTexts() {
    (this.panel.querySelector('.sw-char-title') as HTMLElement).textContent =
      this.dresser ? Lang.text('Mods.SandboxWorld.ClothesWindow.Title') : Lang.text('LegacyMenu.16');
    const tabText: Record<string, string> = {
      info: Lang.text('UI.PlayerCreateCategoryInfo'),
      look: Lang.text('Mods.SandboxWorld.CharCreate.Appearance'),
      hair: Lang.text('UI.PlayerCreateCategoryHairStyle'),
      color: Lang.text('Mods.SandboxWorld.CharCreate.Colors'),
    };
    this.panel.querySelectorAll('[data-tab]').forEach((b) => {
      (b as HTMLElement).textContent = tabText[(b as HTMLElement).dataset.tab!];
    });
    (this.panel.querySelector('[data-act=copy]') as HTMLElement).title = Lang.text('Mods.SandboxWorld.CharCreate.CopyTemplate');
    (this.panel.querySelector('[data-act=paste]') as HTMLElement).title = Lang.text('Mods.SandboxWorld.CharCreate.PasteTemplate');
    (this.panel.querySelector('[data-act=random]') as HTMLElement).title = Lang.text('Mods.SandboxWorld.CharCreate.Random');
    (this.panel.querySelector('[data-act=back]') as HTMLElement).textContent =
      this.dresser ? Lang.text('GameUI.Cancel') : Lang.text('UI.Back');
    (this.panel.querySelector('[data-act=create]') as HTMLElement).textContent =
      this.dresser ? Lang.text('GameUI.Change') : Lang.text('UI.Create');
    this.buildContent();
  }

  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  /** 走路动画预览循环 */
  private loop = () => {
    this.time += 1 / 60;
    this.drawPreview();
    this.raf = requestAnimationFrame(this.loop);
  };

  private drawPreview() {
    const ctx = this.previewCtx;
    ctx.clearRect(0, 0, 120, 150);
    const doll = compositePaperDoll(this.appearance);
    if (!doll) return;
    const f = dollFrame(doll, walkFrame(this.time));
    // 2x 放大：40×56 → 80×112，底部对齐
    ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 20, 150 - 112, 80, 112);
  }

  /** fn 可选(public):外部生命周期清理(UI.closeAll/showClothesWindow 守卫,
   *  2026-08-13 泄露 review——孤儿 rAF/keydown/Lang 订阅即源于无法外部关) */
  close(fn?: () => void) {
    cancelAnimationFrame(this.raf);
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler);
    this.unsubLang?.();
    this.panel.remove();
    fn?.();
  }

  // ================= 内容区 =================

  private buildContent() {
    // 页签高亮
    this.panel.querySelectorAll('.sw-char-tabs button').forEach((b) => {
      (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.tab === this.tab);
    });
    this.content.innerHTML = '';
    this.colorInputs.clear();
    if (this.tab === 'info') this.buildInfo();
    else if (this.tab === 'look') this.buildLook();
    else if (this.tab === 'hair') this.buildHair();
    else this.buildColor();
  }

  /** 缩略图懒加载补画(2026-08-13 枚举 review):buildContent 一次成型,纸娃娃贴图
   *  晚到会留空白缩略图直到交互——miss 时有界重试 buildContent;面板已关/用户
   *  切走页签即停(compositePaperDoll miss 不缓存,重试天然会升级) */
  private thumbRetry = 0;
  private thumbTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private scheduleThumbRetry(missed: boolean) {
    if (!missed || ++this.thumbRetry > 6 || this.thumbTimer) return;
    this.thumbTimer = setTimeout(() => {
      this.thumbTimer = 0;
      if (!this.content.isConnected) return;                   // 面板已关
      if (this.tab !== 'look' && this.tab !== 'hair') return;  // 用户已切走
      this.buildContent();
    }, 700);
  }

  private buildInfo() {
    const box = document.createElement('div');
    box.className = 'sw-char-section';
    // 名字
    const nameRow = document.createElement('label');
    nameRow.className = 'sw-char-row';
    nameRow.innerHTML = `<span>${Lang.text('UI.PlayerNameSlot')}</span>`;
    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = 20;
    name.value = this.appearance.name;
    name.placeholder = Lang.text('Mods.SandboxWorld.CharCreate.NamePlaceholder');
    name.addEventListener('input', () => { this.appearance.name = name.value; });
    nameRow.appendChild(name);
    // 随机名（🎲）：取人类城镇 NPC 名字池并集随机（原版无玩家名字池——见 RandomText 注记）
    const randName = document.createElement('button');
    randName.textContent = '🎲';
    randName.title = Lang.text('Mods.SandboxWorld.CharCreate.RandomName');
    randName.style.cssText = 'padding:4px 8px;cursor:pointer;';
    randName.addEventListener('click', () => {
      name.value = randomPlayerName();
      this.appearance.name = name.value;
    });
    nameRow.appendChild(randName);
    box.appendChild(nameRow);
    // 难度
    const diffTitle = document.createElement('div');
    diffTitle.className = 'sw-char-subtitle';
    diffTitle.textContent = Lang.text('Mods.SandboxWorld.CharCreate.Difficulty');
    box.appendChild(diffTitle);
    const diffRow = document.createElement('div');
    diffRow.className = 'sw-char-diffs';
    DIFFICULTY_INFO.forEach((d, i) => {
      const b = document.createElement('button');
      b.textContent = Lang.text(['UI.Softcore', 'UI.Mediumcore', 'UI.Hardcore', 'UI.Creative'][i]);
      b.style.color = hex(d.color);
      b.classList.toggle('active', this.appearance.difficulty === i);
      b.title = Lang.text(`Mods.SandboxWorld.CharCreate.DiffDesc.${i}`);
      b.addEventListener('click', () => { this.appearance.difficulty = i as Appearance['difficulty']; this.buildContent(); });
      diffRow.appendChild(b);
    });
    box.appendChild(diffRow);
    // 性别（皮肤变体男/女组）
    const genderTitle = document.createElement('div');
    genderTitle.className = 'sw-char-subtitle';
    genderTitle.textContent = Lang.text('Mods.SandboxWorld.CharCreate.Gender');
    box.appendChild(genderTitle);
    const gRow = document.createElement('div');
    gRow.className = 'sw-char-diffs';
    const MALE = [0, 1, 2, 3, 8, 10];
    const FEMALE = [4, 5, 6, 7, 9, 11];
    for (const [label, pool] of [['Mods.SandboxWorld.CharCreate.Male', MALE], ['Mods.SandboxWorld.CharCreate.Female', FEMALE]] as Array<[string, number[]]>) {
      const b = document.createElement('button');
      b.textContent = Lang.text(label);
      b.classList.toggle('active', pool.includes(this.appearance.skinVariant));
      b.addEventListener('click', () => {
        // 同性别的样式索引尽量保留（0↔4, 1↔5, 2↔6, 3↔7, 8↔9, 10↔11）
        const other = pool === MALE ? FEMALE : MALE;
        const idx = Math.max(0, other.indexOf(this.appearance.skinVariant));
        this.appearance.skinVariant = pool[idx] ?? pool[0];
        this.buildContent();
      });
      gRow.appendChild(b);
    }
    box.appendChild(gRow);
    this.content.appendChild(box);
  }

  private buildLook() {
    const box = document.createElement('div');
    box.className = 'sw-char-styles';
    let missed = false;
    VALID_CLOTH_STYLES.forEach((styleId) => {
      const b = document.createElement('button');
      b.className = 'sw-char-stylebtn';
      b.title = Lang.text('Mods.SandboxWorld.CharCreate.StyleId', styleId);
      b.classList.toggle('active', this.appearance.skinVariant === styleId);
      const c = document.createElement('canvas');
      c.width = 40; c.height = 56;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const doll = compositePaperDoll({ ...this.appearance, skinVariant: styleId });
      if (doll) {
        const f = dollFrame(doll, IDLE_FRAME);
        ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 0, 0, 40, 56);
      } else missed = true;
      b.appendChild(c);
      b.addEventListener('click', () => { this.appearance.skinVariant = styleId; this.buildContent(); });
      box.appendChild(b);
    });
    this.content.appendChild(box);
    this.scheduleThumbRetry(missed);
  }

  private buildHair() {
    const wrap = document.createElement('div');
    wrap.className = 'sw-char-hairs';
    let missed = false;
    for (const hairId of CHAR_CREATION_HAIRS) {
      const b = document.createElement('button');
      b.className = 'sw-char-hairbtn';
      b.title = Lang.text('Mods.SandboxWorld.CharCreate.HairId', hairId);
      b.classList.toggle('active', this.appearance.hair === hairId);
      const c = document.createElement('canvas');
      c.width = 40; c.height = 44;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      const doll = compositePaperDoll({ ...this.appearance, hair: hairId });
      if (doll) {
        // 头部区域（帧上部 44px，长发也能展示）
        ctx.drawImage(doll, 0, 0, 40, 44, 0, 0, 40, 44);
      } else missed = true;
      b.appendChild(c);
      b.addEventListener('click', () => { this.appearance.hair = hairId; this.buildContent(); });
      wrap.appendChild(b);
    }
    this.content.appendChild(wrap);
    this.scheduleThumbRetry(missed);
  }

  private buildColor() {
    const box = document.createElement('div');
    box.className = 'sw-char-section';
    for (const row of COLOR_ROWS) {
      if (this.dresser && !row.dresser) continue;   // 更衣窗六色（Main.cs:43579-43585 备份的六色）
      const el = document.createElement('label');
      el.className = 'sw-char-row';
      const span = document.createElement('span');
      span.textContent = Lang.text(row.labelKey);
      const key = row.key as keyof Appearance;
      const input = document.createElement('input');
      input.type = 'color';
      input.value = hex(this.appearance[key] as RGBColor);
      input.addEventListener('input', () => {
        (this.appearance[key] as RGBColor) = fromHex(input.value);
        
      });
      this.colorInputs.set(key, input);
      const rand = document.createElement('button');
      rand.textContent = '🎲';
      rand.title = Lang.text('Mods.SandboxWorld.CharCreate.RandomColor');
      rand.addEventListener('click', () => {
        const c = { r: 0, g: 0, b: 0 };
        const [r, g, b] = hslToRgb(Math.random(), 0.35 + Math.random() * 0.45, 0.3 + Math.random() * 0.35);
        c.r = Math.round(r * 255); c.g = Math.round(g * 255); c.b = Math.round(b * 255);
        (this.appearance[key] as RGBColor) = c;
        input.value = hex(c);
        
      });
      el.append(span, input, rand);
      box.appendChild(el);
    }
    this.content.appendChild(box);
  }
}
