// 角色创建页（DOM 版，M2.5 重写；2026-08 布局层对齐原版 UICharacterCreation 1.4.5.6）：
//  · 面板底 = Inventory_Back13 九宫染色（Utils.DrawInvBG :2672-2691，同暂停菜单 invBgDataUrl）
//  · 角色预览移出面板，站立在面板上沿世界背景中（MakeCharPreview :236-250，UICharacter
//    Top=-70 悬于面板上方 + 行走动画；本仓放大 3x）——全页唯一 canvas（角色渲染管线）
//  · 顶部图标页签条 = UIColoredImageButton 44×44（MakeCategoriesBar :732-770）：
//    CategoryPanel 底常态 0.4 暗、悬停 CategoryPanelBorder 金框、选中 CategoryPanelHighlight
//    亮底；条下 UIHorizontalSeparator 分隔线（:772-781，Separator1 × Lerp(White,(63,65,151),.85)*.9）
//    ——原版 10 页签（7 色钮+服装+发型+信息），本仓把 7 个颜色页签合并为 1 个颜色页
//    （页内一行部位选择钮，语义不变）；页签图标 = CSS mask 贴图 + background-color 染色
//    （外观页签 = ColorCharacter 七层剪影逐层染色，同 _clothingStylesCategoryButton_OnUpdate :803-812）
//  · 信息页 = 名字条（UICharacterNameButton :848-867，CategoryPanel×White*.5 长条）+
//    竖排四难度钮（UIDifficultyButton :871-935，PanelGrayscale × Lerp(Black,color,.8)*.5，
//    选中内衬 Lerp(color,White,.7)*.5）+ 右侧描述气泡（CategoryPanelHighlight×LightGray*.7
//    :880-890，文案 LegacyMenu.29/30/31 + UI.CreativeDescriptionPlayer :949-967）+
//    性别两钮（本仓自有——原版性别走服装页签）
//  · 外观页 = UIClothStyleButton 44×80 十连排（:311-335）+ 复制/粘贴/随机外观模板小钮
//    （:396-430，SmallPanel 底 + Copy/Paste/Randomize 20×20 图标）
//  · 发型页 = UIHairStyleButton 44×44 网格 10 列 46px 栅格（MakeHairstylesMenu :254-304）+
//    滚动条；下沿 翻页箭头（TexturePackButtons 下排两帧，原版语音箭头位）+ 音符随机发型
//    （Voice 图标；本仓语义：箭头=上一个/下一个发型、音符=随机发型）
//  · 颜色页 = 部位选择行（原版为页签条七色钮 ColorHair/ColorEye/... 染当前色）+ HSL 三滑杆
//    （UIColoredSlider.DrawValueBar :107-164：ColorBar 框 + 167×ColorBlip 渐变条 + ColorSlider
//    滑块；渐变随当前 HSL 联动 :1130-1141——DOM 实现：ColorBar 底 + linear-gradient 填充 +
//    ColorSlider 滑块 img）+ HEX 显示 + 复制/粘贴 HEX/随机（Click_CopyHex :1337 等）
//  · 缩略图（发型 213 格/外观 10 格）= 纸娃娃管线烘一张 sprite sheet（dataURL）→
//    格子用 CSS background-position 切片（组件本身零 canvas；色变防抖 250ms 重烘）
// 数据流与回调（onCreate/onCancel/dresser 更衣窗/salon 理发窗/priceOf 报价/appearance 字段/
// 剪贴板模板）与旧版一致；探针兼容：根节点保留 .sw-char-panel、名字输入保留
// .sw-char-row input[type=text]、创建按钮保留 [data-act=create]。
import {
  type Appearance, type RGBColor, randomAppearance, DIFFICULTY_INFO,
  VALID_CLOTH_STYLES, CHAR_CREATION_HAIRS, hslToRgb, rgbToHsl,
} from '../player/Appearance';
import { compositePaperDoll, dollFrame, walkFrame, IDLE_FRAME } from '../player/PaperDoll';
import { Lang } from '../i18n/Lang';
import { ensureVanillaKit } from './vanillaKit';
import { formatCopper } from './NpcDialog';
import { randomPlayerName } from '../i18n/RandomText';
import { UISfx } from '../vui/UISfx';

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
  /** 造型师理发窗（Main.OpenHairWindow Main.cs:43073-43081）：仅发型+发色两页签，
   *  确认=购买（付费改名目走 priceOf 实时显示，GameUI.BuyWithValue）；取消回退。
   *  priceOf = 当前改动报价（铜币；Main.cs:43198-43211 逐行） */
  hairSalon?: boolean;
  priceOf?: (a: Appearance) => number;
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

/** 部位 → 页签条七色钮贴图（MakeCategoriesBar :737-743；兼作 CSS mask 类生成表） */
const PART_TEX: Array<[keyof Appearance, string]> = [
  ['hairColor', 'ColorHair'], ['eyeColor', 'ColorEye'], ['skinColor', 'ColorSkin'],
  ['shirtColor', 'ColorShirt'], ['undershirtColor', 'ColorUndershirt'],
  ['pantsColor', 'ColorPants'], ['shoeColor', 'ColorShoes'],
];

// ================= 原版贴图小工具 =================

type Img = HTMLImageElement;
const UI_TEX = (n: string) => `sprites/vanilla-ui/UI_CharCreation_${n}.png`;
const VAN_TEX = (n: string) => `sprites/vanilla/${n}.png`;

const imgPromises = new Map<string, Promise<Img>>();
function loadImg(src: string): Promise<Img> {
  let p = imgPromises.get(src);
  if (!p) {
    p = new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('img load fail: ' + src));
      img.src = src;
    });
    imgPromises.set(src, p);
  }
  return p;
}

/** 白模染色（multiply + destination-in 半透明回贴 = XNA Color*float 同乘 RGBA）→ dataURL。
 *  仅用于生成 CSS 变量里的静态染色底板（面板条/气泡/分隔线/难度钮），不落组件 canvas */
const tintDataCache = new Map<string, string>();
function tintedDataUrl(img: Img, r: number, g: number, b: number, aMul = 1): string {
  const key = `${img.src}|${r},${g},${b},${aMul}`;
  const hit = tintDataCache.get(key);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.imageSmoothingEnabled = false;
  c.drawImage(img, 0, 0);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = `rgb(${r},${g},${b})`;
  c.fillRect(0, 0, cv.width, cv.height);
  c.globalCompositeOperation = 'destination-in';
  c.globalAlpha = aMul;
  c.drawImage(img, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  const url = cv.toDataURL();
  tintDataCache.set(key, url);
  return url;
}

/** XNA Color.Lerp（逐通道 Round） */
const lerpC = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

const VAR_STYLE_ID = 'sw-char-vars';
function injectVars(entries: Array<[string, string]>): void {
  let st = document.getElementById(VAR_STYLE_ID);
  if (!st) {
    st = document.createElement('style');
    st.id = VAR_STYLE_ID;
    document.head.appendChild(st);
  }
  st.textContent = ':root{' + entries.map(([k, v]) => `${k}:${v};`).join('') + '}';
}

/** 按钮 chrome 所需的染色底板（幂等；完成后给面板盖 ready 章 → 显形 mask 染色图标） */
let assetsPromise: Promise<void> | null = null;
function prepareAssets(): Promise<void> {
  if (assetsPromise) return assetsPromise;
  assetsPromise = (async () => {
    const [cat, hl, gray, small, sep] = await Promise.all(
      ['CategoryPanel', 'CategoryPanelHighlight', 'PanelGrayscale', 'SmallPanel', 'Separator1']
        .map((n) => loadImg(UI_TEX(n))));
    const v: Array<[string, string]> = [
      ['--cc-catpanel', `url(${UI_TEX('CategoryPanel')})`],
      ['--cc-catborder', `url(${UI_TEX('CategoryPanelBorder')})`],
      ['--cc-cathl', `url(${UI_TEX('CategoryPanelHighlight')})`],
      ['--cc-smallpanel', `url(${UI_TEX('SmallPanel')})`],
      ['--cc-smallborder', `url(${UI_TEX('SmallPanelBorder')})`],
      // 名字条/性别钮/外观钮：CategoryPanel × White*0.5（UICharacterNameButton.DrawSelf :62）
      ['--cc-namebar', `url(${tintedDataUrl(cat, 255, 255, 255, 0.5)})`],
      // 难度描述气泡：CategoryPanelHighlight × LightGray(211,211,211)*0.7（MakeInfoMenu :889）
      ['--cc-bubble', `url(${tintedDataUrl(hl, Math.round(211 * 0.7), Math.round(211 * 0.7), Math.round(211 * 0.7), 0.7)})`],
      // 页签条下分隔线：Separator1 × Lerp(White,(63,65,151),.85)*.9（MakeCategoriesBar :779）
      ['--cc-sep', `url(${tintedDataUrl(sep, lerpC(255, 63, 0.85), lerpC(255, 65, 0.85), lerpC(255, 151, 0.85), 0.9)})`],
      // HEX 面板：SmallPanel × White*0.55
      ['--cc-hexbg', `url(${tintedDataUrl(small, 255, 255, 255, 0.55)})`],
    ];
    // 四难度钮：PanelGrayscale × Lerp(Black,color,.8)*.5 / 选中内衬 Lerp(color,White,.7)*.5
    // （UIDifficultyButton.DrawSelf :51-60；颜色表 = DIFFICULTY_INFO 同 UIDifficultyButton 传参）
    DIFFICULTY_INFO.forEach((d, i) => {
      v.push([`--cc-diff${i}`, `url(${tintedDataUrl(gray, lerpC(0, d.color.r, 0.8), lerpC(0, d.color.g, 0.8), lerpC(0, d.color.b, 0.8), 0.5)})`]);
      v.push([`--cc-diff${i}sel`, `url(${tintedDataUrl(gray, lerpC(d.color.r, 255, 0.7), lerpC(d.color.g, 255, 0.7), lerpC(d.color.b, 255, 0.7), 0.5)})`]);
    });
    injectVars(v);
    document.querySelectorAll('.sw-char-panel').forEach((p) => p.classList.add('ready'));
  })();
  return assetsPromise;
}

// ---- Inventory_Back13 九宫面板底（Utils.DrawInvBG；与 UI.ts 暂停菜单同式同染色，
//      此处独立实现——UI.ts 的 invBgDataUrl 模块私有且引它会成环） ----
let invBgImg: Img | null = null;
let invBgTinted: HTMLCanvasElement | null = null;
function invBgEnsure(): Img | null {
  if (typeof Image === 'undefined') return null;
  if (!invBgImg) {
    invBgImg = new Image();
    invBgImg.src = VAN_TEX('Inventory_Back13');
  }
  return invBgImg;
}
function invBgDataUrl(w: number, h: number): string | null {
  const img = invBgEnsure();
  if (!img || !img.complete || !img.naturalWidth) return null;
  if (!invBgTinted) {
    const t = document.createElement('canvas');
    t.width = img.naturalWidth; t.height = img.naturalHeight;
    const tc = t.getContext('2d', { willReadFrequently: true })!;
    tc.imageSmoothingEnabled = false;
    tc.drawImage(img, 0, 0);
    const d = tc.getImageData(0, 0, t.width, t.height);
    const tmul = [33 / 255, 15 / 255, 91 / 255, 0.685];   // IngameOptions 面板色（UI.ts 同款真值）
    for (let i = 0; i < d.data.length; i += 4) {
      d.data[i] = Math.round(d.data[i] * tmul[0]);
      d.data[i + 1] = Math.round(d.data[i + 1] * tmul[1]);
      d.data[i + 2] = Math.round(d.data[i + 2] * tmul[2]);
      d.data[i + 3] = Math.round(d.data[i + 3] * tmul[3]);
    }
    tc.putImageData(d, 0, 0);
    invBgTinted = t;
  }
  const t = invBgTinted, W = t.width, H = t.height;
  const c = document.createElement('canvas');
  c.width = Math.max(20, Math.round(w)); c.height = Math.max(20, Math.round(h));
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.imageSmoothingEnabled = false;
  x.drawImage(t, 0, 0, 10, 10, 0, 0, 10, 10);
  x.drawImage(t, W - 10, 0, 10, 10, c.width - 10, 0, 10, 10);
  x.drawImage(t, 0, H - 10, 10, 10, 0, c.height - 10, 10, 10);
  x.drawImage(t, W - 10, H - 10, 10, 10, c.width - 10, c.height - 10, 10, 10);
  x.drawImage(t, 10, 0, 10, 10, 10, 0, c.width - 20, 10);
  x.drawImage(t, 10, H - 10, 10, 10, 10, c.height - 10, c.width - 20, 10);
  x.drawImage(t, 0, 10, 10, 10, 0, 10, 10, c.height - 20);
  x.drawImage(t, W - 10, 10, 10, 10, c.width - 10, 10, 10, c.height - 20);
  x.drawImage(t, 10, 10, 10, 10, 10, 10, c.width - 20, c.height - 20);
  return c.toDataURL();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function hex(c: RGBColor): string {
  return '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function fromHex(s: string): RGBColor {
  const v = parseInt(s.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

/** 部位 mask 染色图标类（贴图 alpha 作蒙版 + background-color 染色——纯 DOM） */
const PART_MASK_CSS = PART_TEX.map(([k, t]) =>
  `.sw-cc-m-${k}{-webkit-mask-image:url(${UI_TEX(t)});mask-image:url(${UI_TEX(t)});}`).join('');

const CSS = `
:where(.sw-char-panel) :where(button) { font-family: inherit; color: inherit; background: none; border: none; padding: 0; cursor: pointer; }
.sw-char-panel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 500px; max-width: 96vw; z-index: 20; cursor: auto;
  display: flex; flex-direction: column; align-items: center;
  color: #e8e8f4; user-select: none;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
}
.sw-char-title { font-size: 16px; color: #ffe8a0; margin-bottom: 4px;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
/* 角色预览：面板上方世界背景中（MakeCharPreview Top=-70；pointer-events none 防挡页签）
   ——全页唯一 canvas（纸娃娃渲染管线） */
.sw-char-preview { image-rendering: pixelated; pointer-events: none; margin-bottom: -6px; position: relative; z-index: 1; }
/* Inventory_Back13 九宫面板底（Utils.DrawInvBG）；素材未载时退纯色 */
.sw-char-body {
  width: 100%; box-sizing: border-box; padding: 2px 10px 12px;
  background-color: #241a56; background-repeat: no-repeat; background-size: 100% 100%;
  image-rendering: pixelated;
}
/* ---- 图标页签条（UIColoredImageButton 44×44）---- */
.sw-char-tabs { display: flex; justify-content: center; gap: 4px; height: 50px; padding-top: 3px; box-sizing: border-box; }
.sw-cc-tab { position: relative; width: 44px; height: 44px; image-rendering: pixelated; }
.sw-cc-tab::before { content: ''; position: absolute; inset: 0; z-index: 0;
  background: var(--cc-catpanel) center / 100% 100% no-repeat; opacity: 0.4; }
.sw-cc-tab:hover::before { opacity: 1; }
.sw-cc-tab::after { content: ''; position: absolute; inset: 0; z-index: 1; opacity: 0;
  background: var(--cc-catborder) center / 100% 100% no-repeat; }
.sw-cc-tab:hover::after { opacity: 1; }
.sw-cc-tab .hl { position: absolute; inset: 0; z-index: 2; display: none;
  background: var(--cc-cathl) center / 36px 36px no-repeat; }
.sw-cc-tab.active .hl { display: block; }
.sw-cc-tabimg { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3; image-rendering: pixelated; }
/* CSS mask 染色图标（贴图 alpha 蒙版 + background-color；ready 前隐防色块闪现） */
.sw-cc-ico { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3; }
.sw-cc-ico > i, .sw-cc-ico > img { position: absolute; inset: 0; width: 100%; height: 100%; }
.sw-cc-ico > img { image-rendering: pixelated; }
.sw-cc-tint { visibility: hidden; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%; mask-size: 100% 100%; -webkit-mask-position: 0 0; mask-position: 0 0; }
.sw-char-panel.ready .sw-cc-tint { visibility: visible; }
.sw-cc-m-cc { -webkit-mask-size: 26px 238px; mask-size: 26px 238px; }
${PART_MASK_CSS}
/* 页签条下分隔线（UIHorizontalSeparator：Separator1 边 2 拉伸） */
.sw-char-sep { width: 100%; height: 4px; margin-bottom: 4px; box-sizing: border-box;
  border: 2px solid transparent; border-image: var(--cc-sep) 2 fill stretch; image-rendering: pixelated; }
.sw-char-content { height: 240px; overflow: hidden; position: relative; }
/* ---- 底部宽按钮（UITextPanel：50%-10 × 50px 并排）---- */
.sw-char-footer { display: flex; justify-content: center; gap: 20px; width: 100%; margin-top: 6px; }
.sw-char-footer .sw-vbtn { width: calc(50% - 10px); height: 44px; font-size: 15px; letter-spacing: 2px; }
/* ---- 信息页 ---- */
.sw-cc-info { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding-top: 2px; }
.sw-cc-namebar { position: relative; height: 40px; box-sizing: border-box; flex: none;
  display: flex; align-items: center; gap: 8px; padding: 0 4px 0 10px; cursor: text;
  border: 10px solid transparent; border-image: var(--cc-namebar) 10 fill stretch; }
.sw-cc-namebar::after { content: ''; position: absolute; inset: -10px; pointer-events: none; opacity: 0;
  border: 10px solid transparent; border-image: var(--cc-catborder) 10 fill stretch; }
.sw-cc-namebar:focus-within::after { opacity: 1; }
.sw-cc-namelbl { flex: none; color: #cfd6f4; }
.sw-cc-nameval { position: relative; flex: 1; height: 100%; display: flex; align-items: center; min-width: 0; }
.sw-cc-nameval-text { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.sw-cc-nameval-text.empty { color: #8b93b8; }
.sw-cc-nameval input[type=text] { position: absolute; inset: 0; width: 100%; height: 100%;
  opacity: 0; border: none; padding: 0; margin: 0; background: none; cursor: text; }
.sw-cc-infolow { display: flex; gap: 8px; margin-top: 8px; flex: 1; min-height: 0; }
.sw-cc-diffs { width: 42%; flex: none; display: flex; flex-direction: column; gap: 3px; }
/* 底板走 ::before（元素本身无边框）——绝对定位子层(.sel/文字)按 padding box
 *  解析,元素带 border-image 边框会把子层整体挤偏 10px（实测勘误） */
.sw-cc-diff, .sw-cc-gbtn { position: relative; box-sizing: border-box; image-rendering: pixelated; text-align: center; }
.sw-cc-diff { flex: 1; }
.sw-cc-diff::before { content: ''; position: absolute; inset: 0;
  border: 10px solid transparent; border-image: var(--cc-diffbase) 10 fill stretch; }
.sw-cc-gbtn::before { content: ''; position: absolute; inset: 0;
  border: 10px solid transparent; border-image: var(--cc-namebar) 10 fill stretch; }
.sw-cc-diff::after, .sw-cc-gbtn::after { content: ''; position: absolute; inset: 0; opacity: 0; pointer-events: none;
  border: 10px solid transparent; border-image: var(--cc-catborder) 10 fill stretch; }
.sw-cc-diff:hover::after, .sw-cc-gbtn:hover::after { opacity: 1; }
.sw-cc-diff .sel, .sw-cc-gbtn .sel { position: absolute; inset: 7px; display: none; pointer-events: none; box-sizing: border-box;
  border: 10px solid transparent; border-image: var(--cc-diffsel) 10 fill stretch; }
.sw-cc-gbtn .sel { border-image: var(--cc-cathl) 10 fill stretch; }
.sw-cc-diff.active .sel, .sw-cc-gbtn.active .sel { display: block; }
.sw-cc-difftxt, .sw-cc-gbtntxt { position: absolute; left: 0; right: 0; top: 4px; z-index: 1;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-cc-diffdesc { flex: 1; min-width: 0; box-sizing: border-box; display: flex; align-items: center;
  border: 10px solid transparent; border-image: var(--cc-bubble) 10 fill stretch;
  padding: 2px 4px; font-size: 12px; line-height: 1.6; color: #fff;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-cc-gender { flex: none; height: 30px; margin-top: 8px; display: flex; align-items: stretch; gap: 8px; }
.sw-cc-genderlbl { flex: none; align-self: center; color: #cfd6f4; }
.sw-cc-gbtn { width: 90px; }
/* ---- 外观页（UIClothStyleButton 44×80 十连排）---- */
.sw-cc-look { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; height: 100%; }
.sw-cc-styles { display: flex; gap: 2px; }
.sw-cc-stylebtn { position: relative; width: 44px; height: 80px; image-rendering: pixelated; }
.sw-cc-stylebtn::before { content: ''; position: absolute; inset: 0;
  border: 10px solid transparent; border-image: var(--cc-namebar) 10 fill stretch; }
.sw-cc-stylebtn::after { content: ''; position: absolute; inset: 0; z-index: 2; opacity: 0; pointer-events: none;
  border: 10px solid transparent; border-image: var(--cc-catborder) 10 fill stretch; }
.sw-cc-stylebtn:hover::after { opacity: 1; }
.sw-cc-stylebtn .hl { position: absolute; inset: 3px; z-index: 1; display: none; pointer-events: none; box-sizing: border-box;
  border: 10px solid transparent; border-image: var(--cc-cathl) 10 fill stretch; }
.sw-cc-stylebtn .sw-cc-thumb { z-index: 3; }
.sw-cc-stylebtn.active .hl { display: block; }
/* 缩略图 = 烘焙 sprite sheet 的 background-position 切片（组件零 canvas） */
.sw-cc-thumb { position: absolute; inset: 0; background-repeat: no-repeat; image-rendering: pixelated; }
.sw-cc-looklow { display: flex; gap: 10px; }
/* ---- 小方钮（UIColoredImageButton isSmall：SmallPanel 32×32 底）---- */
.sw-cc-small, .sw-cc-part { position: relative; width: 32px; height: 32px; image-rendering: pixelated; }
.sw-cc-small::before, .sw-cc-part::before { content: ''; position: absolute; inset: 0; z-index: 0;
  background: var(--cc-smallpanel) center / 100% 100% no-repeat; opacity: 0.5; }
.sw-cc-small:hover::before, .sw-cc-part:hover::before { opacity: 1; }
.sw-cc-small::after, .sw-cc-part::after { content: ''; position: absolute; inset: 0; z-index: 1; opacity: 0;
  background: var(--cc-smallborder) center / 100% 100% no-repeat; }
.sw-cc-small:hover::after, .sw-cc-part:hover::after { opacity: 1; }
.sw-cc-part .hl { position: absolute; inset: 0; z-index: 2; display: none;
  background: var(--cc-cathl) center / 36px 36px no-repeat; }
.sw-cc-part.active .hl { display: block; }
.sw-cc-small > img, .sw-cc-part > i { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3; }
.sw-cc-small > img { image-rendering: pixelated; }
.sw-cc-part > i { width: 30px; height: 30px; }
/* ---- 发型页（UIHairStyleButton 44×44 网格 + 滚动）---- */
.sw-cc-hair { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; padding-top: 2px; }
.sw-cc-hairgrid { flex: 1; min-height: 0; overflow-y: auto; display: grid;
  grid-template-columns: repeat(10, 44px); gap: 4px 2px; justify-content: center; align-content: start;
  padding: 2px 14px 4px 2px; scrollbar-width: thin; scrollbar-color: #4a5aa0 rgba(10, 14, 40, 0.6); }
.sw-cc-hairgrid::-webkit-scrollbar { width: 12px; }
.sw-cc-hairgrid::-webkit-scrollbar-track { background: rgba(10, 14, 40, 0.6); }
.sw-cc-hairgrid::-webkit-scrollbar-thumb { background: #4a5aa0; border: 2px solid #232c52; }
.sw-cc-hairbtn { position: relative; width: 44px; height: 44px; image-rendering: pixelated; }
.sw-cc-hairbtn::before { content: ''; position: absolute; inset: 0; z-index: 0;
  background: var(--cc-catpanel) center / 100% 100% no-repeat; opacity: 0.4; }
.sw-cc-hairbtn:hover::before { opacity: 1; }
.sw-cc-hairbtn::after { content: ''; position: absolute; inset: 0; z-index: 3; opacity: 0;
  background: var(--cc-catborder) center / 100% 100% no-repeat; }
.sw-cc-hairbtn:hover::after { opacity: 1; }
.sw-cc-hairbtn .hl { position: absolute; inset: 0; z-index: 2; display: none;
  background: var(--cc-cathl) center / 36px 36px no-repeat; }
.sw-cc-hairbtn.active .hl { display: block; }
.sw-cc-hairbtn .sw-cc-thumb { z-index: 1; }
.sw-cc-hairlow { flex: none; height: 34px; display: flex; justify-content: center; align-items: center; gap: 12px; }
.sw-cc-arrow { position: relative; width: 32px; height: 32px; image-rendering: pixelated; }
.sw-cc-arrow:hover { outline: 2px solid #ffe745; }
.sw-cc-arrowico { position: absolute; inset: 0; image-rendering: pixelated;
  background-image: url(sprites/vanilla-ui/UI_TexturePackButtons.png); background-repeat: no-repeat; }
/* ---- 颜色页（部位选择 + HSL 三滑杆 + HEX；全 DOM）---- */
.sw-cc-color { display: flex; flex-direction: column; align-items: center; justify-content: space-between; height: 100%; box-sizing: border-box; padding-top: 2px; }
.sw-cc-parts { display: flex; gap: 5px; }
.sw-cc-sliders { display: flex; flex-direction: column; }
.sw-cc-slider { position: relative; width: 356px; height: 52px; cursor: pointer; touch-action: none; }
.sw-cc-sliderbar { position: absolute; left: 0; top: 10px; width: 356px; height: 32px; image-rendering: pixelated;
  background: url(sprites/vanilla/ColorBar.png) 0 0 / 100% 100% no-repeat; }
.sw-cc-sliderfill { position: absolute; left: 10px; top: 18px; width: 334px; height: 16px; }
.sw-cc-sliderknob { position: absolute; top: 1px; width: 22px; height: 50px; image-rendering: pixelated; pointer-events: none; }
.sw-cc-colorlow { display: flex; align-items: center; gap: 10px; }
.sw-cc-hex { width: 112px; height: 32px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
  border: 8px solid transparent; border-image: var(--cc-hexbg) 8 fill stretch;
  font-size: 14px; letter-spacing: 1px; color: #fff; user-select: text; cursor: text;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
`;

export class CharCreation {
  private panel: HTMLElement;          // 根容器（保留 .sw-char-panel 类 = 探针锚点）
  private appearance: Appearance;
  private clipboard: Appearance | null = null;
  private previewCanvas: HTMLCanvasElement;
  private previewCtx: CanvasRenderingContext2D;
  private raf = 0;
  private time = 0;
  private content: HTMLElement;
  private tab = 'info';
  private dresser = false;   // 梳妆台更衣窗形态（无信息/发型页签，确认=更改）
  private salon = false;     // 造型师理发窗形态（发型+发色，确认=付费购买）
  private priceOf: ((a: Appearance) => number) | null = null;
  /** 颜色页当前编辑部位（原版为页签条七色钮选中态；本仓合并为页内选择行） */
  private colorPart: keyof Appearance = 'hairColor';
  private hsl: [number, number, number] = [0, 0, 0];
  private hexLabel: HTMLElement | null = null;
  private sliderFills: Array<HTMLElement | null> = [null, null, null];
  private sliderKnobs: Array<HTMLElement | null> = [null, null, null];
  /** 页签染色图标层（CSS mask + background-color，随外观刷新） */
  private lookTabLayers: HTMLElement[] = [];
  private hairTabLayer: HTMLElement | null = null;
  private colorTabLayer: HTMLElement | null = null;
  private partTints = new Map<keyof Appearance, HTMLElement>();
  /** 烘焙缩略图 sprite sheet（dataURL；格子 background-position 切片） */
  private hairSheetUrl: string | null = null;
  private lookSheetUrl: string | null = null;
  private sheetTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private lastHex = '';

  constructor(private root: HTMLElement, private cb: CharCreationCallbacks, opts: CharCreationOptions = {}) {
    ensureVanillaKit();
    this.dresser = opts.dresser === true;
    this.salon = opts.hairSalon === true;
    this.priceOf = opts.priceOf ?? null;
    this.appearance = opts.initial
      ? { ...structuredClone(opts.initial) }        // 更衣/理发窗：现外观为底稿（确认才生效）
      : randomAppearance();
    const firstColor = COLOR_ROWS.find((r) => !(this.dresser && !r.dresser) && !(this.salon && r.key !== 'hairColor'));
    this.colorPart = firstColor ? firstColor.key : 'hairColor';
    this.syncHslFromPart();

    if (!document.getElementById('sw-char-style')) {
      const style = document.createElement('style');
      style.id = 'sw-char-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const title = this.dresser ? Lang.text('Mods.SandboxWorld.ClothesWindow.Title')
      : this.salon ? Lang.text('GameUI.HairStyle') : '';
    this.panel = document.createElement('div');
    this.panel.className = 'sw-char-panel';
    this.panel.innerHTML = `
      ${title ? `<div class="sw-char-title">${title}</div>` : ''}
      <canvas class="sw-char-preview" width="120" height="168"></canvas>
      <div class="sw-char-body">
        <div class="sw-char-tabs"></div>
        <div class="sw-char-sep"></div>
        <div class="sw-char-content"></div>
      </div>
      <div class="sw-char-footer">
        <button class="sw-vbtn" data-act="back"></button>
        <button class="sw-vbtn" data-act="create"></button>
      </div>
    `;
    this.root.appendChild(this.panel);
    this.previewCanvas = this.panel.querySelector('.sw-char-preview')!;
    this.previewCtx = this.previewCanvas.getContext('2d')!;
    this.previewCtx.imageSmoothingEnabled = false;
    this.content = this.panel.querySelector('.sw-char-content')!;
    this.tab = this.dresser ? 'look' : this.salon ? 'hair' : 'info';

    this.buildTabs();
    this.panel.querySelector('[data-act=back]')!.addEventListener('click', () => this.close(this.cb.onCancel));
    this.panel.querySelector('[data-act=create]')!.addEventListener('click', () => {
      // 更衣窗不改姓名/难度/发型；理发窗只改发型+发色（其余全保底稿）
      if (this.dresser && opts.initial) {
        this.appearance.name = opts.initial.name;
        this.appearance.difficulty = opts.initial.difficulty;
        this.appearance.hair = opts.initial.hair;
      } else if (this.salon && opts.initial) {
        this.appearance = { ...structuredClone(opts.initial),
          hair: this.appearance.hair, hairColor: this.appearance.hairColor };
      } else {
        this.appearance.name = (this.appearance.name || '').trim() || Lang.text('Mods.SandboxWorld.CharCreate.Unnamed');
      }
      const a = this.appearance;
      this.close(() => this.cb.onCreate(a));
    });
    this.refreshFooterTexts();
    this.buildContent();
    this.loop();

    // Esc 返回
    this.escHandler = (e: KeyboardEvent) => {
      if (e.code === 'Escape') this.close(this.cb.onCancel);
    };
    window.addEventListener('keydown', this.escHandler);
    this.unsubLang = Lang.onChange(() => this.refreshTexts());

    // 面板底九宫：素材懒加载竞态（首次打开未就绪）时保留兜底纯色，就绪后回补
    requestAnimationFrame(() => this.applyPanelBg());
    const bg = invBgEnsure();
    if (bg && !bg.complete) bg.addEventListener('load', () => this.applyPanelBg(), { once: true });
    // 按钮 chrome 染色底板就绪 → 盖 ready 章（显形 mask 图标）+ 重画内容
    void prepareAssets().then(() => {
      if (!this.panel.isConnected) return;
      this.panel.classList.add('ready');
      this.buildContent();
      this.applyPanelBg();
    });
  }

  private unsubLang: (() => void) | null = null;

  // ================= 框架 =================

  /** 页签定义（原版 10 页签；本仓 7 色页签合并为 1 个颜色页） */
  private tabDefs(): Array<{ key: string; tip: string }> {
    if (this.dresser) return [
      { key: 'look', tip: Lang.text('Mods.SandboxWorld.CharCreate.Appearance') },
      { key: 'color', tip: Lang.text('Mods.SandboxWorld.CharCreate.Colors') },
    ];
    if (this.salon) return [
      { key: 'hair', tip: Lang.text('UI.PlayerCreateCategoryHairStyle') },
      { key: 'color', tip: Lang.text('Mods.SandboxWorld.CharCreate.Colors') },
    ];
    return [
      { key: 'info', tip: Lang.text('UI.PlayerCreateCategoryInfo') },
      { key: 'look', tip: Lang.text('Mods.SandboxWorld.CharCreate.Appearance') },
      { key: 'hair', tip: Lang.text('UI.PlayerCreateCategoryHairStyle') },
      { key: 'color', tip: Lang.text('Mods.SandboxWorld.CharCreate.Colors') },
    ];
  }

  /** 页签图标（DOM：静态贴图 img / CSS mask 染色层，无 canvas）：
   *  信息=CharInfo、外观=ColorCharacter 七层剪影逐层染当前色（:803-812）、
   *  发型=HairStyle_Hair 染发色 + HairStyle_Arrow 叠层、颜色=ColorShirt 染衣色 */
  private buildTabs(): void {
    const bar = this.panel.querySelector('.sw-char-tabs')!;
    bar.innerHTML = '';
    this.lookTabLayers = [];
    this.hairTabLayer = null;
    this.colorTabLayer = null;
    for (const def of this.tabDefs()) {
      const b = el('button', 'sw-cc-tab');
      b.dataset.tab = def.key;
      b.title = def.tip;
      b.appendChild(el('span', 'hl'));
      if (def.key === 'info') {
        const img = document.createElement('img');
        img.src = UI_TEX('CharInfo');
        img.draggable = false;
        img.className = 'sw-cc-tabimg';
        img.width = 30; img.height = 30;
        b.appendChild(img);
      } else if (def.key === 'look') {
        const ico = el('span', 'sw-cc-ico');
        ico.style.width = '26px'; ico.style.height = '34px';
        const layers: Array<keyof Appearance> = ['hairColor', 'eyeColor', 'skinColor', 'shirtColor', 'undershirtColor', 'pantsColor', 'shoeColor'];
        layers.forEach((k, i) => {
          const lay = el('i', 'sw-cc-tint sw-cc-m-cc');
          lay.style.maskPosition = `0px ${-i * 34}px`;
          lay.dataset.c = k;
          ico.appendChild(lay);
          this.lookTabLayers.push(lay);
        });
        b.appendChild(ico);
      } else if (def.key === 'hair') {
        const ico = el('span', 'sw-cc-ico');
        ico.style.width = '30px'; ico.style.height = '30px';
        const hair = el('i', 'sw-cc-tint sw-cc-m-hairColor');
        const arrow = document.createElement('img');
        arrow.src = UI_TEX('HairStyle_Arrow');
        arrow.draggable = false;
        ico.append(hair, arrow);
        b.appendChild(ico);
        this.hairTabLayer = hair;
      } else {
        const ico = el('span', 'sw-cc-ico');
        ico.style.width = '30px'; ico.style.height = '30px';
        const shirt = el('i', 'sw-cc-tint sw-cc-m-shirtColor');
        ico.appendChild(shirt);
        b.appendChild(ico);
        this.colorTabLayer = shirt;
      }
      b.addEventListener('click', () => {
        if (this.tab === def.key) return;
        this.tab = def.key;
        UISfx.click();
        this.buildContent();
      });
      bar.appendChild(b);
    }
    this.refreshColorIcons();
  }

  /** 页签/部位染色图标随当前外观刷新（只写 background-color，无重绘） */
  private refreshColorIcons(): void {
    const setTint = (elm: HTMLElement | null, key: keyof Appearance) => {
      if (!elm) return;
      const c = this.appearance[key] as RGBColor;
      elm.style.backgroundColor = `rgb(${c.r},${c.g},${c.b})`;
    };
    for (const lay of this.lookTabLayers) setTint(lay, lay.dataset.c as keyof Appearance);
    setTint(this.hairTabLayer, 'hairColor');
    setTint(this.colorTabLayer, 'shirtColor');
    for (const [key, elm] of this.partTints) setTint(elm, key);
  }

  /** 语言切换：框架文案重取 + 内容区重建（保留 appearance 与页签） */
  private refreshTexts() {
    const title = this.panel.querySelector('.sw-char-title') as HTMLElement | null;
    if (title) {
      title.textContent = this.dresser ? Lang.text('Mods.SandboxWorld.ClothesWindow.Title')
        : Lang.text('GameUI.HairStyle');
    }
    for (const b of Array.from(this.panel.querySelectorAll('.sw-cc-tab')) as HTMLElement[]) {
      const def = this.tabDefs().find((d) => d.key === b.dataset.tab);
      if (def) b.title = def.tip;
    }
    this.refreshFooterTexts();
    this.buildContent();
  }

  private refreshFooterTexts() {
    (this.panel.querySelector('[data-act=back]') as HTMLElement).textContent =
      this.dresser || this.salon ? Lang.text('GameUI.Cancel') : Lang.text('UI.Back');
    (this.panel.querySelector('[data-act=create]') as HTMLElement).textContent =
      this.dresser ? Lang.text('GameUI.Change') : this.salon ? '' : Lang.text('UI.Create');
    if (this.salon) this.updateSalonPrice();
  }

  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  /** 走路动画预览循环 */
  private loop = () => {
    this.time += 1 / 60;
    this.drawPreview();
    this.raf = requestAnimationFrame(this.loop);
  };

  /** 预览：站立在面板上沿（MakeCharPreview :236-250），3x 放大 40×56 → 120×168 */
  private drawPreview() {
    const ctx = this.previewCtx;
    ctx.clearRect(0, 0, 120, 168);
    const doll = compositePaperDoll(this.appearance);
    if (!doll) return;
    const f = dollFrame(doll, walkFrame(this.time));
    ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 0, 0, 120, 168);
  }

  /** 面板底九宫（Utils.DrawInvBG；尺寸固定，打开时合成一次） */
  private applyPanelBg() {
    const body = this.panel.querySelector('.sw-char-body') as HTMLElement | null;
    if (!body || !body.isConnected) return;
    const url = invBgDataUrl(body.offsetWidth, body.offsetHeight);
    if (url) body.style.backgroundImage = `url(${url})`;
  }

  /** fn 可选(public):外部生命周期清理(UI.closeAll/showClothesWindow 守卫,
   *  2026-08-13 泄露 review——孤儿 rAF/keydown/Lang 订阅即源于无法外部关) */
  close(fn?: () => void) {
    cancelAnimationFrame(this.raf);
    if (this.sheetTimer) clearTimeout(this.sheetTimer);
    if (this.thumbTimer) clearTimeout(this.thumbTimer);
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler);
    this.unsubLang?.();
    this.panel.remove();
    fn?.();
  }

  /** 理发窗购买按钮实时报价（Main.cs:43198-43246：0 改动 = GameUI.Buy「购买」；
   *  >0 = GameUI.BuyWithValue「购买({0})」——数值链在 Game.hairRestylePrice） */
  private updateSalonPrice() {
    const btn = this.panel.querySelector('[data-act=create]') as HTMLElement | null;
    if (!btn) return;
    const price = this.priceOf ? this.priceOf(this.appearance) : 0;
    btn.textContent = price > 0
      ? Lang.text('GameUI.BuyWithValue', formatCopper(price))
      : Lang.text('GameUI.Buy');
  }

  // ================= 内容区 =================

  private buildContent() {
    // 页签高亮
    this.panel.querySelectorAll('.sw-cc-tab').forEach((b) => {
      (b as HTMLElement).classList.toggle('active', (b as HTMLElement).dataset.tab === this.tab);
    });
    if (this.salon) this.updateSalonPrice();
    this.content.innerHTML = '';
    this.partTints.clear();
    this.sliderFills = [null, null, null];
    this.sliderKnobs = [null, null, null];
    this.hexLabel = null;
    if (this.tab === 'info') this.buildInfo();
    else if (this.tab === 'look') this.buildLook();
    else if (this.tab === 'hair') this.buildHair();
    else this.buildColor();
    this.refreshColorIcons();
  }

  /** 缩略图懒加载补画(2026-08-13 枚举 review):纸娃娃贴图晚到会留空白格——
   *  miss 时有界重试当前页;面板已关/用户切走页签即停 */
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

  /** 32×32 小方钮（UIColoredImageButton isSmall：SmallPanel 底 + 原版 20×20 图标） */
  private smallBtn(icon: string, tipKey: string, fn: () => void): HTMLButtonElement {
    const b = el('button', 'sw-cc-small');
    b.title = Lang.text(tipKey);
    const img = document.createElement('img');
    img.src = UI_TEX(icon);
    img.draggable = false;
    b.appendChild(img);
    b.addEventListener('click', () => { UISfx.click(); fn(); });
    return b;
  }

  /** 语音箭头钮（TexturePackButtons 下排两帧 32×32——background-position 切片） */
  private arrowBtn(frameCol: 0 | 1, tipKey: string, fn: () => void): HTMLButtonElement {
    const b = el('button', 'sw-cc-arrow');
    b.title = Lang.text(tipKey);
    const ico = el('i', 'sw-cc-arrowico');
    ico.style.backgroundPosition = `-${frameCol * 32}px -32px`;
    b.appendChild(ico);
    b.addEventListener('click', () => { UISfx.click(); fn(); });
    return b;
  }

  /** 随机外观（原版 Click_RandomizePlayer :1546；本仓按形态分域：
   *  理发窗只掷发型 / 更衣窗只掷衣服样式+六色 / 创建页全掷） */
  private randomizeAppearance() {
    if (this.salon) {
      this.appearance.hair = CHAR_CREATION_HAIRS[Math.floor(Math.random() * CHAR_CREATION_HAIRS.length)];
      this.syncHslFromPart();
      this.buildContent();
      return;
    }
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
    this.syncHslFromPart();
    this.buildContent();
  }

  // ================= 缩略图 sprite sheet（纸娃娃管线烘一张，格子切片消费） =================

  /** 烘当前页所需 sheet：发型页 44×44 头像格 ×213 / 外观页 44×80 全身格 ×10 */
  private bakeSheets(): void {
    if (!this.panel.isConnected) return;
    if (this.tab === 'hair') {
      const cols = 10, cell = 44;
      const rows = Math.ceil(CHAR_CREATION_HAIRS.length / cols);
      const cv = document.createElement('canvas');
      cv.width = cols * cell; cv.height = rows * cell;
      const g = cv.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      let missed = false;
      CHAR_CREATION_HAIRS.forEach((hairId, i) => {
        const doll = compositePaperDoll({ ...this.appearance, hair: hairId });
        if (doll) g.drawImage(doll, 0, 0, 40, 44, (i % cols) * cell + 2, Math.floor(i / cols) * cell, 40, 44);
        else missed = true;
      });
      this.hairSheetUrl = cv.toDataURL();
      if (missed) this.scheduleThumbRetry(true);
    } else if (this.tab === 'look') {
      const cell = 44;
      const cv = document.createElement('canvas');
      cv.width = VALID_CLOTH_STYLES.length * cell; cv.height = 80;
      const g = cv.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      let missed = false;
      VALID_CLOTH_STYLES.forEach((styleId, i) => {
        const doll = compositePaperDoll({ ...this.appearance, skinVariant: styleId });
        if (doll) {
          const f = dollFrame(doll, IDLE_FRAME);
          g.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, i * cell + 2, 12, 40, 56);
        } else missed = true;
      });
      this.lookSheetUrl = cv.toDataURL();
      if (missed) this.scheduleThumbRetry(true);
    }
    this.applySheetUrls();
  }

  /** 防抖重烘（拖色每帧重烘 213 格太贵——停手 250ms 后一次烘） */
  private scheduleSheetBake(delay = 250): void {
    if (this.sheetTimer) clearTimeout(this.sheetTimer);
    this.sheetTimer = setTimeout(() => {
      this.sheetTimer = 0;
      this.bakeSheets();
    }, delay);
  }

  /** 已挂载格子原地换 sheet（不重建网格） */
  private applySheetUrls(): void {
    if (this.hairSheetUrl) {
      const img = `url(${this.hairSheetUrl})`;
      this.content.querySelectorAll<HTMLElement>('.sw-cc-hairbtn .sw-cc-thumb')
        .forEach((t) => { t.style.backgroundImage = img; });
    }
    if (this.lookSheetUrl) {
      const img = `url(${this.lookSheetUrl})`;
      this.content.querySelectorAll<HTMLElement>('.sw-cc-stylebtn .sw-cc-thumb')
        .forEach((t) => { t.style.backgroundImage = img; });
    }
  }

  // ---- 信息页 ----

  /** 难度描述（UpdateDifficultyDescription :949-967：LegacyMenu.31/30/29 + 旅程专用键） */
  private diffDesc(d: number): string {
    return d === 0 ? Lang.text('LegacyMenu.31')
      : d === 1 ? Lang.text('LegacyMenu.30')
      : d === 2 ? Lang.text('LegacyMenu.29')
      : Lang.text('UI.CreativeDescriptionPlayer');
  }

  private buildInfo() {
    const box = el('div', 'sw-cc-info');
    // 名字条（UICharacterNameButton：长条 + 左标签 + 值区；输入走隐藏 input 捕获）
    const bar = el('div', 'sw-cc-namebar sw-char-row');
    bar.appendChild(el('span', 'sw-cc-namelbl', Lang.text('UI.PlayerNameSlot')));
    const valWrap = el('div', 'sw-cc-nameval');
    const val = el('span', 'sw-cc-nameval-text');
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 20;
    input.value = this.appearance.name;
    input.setAttribute('aria-label', Lang.text('UI.PlayerNameSlot'));
    const syncVal = () => {
      // 空名占位（UICharacterNameButton SetContents(null) → UI.PlayerEmptyName :861）
      val.textContent = this.appearance.name || Lang.text('UI.PlayerEmptyName');
      val.classList.toggle('empty', !this.appearance.name);
    };
    syncVal();
    input.addEventListener('input', () => { this.appearance.name = input.value; syncVal(); });
    valWrap.append(val, input);
    bar.appendChild(valWrap);
    // 随机名（🎲）：取人类城镇 NPC 名字池并集随机（原版无玩家名字池——见 RandomText 注记）
    bar.appendChild(this.smallBtn('Randomize', 'Mods.SandboxWorld.CharCreate.RandomName', () => {
      input.value = randomPlayerName();
      this.appearance.name = input.value;
      syncVal();
    }));
    bar.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      input.focus();
    });
    box.appendChild(bar);
    // 中段：竖排四难度钮（上→下 = 旅程/经典/中核/硬核，:932-935 追加序）+ 描述气泡
    const low = el('div', 'sw-cc-infolow');
    const diffs = el('div', 'sw-cc-diffs');
    const bubble = el('div', 'sw-cc-diffdesc');
    const diffBtns: HTMLButtonElement[] = [];
    for (const d of [3, 0, 1, 2]) {
      const b = el('button', 'sw-cc-diff');
      b.style.setProperty('--cc-diffbase', `var(--cc-diff${d})`);
      b.style.setProperty('--cc-diffsel', `var(--cc-diff${d}sel)`);
      b.appendChild(el('span', 'sw-cc-difftxt', Lang.text(['UI.Softcore', 'UI.Mediumcore', 'UI.Hardcore', 'UI.Creative'][d])));
      b.appendChild(el('span', 'sel'));
      b.classList.toggle('active', this.appearance.difficulty === d);
      b.addEventListener('click', () => {
        this.appearance.difficulty = d as Appearance['difficulty'];
        diffBtns.forEach((x) => x.classList.toggle('active', x === b));
        bubble.textContent = this.diffDesc(d);
        UISfx.click();
      });
      diffBtns.push(b);
      diffs.appendChild(b);
    }
    bubble.textContent = this.diffDesc(this.appearance.difficulty);
    low.append(diffs, bubble);
    box.appendChild(low);
    // 性别（本仓自有行；皮肤变体男/女组切换，原版性别走服装页签）
    const grow = el('div', 'sw-cc-gender');
    grow.appendChild(el('span', 'sw-cc-genderlbl', Lang.text('Mods.SandboxWorld.CharCreate.Gender')));
    const MALE = [0, 1, 2, 3, 8, 10];
    const FEMALE = [4, 5, 6, 7, 9, 11];
    const gBtns: HTMLButtonElement[] = [];
    for (const [label, pool] of [['Mods.SandboxWorld.CharCreate.Male', MALE], ['Mods.SandboxWorld.CharCreate.Female', FEMALE]] as Array<[string, number[]]>) {
      const b = el('button', 'sw-cc-gbtn');
      b.appendChild(el('span', 'sw-cc-gbtntxt', Lang.text(label)));
      b.appendChild(el('span', 'sel'));
      b.classList.toggle('active', pool.includes(this.appearance.skinVariant));
      b.addEventListener('click', () => {
        // 同性别的样式索引尽量保留（0↔4, 1↔5, 2↔6, 3↔7, 8↔9, 10↔11）
        const other = pool === MALE ? FEMALE : MALE;
        const idx = Math.max(0, other.indexOf(this.appearance.skinVariant));
        this.appearance.skinVariant = pool[idx] ?? pool[0];
        gBtns.forEach((x) => x.classList.toggle('active', x === b));
        this.refreshColorIcons();
        this.scheduleSheetBake(0);
        UISfx.click();
      });
      gBtns.push(b);
      grow.appendChild(b);
    }
    box.appendChild(grow);
    this.content.appendChild(box);
  }

  // ---- 外观页 ----

  private buildLook() {
    const box = el('div', 'sw-cc-look');
    const grid = el('div', 'sw-cc-styles');
    VALID_CLOTH_STYLES.forEach((styleId, i) => {
      const b = el('button', 'sw-cc-stylebtn');
      b.title = Lang.text('Mods.SandboxWorld.CharCreate.StyleId', styleId);
      b.classList.toggle('active', this.appearance.skinVariant === styleId);
      // 原版层序：面板 < 高亮 < 人偶（DrawSelf 先于子层 UICharacter）→ hl 在 thumb 前
      b.appendChild(el('span', 'hl'));
      const thumb = el('i', 'sw-cc-thumb');
      thumb.style.backgroundPosition = `-${i * 44}px 0px`;
      if (this.lookSheetUrl) thumb.style.backgroundImage = `url(${this.lookSheetUrl})`;
      b.appendChild(thumb);
      b.addEventListener('click', () => { this.appearance.skinVariant = styleId; this.buildContent(); UISfx.click(); });
      grid.appendChild(b);
    });
    box.appendChild(grid);
    // 复制/粘贴/随机外观模板（原版外观页下沿小钮 :396-430）
    const low = el('div', 'sw-cc-looklow');
    low.append(
      this.smallBtn('Copy', 'Mods.SandboxWorld.CharCreate.CopyTemplate', () => { this.clipboard = { ...this.appearance }; }),
      this.smallBtn('Paste', 'Mods.SandboxWorld.CharCreate.PasteTemplate', () => {
        if (!this.clipboard) return;
        this.appearance = { ...this.clipboard, name: this.appearance.name };
        this.syncHslFromPart();
        this.buildContent();
      }),
      this.smallBtn('Randomize', 'Mods.SandboxWorld.CharCreate.Random', () => this.randomizeAppearance()),
    );
    box.appendChild(low);
    this.content.appendChild(box);
    this.scheduleSheetBake(0);
  }

  // ---- 发型页 ----

  private buildHair() {
    const box = el('div', 'sw-cc-hair');
    const grid = el('div', 'sw-cc-hairgrid');
    const cols = 10;
    CHAR_CREATION_HAIRS.forEach((hairId, i) => {
      const b = el('button', 'sw-cc-hairbtn');
      b.title = Lang.text('Mods.SandboxWorld.CharCreate.HairId', hairId);
      b.dataset.hair = String(hairId);
      b.classList.toggle('active', this.appearance.hair === hairId);
      // 原版层序：面板 < 发型 < 高亮（UIHairStyleButton.DrawSelf）
      const thumb = el('i', 'sw-cc-thumb');
      thumb.style.backgroundPosition = `-${(i % cols) * 44}px -${Math.floor(i / cols) * 44}px`;
      if (this.hairSheetUrl) thumb.style.backgroundImage = `url(${this.hairSheetUrl})`;
      b.appendChild(thumb);
      b.appendChild(el('span', 'hl'));
      b.addEventListener('click', () => { this.setHair(hairId); UISfx.click(); });
      grid.appendChild(b);
    });
    box.appendChild(grid);
    // 下沿：上一个 / 随机发型（音符） / 下一个（原版该排为语音控件，本仓改派发型域）
    const low = el('div', 'sw-cc-hairlow');
    low.append(
      this.arrowBtn(0, 'Mods.SandboxWorld.CharCreate.PrevHair', () => this.stepHair(-1)),
      this.smallBtn('Voice', 'Mods.SandboxWorld.CharCreate.RandomHair', () => {
        this.setHair(CHAR_CREATION_HAIRS[Math.floor(Math.random() * CHAR_CREATION_HAIRS.length)]);
      }),
      this.arrowBtn(1, 'Mods.SandboxWorld.CharCreate.NextHair', () => this.stepHair(1)),
    );
    box.appendChild(low);
    this.content.appendChild(box);
    this.scheduleSheetBake(0);
  }

  private setHair(id: number): void {
    this.appearance.hair = id;
    this.content.querySelectorAll('.sw-cc-hairbtn').forEach((x) => {
      x.classList.toggle('active', Number((x as HTMLElement).dataset.hair) === id);
    });
    this.refreshColorIcons();
  }

  private stepHair(dir: 1 | -1): void {
    const list = CHAR_CREATION_HAIRS;
    const idx = list.indexOf(this.appearance.hair);
    const next = idx < 0 ? 0 : (idx + dir + list.length) % list.length;
    this.setHair(list[next]);
  }

  // ---- 颜色页 ----

  private syncHslFromPart(): void {
    const c = this.appearance[this.colorPart] as RGBColor;
    this.hsl = rgbToHsl(c.r, c.g, c.b);
  }

  private applyHslToPart(): void {
    const [h, s, l] = this.hsl;
    const [r, g, b] = hslToRgb(h, s, l);
    (this.appearance[this.colorPart] as RGBColor) = {
      r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255),
    };
  }

  private buildColor() {
    const box = el('div', 'sw-cc-color');
    // 部位选择行（原版=页签条七色钮；本仓合并为页内一行，语义不变）
    const parts = el('div', 'sw-cc-parts');
    for (const row of COLOR_ROWS) {
      if (this.dresser && !row.dresser) continue;   // 更衣窗六色（Main.cs:43579-43585 备份的六色）
      if (this.salon && row.key !== 'hairColor') continue;   // 理发窗仅发色（OpenHairWindow 域）
      const b = el('button', 'sw-cc-part');
      b.title = Lang.text(row.labelKey);
      b.classList.toggle('active', this.colorPart === row.key);
      const tint = el('i', `sw-cc-tint sw-cc-m-${row.key}`);
      b.appendChild(el('span', 'hl'));
      b.appendChild(tint);
      this.partTints.set(row.key, tint);
      b.addEventListener('click', () => {
        this.colorPart = row.key;
        this.syncHslFromPart();
        this.buildContent();
        UISfx.click();
      });
      parts.appendChild(b);
    }
    box.appendChild(parts);
    // HSL 三滑杆（UIColoredSlider：ColorBar 框 + 渐变条 + ColorSlider 滑块，全 DOM）
    const sliders = el('div', 'sw-cc-sliders');
    for (const kind of [0, 1, 2] as const) {
      const track = el('div', 'sw-cc-slider');
      track.appendChild(el('i', 'sw-cc-sliderbar'));
      const fill = el('i', 'sw-cc-sliderfill');
      const knob = document.createElement('img');
      knob.src = VAN_TEX('ColorSlider');
      knob.className = 'sw-cc-sliderknob';
      knob.draggable = false;
      track.append(fill, knob);
      this.sliderFills[kind] = fill;
      this.sliderKnobs[kind] = knob;
      this.wireSlider(track, kind);
      sliders.appendChild(track);
    }
    box.appendChild(sliders);
    // HEX + 复制/粘贴/随机（Click_CopyHex :1337 / Click_PasteHex :1343 / 随机单色）
    const low = el('div', 'sw-cc-colorlow');
    const hexEl = el('div', 'sw-cc-hex');
    hexEl.title = Lang.text('Mods.SandboxWorld.CharCreate.CopyHex');
    this.hexLabel = hexEl;
    hexEl.addEventListener('click', () => this.copyHex());
    low.appendChild(hexEl);
    low.append(
      this.smallBtn('Copy', 'Mods.SandboxWorld.CharCreate.CopyHex', () => this.copyHex()),
      this.smallBtn('Paste', 'Mods.SandboxWorld.CharCreate.PasteHex', () => void this.pasteHex()),
      this.smallBtn('Randomize', 'Mods.SandboxWorld.CharCreate.RandomColor', () => {
        // 原版随机单色 = HSL 三分量均匀掷（GetRandomColorVector :1794）
        this.hsl = [Math.random(), Math.random(), Math.random()];
        this.applyHslToPart();
        this.redrawColorPage();
      }),
    );
    box.appendChild(low);
    this.content.appendChild(box);
    this.redrawColorPage();
  }

  /** 滑杆渐变色（GetHSLSliderColorAt :1130-1141：饱和/亮度杆随当前 HSL 联动） */
  private sliderColorAt(kind: 0 | 1 | 2, t: number): RGBColor {
    const [h, s, l] = this.hsl;
    const [r, g, b] = kind === 0 ? hslToRgb(t, 1, 0.5)
      : kind === 1 ? hslToRgb(h, t, l)
      : hslToRgb(h, s, t);
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  /** 滑杆/HEX/页签图标/缩略图联动（预览由 rAF 自刷新） */
  private redrawColorPage(): void {
    for (const kind of [0, 1, 2] as const) {
      const fill = this.sliderFills[kind];
      const knob = this.sliderKnobs[kind];
      if (fill) {
        const stops: string[] = [];
        for (let i = 0; i < 167; i++) {
          const c = this.sliderColorAt(kind, i / 167);
          stops.push(`rgb(${c.r},${c.g},${c.b}) ${((i / 166) * 100).toFixed(2)}%`);
        }
        fill.style.background = `linear-gradient(90deg, ${stops.join(',')})`;
      }
      if (knob) knob.style.left = `${Math.round((5 + 167 * this.hsl[kind]) * 2) - 11}px`;
    }
    if (this.hexLabel) this.hexLabel.textContent = hex(this.appearance[this.colorPart] as RGBColor).toUpperCase();
    this.refreshColorIcons();
    this.scheduleSheetBake();
  }

  private wireSlider(track: HTMLElement, kind: 0 | 1 | 2): void {
    const apply = (e: PointerEvent) => {
      const rect = track.getBoundingClientRect();
      if (!rect.width) return;
      const x = ((e.clientX - rect.left) / rect.width) * 178;   // 画布坐标 = 原版 178 宽条
      this.hsl[kind] = Math.max(0, Math.min(1, (x - 5) / 167));
      this.applyHslToPart();
      this.redrawColorPage();
    };
    track.addEventListener('pointerdown', (e) => {
      try { track.setPointerCapture(e.pointerId); } catch { /* 合成事件无活动指针——拖动仍走 buttons 门 */ }
      apply(e);
    });
    track.addEventListener('pointermove', (e) => {
      if (e.buttons & 1) apply(e);
    });
  }

  private copyHex(): void {
    const t = hex(this.appearance[this.colorPart] as RGBColor).toUpperCase();
    this.lastHex = t;
    try { void navigator.clipboard?.writeText(t); } catch { /* 无权限时 lastHex 兜底 */ }
  }

  private async pasteHex(): Promise<void> {
    let text = this.lastHex;
    try {
      const v = await navigator.clipboard?.readText();
      if (v) text = v;
    } catch { /* 剪贴板权限缺失走 lastHex 兜底 */ }
    const m = /#?([0-9a-fA-F]{6})/.exec(text);
    if (!m) return;
    const c = fromHex('#' + m[1]);
    (this.appearance[this.colorPart] as RGBColor) = c;
    this.syncHslFromPart();
    this.redrawColorPage();
  }
}
