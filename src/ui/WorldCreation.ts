// 世界创建页（DOM 版，替代 VUI UIWorldCreationState）：
// 世界名/种子 + 大小/难度/邪恶三组选项 + 彩蛋种子图标 + 多层预览图 + 描述。
import { parseSeed } from '../world/gen/SeedEasterEggs';
import { randomWorldName } from '../i18n/RandomText';
import { Lang } from '../i18n/Lang';
import { ensureVanillaKit, bindKeyboardShift } from './vanillaKit';
import { UISfx } from '../vui/UISfx';

export interface WorldCreationFlow {
  onCreate(cfg: { name: string; seed: string; w: number; h: number; /** 尺寸档 0 小/1 中/2 大（SIZES 下标；GenConfig.size 直传，W/H 与之同源派生） */ size: number; difficulty: number; evil: -1 | 0 | 1 }): void;
  onCancel(): void;
}

// 选项 = 键引用(语言切换时重取,不留硬编码文案)。
// label/desc 全用原版键(UI.*),邪恶三项短标签原版无现成键 → 自有键。
interface Opt { labelKey: string; icon: string; descKey: string; }
interface SizeOpt extends Opt { w: number; h: number; }

const SIZES: SizeOpt[] = [
  { labelKey: 'UI.WorldSizeSmall', w: 4200, h: 1200, icon: 'UI_WorldCreation_IconSizeSmall', descKey: 'UI.WorldDescriptionSizeSmall' },
  { labelKey: 'UI.WorldSizeMedium', w: 6400, h: 1800, icon: 'UI_WorldCreation_IconSizeMedium', descKey: 'UI.WorldDescriptionSizeMedium' },
  { labelKey: 'UI.WorldSizeLarge', w: 8400, h: 2400, icon: 'UI_WorldCreation_IconSizeLarge', descKey: 'UI.WorldDescriptionSizeLarge' },
];
const DIFFS: Opt[] = [
  { labelKey: 'UI.Normal', icon: 'UI_WorldCreation_IconDifficultyNormal', descKey: 'UI.WorldDescriptionNormal' },
  { labelKey: 'GameUI.Expert', icon: 'UI_WorldCreation_IconDifficultyExpert', descKey: 'UI.WorldDescriptionExpert' },
  { labelKey: 'UI.Master', icon: 'UI_WorldCreation_IconDifficultyMaster', descKey: 'UI.WorldDescriptionMaster' },
  { labelKey: 'UI.Creative', icon: 'UI_WorldCreation_IconDifficultyCreative', descKey: 'UI.WorldDescriptionCreative' },
];
const EVILS: Array<Opt & { value: -1 | 0 | 1 }> = [
  { labelKey: 'Mods.SandboxWorld.WorldCreation.EvilRandom', icon: 'UI_WorldCreation_IconEvilRandom', descKey: 'UI.WorldDescriptionEvilRandom', value: -1 },
  { labelKey: 'Mods.SandboxWorld.WorldCreation.EvilCorrupt', icon: 'UI_WorldCreation_IconEvilCorruption', descKey: 'UI.WorldDescriptionEvilCorrupt', value: 0 },
  { labelKey: 'Mods.SandboxWorld.WorldCreation.EvilCrimson', icon: 'UI_WorldCreation_IconEvilCrimson', descKey: 'UI.WorldDescriptionEvilCrimson', value: 1 },
];

const CSS = `
.sw-wc-panel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 620px; max-width: 96vw; z-index: 20; cursor: auto;
  opacity: 0.9;   /* 与 .sw-vsel 选择面板同族 90% 微半透（2026-08-25 用户实报缺） */
  color: #e8e8f4; padding: 10px 4px;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
}
.sw-wc-title { text-align: center; font-size: 18px; color: #ffe8a0; margin-bottom: 10px;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-wc-body { display: flex; gap: 14px; }
.sw-wc-main { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.sw-wc-row { display: flex; align-items: center; gap: 8px; }
.sw-wc-row > span { width: 52px; color: #c8d0f0; flex-shrink: 0; }
.sw-wc-row input[type=text] { flex: 1; background: #10142c; border: 1px solid #4a5aa0; color: #fff;
  padding: 6px 8px; border-radius: 4px; font-family: inherit; min-width: 0; }
.sw-wc-rand { background: #232c52; border: 1px solid #3a4680; border-radius: 4px; padding: 4px 8px;
  cursor: pointer; flex-shrink: 0; }
.sw-wc-seedicon { width: 34px; height: 34px; flex-shrink: 0; image-rendering: pixelated; }
.sw-wc-rand img { width: 28px; height: 28px; display: block; image-rendering: pixelated; }
.sw-wc-group { display: flex; flex-direction: column; gap: 2px; }
.sw-wc-grouplabel { color: #b8c0e8; font-size: 13px; }
.sw-wc-opts { display: flex; gap: 8px; }
.sw-wc-opt {
  display: flex; align-items: center; gap: 6px; flex: 1; justify-content: center;
  background: rgb(44, 57, 106); border: 2px solid #3e5195;
  padding: 4px 4px; cursor: pointer; font-family: inherit; color: #e8e8f4;
}
.sw-wc-opt img { width: 32px; height: 32px; image-rendering: pixelated; }
.sw-wc-opt:hover { background: rgb(73, 94, 171); border-color: #ffe745; }
.sw-wc-opt.active { outline: 2px solid #ffe745; background: rgb(73, 94, 171); }
.sw-wc-desc { min-height: 34px; color: #9aa2cc; font-size: 12px; }
.sw-wc-side { width: 132px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.sw-wc-preview { width: 120px; height: 120px; image-rendering: pixelated;
  background: #10142c; border: 2px solid #4a5aa0; border-radius: 4px; }
.sw-wc-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
.sw-wc-footer button {
  color: #e8e8f4; padding: 8px 22px; cursor: pointer; font-family: inherit;
  font-size: 15px;
}
/* ---- 手机适配(2026-08-25,加法式覆盖,桌面 ≥1024×768 全不命中)----
   窄屏(≤700,含 640 宽小屏横屏):预览侧栏从右侧列改为叠在主列上方一行
   (column-reverse 保持 DOM 序=侧栏在后),选项钮标签缩号防挤压;
   input 16px 防 iOS 聚焦自动放大。矮横屏(max-height:500):面板内滚兜底 */
@media (max-width: 700px) {
  .sw-wc-body { flex-direction: column-reverse; }
  .sw-wc-side { width: 100%; flex-direction: row; justify-content: center; }
  .sw-wc-opt span { font-size: 13px; }
  .sw-wc-row input[type=text] { font-size: 16px; }
  .sw-wc-panel { translate: 0 var(--kb-shift, 0px); transition: translate .15s; }
}
@media (max-height: 500px) {
  .sw-wc-panel { max-height: 96vh; overflow-y: auto; overscroll-behavior: contain;
    translate: 0 var(--kb-shift, 0px); transition: translate .15s; }
  /* 矮横屏(375-430 高)纵向体量压缩——★保持双列(覆盖 A 档堆叠:矮屏双列更矮,
   * SE 横屏 375 实测堆叠会把邪恶组+footer 折叠出屏),目标全面板一屏放下,
   * overflow-y 仅作极端字号/语言兜底 */
  .sw-wc-body { flex-direction: row; }
  .sw-wc-side { width: 118px; flex-direction: column; }
  .sw-wc-preview { width: 88px; height: 88px; }
  .sw-wc-title { margin-bottom: 4px; font-size: 16px; }
  .sw-wc-main { gap: 5px; }
  .sw-wc-row input[type=text] { padding: 3px 8px; font-size: 16px; }
  .sw-wc-grouplabel { font-size: 12px; }
  .sw-wc-opt { padding: 2px 4px; }
  .sw-wc-opt img { width: 24px; height: 24px; }
  .sw-wc-desc { min-height: 14px; font-size: 11px; }
  .sw-wc-footer { margin-top: 5px; }
  .sw-wc-footer button { padding: 4px 14px; font-size: 14px; }
}
`;

const SEED_ICON: Record<string, string> = {
  everything: 'Seed_Everything', drunkWorld: 'Seed_Drunk', notTheBees: 'Seed_NotTheBees',
  getGoodWorld: 'Seed_ForTheWorthy', theConstant: 'Seed_TheConstant', skyblock: 'Seed_Skyblock',
  tenthAnniversary: 'Seed_Celebration', noTraps: 'Seed_NoTraps', remix: 'Seed_Remix',
};

export class WorldCreationPanel {
  private panel: HTMLElement;
  private desc: HTMLElement;
  private preview: HTMLCanvasElement;
  private previewCtx: CanvasRenderingContext2D;
  // 模块级:语言切换重建面板时恢复用户选择
  private static lastSel = { size: 0, diff: 0, evil: 0 };   // 默认小世界(2026-08-26 用户要求;会话内仍记忆用户上次选择)
  private sel = { ...WorldCreationPanel.lastSel };

  constructor(parent: HTMLElement, private flow: WorldCreationFlow) {
    ensureVanillaKit();
    // 样式表每次挂载都刷新(★HMR 期守卫只建不更,旧 CSS 驻留吞变更——同 TitleMenu)
    let style = document.getElementById('sw-wc-style') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'sw-wc-style';
      document.head.appendChild(style);
    }
    style.textContent = CSS;
    this.panel = document.createElement('div');
    this.panel.className = 'sw-wc-panel sw-vpanel';
    this.panel.innerHTML = `
      <div class="sw-wc-title">${Lang.text('LegacyMenu.47')}</div>
      <div class="sw-wc-body">
        <div class="sw-wc-main">
          <div class="sw-wc-row"><span>${Lang.text('UI.WorldCreationName')}</span><input type="text" data-f="name" maxlength="27"><button class="sw-wc-rand" data-act="randname" title="${Lang.text('UI.WorldCreationRandomizeNameDescription')}"><img src="sprites/vanilla-ui/UI_WorldCreation_IconRandomName.png"></button></div>
          <div class="sw-wc-row"><span>${Lang.text('UI.WorldCreationSeed')}</span><input type="text" data-f="seed" maxlength="40" placeholder="${Lang.text('UI.WorldCreationSeedEmpty').replace(/^[<：: ]+|[>]+$|\s*[：:]\s*$/g, '')}"><button class="sw-wc-rand" data-act="randseed" title="${Lang.text('UI.WorldCreationRandomizeSeedDescription')}"><img src="sprites/vanilla-ui/UI_WorldCreation_IconRandomSeed.png"></button><img class="sw-wc-seedicon" src="sprites/vanilla-ui/UI_WorldCreation_Seed_Normal.png"></div>
          <div class="sw-wc-group"><div class="sw-wc-grouplabel">${Lang.text('UI.WorldCreationSize')}</div><div class="sw-wc-opts" data-g="size"></div></div>
          <div class="sw-wc-group"><div class="sw-wc-grouplabel">${Lang.text('UI.WorldCreationDifficulty')}</div><div class="sw-wc-opts" data-g="diff"></div></div>
          <div class="sw-wc-group"><div class="sw-wc-grouplabel">${Lang.text('UI.WorldCreationEvil')}</div><div class="sw-wc-opts" data-g="evil"></div></div>
          <div class="sw-wc-desc"></div>
        </div>
        <div class="sw-wc-side"><canvas class="sw-wc-preview" width="84" height="84"></canvas></div>
      </div>
      <div class="sw-wc-footer"><button data-act="back" class="sw-vbtn">${Lang.text('UI.Back')}</button><button data-act="create" class="sw-vbtn">${Lang.text('UI.Create')}</button></div>
    `;
    (this.panel.querySelector('[data-f=name]') as HTMLInputElement).value = randomWorldName();
    this.desc = this.panel.querySelector('.sw-wc-desc')!;
    this.preview = this.panel.querySelector('.sw-wc-preview')!;
    this.previewCtx = this.preview.getContext('2d')!;
    this.previewCtx.imageSmoothingEnabled = false;

    // 选项组
    this.buildGroup('size', SIZES);
    this.buildGroup('diff', DIFFS);
    this.buildGroup('evil', EVILS);
    this.refresh();

    this.panel.querySelector('[data-act=randname]')!.addEventListener('click', () => {
      (this.panel.querySelector('[data-f=name]') as HTMLInputElement).value = randomWorldName();
    });
    this.seedIcon = this.panel.querySelector('.sw-wc-seedicon') as unknown as HTMLImageElement;
    this.panel.querySelector('[data-act=randseed]')!.addEventListener('click', () => {
      (this.panel.querySelector('[data-f=seed]') as HTMLInputElement).value = String(Math.floor(Math.random() * 1e9));
      this.refreshSeedIcon();
    });
    (this.panel.querySelector('[data-f=seed]') as HTMLInputElement).addEventListener('input', () => this.refreshSeedIcon());
    this.panel.querySelector('[data-act=back]')!.addEventListener('click', () => this.close(flow.onCancel));
    this.panel.querySelector('[data-act=create]')!.addEventListener('click', () => this.submit());
    this.escHandler = (e: KeyboardEvent) => { if (e.code === 'Escape') this.close(flow.onCancel); };
    window.addEventListener('keydown', this.escHandler);
    this.unsubKb = bindKeyboardShift(this.panel);   // 移动端键盘遮挡补偿
    this.unsubLang = Lang.onChange(() => this.rebuild());
    parent.appendChild(this.panel);
  }

  private unsubLang: (() => void) | null = null;
  private unsubKb: (() => void) | null = null;

  /** 语言切换 → 重建面板(保留 sel/世界名/种子输入) */
  private rebuild() {
    const name = (this.panel.querySelector('[data-f=name]') as HTMLInputElement).value;
    const seed = (this.panel.querySelector('[data-f=seed]') as HTMLInputElement).value;
    WorldCreationPanel.lastSel = { ...this.sel };
    const parent = this.panel.parentElement;
    this.close(() => {});
    if (parent) new WorldCreationPanel(parent, this.flow);
    requestAnimationFrame(() => {
      const p = document.querySelector('.sw-wc-panel');
      if (!p) return;
      (p.querySelector('[data-f=name]') as HTMLInputElement).value = name;
      (p.querySelector('[data-f=seed]') as HTMLInputElement).value = seed;
    });
  }

  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  private buildGroup(g: 'size' | 'diff' | 'evil', opts: Opt[]) {
    const box = this.panel.querySelector(`[data-g=${g}]`)!;
    opts.forEach((o, i) => {
      const b = document.createElement('div');
      b.className = 'sw-wc-opt';
      b.innerHTML = `<img src="sprites/vanilla-ui/${o.icon}.png"><span>${Lang.text(o.labelKey)}</span>`;
      b.addEventListener('click', () => { this.sel[g] = i; this.refresh(); });
      b.addEventListener('mouseenter', () => { this.desc.textContent = Lang.text(o.descKey); });
      box.appendChild(b);
    });
  }

  private refresh() {
    // 高亮
    const mark = (g: 'size' | 'diff' | 'evil', idx: number) => {
      this.panel.querySelectorAll(`[data-g=${g}] .sw-wc-opt`).forEach((el, i) => {
        (el as HTMLElement).classList.toggle('active', i === idx);
      });
    };
    mark('size', this.sel.size); mark('diff', this.sel.diff); mark('evil', this.sel.evil);
    this.desc.textContent = '';
    this.drawPreview();
    this.refreshSeedIcon();
  }

  /** 多层预览图（UIWorldCreationPreview.cs 1:1：元素 84×84，
   *  边框 (0,0)、内容层 (4,4)——76×76 恰好嵌在 84 边框的 4px 边内。
   *  曾把 120×120 画布按原尺寸画 → 内容层只有 76²、边框 84²，图小框大） */
  private previewImgs = new Map<string, ImageBitmap | HTMLImageElement>();
  private drawPreview() {
    const ctx = this.previewCtx;
    ctx.clearRect(0, 0, 84, 84);
    const content = [
      ['UI_WorldCreation_PreviewSizeSmall', 'UI_WorldCreation_PreviewSizeMedium', 'UI_WorldCreation_PreviewSizeLarge'][this.sel.size],
      // 此前误写 UI_WWorldCreation_*(双 W)→ 四个难度层 404,预览缺难度层像"错位"
      ['UI_WorldCreation_PreviewDifficultyNormal2', 'UI_WorldCreation_PreviewDifficultyExpert2', 'UI_WorldCreation_PreviewDifficultyMaster2', 'UI_WorldCreation_PreviewDifficultyCreative2'][this.sel.diff],
      // 同 :200 双 W typo 漏修分支(2026-08-13 枚举 review 实锤)——邪恶层曾 404
      ['UI_WorldCreation_PreviewEvilRandom', 'UI_WorldCreation_PreviewEvilCorruption', 'UI_WorldCreation_PreviewEvilCrimson'][this.sel.evil],
    ];
    const border = 'UI_WorldCreation_PreviewBorder';
    // 贴图缓存 + 全层重画（onload 乱序到达也不串层）
    const draw = () => {
      ctx.clearRect(0, 0, 84, 84);
      for (const key of content) {
        const im = this.previewImgs.get(key);
        const ime = im as unknown as HTMLImageElement | undefined;
        if (ime?.complete && ime.width) ctx.drawImage(ime, 4, 4);
      }
      const b = this.previewImgs.get(border);
      const be = b as unknown as HTMLImageElement | undefined;
      if (be?.complete && be.width) ctx.drawImage(be, 0, 0);
    };
    for (const key of [...content, border]) {
      if (this.previewImgs.has(key)) continue;
      const im = new Image();
      im.onload = () => draw();
      im.src = `sprites/vanilla-ui/${key}.png`;
      this.previewImgs.set(key, im);
    }
    draw();
  }

  private seedIcon: ImageBitmap | HTMLImageElement;
  /** 上次解析的种子图标键——menu_accept 的「首次命中」判定基线 */
  private lastSeedKey = '';
  private refreshSeedIcon() {
    const seed = (this.panel.querySelector('[data-f=seed]') as HTMLInputElement).value.trim();
    const { flags } = parseSeed(seed);
    const key = flags.everything ? 'Seed_Everything'
      : flags.drunkWorld ? 'Seed_Drunk'
      : flags.notTheBees ? 'Seed_NotTheBees'
      : flags.getGoodWorld ? 'Seed_ForTheWorthy'
      : flags.theConstant ? 'Seed_TheConstant'
      : flags.skyblock ? 'Seed_Skyblock'
      : flags.tenthAnniversary ? 'Seed_Celebration'
      : flags.noTraps ? 'Seed_NoTraps'
      : flags.remix ? 'Seed_Remix'
      : flags.vampireSeed ? 'Seed_Secret'   // 秘密种子通用图标（吸血鬼 1.4.5 无专属图标）
      : 'Seed_Normal';
    // 输入即响（UIWorldCreation.cs:842 输入回调内 CheckInputForSecretSeed 命中且未启用 →
    //   WorldGen.SecretSeed.Enable(secretSeed)（WorldGen.cs:532-546,playSound 缺省 true）
    //   → SoundEngine.PlaySound(seed._sound)；全部秘密种子 _sound=SoundID.MenuAccept
    //   （WorldGen.cs:341-379 Register 统一传参））。本仓 parseSeed 是纯函数无 Enabled
    //   生命周期,以「图标键从普通切到任一秘密种子」为首次命中拍——同键续敲/回改普通不重播
    if (key !== this.lastSeedKey && key !== 'Seed_Normal') {
      UISfx.sfx.playWavFile('menu_accept');
    }
    this.lastSeedKey = key;
    (this.seedIcon as HTMLImageElement).src = `sprites/vanilla-ui/UI_WorldCreation_${key}.png`;
  }

  private submit() {
    const size = SIZES[this.sel.size];
    const seed = (this.panel.querySelector('[data-f=seed]') as HTMLInputElement).value.trim();
    const name = (this.panel.querySelector('[data-f=name]') as HTMLInputElement).value.trim()
      || parseSeed(seed).specialName || Lang.text('Mods.SandboxWorld.WorldCreation.DefaultName');
    this.close(() => this.flow.onCreate({ name, seed, w: size.w, h: size.h, size: this.sel.size, difficulty: this.sel.diff, evil: EVILS[this.sel.evil].value }));
  }

  private close(fn: () => void) {
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler);
    this.unsubKb?.();
    this.unsubLang?.();
    this.panel.remove();
    fn();
  }
}
