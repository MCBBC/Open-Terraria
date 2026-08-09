// 移植 UICharacterCreation.cs：500×~420 面板。
// 左：大预览（animated）。右上：分类条（信息/衣服/发型 + 7 取色器入口）。
// 右中：分类内容。右下：随机 + 返回/创建。
// 颜色编辑 = 选中取色器后出现 HSL 三滑条（UIColoredSliderSimple）。
import { UIState } from '../core/UIState';
import { UIPanel } from '../elements/UIPanel';
import { UITextPanel } from '../elements/UITextPanel';
import { UIText } from '../elements/UIText';
import { UIList } from '../elements/UIList';
import { UIScrollbar } from '../elements/UIScrollbar';
import { UIImageButton } from '../elements/UIImage';
import { UICharacterPreview } from '../elements/UICharacterPreview';
import { UITextBox } from '../elements/UITextBox';
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { rgb, type Color } from '../draw/UISpriteBatch';
import { UITextures } from '../assets/UITextures';
import { UISfx } from '../UISfx';
import {
  type Appearance, type RGBColor, randomAppearance, HAIR_COUNT,
  DIFFICULTY_INFO, rgbToHsl, hslToRgb, VALID_CLOTH_STYLES,
} from '../../player/Appearance';
import { compositePaperDoll } from '../../player/PaperDoll';
import { UserInterface } from '../core/UserInterface';

export interface CharacterCreationFlow {
  onCreate(a: Appearance): void;
  onCancel(): void;
}

type Category = 'info' | 'clothing' | 'hair' | 'color';
type ColorKey = 'hairColor' | 'eyeColor' | 'skinColor' | 'shirtColor' | 'undershirtColor' | 'pantsColor' | 'shoeColor';

const COLOR_ENTRIES: Array<{ key: ColorKey; icon: string; label: string }> = [
  { key: 'hairColor', icon: 'UI_CharCreation_ColorHair', label: '发色' },
  { key: 'eyeColor', icon: 'UI_CharCreation_ColorEye', label: '瞳色' },
  { key: 'skinColor', icon: 'UI_CharCreation_ColorSkin', label: '肤色' },
  { key: 'shirtColor', icon: 'UI_CharCreation_ColorShirt', label: '上衣' },
  { key: 'undershirtColor', icon: 'UI_CharCreation_ColorUndershirt', label: '底衫' },
  { key: 'pantsColor', icon: 'UI_CharCreation_ColorPants', label: '裤子' },
  { key: 'shoeColor', icon: 'UI_CharCreation_ColorShoes', label: '鞋子' },
];

/** HSL 滑条（UIColoredSliderSimple 风格：色带轨道 + 可拖拽把手） */
class HslSlider extends UIElement {
  dragging = false;
  constructor(public label: string, public hueOnly = false, public onInput: (v: number) => void) {
    super();
    this.width = StyleDimension.fromPixels(180);
    this.height = StyleDimension.fromPixels(22);
    this.onMouseDown(() => { this.dragging = true; this.pick(); });
    this.onMouseUp(() => { this.dragging = false; });
  }

  private pick() {
    const U = UserInterface.activeInstance;
    if (!U) return;
    const d = this.getDimensions();
    const t = Math.max(0, Math.min(1, (U.mousePosition.x - d.x - 10) / Math.max(1, d.width - 20)));
    this.onInput(t);
  }

  protected drawSelf(batch: UISpriteBatch): void {
    if (this.dragging) this.pick();
    const d = this.getDimensions();
    const y = d.y + 8;
    const w = d.width - 20;
    batch.drawString(this.label, d.x, d.y, rgb(200, 200, 220), 0.7);
    for (let i = 0; i < w; i++) {
      const t = i / (w - 1);
      const [r, g, b] = this.hueOnly ? hslToRgb(t, 1, 0.5) : this.bandColor(t);
      batch.fillRect(d.x + 10 + i, y, 1, 10, { r: r * 255, g: g * 255, b: b * 255, a: 255 } as Color);
    }
  }

  private bandColor(t: number): [number, number, number] {
    // 饱和度/亮度滑条：灰→彩
    return [t, t, t];
  }
}

export class UICharacterCreationState extends UIState {
  private appearance: Appearance;
  /** 复制/粘贴模板（原版 Click_Copy/PastePlayerTemplate） */
  private clipboard: Appearance | null = null;
  private preview: UICharacterPreview;
  private content = new UIElement();
  private nameBox: UITextBox;
  private activeCategory: Category = 'info';
  private activeColor: ColorKey = 'hairColor';
  private hslContainer = new UIElement();
  private tabs = new Map<Category, UITextPanel>();

  constructor(private flow: CharacterCreationFlow) {
    super();
    this.appearance = randomAppearance();

    const panel = new UIPanel();
    panel.hAlign = 0.5;
    panel.vAlign = 0.5;
    panel.width = StyleDimension.fromPixels(560);
    panel.height = StyleDimension.fromPixels(440);
    panel.setPadding(14);
    this.append(panel);

    // 左：预览（放大版）
    this.preview = new UICharacterPreview(this.appearance, true, true, 1.6);
    this.preview.top = StyleDimension.fromPixels(80);
    this.preview.left = StyleDimension.fromPixels(20);
    panel.append(this.preview);

    // 分类条
    const tabs: Array<[Category, string]> = [['info', '角色信息'], ['clothing', '衣服'], ['hair', '发型']];
    tabs.forEach(([cat, label], i) => {
      const b = new UITextPanel(label, 0.85);
      b.top = StyleDimension.fromPixels(4);
      b.left = StyleDimension.fromPixels(180 + i * 90);
      b.minWidth = StyleDimension.fromPixels(80);
      b.onClick(() => this.setCategory(cat));
      this.tabs.set(cat, b);
      panel.append(b);
    });

    // 7 取色器入口（常显当前颜色；点击即进入取色视图——对齐原版取色器行为）
    COLOR_ENTRIES.forEach((e, i) => {
      const btn = new UIImageButton(e.icon, 1);
      btn.top = StyleDimension.fromPixels(36);
      btn.left = StyleDimension.fromPixels(180 + i * 38);
      btn.onClick(() => this.setColorKey(e.key));
      btn.onUpdate((el) => {
        const b2 = el as UIImageButton;
        const c = this.rgbToColor(this.appearance[e.key]);
        b2.setHoverColor(c);
        b2.setNormalColor(c);
      });
      panel.append(btn);
    });

    // 内容区
    this.content.width = StyleDimension.fromPixels(330);
    this.content.height = StyleDimension.fromPixels(290);
    this.content.top = StyleDimension.fromPixels(80);
    this.content.left = StyleDimension.fromPixels(180);
    panel.append(this.content);

    // 名字（info 分类内容的一部分，常驻顶部）
    this.nameBox = new UITextBox('', 20, '输入角色名…');
    this.nameBox.width = StyleDimension.fromPixels(320);
    this.nameBox.top = StyleDimension.fromPixels(0);
    this.nameBox.onChange = (v) => { this.appearance.name = v; };
    this.content.append(this.nameBox);

    // 底部：返回 / 创建（随机按钮在衣服页签，对齐原版布局）
    const back = new UITextPanel('返回', 0.9);
    back.top = StyleDimension.fromPixels(396);
    back.left = StyleDimension.fromPixels(300);
    back.minWidth = StyleDimension.fromPixels(100);
    back.onClick(() => flow.onCancel());
    panel.append(back);

    const create = new UITextPanel('创建', 0.9);
    create.top = StyleDimension.fromPixels(396);
    create.left = StyleDimension.fromPixels(410);
    create.minWidth = StyleDimension.fromPixels(100);
    create.onClick(() => {
      this.appearance.name = (this.appearance.name || '').trim() || '无名角色';
      flow.onCreate(this.appearance);
    });
    panel.append(create);

    this.buildContent();
  }

  private rgbToColor(c: RGBColor): Color { return rgb(c.r, c.g, c.b); }

  private setCategory(cat: Category) {
    this.activeCategory = cat;
    this.buildContent();
  }

  /** 点击取色器图标 → 切到取色视图（对齐原版：任何页签下点取色器都弹出 HSL 编辑） */
  private setColorKey(key: ColorKey) {
    this.activeColor = key;
    this.activeCategory = 'color';
    this.buildContent();
  }

  /** 页签高亮（选中项加背景，颜色页签时三个页签都不亮） */
  private refreshTabHighlight() {
    for (const [cat, tab] of this.tabs) {
      tab.backgroundColor = cat === this.activeCategory ? rgb(90, 110, 180, 220) : rgb(63, 82, 151, 200);
    }
  }

  private refresh() {
    this.preview.setAppearance(this.appearance);
    this.buildContent();
  }

  /** 重建内容区（分类切换/颜色切换后） */
  private buildContent() {
    this.content.removeAllChildren();
    this.content.append(this.nameBox);
    const y0 = 44;
    this.refreshTabHighlight();

    if (this.activeCategory === 'color') {
      // 取色视图：HSL 三滑条 + 当前颜色标签（文字用当前颜色）
      const label = COLOR_ENTRIES.find((e) => e.key === this.activeColor)?.label ?? '';
      const title = new UITextPanel(`${label} 颜色`, 0.9);
      title.top = StyleDimension.fromPixels(y0);
      title.width = StyleDimension.fromPixels(150);
      title.textColor = this.rgbToColor(this.appearance[this.activeColor]);
      this.content.append(title);
      this.appendHslSliders(y0 + 44);
    } else if (this.activeCategory === 'info') {
      // 难度四选（UIDifficultyButton：颜色 + 悬停描述）
      const DIFF_DESC = [
        '软核：掉落一半金币。',
        '中核：掉落所有金币和物品。',
        '硬核：死亡后掉落全部物品并变为幽灵。',
        '旅程：研究物品、复制、控制时间与难度。',
      ];
      const diffDesc = new UIText('', 0.7);
      diffDesc.top = StyleDimension.fromPixels(y0 + 160);
      diffDesc.left = StyleDimension.fromPixels(0);
      diffDesc.width = StyleDimension.fromPixels(320);
      diffDesc.setTextColor(rgb(200, 200, 225));
      DIFFICULTY_INFO.forEach((d, i) => {
        const b = new UITextPanel(d.label, 0.9);
        b.top = StyleDimension.fromPixels(y0 + i * 40);
        b.left = StyleDimension.fromPixels(0);
        b.width = StyleDimension.fromPixels(150);
        b.textColor = this.rgbToColor(d.color);
        b.onClick(() => {
          this.appearance.difficulty = i as Appearance['difficulty'];
          this.buildContent();
        });
        b.onMouseOver(() => diffDesc.setText(DIFF_DESC[i]));
        b.onMouseOut(() => diffDesc.setText(''));
        if (this.appearance.difficulty === i) b.backgroundColor = rgb(90, 110, 180, 220);
        this.content.append(b);
      });
      this.content.append(diffDesc);
    } else if (this.activeCategory === 'clothing') {
      // 衣服样式（UIClothStyleButton：44×80，内嵌该变体的小预览；两行各 5）
      VALID_CLOTH_STYLES.forEach((styleId, i) => {
        const row = Math.floor(i / 5), col = i % 5;
        const b = new ClothStyleButton(() => this.appearance, styleId, () => {
          this.appearance.skinVariant = styleId;
          this.refresh();
        });
        b.top = StyleDimension.fromPixels(y0 + row * 88);
        b.left = StyleDimension.fromPixels(col * 66);
        this.content.append(b);
      });
      // 模板按钮行（原版 Cloth 页底部：复制/粘贴/随机）
      const copy = new UIImageButton('UI_CharCreation_Copy', 1);
      copy.top = StyleDimension.fromPixels(y0 + 190);
      copy.left = StyleDimension.fromPixels(0);
      copy.onClick(() => { this.clipboard = { ...this.appearance }; });
      this.content.append(copy);
      const paste = new UIImageButton('UI_CharCreation_Paste', 1);
      paste.top = StyleDimension.fromPixels(y0 + 190);
      paste.left = StyleDimension.fromPixels(40);
      paste.onClick(() => {
        if (!this.clipboard) return;
        this.appearance = { ...this.clipboard, name: this.appearance.name };
        this.refresh();
      });
      this.content.append(paste);
      const rand = new UIImageButton('UI_CharCreation_Randomize', 1);
      rand.top = StyleDimension.fromPixels(y0 + 190);
      rand.left = StyleDimension.fromPixels(80);
      rand.onClick(() => {
        const name = this.appearance.name;
        this.appearance = randomAppearance(name);
        this.refresh();
      });
      this.content.append(rand);
    } else {
      // 发型列表（44×44 按钮网格 6 列）
      const list = new UIList();
      list.top = StyleDimension.fromPixels(y0);
      list.width = StyleDimension.fromPixels(320);
      list.height = StyleDimension.fromPixels(230);
      list.listPadding = 4;
      const scrollbar = new UIScrollbar();
      scrollbar.height = StyleDimension.fromPixels(230);
      scrollbar.top = StyleDimension.fromPixels(y0);
      scrollbar.left = StyleDimension.fromPixels(322);
      list.setScrollbar(scrollbar);
      this.content.append(scrollbar);
      this.content.append(list);
      for (let i = 1; i <= HAIR_COUNT; i++) {
        const b = new HairStyleButton(this.appearance, i, () => {
          this.appearance.hair = i;
          this.refresh();
        });
        list.add(b);
      }
    }
  }

  /** 当前颜色的 HSL 三滑条 */
  private appendHslSliders(y: number) {
    const c = this.appearance[this.activeColor];
    const [h, s, l] = rgbToHsl(c.r, c.g, c.b);
    const apply = (nh: number, ns: number, nl: number) => {
      const [r, g, b] = hslToRgb(nh, ns, nl);
      this.appearance[this.activeColor] = { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
      this.preview.setAppearance(this.appearance);
    };
    const mk = (label: string, val: number, hueOnly: boolean, on: (t: number) => void) => {
      const sl = new HslSlider(label, hueOnly, on);
      sl.top = StyleDimension.fromPixels(0);
      sl.left = StyleDimension.fromPixels(0);
      this.hslContainer.append(sl);
      void val;
    };
    this.hslContainer.removeAllChildren();
    this.content.append(this.hslContainer);
    mk('色调', h, true, (t) => apply(t, s, l));
    mk('饱和', s, false, (t) => apply(h, t, l));
    mk('亮度', l, false, (t) => apply(h, s, t));
    // 三个滑条纵向排布
    let yy = y;
    for (const child of this.hslContainer.children) {
      child.top = StyleDimension.fromPixels(yy);
      yy += 30;
    }
  }
}

/** 发型选择按钮（UIHairStyleButton：44×44 + 当前发型头像 + 选中高亮框） */
class HairStyleButton extends UIElement {
  constructor(private appearance: Appearance, public hairId: number, private onPick: () => void) {
    super();
    this.width = StyleDimension.fromPixels(52);
    this.height = StyleDimension.fromPixels(52);
    this.onClick(() => onPick());
  }

  protected drawSelf(batch: UISpriteBatch): void {
    const d = this.getDimensions();
    const bg = UITextures.get('UI_CharCreation_CategoryPanel');
    if (bg) batch.draw(bg, d.x + 3, d.y + 3, { scale: 1 });
    // 头像：纸娃娃站立帧头部裁剪（约上 24px）
    const doll = this.doll();
    if (doll) {
      batch.draw({ img: doll, sx: 0, sy: 0, sw: 40, sh: 26 }, d.x + 6, d.y + 12, { scale: 1 });
    }
    if (this.isMouseHovering) {
      const border = UITextures.get('UI_CharCreation_CategoryPanelBorder');
      if (border) batch.draw(border, d.x + 1, d.y + 1, { scale: 1 });
    }
    if (this.appearance.hair === this.hairId) {
      const sel = UITextures.get('UI_CharCreation_CategoryPanelHighlight');
      if (sel) batch.draw(sel, d.x + 1, d.y + 1, { scale: 1 });
    }
  }

  private _doll: HTMLCanvasElement | null = null;
  private doll(): HTMLCanvasElement | null {
    const key = `${this.hairId}`;
    if (this._dollKey === key && this._doll) return this._doll;
    this._dollKey = key;
    this._doll = compositePaperDoll({ ...this.appearance, hair: this.hairId });
    return this._doll;
  }
  private _dollKey = '';
}

/** 衣服样式按钮（UIClothStyleButton：44×80 面板 + 该变体的站立小预览，选中高亮框） */
class ClothStyleButton extends UIElement {
  private char: UICharacterPreview;
  private soundedHover = false;

  constructor(private getParentAppearance: () => Appearance, public styleId: number, onPick: () => void) {
    super();
    this.width = StyleDimension.fromPixels(44);
    this.height = StyleDimension.fromPixels(80);
    this.char = new UICharacterPreview({ ...getParentAppearance(), skinVariant: styleId }, false, false, 0.7);
    this.char.hAlign = 0.5;
    this.char.vAlign = 0.5;
    this.append(this.char);
    this.onClick(onPick);
    this.onMouseOver(() => { if (!this.soundedHover) UISfx.hover(); this.soundedHover = true; });
    this.onMouseOut(() => { this.soundedHover = false; });
  }

  update(): void {
    // 实时跟随父级外观颜色（换色后小预览同步）
    this.char.setAppearance({ ...this.getParentAppearance(), skinVariant: this.styleId });
    super.update();
  }

  protected drawSelf(batch: UISpriteBatch): void {
    const d = this.getDimensions();
    const panel = UITextures.get('UI_CharCreation_CategoryPanel');
    if (panel) batch.draw(panel, d.x, d.y, { alpha: 0.5 });
    if (this.getParentAppearance().skinVariant === this.styleId) {
      const sel = UITextures.get('UI_CharCreation_CategoryPanelHighlight');
      if (sel) batch.draw(sel, d.x + 3, d.y + 3);
    }
    if (this.isMouseHovering) {
      const border = UITextures.get('UI_CharCreation_CategoryPanelBorder');
      if (border) batch.draw(border, d.x, d.y);
    }
  }
}
