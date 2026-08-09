// 移植 UIWorldCreation.cs：世界名/种子 + 大小/难度/邪恶三组选项 + 描述面板 + 多层预览图。
// 布局参考原版 BuildPage（500×452）：本实现 560×460 与角色页统一。
import { UIState } from '../core/UIState';
import { UIElement } from '../core/UIElement';
import { UIPanel } from '../elements/UIPanel';
import { UITextPanel } from '../elements/UITextPanel';
import { UIText } from '../elements/UIText';
import { GroupOptionButton } from '../elements/GroupOptionButton';
import { UITextBox } from '../elements/UITextBox';
import { UIImage } from '../elements/UIImage';
import { StyleDimension } from '../core/StyleDimension';
import { rgb } from '../draw/UISpriteBatch';
import { UITextures } from '../assets/UITextures';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { parseSeed, randomWorldName } from '../../world/gen/SeedEasterEggs';

export interface WorldCreationFlow {
  /** 提交创建。seed 为用户输入原文；evil: -1 随机 0 腐化 1 猩红 */
  onCreate(cfg: { name: string; seed: string; w: number; h: number; difficulty: number; evil: -1 | 0 | 1 }): void;
  onCancel(): void;
}

interface Opt { label: string; icon: string; desc: string; }
interface SizeOpt extends Opt { w: number; h: number; }

const SIZES: SizeOpt[] = [
  { label: '小', w: 4200, h: 1200, icon: 'UI_WorldCreation_IconSizeSmall', desc: '小世界：适合快速探索，生成最快。' },
  { label: '中', w: 6400, h: 1800, icon: 'UI_WorldCreation_IconSizeMedium', desc: '中等世界：体验均衡。' },
  { label: '大', w: 8400, h: 2400, icon: 'UI_WorldCreation_IconSizeLarge', desc: '大世界：广袤辽阔，探索耗时最长。' },
];
const DIFFS: Opt[] = [
  { label: '经典', icon: 'UI_WorldCreation_IconDifficultyNormal', desc: '经典模式：标准体验。' },
  { label: '专家', icon: 'UI_WorldCreation_IconDifficultyExpert', desc: '专家模式：更难的敌怪，更好的战利品。' },
  { label: '大师', icon: 'UI_WorldCreation_IconDifficultyMaster', desc: '大师模式：为高玩准备的终极考验。' },
  { label: '旅程', icon: 'UI_WorldCreation_IconDifficultyCreative', desc: '旅程模式：以自己的节奏研究和游玩。' },
];
const EVILS: Array<Opt & { value: -1 | 0 | 1 }> = [
  { label: '随机', icon: 'UI_WorldCreation_IconEvilRandom', desc: '让命运决定世界的邪恶形态。', value: -1 },
  { label: '腐化', icon: 'UI_WorldCreation_IconEvilCorruption', desc: '腐化之地：噬魂怪与诅咒之地。', value: 0 },
  { label: '猩红', icon: 'UI_WorldCreation_IconEvilCrimson', desc: '猩红之地：血肉与恐怖的噩梦。', value: 1 },
];

/** 多层预览图（UIWorldCreationPreview：地形剪影 + 难度/邪恶图标层 + 边框） */
class WorldPreview extends UIElement {
  constructor(private getSel: () => { size: number; diff: number; evil: number }) {
    super();
    this.width = StyleDimension.fromPixels(120);
    this.height = StyleDimension.fromPixels(120);
  }

  protected drawSelf(batch: UISpriteBatch): void {
    const d = this.getDimensions();
    const { size, diff, evil } = this.getSel();
    const layer = (k: string | null) => (k ? UITextures.get(k) : null);
    const sizeTex = layer(['UI_WorldCreation_PreviewSizeSmall', 'UI_WorldCreation_PreviewSizeMedium', 'UI_WorldCreation_PreviewSizeLarge'][size]);
    const diffTex = layer(['UI_WorldCreation_PreviewDifficultyNormal2', 'UI_WorldCreation_PreviewDifficultyExpert2', 'UI_WorldCreation_PreviewDifficultyMaster2', 'UI_WorldCreation_PreviewDifficultyCreative2'][diff]);
    const evilTex = layer(['UI_WorldCreation_PreviewEvilRandom', 'UI_WorldCreation_PreviewEvilCorruption', 'UI_WorldCreation_PreviewEvilCrimson'][evil]);
    if (sizeTex) batch.draw(sizeTex, d.x, d.y);
    if (diffTex) batch.draw(diffTex, d.x, d.y);
    if (evilTex) batch.draw(evilTex, d.x, d.y);
    const border = UITextures.get('UI_WorldCreation_PreviewBorder');
    if (border) batch.draw(border, d.x, d.y);
  }
}

export class UIWorldCreationState extends UIState {
  private panel!: UIPanel;
  private nameBox: UITextBox;
  private seedBox: UITextBox;
  private descText: UIText;
  /** 彩蛋种子图标（输入彩蛋种子时显示对应 Seed_*.png） */
  private seedIcon: UIImage;
  private sel = { size: 1, diff: 0, evil: 0 }; // 默认：中/经典/随机（对齐原版 SetDefaultOptions）

  constructor(private flow: WorldCreationFlow) {
    super();

    this.panel = new UIPanel();
    this.panel.hAlign = 0.5;
    this.panel.vAlign = 0.5;
    this.panel.width = StyleDimension.fromPixels(560);
    this.panel.height = StyleDimension.fromPixels(460);
    this.panel.setPadding(14);
    this.append(this.panel);

    // 右上：预览图
    const preview = new WorldPreview(() => this.sel);
    preview.top = StyleDimension.fromPixels(4);
    preview.left = StyleDimension.fromPixels(420);
    this.panel.append(preview);

    // 世界名 / 种子 + 随机按钮
    this.nameBox = new UITextBox(randomWorldName(), 27, '世界名…');
    this.seedBox = new UITextBox('', 40, '种子（可选）…');
    this.addRow(this.nameBox, 4, 'UI_WorldCreation_IconRandomName', () => this.nameBox.setText(randomWorldName()));
    this.addRow(this.seedBox, 46, 'UI_WorldCreation_IconRandomSeed', () => {
      this.seedBox.setText(String(Math.floor(Math.random() * 1e9)));
    });
    // 彩蛋种子图标（种子变化时联动）
    this.seedIcon = new UIImage('UI_WorldCreation_Seed_Normal', 1);
    this.seedIcon.top = StyleDimension.fromPixels(90);
    this.seedIcon.left = StyleDimension.fromPixels(436);
    this.seedIcon.ignoresMouseInteraction = true;
    this.seedBox.onChange = () => this.refreshSeedIcon();
    this.panel.append(this.seedIcon);

    // 三组选项标题
    for (const [y, label] of [[88, '世界大小'], [140, '游戏难度'], [192, '邪恶群系']] as const) {
      const t = new UIText(label, 0.7);
      t.top = StyleDimension.fromPixels(y);
      t.setTextColor(rgb(180, 180, 210));
      this.panel.append(t);
    }

    // 描述面板（悬停选项时显示描述）
    const descPanel = new UITextPanel('', 0.75);
    descPanel.top = StyleDimension.fromPixels(256);
    descPanel.left = StyleDimension.fromPixels(70);
    descPanel.width = StyleDimension.fromPixels(400);
    descPanel.height = StyleDimension.fromPixels(90);
    this.panel.append(descPanel);
    this.descText = new UIText('', 0.75);
    this.descText.top = StyleDimension.fromPixels(268);
    this.descText.left = StyleDimension.fromPixels(82);
    this.descText.width = StyleDimension.fromPixels(380);
    this.descText.isWrapped = true;
    this.descText.setTextColor(rgb(220, 220, 240));
    this.panel.append(this.descText);

    // 底部：返回 / 创建
    const back = new UITextPanel('返回', 0.9);
    back.top = StyleDimension.fromPixels(396);
    back.left = StyleDimension.fromPixels(300);
    back.minWidth = StyleDimension.fromPixels(100);
    back.onClick(() => flow.onCancel());
    this.panel.append(back);
    const create = new UITextPanel('创建', 0.9);
    create.top = StyleDimension.fromPixels(396);
    create.left = StyleDimension.fromPixels(410);
    create.minWidth = StyleDimension.fromPixels(100);
    create.onClick(() => this.submit());
    this.panel.append(create);

    this.buildGroups();
    this.refreshSeedIcon();
  }

  /** 名称/种子行 + 右侧随机按钮 */
  private addRow(box: UITextBox, y: number, iconKey: string, onRandom: () => void) {
    box.width = StyleDimension.fromPixels(300);
    box.top = StyleDimension.fromPixels(y);
    this.panel.append(box);
    const btn = new UIImage(iconKey, 1);
    btn.top = StyleDimension.fromPixels(y + 4);
    btn.left = StyleDimension.fromPixels(348);
    btn.onClick(onRandom);
    this.panel.append(btn);
  }

  /** 三组互斥选项行（选中态/悬停描述联动） */
  private buildGroups() {
    for (const c of [...this.panel.children]) {
      if (c instanceof GroupOptionButton) this.panel.removeChild(c);
    }
    const rows: Array<[Opt[], number, number, (i: number) => void]> = [
      [SIZES, 100, this.sel.size, (i) => { this.sel.size = i; this.buildGroups(); }],
      [DIFFS, 152, this.sel.diff, (i) => { this.sel.diff = i; this.buildGroups(); }],
      [EVILS, 204, this.sel.evil, (i) => { this.sel.evil = i; this.buildGroups(); }],
    ];
    for (const [opts, y, selected, onPick] of rows) {
      opts.forEach((o, i) => {
        const b = new GroupOptionButton(i, o.label, o.icon, o.desc, () => onPick(i), (v) => {
          this.descText.setText(v == null ? '' : opts[v]?.desc ?? '');
        });
        b.top = StyleDimension.fromPixels(y);
        b.left = StyleDimension.fromPixels(i * 110);
        b.setSelected(selected === i);
        this.panel.append(b);
      });
    }
  }

  /** 彩蛋种子图标联动（输入彩蛋种子时显示对应 Seed_*.png） */
  private refreshSeedIcon() {
    const { flags } = parseSeed(this.seedBox.value);
    const key = flags.everything ? 'Seed_Everything'
      : flags.drunkWorld ? 'Seed_Drunk'
      : flags.notTheBees ? 'Seed_NotTheBees'
      : flags.getGoodWorld ? 'Seed_ForTheWorthy'
      : flags.theConstant ? 'Seed_TheConstant'
      : flags.skyblock ? 'Seed_Skyblock'
      : flags.tenthAnniversary ? 'Seed_Celebration'
      : flags.noTraps ? 'Seed_NoTraps'
      : flags.remix ? 'Seed_Remix'
      : 'Seed_Normal';
    this.seedIcon.textureKey = `UI_WorldCreation_${key}`;
  }

  private submit() {
    const size = SIZES[this.sel.size];
    const seed = this.seedBox.value.trim();
    const { specialName } = parseSeed(seed);
    const name = this.nameBox.value.trim() || specialName || '新世界';
    this.flow.onCreate({
      name,
      seed,
      w: size.w, h: size.h,
      difficulty: this.sel.diff,
      evil: EVILS[this.sel.evil].value,
    });
  }
}
