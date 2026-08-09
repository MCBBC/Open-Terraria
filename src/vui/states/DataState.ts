// 临时「数据」面板（M1 过渡用）：
// 收纳旧 DOM 菜单的 继续存档/读档/导入 .wld/开发者模式，M6 被 SettingsRootState 的数据页替换。
import { UIState } from '../core/UIState';
import { UIPanel } from '../elements/UIPanel';
import { UITextPanel } from '../elements/UITextPanel';
import { StyleDimension } from '../core/StyleDimension';
import { rgb } from '../draw/UISpriteBatch';

export interface DataFlow {
  onQuickLoad(): void;
  onLoadFile(): void;
  onImportWld(): void;
  devMode: boolean;
  onToggleDev(): void;
  onBack(): void;
}

export class DataState extends UIState {
  private devLabel: UITextPanel;

  constructor(private flow: DataFlow) {
    super();
    const panel = new UIPanel();
    panel.hAlign = 0.5;
    panel.vAlign = 0.5;
    panel.width = StyleDimension.fromPixels(400);
    panel.setPadding(16);

    const mk = (label: string, fn: () => void, y: number): UITextPanel => {
      const b = new UITextPanel(label, 0.9);
      b.top = StyleDimension.fromPixels(y);
      b.hAlign = 0.5;
      b.minWidth = StyleDimension.fromPixels(300);
      b.onClick(fn);
      panel.append(b);
      return b;
    };

    mk('继续上次存档', () => flow.onQuickLoad(), 0);
    mk('读取存档文件… (.json)', () => flow.onLoadFile(), 52);
    mk('导入泰拉瑞亚地图 (.wld)…', () => flow.onImportWld(), 104);
    this.devLabel = mk(flow.devMode ? '开发者模式：开' : '开发者模式：关', () => {
      flow.onToggleDev();
      this.devLabel.setText(flow.devMode ? '开发者模式：开' : '开发者模式：关');
    }, 156);
    mk('返回', () => flow.onBack(), 208);

    this.append(panel);
  }
}
