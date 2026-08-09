// 移植自 Terarria1405/UI/UIState.cs：占满全屏的根容器
import { UIElement } from './UIElement';
import { StyleDimension } from './StyleDimension';

export class UIState extends UIElement {
  constructor() {
    super();
    this.width = StyleDimension.Fill;
    this.height = StyleDimension.Fill;
    this.recalculate();
  }
}
