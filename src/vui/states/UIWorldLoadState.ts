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

// 原版语义:LoadingTips_Default 类别随机(109 键,构建期已剥离 {? 条件标记)

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

    const tip = new UIText(Lang.randomFromCategory('LoadingTips_Default') ?? '', 0.8);
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

  /** WorldGen.onWorldPartial 回调：挂上部分世界，开启实时预览（主线程 fallback 路径） */
  attachWorld(world: World) {
    if (this.preview) return;
    this.preview = new GenWorldPreview(world);
    this.append(this.preview);
    this.bar.crimson = !!world.crimson;
  }

  /** worker 路径的降采样预览帧（PreviewFrame）：位图模式直接上屏 */
  attachPreview(f: { width: number; height: number; rgba: Uint8ClampedArray }) {
    if (!this.preview) {
      this.preview = GenWorldPreview.fromFirstFrame(f.rgba, f.width, f.height);
      this.append(this.preview);
    } else if (this.preview instanceof GenWorldPreview) {
      this.preview.setPreviewFrame(f.rgba, f.width, f.height);
    }
  }

  update(): void {
    this.time += 1 / 60;
    super.update();
  }

  /** 预览已挂载（测试用） */
  get hasPreview(): boolean { return this.preview != null; }
}
