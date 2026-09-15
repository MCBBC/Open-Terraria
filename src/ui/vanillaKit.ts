// 原版 UI kit（DOM 侧共享）：UIPanel 9-slice 白模预染色 + 悬停金框 + 文本面板按钮。
// 规格（反编译）：
//  · UIPanel.cs:14-33/50-70：PanelBorder/PanelBackground 28² 白模，corner 12/bar 4
//    九宫拉伸；背景 tint Color(63,82,151)×0.7、边 tint Black
//  · 悬停（UICharacterSelect.cs:125-132 MouseOver/Out）：背景 Color(73,94,171)、
//    边 Colors.FancyUIFatButtonMouseOver = Main.OurFavoriteColor(255,231,69)（Main.cs:868）
//  · UITextPanel = UIPanel + 居中文本（菜单按钮形态）
// DOM 实现：白模 canvas 预染色 → dataURL → CSS 变量 + border-image 12 fill stretch
// （fill 中段透明露出元素底色；拉伸语义与 DrawPanel 的 bar 拉伸一致）。
const BORDER_SRC = 'sprites/vanilla-ui/UI_PanelBorder.png';

/** 白模染色（multiply+destination-in，MenuBackground.tinted 同技法）→ dataURL */
const tintCache = new Map<string, string>();
function tintedDataUrl(src: string, color: string): Promise<string> {
  const key = src + '|' + color;
  const hit = tintCache.get(key);
  if (hit) return Promise.resolve(hit);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d')!;
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = color;
      g.fillRect(0, 0, cv.width, cv.height);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(img, 0, 0);
      const url = cv.toDataURL();
      tintCache.set(key, url);
      res(url);
    };
    img.src = src;
  });
}

const KIT_STYLE_ID = 'sw-vanilla-kit';

/** 白模染色(XNA Color 乘 RGBA:rgb=multiply、alpha=tex.a×aMul;CharCreation.bakeTint
 *  同技法)→ dataURL。UIPanel/UIHorizontalSeparator 等 9-slice 白模进 border-image
 *  前的预染色通道——色值一律由调用侧传反编译常量数值(禁目测)。按 (src|色) 缓存,
 *  失败解析为 ''(调用侧保留纯色兜底层)。 */
const sliceTintCache = new Map<string, Promise<string>>();
export function tintedSliceDataUrl(src: string, r: number, g: number, b: number, aMul: number): Promise<string> {
  const key = `${src}|${r},${g},${b},${aMul}`;
  const hit = sliceTintCache.get(key);
  if (hit) return hit;
  const p = new Promise<string>((res) => {
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const c = cv.getContext('2d', { willReadFrequently: true })!;
        c.imageSmoothingEnabled = false;
        c.drawImage(img, 0, 0);
        c.globalCompositeOperation = 'multiply';
        c.fillStyle = `rgb(${r},${g},${b})`;
        c.fillRect(0, 0, cv.width, cv.height);
        c.globalCompositeOperation = 'destination-in';
        c.globalAlpha = aMul;
        c.drawImage(img, 0, 0);
        res(cv.toDataURL());
      } catch { res(''); }
    };
    img.onerror = () => res('');
    img.src = src;
  });
  sliceTintCache.set(key, p);
  return p;
}

/** 注入 kit 样式（幂等；染色完成后写 CSS 变量，未就绪前面板退化为纯色边） */
export function ensureVanillaKit(): void {
  if (document.getElementById(KIT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = KIT_STYLE_ID;
  style.textContent = `
:root {
  --sw-vpanel-border: none;
  --sw-vpanel-border-hover: none;
}
.sw-vpanel {
  border: 12px solid #596f9e;
  border-image: var(--sw-vpanel-border) 12 fill stretch;
  background: rgb(44, 57, 106);
  image-rendering: pixelated;
  box-sizing: border-box;
  border-radius: 10px;   /* 背景色裁圆——PanelBorder 白模弧角外透明区不再露方角 */
}
.sw-vpanel:hover {
  border-image: var(--sw-vpanel-border-hover) 12 fill stretch;
  background: rgb(73, 94, 171);
}
.sw-vbtn {
  display: inline-flex; align-items: center; justify-content: center;
  border: 12px solid #596f9e;
  border-image: var(--sw-vpanel-border) 12 fill stretch;
  background: rgb(44, 57, 106);
  image-rendering: pixelated;
  box-sizing: border-box;
  border-radius: 10px;
  color: #fff; cursor: pointer; user-select: none;
  font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif;
  text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
}
.sw-vbtn:hover {
  border-image: var(--sw-vpanel-border-hover) 12 fill stretch;
  background: rgb(73, 94, 171);
}
.sw-vbtn:active { transform: scale(0.98); }
`;
  document.head.appendChild(style);
  void Promise.all([
    tintedDataUrl(BORDER_SRC, '#000000'),
    tintedDataUrl(BORDER_SRC, '#ffe745'),
    tintedDataUrl(BORDER_SRC, '#3e5195'),   // 列表项边 (89,116,213)×0.7（UICharacterListItem.cs:56）
  ]).then(([normal, hover, item]) => {
    const el = document.getElementById(KIT_STYLE_ID);
    if (!el) return;
    el.textContent = el.textContent!
      .replace('--sw-vpanel-border: none;', `--sw-vpanel-border: url(${normal});`)
      .replace('--sw-vpanel-border-hover: none;', `--sw-vpanel-border-hover: url(${hover});`)
      .replace('--sw-vitem-border: none;', `--sw-vitem-border: url(${item});`);
  });
  // 列表项变体（蓝边常态、悬停金边——与面板同底色系）
  const extra = document.createElement('style');
  extra.textContent = `
.sw-vpanel-item {
  border: 12px solid #3e5195;
  border-image: var(--sw-vitem-border, none) 12 fill stretch;
  background: rgb(44, 57, 106);
  image-rendering: pixelated;
  box-sizing: border-box;
  border-radius: 10px;
}
.sw-vpanel-item:hover {
  border-image: var(--sw-vpanel-border-hover) 12 fill stretch;
  background: rgb(73, 94, 171);
}
`;
  document.head.appendChild(extra);
}

/** 键盘遮挡补偿（移动端）：系统键盘压缩 visualViewport 时把面板上移半量遮挡
 *  （写 --kb-shift 变量，由各面板窄屏 @media 档的 translate:0 var(--kb-shift)
 *  消费——独立 translate 属性，与占用的 transform 居中/缩放叠加不打架）。
 *  仅当焦点在本面板的文本输入内且遮挡 >80px 才生效；桌面键盘不缩 vv ⇒ 恒零。
 *  返回解绑函数（close() 时调用） */
export function bindKeyboardShift(panel: HTMLElement): () => void {
  const update = () => {
    const v = window.visualViewport;
    const active = document.activeElement;
    const isText = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    if (!v || !active || !isText || !panel.contains(active)) {
      panel.style.removeProperty('--kb-shift');
      return;
    }
    const overlap = window.innerHeight - (v.height + v.offsetTop);
    if (overlap > 80) panel.style.setProperty('--kb-shift', `${Math.round(-overlap / 2)}px`);
    else panel.style.removeProperty('--kb-shift');
  };
  const onFocusOut = () => setTimeout(update, 0);   // focusout 时 activeElement 尚未切换完
  window.visualViewport?.addEventListener('resize', update);
  window.addEventListener('focusin', update);
  window.addEventListener('focusout', onFocusOut);
  return () => {
    window.visualViewport?.removeEventListener('resize', update);
    window.removeEventListener('focusin', update);
    window.removeEventListener('focusout', onFocusOut);
    panel.style.removeProperty('--kb-shift');
  };
}
