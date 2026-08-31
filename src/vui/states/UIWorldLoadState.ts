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

  /** 进度回调（WorldGen/Game 的 (label,p[,local])）。
   *  ★原版对齐（2026-08-31）：长条=p=加权 TotalProgress（GenerationProgress.TotalProgress，
   *  经 Game 端 0.7 外层缩放）；短条=local=当前原版 pass 的段内 Value——与
   *  UIWorldLoad.DrawSelf :113-133 双杆逐字同义。local 缺省的兼容路径（读档
   *  tiles/settle/preload 等）保留旧十分位窗口回退。 */
  setProgress(label: string | undefined, rawP: number, local?: number) {
    const p = Number.isFinite(rawP) ? Math.max(0, Math.min(1, rawP)) : 0;   // NaN/越界防御
    const lc = local !== undefined && Number.isFinite(local)
      ? Math.max(0, Math.min(1, local)) : null;
    this.pct = p;
    this.bar.totalProgress = p;
    if (lc !== null) {
      this.bar.currentProgress = lc;               // 原版短条=当前 GenPass 段内 Value
    } else {
      // 兼容回退（原十分位窗口）：非生成管线的合成进度没有"段内"概念
      const win = Math.floor(p * 10) / 10;
      this.bar.currentProgress = Math.max(0, Math.min(1, (p - win) * 10));
    }
    // 后缀百分比优先用 local（0..100% 段内水位,同原版 Message 的 {0:0.0%} 填充位）；
    // 无 local（读档等合成标尺）维持既有总进度读数。
    const pctShown = lc !== null ? Math.round(lc * 100) : Math.round(p * 100);
    if (label !== undefined && label !== this.lastLabelKey) {
      this.lastLabelKey = label;
      const text = Lang.worldgenText(label);
      // 标签自带百分比时(读档 tiles/settle 原版水位文案"…X%")不再追加
      // " - X%"后缀——曾拼出"正在安置液体50% - 0%"双重百分比,且追加用的是
      // 阶段内 p 与标签水位不同标尺(2026-08-14)
      this.suffixMode = !text.includes('%');
      this.baseText = text;
      this.header.setText(this.suffixMode ? `${text} - ${pctShown}%` : text);
    } else if (this.suffixMode && this.baseText) {
      // label=undefined（GenProgress 粘滞文案）沿用 baseText，仅推进后缀数字；
      // 首条粘滞文案到达前（baseText 空,如 Reset 窗先于 Terrain 词条）不画空后缀
      this.header.setText(`${this.baseText} - ${pctShown}%`);
    }
  }
  private suffixMode = true;   // 标签不含 % 时才追加 " - X%" 后缀
  private baseText = '';
  /** 最近一次显示键（undefined 文案=粘滞沿用,不触发重翻译/换行计算） */
  private lastLabelKey: string | undefined = '';

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
