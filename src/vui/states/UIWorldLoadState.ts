// 移植 UIWorldLoad.cs：UIHeader 阶段文字 + UIGenProgressBar 双进度条 + 底部小贴士。
// 外加用户特有需求：左侧 GenWorldPreview 实时地图预览。
import { UIState } from '../core/UIState';
import { UIHeader } from '../elements/UIHeader';
import { UIGenProgressBar } from '../elements/UIGenProgressBar';
import { UIText } from '../elements/UIText';
import { StyleDimension } from '../core/StyleDimension';
import { rgb } from '../draw/UISpriteBatch';
import { GenWorldPreview } from './GenWorldPreview';
import { Lang } from '../../i18n/Lang';
import type { World } from '../../world/World';

const TIPS = [
  '提示：按住空格键可以跳得更高。',
  '提示：火把是探索洞穴的必备品。',
  '提示：把生命水晶捏在手里使用可以提升生命上限。',
  '提示：按 E 打开背包查看合成配方。',
  '提示：在沙子上行走要小心，下面可能什么都没有。',
];

export class UIWorldLoadState extends UIState {
  private header: UIHeader;
  private bar = new UIGenProgressBar();
  private preview: GenWorldPreview | null = null;
  private lastLabel = '';
  private pct = 0;
  private time = 0;

  constructor(evil?: -1 | 0 | 1) {
    super();
    const logicalH = this.getDimensions().height;
    // 1.4.5.6：随机邪恶（generatingRandomEvil）用 Outer_Random 专属配色
    this.bar.randomEvil = evil === undefined || evil === -1;

    this.header = new UIHeader('');
    this.header.hAlign = 0.5;
    this.header.top = StyleDimension.fromPixels(UIGenProgressBar.topForScreenH(logicalH) - 70);
    this.append(this.header);

    this.bar.hAlign = 0.5;
    this.bar.top = StyleDimension.fromPixels(UIGenProgressBar.topForScreenH(logicalH));
    this.append(this.bar);

    const tip = new UIText(TIPS[Math.floor(Math.random() * TIPS.length)], 0.8);
    tip.hAlign = 0.5;
    tip.top = StyleDimension.fromPixels(logicalH - 40);
    tip.setTextColor(rgb(210, 210, 230));
    this.append(tip);
  }

  /** 进度回调（WorldGen/Game 的 (label, p)） */
  setProgress(label: string, p: number) {
    this.pct = p;
    this.bar.totalProgress = p;
    // 段内进度：10% 窗口的局部比例（长 pass 内也有可见移动）
    const win = Math.floor(p * 10) / 10;
    this.bar.currentProgress = Math.max(0, Math.min(1, (p - win) * 10));
    if (label !== this.lastLabel) {
      this.lastLabel = label;
      const text = Lang.worldgenText(label);
      this.header.setText(`${text} - ${Math.round(p * 100)}%`);
    } else {
      this.header.setText(`${this.header.text.split(' - ')[0]} - ${Math.round(p * 100)}%`);
    }
  }

  /** WorldGen.onWorldPartial 回调：挂上部分世界，开启实时预览 */
  attachWorld(world: World) {
    if (this.preview) return;
    this.preview = new GenWorldPreview(world);
    this.append(this.preview);
    this.bar.crimson = !!world.crimson;
  }

  update(): void {
    this.time += 1 / 60;
    super.update();
  }

  /** 预览已挂载（测试用） */
  get hasPreview(): boolean { return this.preview != null; }
}
