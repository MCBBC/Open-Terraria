// VUI 框架布局/状态机单测（纯逻辑，不依赖 DOM 渲染）
import { describe, it, expect, beforeEach } from 'vitest';
import { UIElement } from '../src/vui/core/UIElement';
import { UIState } from '../src/vui/core/UIState';
import { UserInterface } from '../src/vui/core/UserInterface';
import { StyleDimension } from '../src/vui/core/StyleDimension';
import { CalculatedStyle } from '../src/vui/core/CalculatedStyle';
import { UIList } from '../src/vui/elements/UIList';
import { UIScale } from '../src/vui/draw/UIScale';
/** 测试内直接驱动鼠标逻辑坐标 */
function mouseAt(x, y) {
    UIScale.mouseX = x;
    UIScale.mouseY = y;
}
// UserInterface.activeInstance 需要提供全屏尺寸；Node 环境无 window，直接给 activeInstance 造一个
function setupUI() {
    const ui = new UserInterface();
    ui.getDimensions = () => new CalculatedStyle(0, 0, 1920, 1080);
    return ui;
}
describe('StyleDimension', () => {
    it('pixels + precent * containerSize', () => {
        expect(StyleDimension.fromPixels(10).getValue(800)).toBe(10);
        expect(StyleDimension.fromPercent(0.5).getValue(800)).toBe(400);
        expect(StyleDimension.fromPixelsAndPercent(10, 0.5).getValue(800)).toBe(410);
        expect(StyleDimension.Fill.getValue(100)).toBe(100);
        expect(StyleDimension.Empty.getValue(100)).toBe(0);
    });
});
describe('UIElement 三层盒模型', () => {
    beforeEach(() => { setupUI(); });
    it('margin → dimensions，padding → inner', () => {
        const el = new UIElement();
        el.left = StyleDimension.fromPixels(100);
        el.top = StyleDimension.fromPixels(50);
        el.width = StyleDimension.fromPixels(200);
        el.height = StyleDimension.fromPixels(100);
        el.marginLeft = 4;
        el.marginTop = 6;
        el.paddingLeft = 8;
        el.paddingTop = 10;
        el.recalculate();
        expect(el.getOuterDimensions().x).toBe(100);
        expect(el.getDimensions().x).toBe(104); // +marginLeft
        expect(el.getDimensions().y).toBe(56);
        expect(el.getInnerDimensions().x).toBe(112); // +paddingLeft
        expect(el.getInnerDimensions().y).toBe(66);
        // vanilla：outer 宽 = Width + marginL + marginR，dimensions 宽 = outer - marginL - marginR = Width
        expect(el.getOuterDimensions().width).toBe(200 + 4);
        expect(el.getDimensions().width).toBe(200);
    });
    it('HAlign 居中公式（UIElement.cs:252）', () => {
        const parent = new UIElement();
        parent.width = StyleDimension.fromPixels(400);
        parent.height = StyleDimension.fromPixels(300);
        parent.recalculate(); // 先让父级有尺寸，再挂子（对齐挂树后自上而下重排的时序）
        const child = new UIElement();
        child.width = StyleDimension.fromPixels(100);
        child.height = StyleDimension.fromPixels(50);
        child.hAlign = 0.5;
        child.vAlign = 0.5;
        parent.append(child);
        expect(child.getDimensions().x).toBeCloseTo((400 - 100) / 2, 5);
        expect(child.getDimensions().y).toBeCloseTo((300 - 50) / 2, 5);
    });
    it('Min/Max 钳制', () => {
        const el = new UIElement();
        el.width = StyleDimension.Fill;
        el.maxWidth = StyleDimension.fromPixels(100);
        el.height = StyleDimension.fromPixels(10);
        el.minHeight = StyleDimension.fromPixels(50);
        el.recalculate();
        expect(el.getDimensions().width).toBe(100);
        expect(el.getDimensions().height).toBe(50);
    });
    it('命中测试用 dimensions（不含 padding 区）', () => {
        const el = new UIElement();
        el.left = StyleDimension.fromPixels(100);
        el.top = StyleDimension.fromPixels(100);
        el.width = StyleDimension.fromPixels(50);
        el.height = StyleDimension.fromPixels(50);
        el.recalculate();
        expect(el.containsPoint({ x: 110, y: 110 })).toBe(true);
        expect(el.containsPoint({ x: 99, y: 110 })).toBe(false);
        expect(el.containsPoint({ x: 151, y: 110 })).toBe(false); // 右边界开区间
    });
});
describe('UIState 占满全屏', () => {
    it('Width/Height = Fill', () => {
        const ui = setupUI();
        const st = new UIState();
        st.recalculate();
        expect(st.getDimensions().width).toBe(1920);
        expect(st.getDimensions().height).toBe(1080);
        expect(ui).toBeTruthy();
    });
});
describe('UserInterface 状态机', () => {
    it('setState/goBack 历史（GoBack 回退两级）', () => {
        const ui = setupUI();
        const a = new UIState();
        const b = new UIState();
        const c = new UIState();
        ui.setState(a);
        ui.setState(b);
        ui.setState(c);
        expect(ui.current).toBe(c);
        ui.goBack(); // history [a,b,c] → 取 Count-2 即 b，移除 [b,c] 后 setState(b)
        expect(ui.current).toBe(b);
    });
    it('Click 要求抬起仍在同元素内', () => {
        const ui = setupUI();
        const st = new UIState();
        const btn = new UIElement();
        btn.width = StyleDimension.fromPixels(100);
        btn.height = StyleDimension.fromPixels(50);
        st.append(btn);
        ui.setState(st);
        let clicks = 0;
        btn.onClick(() => clicks++);
        // btn 内按下、抬起 → 1 次 Click
        mouseAt(50, 25);
        ui.update(250, true, false, true, 0); // 等 200ms 抑制结束再按
        ui.update(16, false, false, true, 0);
        expect(clicks).toBe(1);
        // btn 内按下、移出后抬起 → 不产生 Click
        mouseAt(50, 25);
        ui.update(16, true, false, true, 0);
        mouseAt(500, 500);
        ui.update(16, false, false, true, 0);
        expect(clicks).toBe(1);
    });
    it('双击 500ms 窗口', () => {
        const ui = setupUI();
        const st = new UIState();
        const btn = new UIElement();
        btn.width = StyleDimension.fromPixels(100);
        btn.height = StyleDimension.fromPixels(50);
        st.append(btn);
        ui.setState(st);
        let doubles = 0;
        btn.onDoubleClick(() => doubles++);
        mouseAt(50, 25);
        ui.update(250, true, false, true, 0); // 跨过抑制期
        ui.update(16, false, false, true, 0);
        for (const pressed of [true, false])
            ui.update(100, pressed, false, true, 0); // 间隔 <500ms
        expect(doubles).toBe(1);
        // 间隔 >500ms 不算双击
        for (const pressed of [true, false])
            ui.update(600, pressed, false, true, 0);
        expect(doubles).toBe(1);
    });
    it('右键独立事件（1.4.5.6 Left*/Right* 拆分）', () => {
        const ui = setupUI();
        const st = new UIState();
        const btn = new UIElement();
        btn.width = StyleDimension.fromPixels(100);
        btn.height = StyleDimension.fromPixels(50);
        st.append(btn);
        ui.setState(st);
        let leftClicks = 0, rightClicks = 0;
        btn.onClick(() => leftClicks++);
        btn.onRightClick(() => rightClicks++);
        mouseAt(50, 25);
        ui.update(250, true, false, true, 0); // 左键按下
        ui.update(16, false, false, true, 0); // 左键抬起
        ui.update(16, false, true, true, 0); // 右键按下
        ui.update(16, false, false, true, 0); // 右键抬起
        expect(leftClicks).toBe(1);
        expect(rightClicks).toBe(1);
    });
    it('PassThroughMouseInteraction 命中穿透（1.4.5.6 GetElementAt）', () => {
        const ui = setupUI();
        const st = new UIState();
        const back = new UIElement();
        back.width = StyleDimension.fromPixels(100);
        back.height = StyleDimension.fromPixels(50);
        const front = new UIElement();
        front.width = StyleDimension.fromPixels(100);
        front.height = StyleDimension.fromPixels(50);
        front.passThroughMouseInteraction = true;
        st.append(back);
        st.append(front); // 后添加的通常优先，但 passThrough → 命中 back
        mouseAt(50, 25);
        const hit = st.getElementAt({ x: 50, y: 25 });
        expect(hit).toBe(back);
        front.passThroughMouseInteraction = false;
        expect(st.getElementAt({ x: 50, y: 25 })).toBe(front);
    });
    it('状态切换后 200ms 点击抑制', () => {
        const ui = setupUI();
        const st = new UIState();
        const btn = new UIElement();
        btn.width = StyleDimension.fromPixels(100);
        btn.height = StyleDimension.fromPixels(50);
        st.append(btn);
        let clicks = 0;
        btn.onClick(() => clicks++);
        ui.setState(st); // 切换瞬间置 200ms 抑制
        mouseAt(50, 25);
        ui.update(16, true, false, true, 0);
        ui.update(16, false, false, true, 0);
        expect(clicks).toBe(0); // 被抑制
        ui.update(200, true, false, true, 0);
        ui.update(16, false, false, true, 0);
        expect(clicks).toBe(1); // 200ms 后恢复
    });
});
describe('UIList 布局', () => {
    it('子元素纵向排布 + ListPadding', () => {
        setupUI();
        const list = new UIList();
        list.width = StyleDimension.fromPixels(200);
        list.height = StyleDimension.fromPixels(400);
        list.listPadding = 10;
        for (let i = 0; i < 3; i++) {
            const item = new UIElement();
            item.width = StyleDimension.fromPixels(200);
            item.height = StyleDimension.fromPixels(50);
            list.add(item);
        }
        list.recalculate();
        const ys = list.children[0].children.map((c) => c.getOuterDimensions().y);
        // vanilla：每项后都加 ListPadding（含尾随）→ 步长 = 高度 + padding
        expect(ys[1] - ys[0]).toBe(60);
        expect(ys[2] - ys[1]).toBe(60);
        expect(list.getTotalHeight()).toBeCloseTo(180, 5);
    });
    it('子元素父高度视为 Infinity（percent 高度不被裁剪）', () => {
        setupUI();
        const list = new UIList();
        list.width = StyleDimension.fromPixels(200);
        list.height = StyleDimension.fromPixels(100);
        const item = new UIElement();
        item.width = StyleDimension.fromPixels(200);
        item.height = StyleDimension.fromPercent(1); // 占父高——UIList 下视为无穷
        list.add(item);
        list.recalculate();
        // percent 高度按 MAX_VALUE 父高计算 → 不受 UIList 自身 100px 高度约束
        expect(item.getDimensions().height).toBe(Number.MAX_VALUE);
    });
});
