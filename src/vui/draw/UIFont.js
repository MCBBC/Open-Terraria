// @font-face 注入 + 字体就绪等待。
// 字体：Fusion Pixel 12px proportional zh_hans（OFL 许可，public/fonts/）。
import { PixelText } from './PixelText';
let injected = false;
export const UIFont = {
    /** 注入 @font-face（幂等）并等待字体可用。失败回退系统字体。 */
    async load() {
        if (!injected) {
            injected = true;
            const style = document.createElement('style');
            style.textContent = `
        @font-face {
          font-family: "Fusion Pixel 12px";
          src: url("fonts/fusion-pixel-12px-proportional-zh_hans.ttf.woff2") format("woff2");
          font-display: block;
          font-weight: normal;
          font-style: normal;
        }
      `;
            document.head.appendChild(style);
        }
        const ok = await PixelText.load();
        if (!ok)
            console.warn('[UIFont] Fusion Pixel 加载失败，回退系统字体');
    },
};
