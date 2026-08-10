// M0 验收用 demo state：Panel/TextPanel/UIList+Scrollbar/UIImage/UIHeader 组合展示。
// 入口：?vuidemo=1（main.ts 临时挂接，M1 后移除）
import { UIState } from '../core/UIState';
import { UIPanel } from '../elements/UIPanel';
import { UITextPanel } from '../elements/UITextPanel';
import { UIText } from '../elements/UIText';
import { UIList } from '../elements/UIList';
import { UIScrollbar } from '../elements/UIScrollbar';
import { UIImage } from '../elements/UIImage';
import { UIHeader } from '../elements/UIHeader';
import { StyleDimension } from '../core/StyleDimension';
import { rgb } from '../draw/UISpriteBatch';
import { Lang } from '../../i18n/Lang';
export class VuiDemoState extends UIState {
    constructor() {
        super();
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "clickCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        const root = new UIPanel();
        root.hAlign = 0.5;
        root.top = StyleDimension.fromPixels(40);
        root.width = StyleDimension.fromPixels(560);
        root.height = StyleDimension.fromPixels(420);
        root.setPadding(14);
        const header = new UIHeader('VUI 框架演示');
        header.hAlign = 0.5;
        root.append(header);
        const play = new UITextPanel(Lang.loaded ? Lang.text('UI.Play') : 'Play 开始游戏', 0.85);
        play.top = StyleDimension.fromPixels(70);
        play.hAlign = 0.5;
        play.onClick(() => {
            this.clickCount++;
            this.log.setText(`点击次数: ${this.clickCount}`);
        });
        root.append(play);
        // UIList + Scrollbar
        const list = new UIList();
        list.top = StyleDimension.fromPixels(120);
        list.width = StyleDimension.fromPixels(260);
        list.height = StyleDimension.fromPixels(240);
        const scrollbar = new UIScrollbar();
        scrollbar.height = StyleDimension.Fill;
        scrollbar.top = StyleDimension.fromPixels(0);
        scrollbar.left = StyleDimension.fromPixels(264);
        list.setScrollbar(scrollbar);
        root.append(scrollbar);
        root.append(list);
        for (let i = 0; i < 30; i++) {
            const item = new UITextPanel(`列表项 ${i + 1}`, 0.8);
            item.textColor = rgb(220, 220, 255);
            list.add(item);
        }
        // 图片（logo 帧）
        const img = new UIImage('logo_1', 0.5);
        img.top = StyleDimension.fromPixels(120);
        img.left = StyleDimension.fromPixels(320);
        root.append(img);
        this.log = new UIText('点击上方按钮试试', 0.9);
        this.log.top = StyleDimension.fromPixels(380);
        this.log.hAlign = 0.5;
        this.log.setTextColor(rgb(255, 220, 120));
        root.append(this.log);
        this.append(root);
    }
}
