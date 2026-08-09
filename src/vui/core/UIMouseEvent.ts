// 移植自 Terarria1405/UI/UIMouseEvent.cs / UIScrollWheelEvent.cs
import type { UIElement } from './UIElement';

export class UIMouseEvent {
  constructor(public target: UIElement, public mousePosition: { x: number; y: number }) {}
}

export class UIScrollWheelEvent {
  constructor(public target: UIElement, public mousePosition: { x: number; y: number }, public scrollWheelValue: number) {}
}
