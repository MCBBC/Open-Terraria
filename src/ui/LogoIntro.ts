// 进入画面 logo 卡（vanilla-ui/logo_1..8.png 随机一张，RE-Logic 工作室卡 800×600）：
// 自启动 t=0 盖在最上层显示，保证至少 minMs（默认 2000ms）后才允许收场——
// 此前 vanilla Splash 三件套在暖缓存下被 done() 秒切（可见时长 ~0.2s，用户报告
// "直接跳过去"）。finish() 由启动链在资源加载/初始化完成后调用：补满最短显示
// 时长 → 淡出 0.4s → 移除进标题。图片加载失败立即退场（露出底层 vanilla
// Splash 兜底，不阻断启动）。
// 旁路路由（?play/?quickload/?vuidemo）不挂本卡（调试入口不陪跑 2s）。

/** rand∈[0,1) → 1..8（与 pickSplashSet 同式） */
export function pickLogoIndex(rand: () => number): number {
  return 1 + Math.floor(rand() * 8);
}

export interface LogoIntroHandle {
  /** 资源就绪后调用：补满最短显示 → 淡出 → 移除（resolve 于完全移除；幂等） */
  finish(): Promise<void>;
}

export function showLogoIntro(opts: { minMs?: number; rand?: () => number } = {}): LogoIntroHandle {
  const minMs = opts.minMs ?? 2000;
  const rand = opts.rand ?? Math.random;
  const n = pickLogoIndex(rand);
  const root = document.createElement('div');
  root.id = 'sw-logo-intro';
  root.innerHTML = `
    <style>
      #sw-logo-intro { position: fixed; inset: 0; z-index: 10000; background: #000;
        display: flex; align-items: center; justify-content: center;
        transition: opacity .4s; }
      #sw-logo-intro img { max-width: 100vw; max-height: 100vh;
        image-rendering: pixelated; opacity: 0; transition: opacity .25s; }
    </style>
    <img alt="" src="sprites/vanilla-ui/logo_${n}.png">
  `;
  document.body.appendChild(root);
  const img = root.querySelector('img') as HTMLImageElement;
  const t0 = performance.now();
  let finishCalled = false;
  let removed = false;

  // 图片就绪即淡入；失败立即退场（vanilla Splash 在底层兜底）
  img.addEventListener('load', () => { if (!removed) img.style.opacity = '1'; }, { once: true });
  img.addEventListener('error', () => { removed = true; root.remove(); }, { once: true });

  const finish = () => new Promise<void>((resolve) => {
    if (finishCalled) { resolve(); return; }
    finishCalled = true;
    const wait = Math.max(0, minMs - (performance.now() - t0));
    setTimeout(() => {
      if (removed) { resolve(); return; }   // 图挂了已自退
      img.style.opacity = '0';
      root.style.opacity = '0';
      setTimeout(() => { removed = true; root.remove(); resolve(); }, 420);
    }, wait);
  });
  return { finish };
}
