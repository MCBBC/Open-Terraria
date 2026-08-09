// 名字输入框（UICharacterNameButton 的 Web 等价）：
// Canvas 上只绘制当前文本；点击聚焦隐藏 DOM input 接管键盘/IME。
import { UITextPanel } from './UITextPanel';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { rgb } from '../draw/UISpriteBatch';

let hiddenInput: HTMLInputElement | null = null;
function getHiddenInput(): HTMLInputElement {
  if (!hiddenInput) {
    hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.style.cssText = 'position:absolute;left:-100px;top:0;width:10px;opacity:0;';
    document.body.appendChild(hiddenInput);
  }
  return hiddenInput;
}

export class UITextBox extends UITextPanel {
  focused = false;
  private caretTime = 0;

  constructor(text: string, public maxLength: number, public placeholder = '请输入…') {
    super(text, 0.9);
    this.minWidth = StyleDimension.fromPixels(260);
    this.onClick(() => this.focus());
  }

  focus() {
    const inp = getHiddenInput();
    inp.value = this.text;
    inp.maxLength = this.maxLength;
    inp.oninput = () => {
      this.setText(inp.value);
      this.onChange?.(inp.value);
    };
    inp.onblur = () => { this.focused = false; };
    this.focused = true;
    inp.focus();
  }

  /** 文本变化回调 */
  onChange: ((v: string) => void) | null = null;

  /** 当前文本（外部读取用） */
  get value(): string { return this.text; }

  update(): void {
    this.caretTime += 1 / 60;
    super.update();
  }

  protected drawText(batch: UISpriteBatch) {
    if (!this.text && this.placeholder) {
      const saved = this.text;
      this.text = this.placeholder;
      this._color = rgb(150, 150, 150);
      super.drawText(batch);
      this.text = saved;
      this._color = rgb(255, 255, 255);
      return;
    }
    super.drawText(batch);
    if (this.focused && Math.floor(this.caretTime * 2) % 2 === 0) {
      const inner = this.getInnerDimensions();
      const w = this.textSize;
      batch.fillRect(inner.x + 6 + w, inner.y + 2, 2, 14, rgb(255, 255, 255));
    }
  }
}
