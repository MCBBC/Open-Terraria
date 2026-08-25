// 角色创建页（DOM 版；2026-08 二轮重制——页签条恢复原版 10 个一级页签 + 图标贴图直出 +
// 几何 1:1 对齐 UICharacterCreation（Terarria1457 Terraria.GameContent.UI.States，1.4.5.6/7 同构））：
//  · 面板底 = Inventory_Back13 九宫染色（Utils.DrawInvBG :2672-2691，同暂停菜单 invBgDataUrl）
//  · 角色预览 = 面板上方居中（MakeCharPreview :252-270：UICharacter 80×80 Top=-70 悬于面板上沿、
//    characterScale 1.5 → 纸娃娃 40×56 源帧 1.5x = 60×84，脚踩进面板上沿 ~2px）——全页唯一 canvas
//  · 页签条 = UIColoredImageButton 44×44 十连一级平铺（MakeCategoriesBar :732-796）：
//    原版顺序 信息/服装/发型/发色/眼睛/皮肤/衬衫/内衣/裤装/鞋子，Left = id*48（面板内 x10 起，
//    间距 48 = 44 宽 + 4 缝）；底 = CategoryPanel 常态 0.4 暗（_visibilityInactive :17）、
//    悬停 CategoryPanelBorder 金框、选中 CategoryPanelHighlight 亮底（36×36 居中）；
//    条下 UIHorizontalSeparator（Separator1 6×4 边 2 拉伸，宽 475 = 100%-25，:779-788）
//  · 页签图标 = 原版贴图直出（<img> 静态层 / tintedDataUrl 乘色 dataURL 底图层，禁 CSS mask）：
//    UIColoredImageButton.DrawSelf :52-76 层序 = 底板→悬停框→选中框→中贴图→主贴图(乘 _color)，
//    SetColor = SpriteBatch 乘色 → 本仓 canvas multiply 同式：
//      信息 = CharInfo（素贴图）；服装 = ColorCharacter 七帧剪影逐层乘当前七色
//       （:749-763 七层 UIImageFramed + _clothingStylesCategoryButton_OnUpdate :798-806）；
//      发型 = HairStyle_Arrow（中贴图，在下）+ HairStyle_Hair 乘发色（主贴图，在上）；
//      眼睛 = ColorEyeBack（中贴图，在下，:744）+ ColorEye 乘眼色；
//      其余五色钮 = ColorHair/ColorSkin/ColorShirt/ColorUndershirt/ColorPants/ColorShoes 乘当前部位色
//  · 几何（BuildPage :203-247）= 外层 500×384：面板 UIPanel 500×230（Top 50）+ 底部
//    UITextPanel 返回/创建 240×50（50%-10，VAlign 1 Top -45 → 面板下沿 9px）；
//    页签容器高 50（padding-top 4）+ 分隔线（+2）+ 中部容器 160（padding-top 3）
//  · 信息页（MakeInfoMenu :845-935）= 名字条 480×40（UICharacterNameButton CategoryPanel×White*.5）
//    + 竖排四难度钮 188×27.5 ×4（Width 40%-4、Height 1/4 无缝平铺，:886-921 追加序 旅程/经典/中核/硬核）
//    + 右侧描述气泡 280×110（CategoryPanelHighlight×LightGray*.7 :880-890，文案 LegacyMenu.29/30/31
//    + UI.CreativeDescriptionPlayer :949-967；正文 Top 15 左右 padding 20 左对齐）——
//    原版无性别行（性别走服装页签十样式），本仓同删
//  · 服装页（MakeClothStylesMenu :297-311）= UIClothStyleButton 44×80 十连
//    Left = i*46 + (i<5 ? 11 : 29)（男女组间 20px 空档）+ 组下分隔线（宽 442 @y89）+ 复制/粘贴/随机
//  · 发型页（MakeHairstylesMenu :272-304）= UIHairStyleButton 44×44 网格 10 列 46/48 栅格 + 滚动条；
//    下沿翻页箭头（TexturePackButtons 下排两帧）+ 音符随机（本仓语义：箭头=上/下一个发型、音符=随机）
//  · 颜色页（MakeHSLMenu :936-1006）= UIPanel 220×104（Top 10）内三根 HSL 滑杆（行距 30、
//    UIColoredSlider.DrawValueBar :107-164：ColorBar 178×16 @行内(22,18) + 167 枚 ColorBlip 2×8 渐变条
//    @(27,22) + ColorSlider 11×25 滑块中心 @(27+167*v, 26) + 悬停 Slider_Highlight×OurFavoriteColor
//    (255,231,69)；取值矩形 = 杆内缩 (3,4,174,8)）+ 右下 HEX 框 100×32（UIPanel 底
//    PanelBackground×(63,82,151)*.7 + PanelBorder 黑）+ 左下 复制/粘贴/随机三小钮（间距 40）
//  · 缩略图（发型 213 格/外观 10 格）= 纸娃娃管线烘一张 sprite sheet（dataURL）→
//    格子用 CSS background-position 切片（组件本身零 canvas；色变防抖 250ms 重烘）
// 数据流与回调（onCreate/onCancel/dresser 更衣窗/salon 理发窗/priceOf 报价/appearance 字段/
// 剪贴板模板）与旧版一致；探针兼容：根节点保留 .sw-char-panel、名字输入保留
// .sw-char-row input[type=text]、创建按钮保留 [data-act=create]。
import {
  type Appearance, type RGBColor, randomAppearance, DIFFICULTY_INFO,
  VALID_CLOTH_STYLES, CHAR_CREATION_HAIRS, hslToRgb, rgbToScaledHsl, scaledLuminosity,
} from '../player/Appearance';
import { compositePaperDoll, dollFrame, walkFrame, IDLE_FRAME } from '../player/PaperDoll';
import { Lang } from '../i18n/Lang';
import { ensureVanillaKit, bindKeyboardShift } from './vanillaKit';
import { formatCopper } from './NpcDialog';
import { randomPlayerName } from '../i18n/RandomText';
import { UISfx } from '../vui/UISfx';

export interface CharCreationCallbacks {
  onCreate(a: Appearance): void;
  onCancel(): void;
}

/** 面板形态：
 *  - 默认 = 角色创建（原版 10 一级页签全量）；
 *  - dresser = 梳妆台更衣窗（Main.OpenClothesWindow Main.cs:44886——只改衣服样式与六色，
 *    不含姓名/难度/发型；发型原版归造型师）→ 页签 = 服装 + 六色（无发色）；
 *  - salon = 造型师理发窗（Main.OpenHairWindow Main.cs:44391——快照 oldHairStyle/oldHairColor）
 *    → 页签 = 发型 + 发色，确认=购买（付费改名目走 priceOf 实时显示，GameUI.BuyWithValue）；
 *    priceOf = 当前改动报价（铜币；Main.cs:43198-43211 逐行） */
export interface CharCreationOptions {
  initial?: Appearance;
  dresser?: boolean;
  hairSalon?: boolean;
  priceOf?: (a: Appearance) => number;
}

/** 页签 → 编辑部位（七色页签即部位页：点页签 = 选中该部位，页内三滑杆编辑它的颜色） */
const TAB_PART: Partial<Record<string, keyof Appearance>> = {
  hairColor: 'hairColor', eye: 'eyeColor', skin: 'skinColor', shirt: 'shirtColor',
  undershirt: 'undershirtColor', pants: 'pantsColor', shoes: 'shoeColor',
};

/** 页签悬停提示（UpdateHoverText :1944-1978 的 UI.PlayerCreateCategory* 族） */
const TAB_TIP: Record<string, string> = {
  info: 'UI.PlayerCreateCategoryInfo',
  look: 'UI.PlayerCreateCategoryBodyStyle',
  hair: 'UI.PlayerCreateCategoryHairStyle',
  hairColor: 'UI.PlayerCreateCategoryHairColor',
  eye: 'UI.PlayerCreateCategoryEyeColor',
  skin: 'UI.PlayerCreateCategorySkinColor',
  shirt: 'UI.PlayerCreateCategoryShirtColor',
  undershirt: 'UI.PlayerCreateCategoryUndershirtColor',
  pants: 'UI.PlayerCreateCategoryPantsColor',
  shoes: 'UI.PlayerCreateCategoryShoesColor',
};

/** 页签图标贴图名（Images/UI/CharCreation/*；素材树 terraria-assets/Images/UI/CharCreation
 *  已 1:1 镜像进 public/sprites/vanilla-ui/UI_CharCreation_*.png，md5 同源） */
const TAB_ICON_TEX: Partial<Record<string, string>> = {
  info: 'CharInfo', hair: 'HairStyle_Hair', hairColor: 'ColorHair', eye: 'ColorEye',
  skin: 'ColorSkin', shirt: 'ColorShirt', undershirt: 'ColorUndershirt',
  pants: 'ColorPants', shoes: 'ColorShoes',
};

/** 服装页签七层剪影的层序 = 部位顺序（_clothingStylesCategoryButton_OnUpdate :798-806） */
const LOOK_LAYERS: Array<keyof Appearance> = [
  'hairColor', 'eyeColor', 'skinColor', 'shirtColor', 'undershirtColor', 'pantsColor', 'shoeColor',
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

/** 页签/滑杆用贴图缓存（prepareAssets 预载；未就绪时取 null，就绪后重刷） */
const iconImgs = new Map<string, Img>();
function iconImg(name: string): Img | null {
  const img = iconImgs.get(name);
  return img && img.complete && img.naturalWidth ? img : null;
}

/** 白模染色（multiply + destination-in 半透明回贴 = XNA Color*float 同乘 RGBA）→ dataURL。
 *  仅用于生成 CSS 变量/图标底图的静态染色位（面板条/气泡/分隔线/难度钮/页签图标），不落组件 canvas */
const tintDataCache = new Map<string, string>();
function tintedDataUrl(img: Img, r: number, g: number, b: number, aMul = 1): string {
  const key = `${img.src}|${r},${g},${b},${aMul}`;
  const hit = tintDataCache.get(key);
  if (hit) return hit;
  const url = bakeTint(img, 0, 0, img.naturalWidth, img.naturalHeight, r, g, b, aMul);
  tintDataCache.set(key, url);
  return url;
}

/** 帧裁剪版染色（ColorCharacter 七帧剪影逐层乘色用；同缓存键空间） */
function tintedCropDataUrl(img: Img, sx: number, sy: number, sw: number, sh: number,
  r: number, g: number, b: number): string {
  const key = `${img.src}|${sx},${sy},${sw},${sh}|${r},${g},${b}`;
  const hit = tintDataCache.get(key);
  if (hit) return hit;
  const url = bakeTint(img, sx, sy, sw, sh, r, g, b, 1);
  tintDataCache.set(key, url);
  return url;
}

function bakeTint(img: Img, sx: number, sy: number, sw: number, sh: number,
  r: number, g: number, b: number, aMul: number): string {
  const cv = document.createElement('canvas');
  cv.width = sw; cv.height = sh;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.imageSmoothingEnabled = false;
  c.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = `rgb(${r},${g},${b})`;
  c.fillRect(0, 0, sw, sh);
  c.globalCompositeOperation = 'destination-in';
  c.globalAlpha = aMul;
  c.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  return cv.toDataURL();
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

/** 页签图标贴图清单（MakeCategoriesBar 引用全量 + UIPanel/滑杆 chrome） */
const ICON_TEX_NAMES = [
  'CharInfo', 'ColorCharacter', 'HairStyle_Hair', 'HairStyle_Arrow', 'ColorEyeBack',
  'ColorEye', 'ColorHair', 'ColorSkin', 'ColorShirt', 'ColorUndershirt', 'ColorPants', 'ColorShoes',
];

/** 按钮 chrome 所需的染色底板 + 图标贴图预载（幂等；完成后给面板盖 ready 章） */
let assetsPromise: Promise<void> | null = null;
function prepareAssets(): Promise<void> {
  if (assetsPromise) return assetsPromise;
  assetsPromise = (async () => {
    const [cat, hl, gray, small, sep, panelBg, panelBorder, sliderHl] = await Promise.all(
      ['CategoryPanel', 'CategoryPanelHighlight', 'PanelGrayscale', 'SmallPanel', 'Separator1',
        'UI_PanelBackground', 'UI_PanelBorder', 'UI_Slider_Highlight']
        .map((n) => loadImg(n.startsWith('UI_')
          ? `sprites/vanilla-ui/${n}.png`
          : UI_TEX(n))));
    await Promise.all(ICON_TEX_NAMES.map(async (n) => {
      try { iconImgs.set(n, await loadImg(UI_TEX(n))); } catch { /* 贴图缺失时图标留空 */ }
    }));
    const v: Array<[string, string]> = [
      ['--cc-catpanel', `url(${UI_TEX('CategoryPanel')})`],
      ['--cc-catborder', `url(${UI_TEX('CategoryPanelBorder')})`],
      ['--cc-cathl', `url(${UI_TEX('CategoryPanelHighlight')})`],
      ['--cc-smallpanel', `url(${UI_TEX('SmallPanel')})`],
      ['--cc-smallborder', `url(${UI_TEX('SmallPanelBorder')})`],
      // 名字条/外观钮：CategoryPanel × White*0.5（UICharacterNameButton.DrawSelf :62）
      ['--cc-namebar', `url(${tintedDataUrl(cat, 255, 255, 255, 0.5)})`],
      // 难度描述气泡：CategoryPanelHighlight × LightGray(211,211,211)*0.7（MakeInfoMenu :889）
      ['--cc-bubble', `url(${tintedDataUrl(hl, Math.round(211 * 0.7), Math.round(211 * 0.7), Math.round(211 * 0.7), 0.7)})`],
      // 页签条下分隔线：Separator1 × Lerp(White,(63,65,151),.85)*.9（MakeCategoriesBar :786）
      ['--cc-sep', `url(${tintedDataUrl(sep, lerpC(255, 63, 0.85), lerpC(255, 65, 0.85), lerpC(255, 151, 0.85), 0.9)})`],
      // UIPanel 底（HEX 框/HSL 面板）：PanelBackground × (63,82,151)*0.7 + PanelBorder 黑（UIPanel.cs:15-16）
      ['--cc-panelbg', `url(${tintedDataUrl(panelBg, Math.round(63 * 0.7), Math.round(82 * 0.7), Math.round(151 * 0.7), 0.7)})`],
      ['--cc-panelborder', `url(${tintedDataUrl(panelBorder, 0, 0, 0, 1)})`],
      // 滑杆悬停亮框：Slider_Highlight × OurFavoriteColor(255,231,69)（Main.cs:886 / UIColoredSlider :159）
      ['--cc-sliderhl', `url(${tintedDataUrl(sliderHl, 255, 231, 69, 1)})`],
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

/** 静态贴图图标层（<img> 直出原版贴图，禁 mask 染色） */
function staticIcon(tex: string, w: number, h: number): HTMLImageElement {
  const img = document.createElement('img');
  img.src = UI_TEX(tex);
  img.draggable = false;
  img.className = 'sw-cc-tabimg';
  img.width = w;
  img.height = h;
  return img;
}

const CSS = `
:where(.sw-char-panel) :where(button) { font-family: inherit; color: inherit; background: none; border: none; padding: 0; cursor: pointer; }
.sw-char-panel {
  position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 500px; max-width: 96vw; z-index: 20; cursor: auto;
  opacity: 0.9;   /* 与 .sw-vsel 选择面板同族 90% 微半透（2026-08-25 用户实报缺） */
  display: flex; flex-direction: column; align-items: center;
  color: #e8e8f4; user-select: none;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  --cc-fit: 1;   /* 手机窄/矮屏整体缩放因子(fitPanel 实测写入;桌面恒 1) */
}
.sw-char-title { font-size: 16px; color: #ffe8a0; margin-bottom: 4px;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
/* 角色预览：面板上方居中（MakeCharPreview :252-270，1.5x → 60×84；脚踩面板上沿 ~2px）
   ——全页唯一 canvas（纸娃娃渲染管线） */
.sw-char-preview { width: 60px; height: 84px; image-rendering: pixelated; pointer-events: none;
  margin-bottom: -2px; position: relative; z-index: 1; }
/* Inventory_Back13 九宫面板底（Utils.DrawInvBG）；素材未载时退纯色。
   面板 = 500×230（BuildPage :210-222：UIPanel 500×230 Top 50） */
.sw-char-body {
  width: 500px; height: 230px; box-sizing: border-box; padding: 0 10px 14px;
  background-color: #241a56; background-repeat: no-repeat; background-size: 100% 100%;
  image-rendering: pixelated;
}
/* ---- 图标页签条（UIColoredImageButton 44×44 十连；容器高 50 含 padding-top 4，
        Left = id*48 → 面板内 x10 起、间距 48）---- */
.sw-char-tabs { position: relative; height: 50px; }
.sw-cc-tab { position: absolute; top: 4px; width: 44px; height: 44px; image-rendering: pixelated; }
.sw-cc-tab::before { content: ''; position: absolute; inset: 0; z-index: 0;
  background: var(--cc-catpanel) center / 100% 100% no-repeat; opacity: 0.4; }
.sw-cc-tab:hover::before { opacity: 1; }
.sw-cc-tab::after { content: ''; position: absolute; inset: 0; z-index: 1; opacity: 0;
  background: var(--cc-catborder) center / 100% 100% no-repeat; pointer-events: none; }
.sw-cc-tab:hover::after { opacity: 1; }
.sw-cc-tab .hl { position: absolute; inset: 0; z-index: 2; display: none; pointer-events: none;
  background: var(--cc-cathl) center / 36px 36px no-repeat; }
.sw-cc-tab.active .hl { display: block; }
/* 图标层：静态 <img> 与乘色底图层同位叠放（DrawSelf :52-76 层序 = 中贴图在下、主贴图在上） */
.sw-cc-tabimg { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3; image-rendering: pixelated; }
.sw-cc-tinted { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 4;
  width: 30px; height: 30px; background-repeat: no-repeat; background-size: 100% 100%;
  image-rendering: pixelated; pointer-events: none; }
/* 页签条下分隔线（UIHorizontalSeparator：Separator1 边 2 拉伸；宽 475 = 100%-25） */
.sw-char-sep { height: 4px; margin-top: 2px; width: calc(100% - 5px); box-sizing: border-box;
  border: 2px solid transparent; border-image: var(--cc-sep) 2 fill stretch; image-rendering: pixelated; }
/* 中部容器（BuildPage :223-231：高 160、padding-top 3） */
.sw-char-content { height: 160px; padding-top: 3px; box-sizing: border-box; position: relative; }
/* ---- 底部宽按钮（UITextPanel：50%-10 × 50px 并排，VAlign 1 Top -45 → 面板下沿 9px）---- */
.sw-char-footer { display: flex; justify-content: space-between; width: 100%; margin-top: 9px; }
.sw-char-footer .sw-vbtn { width: calc(50% - 10px); height: 50px; font-size: 15px; letter-spacing: 2px; }
/* ---- UIPanel 九宫底（PanelBackground × (63,82,151)*.7 + PanelBorder 黑；角 12 条 4）---- */
.sw-cc-panelbg::before, .sw-cc-panelbg::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  border: 12px solid transparent; border-image: var(--cc-panelbg) 12 fill stretch; }
.sw-cc-panelbg::after { border-image: var(--cc-panelborder) 12 fill stretch; }
/* ---- 信息页（MakeInfoMenu :845-935）---- */
.sw-cc-info { position: relative; height: 100%; }
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
/* 中段：难度列 188×110（Width 40%-4，VAlign 1）+ 气泡 280×110（Width 60%-8，右缩 4） */
.sw-cc-infolow { position: absolute; left: 0; right: 0; bottom: 0; height: 110px; }
.sw-cc-diffs { position: absolute; left: 0; top: 0; width: 188px; height: 110px;
  display: flex; flex-direction: column; }
/* 底板走 ::before（元素本身无边框）——绝对定位子层(.sel/文字)按 padding box
 *  解析,元素带 border-image 边框会把子层整体挤偏 10px（实测勘误） */
.sw-cc-diff { position: relative; flex: 1; box-sizing: border-box; image-rendering: pixelated; text-align: center; }
.sw-cc-diff::before { content: ''; position: absolute; inset: 0;
  border: 10px solid transparent; border-image: var(--cc-diffbase) 10 fill stretch; }
.sw-cc-diff::after { content: ''; position: absolute; inset: 0; opacity: 0; pointer-events: none;
  border: 10px solid transparent; border-image: var(--cc-catborder) 10 fill stretch; }
.sw-cc-diff:hover::after { opacity: 1; }
/* 选中内衬：UIDifficultyButton num=7(高<30 取 5) → x+5 y+3 w-10 h-10（:56-58） */
.sw-cc-diff .sel { position: absolute; inset: 3px 5px 5px; display: none; pointer-events: none; box-sizing: border-box;
  border: 10px solid transparent; border-image: var(--cc-diffsel) 10 fill stretch; }
.sw-cc-diff.active .sel { display: block; }
.sw-cc-difftxt { position: absolute; left: 0; right: 0; top: 4px; z-index: 1;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
/* 描述气泡（UISlicedImage CategoryPanelHighlight×LightGray*.7；正文 Top 15 左右 20、
 *  UIText TextOriginX=0.5 水平居中 :84-85） */
.sw-cc-diffdesc { position: absolute; right: 4px; top: 0; width: 280px; height: 110px; box-sizing: border-box;
  border: 10px solid transparent; border-image: var(--cc-bubble) 10 fill stretch;
  padding: 13px 20px 0; font-size: 12px; line-height: 1.6; color: #fff; text-align: center;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
/* ---- 服装页（MakeClothStylesMenu :297-311：44×80 十连 Left=i*46+(i<5?11:29)）---- */
.sw-cc-look { position: relative; height: 100%; }
.sw-cc-styles { position: absolute; left: 0; top: 0; width: 100%; height: 80px; }
.sw-cc-stylebtn { position: absolute; top: 0; width: 44px; height: 80px; image-rendering: pixelated; }
.sw-cc-stylebtn::before { content: ''; position: absolute; inset: 0;
  border: 10px solid transparent; border-image: var(--cc-namebar) 10 fill stretch; }
.sw-cc-stylebtn::after { content: ''; position: absolute; inset: 0; z-index: 2; opacity: 0; pointer-events: none;
  border: 10px solid transparent; border-image: var(--cc-catborder) 10 fill stretch; }
.sw-cc-stylebtn:hover::after { opacity: 1; }
.sw-cc-stylebtn .hl { position: absolute; inset: 3px; z-index: 1; display: none; pointer-events: none; box-sizing: border-box;
  border: 10px solid transparent; border-image: var(--cc-cathl) 10 fill stretch; }
.sw-cc-stylebtn.active .hl { display: block; }
/* 缩略图 = 烘焙 sprite sheet 的 background-position 切片（组件零 canvas） */
.sw-cc-thumb { position: absolute; inset: 0; background-repeat: no-repeat; image-rendering: pixelated; }
.sw-cc-stylebtn .sw-cc-thumb { z-index: 3; }
.sw-cc-looksep { position: absolute; left: 19px; top: 89px; width: 442px; height: 4px; box-sizing: border-box;
  border: 2px solid transparent; border-image: var(--cc-sep) 2 fill stretch;
  image-rendering: pixelated; pointer-events: none; }
.sw-cc-looklow { position: absolute; left: 0; right: 0; top: 106px; display: flex; justify-content: center; }
/* ---- 小方钮（UIColoredImageButton isSmall：SmallPanel 32×32 底，常态 0.4 暗）---- */
.sw-cc-small { position: relative; width: 32px; height: 32px; image-rendering: pixelated; }
.sw-cc-small::before { content: ''; position: absolute; inset: 0; z-index: 0;
  background: var(--cc-smallpanel) center / 100% 100% no-repeat; opacity: 0.4; }
.sw-cc-small:hover::before { opacity: 1; }
.sw-cc-small::after { content: ''; position: absolute; inset: 0; z-index: 1; opacity: 0; pointer-events: none;
  background: var(--cc-smallborder) center / 100% 100% no-repeat; }
.sw-cc-small:hover::after { opacity: 1; }
.sw-cc-small > img { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3; image-rendering: pixelated; }
/* ---- 发型页（UIHairStyleButton 44×44 网格 + 滚动）---- */
.sw-cc-hair { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
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
/* 层序对齐 UIHairStyleButton.DrawSelf :56-76 = 底板(::before) → 选中亮底(.hl，
 *  CategoryPanelHighlight 36×36 不透明圆角块，居中) → 悬停框(::after) → 头像最后画在最上。
 *  亮底必须在头像之下：原版亮块不透明，画在头像上会把缩略图整个盖死（2026-08 实测勘误） */
.sw-cc-hairbtn .hl { position: absolute; inset: 0; z-index: 1; display: none; pointer-events: none;
  background: var(--cc-cathl) center / 36px 36px no-repeat; }
.sw-cc-hairbtn.active .hl { display: block; }
.sw-cc-hairbtn::after { content: ''; position: absolute; inset: 0; z-index: 2; opacity: 0; pointer-events: none;
  background: var(--cc-catborder) center / 100% 100% no-repeat; }
.sw-cc-hairbtn:hover::after { opacity: 1; }
.sw-cc-hairbtn .sw-cc-thumb { z-index: 3; }
.sw-cc-hairlow { flex: none; height: 34px; display: flex; justify-content: center; align-items: center; gap: 12px; }
.sw-cc-arrow { position: relative; width: 32px; height: 32px; image-rendering: pixelated; }
.sw-cc-arrow:hover { outline: 2px solid #ffe745; }
.sw-cc-arrowico { position: absolute; inset: 0; image-rendering: pixelated;
  background-image: url(sprites/vanilla-ui/UI_TexturePackButtons.png); background-repeat: no-repeat; }
/* ---- 颜色页（MakeHSLMenu :936-1006；容器 220 宽居中，滑杆面板 220×104 Top 10）---- */
.sw-cc-color { position: relative; width: 220px; height: 100%; margin: 0 auto; }
.sw-cc-hslpanel { position: absolute; left: 0; top: 10px; width: 220px; height: 104px; }
/* 三根 HSL 滑杆（行距 30；杆 = ColorBar 178×16 @行内(22,18)，渐变条 167×2×8 @(27,22)） */
.sw-cc-slider { position: absolute; left: 0; width: 210px; height: 30px; cursor: pointer; touch-action: none; }
.sw-cc-sliderbar { position: absolute; left: 22px; top: 18px; width: 178px; height: 16px; image-rendering: pixelated;
  background: url(sprites/vanilla/ColorBar.png) 0 0 / 100% 100% no-repeat; }
.sw-cc-sliderhl { position: absolute; left: 22px; top: 18px; width: 178px; height: 16px; image-rendering: pixelated;
  background: var(--cc-sliderhl) 0 0 / 100% 100% no-repeat; opacity: 0; pointer-events: none; }
.sw-cc-slider:hover .sw-cc-sliderhl { opacity: 1; }
.sw-cc-sliderfill { position: absolute; left: 27px; top: 22px; width: 167px; height: 8px; }
/* 滑块 ColorSlider 11×25：中心 @(27+167*v, 26)（DrawValueBar :160-162 origin=中心） */
.sw-cc-sliderknob { position: absolute; top: 13.5px; width: 11px; height: 25px; margin-left: -5.5px;
  image-rendering: pixelated; pointer-events: none; }
/* HEX 框 100×32（UIPanel 底）右下 + 三小钮左下（间距 40） */
.sw-cc-hex { position: absolute; right: 0; bottom: 0; width: 100px; height: 32px; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; letter-spacing: 1px; color: #fff; user-select: text; cursor: text;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }
.sw-cc-hex > span { position: relative; z-index: 1; }
.sw-cc-colorlow { position: absolute; left: 0; bottom: 0; width: 112px; height: 32px; }
.sw-cc-colorlow .sw-cc-small { position: absolute; bottom: 0; }
/* ---- 手机适配(2026-08-25,加法式覆盖,桌面 ≥1024×768 全不命中)----
   内部全部绝对定位像素常量(页签 48 pitch/发型网格 10 列/滑杆 178),逐元素重排
   回归风险高 → 窄屏(max-width:700)或矮屏(max-height:560,横屏手机 ~390 高)
   整体 transform scale(--cc-fit,JS 按布局尺寸实测);max-width:none 放开 96vw
   让布局恒 500 宽、缩放全权交给 --cc-fit。input 16px 防 iOS 聚焦自动放大。
   translate(独立属性)消费键盘遮挡补偿 --kb-shift(vanillaKit.bindKeyboardShift),
   先于 transform 叠加、互不打架 */
@media (max-width: 700px), (max-height: 560px) {
  .sw-char-panel {
    transform: translate(-50%, -50%) scale(var(--cc-fit));
    transform-origin: center; max-width: none;
    translate: 0 var(--kb-shift, 0px);
    transition: translate .15s;
  }
  .sw-char-panel input[type=text] { font-size: 16px; }
}
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
  private dresser = false;   // 梳妆台更衣窗形态（服装+六色页签，确认=更改）
  private salon = false;     // 造型师理发窗形态（发型+发色，确认=付费购买）
  private priceOf: ((a: Appearance) => number) | null = null;
  /** 当前颜色页编辑的部位 = 所选颜色页签（原版 _selectedPicker） */
  private colorPart: keyof Appearance = 'hairColor';
  private hsl: [number, number, number] = [0, 0, 0];
  private hexLabel: HTMLElement | null = null;
  private sliderFills: Array<HTMLElement | null> = [null, null, null];
  private sliderKnobs: Array<HTMLElement | null> = [null, null, null];
  /** 页签乘色图标层登记表（贴图 + 部位 + 可选帧裁剪；颜色变化时重烘 dataURL） */
  private tintLayers: Array<{ elm: HTMLElement; tex: string; part: keyof Appearance; crop?: [number, number, number, number] }> = [];
  private iconTintRaf = 0;
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
    // 初始颜色页部位 = 各形态第一个颜色页签（更衣窗六色无发色；理发窗仅发色）
    this.colorPart = this.dresser ? 'eyeColor' : 'hairColor';
    this.syncHslFromPart();

    // 样式表每次挂载都刷新(★HMR 期守卫只建不更,旧 CSS 驻留吞变更——同 TitleMenu)
    let style = document.getElementById('sw-char-style') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'sw-char-style';
      document.head.appendChild(style);
    }
    style.textContent = CSS;

    const title = this.dresser ? Lang.text('Mods.SandboxWorld.ClothesWindow.Title')
      : this.salon ? Lang.text('GameUI.HairStyle') : '';
    this.panel = document.createElement('div');
    this.panel.className = 'sw-char-panel';
    this.panel.innerHTML = `
      ${title ? `<div class="sw-char-title">${title}</div>` : ''}
      <canvas class="sw-char-preview" width="60" height="84"></canvas>
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
    // 手机窄/矮屏整体等比缩放(--cc-fit;桌面断点外恒 1 逐像素不变)+键盘遮挡补偿
    requestAnimationFrame(() => this.fitPanel());
    window.addEventListener('resize', this.fitPanel);
    window.addEventListener('orientationchange', this.fitPanel);
    window.visualViewport?.addEventListener('resize', this.fitPanel);
    this.unsubKb = bindKeyboardShift(this.panel);

    // 面板底九宫：素材懒加载竞态（首次打开未就绪）时保留兜底纯色，就绪后回补
    requestAnimationFrame(() => this.applyPanelBg());
    const bg = invBgEnsure();
    if (bg && !bg.complete) bg.addEventListener('load', () => this.applyPanelBg(), { once: true });
    // 按钮 chrome 染色底板 + 页签图标贴图就绪 → 盖 ready 章 + 重刷图标/内容
    void prepareAssets().then(() => {
      if (!this.panel.isConnected) return;
      this.panel.classList.add('ready');
      this.refreshColorIcons();
      this.buildContent();
      this.applyPanelBg();
    });
  }

  private unsubLang: (() => void) | null = null;
  private unsubKb: (() => void) | null = null;

  /** 手机窄/矮屏整体等比缩放因子(媒体查询门内消费,见 CSS 尾注):
   *  offsetWidth/Height 是布局尺寸不含 transform → 测量稳定;下限 0.55 防过小。
   *  桌面 ≥断点时 s=min(1, …) ≡ 1,写同值无副作用 */
  private fitPanel = () => {
    const vv = window.visualViewport;
    const s = Math.min(
      1,
      (window.innerWidth - 16) / Math.max(1, this.panel.offsetWidth),
      ((vv?.height ?? window.innerHeight) - 16) / Math.max(1, this.panel.offsetHeight),
    );
    this.panel.style.setProperty('--cc-fit', String(Math.max(0.55, s)));
  };

  // ================= 框架 =================

  /** 页签定义（MakeCategoriesBar :732-768 原版顺序；dresser/salon 按窗口域裁剪） */
  private tabDefs(): Array<{ key: string; part?: keyof Appearance }> {
    if (this.dresser) {
      return [
        { key: 'look' },
        { key: 'eye', part: 'eyeColor' },
        { key: 'skin', part: 'skinColor' },
        { key: 'shirt', part: 'shirtColor' },
        { key: 'undershirt', part: 'undershirtColor' },
        { key: 'pants', part: 'pantsColor' },
        { key: 'shoes', part: 'shoeColor' },
      ];
    }
    if (this.salon) {
      return [
        { key: 'hair' },
        { key: 'hairColor', part: 'hairColor' },
      ];
    }
    return [
      { key: 'info' },
      { key: 'look' },
      { key: 'hair' },
      { key: 'hairColor', part: 'hairColor' },
      { key: 'eye', part: 'eyeColor' },
      { key: 'skin', part: 'skinColor' },
      { key: 'shirt', part: 'shirtColor' },
      { key: 'undershirt', part: 'undershirtColor' },
      { key: 'pants', part: 'pantsColor' },
      { key: 'shoes', part: 'shoeColor' },
    ];
  }

  /** 页签条（图标 = 原版贴图直出：静态 <img> 层 + 乘色 dataURL 底图层，禁 CSS mask）。
   *  全 10 页签按原版 Left=id*48（面板内 x10 起）；更衣/理发窗的短页签组居中（原版该二窗
   *  为独立 legacy UI 无此条，居中为本仓取齐面板中轴的呈现约定） */
  private buildTabs(): void {
    const bar = this.panel.querySelector('.sw-char-tabs')!;
    bar.innerHTML = '';
    this.tintLayers = [];
    const defs = this.tabDefs();
    const fullBar = defs.length >= 10;
    const start = fullBar ? 0 : Math.round((480 - (defs.length * 48 - 4)) / 2);
    defs.forEach((def, i) => {
      const b = el('button', 'sw-cc-tab');
      b.dataset.tab = def.key;
      b.title = Lang.text(TAB_TIP[def.key] ?? def.key);
      b.style.left = `${start + i * 48}px`;    // 面板内 x10 起、间距 48（CreateColorPicker :827-837）
      b.appendChild(el('span', 'hl'));
      if (def.key === 'info') {
        b.appendChild(staticIcon('CharInfo', 30, 30));
      } else if (def.key === 'look') {
        // 七层剪影逐层乘当前七色（:749-763 七帧 UIImageFramed 同位叠放）
        LOOK_LAYERS.forEach((part, fi) => {
          const lay = el('i', 'sw-cc-tinted');
          lay.style.width = '26px';
          lay.style.height = '34px';
          b.appendChild(lay);
          this.tintLayers.push({ elm: lay, tex: 'ColorCharacter', part, crop: [0, fi * 34, 26, 34] });
        });
      } else if (def.key === 'hair') {
        // 中贴图在下（HairStyle_Arrow）、主贴图乘发色在上（DrawSelf :69-76 层序）
        b.appendChild(staticIcon('HairStyle_Arrow', 30, 30));
        const lay = el('i', 'sw-cc-tinted');
        b.appendChild(lay);
        this.tintLayers.push({ elm: lay, tex: 'HairStyle_Hair', part: 'hairColor' });
      } else {
        if (def.key === 'eye') b.appendChild(staticIcon('ColorEyeBack', 30, 30));   // 中贴图（:744）
        const lay = el('i', 'sw-cc-tinted');
        b.appendChild(lay);
        this.tintLayers.push({ elm: lay, tex: TAB_ICON_TEX[def.key]!, part: def.part! });
      }
      b.addEventListener('click', () => {
        if (this.tab === def.key) return;
        this.tab = def.key;
        if (def.part) {                          // 颜色页签 = 选中该部位
          this.colorPart = def.part;
          this.syncHslFromPart();
        }
        UISfx.click();
        this.buildContent();
      });
      bar.appendChild(b);
    });
    this.refreshColorIcons();
  }

  /** 页签/部位乘色图标随当前外观刷新（重烘 30×30 级小图 dataURL；贴图未就绪的格子
   *  留空，由 constructor 的 prepareAssets().then 统一补刷） */
  private refreshColorIcons(): void {
    for (const lay of this.tintLayers) {
      const img = iconImg(lay.tex);
      if (!img) continue;
      const c = this.appearance[lay.part] as RGBColor;
      const url = lay.crop
        ? tintedCropDataUrl(img, lay.crop[0], lay.crop[1], lay.crop[2], lay.crop[3], c.r, c.g, c.b)
        : tintedDataUrl(img, c.r, c.g, c.b);
      lay.elm.style.backgroundImage = `url(${url})`;
    }
  }

  /** 拖色等高频路径的合帧刷新（每帧至多重烘一次图标层） */
  private queueIconTint(): void {
    if (this.iconTintRaf) return;
    this.iconTintRaf = requestAnimationFrame(() => {
      this.iconTintRaf = 0;
      if (this.panel.isConnected) this.refreshColorIcons();
    });
  }

  /** 语言切换：框架文案重取 + 内容区重建（保留 appearance 与页签） */
  private refreshTexts() {
    const title = this.panel.querySelector('.sw-char-title') as HTMLElement | null;
    if (title) {
      title.textContent = this.dresser ? Lang.text('Mods.SandboxWorld.ClothesWindow.Title')
        : Lang.text('GameUI.HairStyle');
    }
    for (const b of Array.from(this.panel.querySelectorAll('.sw-cc-tab')) as HTMLElement[]) {
      b.title = Lang.text(TAB_TIP[b.dataset.tab ?? ''] ?? '');
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

  /** 预览：面板上方居中（MakeCharPreview :252-270），1.5x = 60×84（原版 UICharacter characterScale） */
  private drawPreview() {
    const ctx = this.previewCtx;
    ctx.clearRect(0, 0, 60, 84);
    const doll = compositePaperDoll(this.appearance);
    if (!doll) return;
    const f = dollFrame(doll, walkFrame(this.time));
    // 双保险（2026-08-24）：缓存条目可能被 tintCache 满清/contextlost 清理释放——
    // detached 位图 drawImage 会抛 InvalidStateError 炸掉 rAF 帧（预览人物消失）
    try {
      if (f.img instanceof ImageBitmap && f.img.width === 0) return;
      ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 0, 0, 60, 84);
    } catch { /* 本帧跳过，下帧缓存重建后自愈 */ }
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
    if (this.iconTintRaf) cancelAnimationFrame(this.iconTintRaf);
    if (this.sheetTimer) clearTimeout(this.sheetTimer);
    if (this.thumbTimer) clearTimeout(this.thumbTimer);
    if (this.escHandler) window.removeEventListener('keydown', this.escHandler);
    window.removeEventListener('resize', this.fitPanel);
    window.removeEventListener('orientationchange', this.fitPanel);
    window.visualViewport?.removeEventListener('resize', this.fitPanel);
    this.unsubKb?.();
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
    this.sliderFills = [null, null, null];
    this.sliderKnobs = [null, null, null];
    this.hexLabel = null;
    if (this.tab === 'info') this.buildInfo();
    else if (this.tab === 'look') this.buildLook();
    else if (this.tab === 'hair') this.buildHair();
    else this.buildColor();                    // hairColor/eye/skin/shirt/undershirt/pants/shoes
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
    this.queueIconTint();
    this.buildContent();
    // 随机后同步重烘当前页 sheet（buildLook/buildHair 尾部的 scheduleSheetBake(0)
    // 走 setTimeout 异步+retry 链依赖贴图重载——contextlost 清缓存后 retry 期格子
    // 全空（2026-08-24 用户实报）。同步烘一次立即出图，retry 链仍作兜底
    this.bakeSheets();
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
    // 名字条（UICharacterNameButton：480×40 长条 + 左标签 + 值区；输入走隐藏 input 捕获）
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
    // 中段：竖排四难度钮（上→下 = 旅程/经典/中核/硬核，:886-921 追加序）+ 描述气泡
    // （原版四钮 1/4 高无缝平铺，无性别行——性别走服装页签十样式）
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
    this.content.appendChild(box);
  }

  // ---- 服装页 ----

  private buildLook() {
    const box = el('div', 'sw-cc-look');
    const grid = el('div', 'sw-cc-styles');
    VALID_CLOTH_STYLES.forEach((styleId, i) => {
      const b = el('button', 'sw-cc-stylebtn');
      b.title = Lang.text('Mods.SandboxWorld.CharCreate.StyleId', styleId);
      b.style.left = `${i * 46 + (i < 5 ? 11 : 29)}px`;   // 男女组间 20px 空档（MakeClothStylesMenu :303-309）
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
    // 组下分隔线（:452-460 宽 442 @y89）+ 复制/粘贴/随机外观模板（:405-430）
    box.appendChild(el('i', 'sw-cc-looksep'));
    const low = el('div', 'sw-cc-looklow');
    low.append(
      this.smallBtn('Copy', 'Mods.SandboxWorld.CharCreate.CopyTemplate', () => { this.clipboard = { ...this.appearance }; }),
      this.smallBtn('Paste', 'Mods.SandboxWorld.CharCreate.PasteTemplate', () => {
        if (!this.clipboard) return;
        this.appearance = { ...this.clipboard, name: this.appearance.name };
        this.syncHslFromPart();
        this.queueIconTint();
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
    // ★网格复用（2026-08-24 用户报"切到发型列表卡一下"）：213 格 DOM 一次性构建，
    //  再入页只更新选中态+重烘贴图（content.innerHTML='' 全量重建=每次切页签卡顿）
    const prev = this.panel.querySelector('.sw-cc-hair') as HTMLElement | null;
    if (prev) {
      this.content.appendChild(prev);
      prev.querySelectorAll('.sw-cc-hairbtn').forEach((b) => {
        b.classList.toggle('active', this.appearance.hair === Number((b as HTMLElement).dataset.hair));
      });
      this.scheduleSheetBake(0);
      return;
    }
    const box = el('div', 'sw-cc-hair');
    const grid = el('div', 'sw-cc-hairgrid');
    const cols = 10;
    CHAR_CREATION_HAIRS.forEach((hairId, i) => {
      const b = el('button', 'sw-cc-hairbtn');
      b.title = Lang.text('Mods.SandboxWorld.CharCreate.HairId', hairId);
      b.dataset.hair = String(hairId);
      b.classList.toggle('active', this.appearance.hair === hairId);
      // 原版层序（UIHairStyleButton.DrawSelf :56-76）：面板 < 选中亮底 < 悬停框 < 头像（最后画，最上）
      b.appendChild(el('span', 'hl'));
      const thumb = el('i', 'sw-cc-thumb');
      thumb.style.backgroundPosition = `-${(i % cols) * 44}px -${Math.floor(i / cols) * 44}px`;
      if (this.hairSheetUrl) thumb.style.backgroundImage = `url(${this.hairSheetUrl})`;
      b.appendChild(thumb);
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
    this.queueIconTint();
  }

  private stepHair(dir: 1 | -1): void {
    const list = CHAR_CREATION_HAIRS;
    const idx = list.indexOf(this.appearance.hair);
    const next = idx < 0 ? 0 : (idx + dir + list.length) % list.length;
    this.setHair(list[next]);
  }

  // ---- 颜色页（部位 = 当前颜色页签） ----

  /** 取色器 HSL 走原版缩放域（ScaledHslToRgb :2359-2362 l×0.85+0.15 / RgbToScaledHsl
   *  :2364-2369 (l-0.15)/0.85 钳 [0,1]）——滑杆亮度全域映射实际亮度 [0.15,1]，
   *  七取色器色彩域/滑块位置/HEX 读数与原版一致。R24 修复：曾直用未缩放 HSL。 */
  private syncHslFromPart(): void {
    const c = this.appearance[this.colorPart] as RGBColor;
    this.hsl = rgbToScaledHsl(c.r, c.g, c.b);
  }

  private applyHslToPart(): void {
    const [h, s, l] = this.hsl;
    const [r, g, b] = hslToRgb(h, s, scaledLuminosity(l));
    (this.appearance[this.colorPart] as RGBColor) = {
      r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255),
    };
  }

  private buildColor() {
    const box = el('div', 'sw-cc-color');
    // HSL 三滑杆面板（UIPanel 220×104 Top 10；三杆行距 30，全 DOM）
    const panel = el('div', 'sw-cc-hslpanel sw-cc-panelbg');
    const sliders = el('div');
    for (const kind of [0, 1, 2] as const) {
      const track = el('div', 'sw-cc-slider');
      track.style.top = `${3 + kind * 30}px`;
      track.appendChild(el('i', 'sw-cc-sliderbar'));
      track.appendChild(el('i', 'sw-cc-sliderhl'));
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
    panel.appendChild(sliders);
    box.appendChild(panel);
    // HEX 框（UIPanel 100×32 右下；Click_CopyHex :1337）+ 复制/粘贴/随机（左下间距 40）
    const hexEl = el('div', 'sw-cc-hex');
    hexEl.appendChild(el('span', undefined, 'FFFFFF'));
    hexEl.title = Lang.text('Mods.SandboxWorld.CharCreate.CopyHex');
    this.hexLabel = hexEl;
    hexEl.addEventListener('click', () => this.copyHex());
    box.appendChild(hexEl);
    const low = el('div', 'sw-cc-colorlow');
    const hexBtns: Array<[string, string, () => void]> = [
      ['Copy', 'Mods.SandboxWorld.CharCreate.CopyHex', () => this.copyHex()],
      ['Paste', 'Mods.SandboxWorld.CharCreate.PasteHex', () => void this.pasteHex()],
      ['Randomize', 'Mods.SandboxWorld.CharCreate.RandomColor', () => {
        // 原版随机单色 = HSL 三分量均匀掷（GetRandomColorVector :1794）
        this.hsl = [Math.random(), Math.random(), Math.random()];
        this.applyHslToPart();
        this.redrawColorPage();
      }],
    ];
    hexBtns.forEach(([icon, tip, fn], i) => {
      const b = this.smallBtn(icon, tip, fn);
      b.style.left = `${i * 40}px`;
      low.appendChild(b);
    });
    box.appendChild(low);
    this.content.appendChild(box);
    this.redrawColorPage();
  }

  /** 滑杆渐变色（GetHSLSliderColorAt :1128-1141：三支全走 ScaledHslToRgb——
   *  色相杆 = (t,1,0.5)（实际亮度 0.5×0.85+0.15=0.575）；饱和/亮度杆随当前
   *  HSL 联动，亮度分量同样过 ×0.85+0.15 缩放） */
  private sliderColorAt(kind: 0 | 1 | 2, t: number): RGBColor {
    const [h, s, l] = this.hsl;
    const [r, g, b] = kind === 0 ? hslToRgb(t, 1, scaledLuminosity(0.5))
      : kind === 1 ? hslToRgb(h, t, scaledLuminosity(l))
      : hslToRgb(h, s, scaledLuminosity(t));
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
      // 滑块中心 x = 27 + 167*v（DrawValueBar :160-162）；CSS margin-left -5.5 已含半宽
      if (knob) knob.style.left = `${(27 + 167 * this.hsl[kind]).toFixed(2)}px`;
    }
    if (this.hexLabel) {
      (this.hexLabel.firstElementChild as HTMLElement).textContent =
        hex(this.appearance[this.colorPart] as RGBColor).toUpperCase();
    }
    this.queueIconTint();
    this.scheduleSheetBake();
  }

  private wireSlider(track: HTMLElement, kind: 0 | 1 | 2): void {
    // 取值矩形 = 杆内缩 (3,4,174,8)（DrawValueBar :150-153）→ value=(localX-3)/174。
    // localX 由 .sw-cc-sliderbar 自身 rect 归一化回本地 178 域:未缩放时 bar.left
    // =track.left+22、width=178 ⇒ 与旧式 (clientX-track.left-22-3)/174 数值严格
    // 相同;面板缩放(--cc-fit)后 rect 随之缩小,直减屏幕像素常数会错位,rect 化
    // 两态通用(knob left=27+167v 与渐变 stops 均为本地域,指针↔滑块保持一致)
    const apply = (e: PointerEvent) => {
      const bar = track.querySelector<HTMLElement>('.sw-cc-sliderbar');
      const rect = (bar ?? track).getBoundingClientRect();
      if (!rect.width) return;
      const localX = ((e.clientX - rect.left) / rect.width) * 178;
      const v = (localX - 3) / 174;
      this.hsl[kind] = Math.max(0, Math.min(1, v));
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
