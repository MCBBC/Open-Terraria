// UI 根容器尺寸提供者（解 UIElement ↔ UserInterface 循环依赖）。
// UserInterface 构造时注入 provider = () => this.getDimensions()。
import { CalculatedStyle } from './CalculatedStyle';
import { UIScale } from '../draw/UIScale';
export const RootDimension = {
    provider: () => new CalculatedStyle(0, 0, UIScale.logicalW, UIScale.logicalH),
};
