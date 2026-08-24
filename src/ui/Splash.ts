// 启动加载画面（1457 Main.DrawSplash :53297-53430 1:1，DOM 覆盖层实现）：
//  每次启动 UnifiedRandom.Next(1,11) 随机一组三件套 {Back 1920×1080 cover /
//  Tree 512×512 contain 锚右下 / Front 1920×1080 contain 中心}；淡入
//  [num3..num4] → 持满至 num5-num6 → num6 内淡出，全程 ~10.3s（90/410/620/60，
//  单位帧≈16.67ms）——资源就绪也不快进（2026-08-24 用户要求"按原版时间渐入渐
//  出"）；快档 quick（0/75/200/75/75）= 原版 quickSplash：musicVolume==0
//  （:53311-53314；曾误绑 Splash_1 组——16x9 只是贴图名，与快慢无关）。
//  异步加载未完则时序尽后全暗 + LoadingSunflower（52×1007 竖条，19 帧环形取
//  (t/3+10)%19，底中锚缩放；:53417-53422 显隐门 1:1）。
//  RE-LOGIC 字样烘在 Splash_N_2 前景层（透明底 PNG）；vanilla-ui/logo_1..8.png
//  是死资产（AssetInitializer.cs:84 加载后无绘制点），不使用。
export interface SplashHandle {
  /** 旁路立即收场（?play/?quickload 调试入口不陪跑时序）；正常路径不调用——
   *  时序自然走完自收场 */
  done(): void;
  /** 标记菜单已在幕后建好：渐隐段（num5-num6 起）splash 底色转透明，场景淡出
   *  直接透出菜单——不渐隐到黑再跳切（2026-08-24 用户要求）。渐隐已开始则立即
   *  转透明（下载等待跨过渐隐段的补课路径） */
  revealBehind(): void;
  /** resolve 于 splash 完全移除（时序尽自收场或 done()）——主流程等它再揭幕 */
  finished: Promise<void>;
}

/** 每次启动随机一组（Main.cs：UnifiedRandom.Next(1,11)） */
export function pickSplashSet(rand: () => number): number {
  return 1 + Math.floor(rand() * 10);
}

/** 淡入淡出 alpha 曲线（:53340-53362，帧→ms；quick=quickSplash 快档） */
export function splashAlphaAt(tMs: number, quick: boolean): number {
  const [n3, n4, n5, n6] = quick ? [0, 75, 200, 75] : [90, 410, 620, 60];
  const t = tMs / 16.67;
  if (t < n3) return 0;
  if (t <= n4) return ((t - n3) / (n4 - n3)) * 255;
  if (t <= n5 - n6) return 255;
  if (t <= n5) return ((n6 - (t - (n5 - n6))) / n6) * 255;
  return -1;   // 时序走完（加载完成则收场，未完归零）
}

export function showSplash(opts: {
  /** 异步加载完成信号（resolve 后时序尽即自收场；未 resolve 则时序尽转全暗
   *  + LoadingSunflower 等待——资源下载等待期即此态） */
  loading: Promise<unknown> | null;
  /** 原版 quickSplash（musicVolume==0 → 快档时序；Main.cs:53311-53314） */
  quick?: boolean;
  /** 随机源（默认 Math.random——原版 UnifiedRandom） */
  rand?: () => number;
}): SplashHandle {
  const rand = opts.rand ?? Math.random;
  const quick = opts.quick ?? false;
  const root = document.createElement('div');
  root.id = 'sw-splash';
  // 三件套层级：Back(cover 铺满) / Tree(contain 锚右下) / Front(contain 中心)
  root.innerHTML = `
    <style>
      /* z=30：资源下载徽标(40)/门槛弹窗(60)须浮于本层之上——启动保持期
         (holdForAssetsReady)边下边显进度（Main.DrawSplash 本体无 UI 层冲突） */
      #sw-splash { position: fixed; inset: 0; z-index: 30; background: #000; }
      #sw-splash .layer { position: absolute; inset: 0; background-repeat: no-repeat; }
      /* 三层锚点 1:1（Main.cs:53400-53412）：back=scale2(max)=cover 中心；
         tree=scale(min)=contain 锚右下(origin=Size(),position=ScreenSize)；
         front=scale(min)=contain 中心（透明底 1920×1080，RE-LOGIC 字样烘在此层） */
      #sw-splash .back  { background-size: cover; background-position: center; }
      #sw-splash .tree  { background-size: contain; background-position: right bottom; }
      #sw-splash .front { background-size: contain; background-position: center; }
      #sw-splash .flower {
        position: absolute; left: 50%; bottom: 50px; transform: translateX(-50%);
        image-rendering: pixelated; opacity: 0;
      }
    </style>
    <div class="layer back"></div>
    <div class="layer tree"></div>
    <div class="layer front"></div>
    <canvas class="flower" width="52" height="53"></canvas>
  `;
  document.body.appendChild(root);
  // 角标文字渐显驱动变量【构造即置 0】——若等首帧 b>0 才写，TitleMenu 更早挂载
  // 时 var() 回退值 1 = 文字在黑场期全亮、渐显开始才骤隐（2026-08-24 用户实报）；
  // 先置 0 则黑场期文字隐藏、随场景同曲线渐显。remove() 摘除=菜单态回满亮
  document.documentElement.style.setProperty('--sw-splash-alpha', '0');
  const back = root.querySelector('.back') as HTMLDivElement;
  const tree = root.querySelector('.tree') as HTMLDivElement;
  const front = root.querySelector('.front') as HTMLDivElement;
  const flower = root.querySelector('.flower') as HTMLCanvasElement;

  const set = pickSplashSet(rand);
  const base = `sprites/vanilla/SplashScreens_Splash_${set}_`;
  back.style.backgroundImage = `url(${base}0.png)`;
  tree.style.backgroundImage = `url(${base}1.png)`;
  front.style.backgroundImage = `url(${base}2.png)`;

  // 时序（帧→ms；:53340-53346：默认 90/410/620/60，quickSplash 0/75/200/75）
  const [n3, n4, n5, n6] = quick
    ? [0, 75, 200, 75].map((v) => v * 16.67)
    : [90, 410, 620, 60].map((v) => v * 16.67);
  const flowerImg = new Image();
  // 懒加载(2026-08-24 用户报菜单白载):向日葵只在"时序尽+未加载完"的等待期
  // 显示,快路径(资源秒开)整场不出现——首帧不设 src,等待期首次需要时才拉
  const fctx = flower.getContext('2d')!;
  let flowerSrcSet = false;
  const ensureFlowerSrc = () => {
    if (!flowerSrcSet) {
      flowerSrcSet = true;
      flowerImg.src = 'sprites/vanilla-ui/UI_Sunflower_Loading.png'; // UI/ 子目录展平在 vanilla-ui/
    }
  };

  let loadingDone = false;
  let removed = false;
  void Promise.resolve(opts.loading).then(() => { loadingDone = true; });

  const t0 = performance.now();
  let b = 0;            // white alpha 0..255
  let timelineOver = false;
  /** 角标文字（版本/署名）渐显驱动：单调广播 --sw-splash-alpha（只升不降）——
   *  文字渐显与图片同曲线（2026-08-24 用户要求）；渐隐段不回写（文字保持可见，
   *  揭幕无 0→1 跳变）；下载等待全暗段同理不回写。remove() 时摘除变量=菜单态 */
  let chromeSent = 0;
  /** 渐隐透出菜单（revealBehind × 渐隐段起点，见接口注） */
  let menuBehind = false;
  let fadeOutStarted = false;
  const goTransparent = () => { root.style.background = 'transparent'; };
  const apply = () => {
    if (b > chromeSent) {
      chromeSent = b;
      document.documentElement.style.setProperty('--sw-splash-alpha', String(b / 255));
    }
    back.style.opacity = front.style.opacity = String(b / 255);
    tree.style.opacity = String(Math.min(1, b / 255));
    // LoadingSunflower 显隐（Main.cs:53417-53422 1:1）：时序走完且未加载完 →
    // Color.White 全亮（num==1 分支）；时序内但已超 10s（num2>num）→ 随 b 淡显；
    // 前 10s 不画。加载完 → 隐（收场在即）
    const flowerVisible = !loadingDone && (timelineOver || (performance.now() - t0) > 10000);
    if (flowerVisible) ensureFlowerSrc();
    flower.style.opacity = loadingDone ? '0'
      : timelineOver ? '1'
        : (flowerVisible ? String(b / 255) : '0');
  };
  const step = () => {
    if (removed) return;
    const t = performance.now() - t0;
    const a = splashAlphaAt(t, quick);
    if (a < 0) { if (!loadingDone) { b = 0; timelineOver = true; } else { remove(); return; } }
    else b = Math.round(a);
    // 渐隐段起点（alpha 开始下降处）：幕后有菜单 → 底色转透明，场景淡出直接
    // 透出菜单（黑底会在揭幕瞬间跳切，2026-08-24 用户反馈）
    if (!fadeOutStarted && t >= n5 - n6) {
      fadeOutStarted = true;
      if (menuBehind) goTransparent();
    }
    apply();
    // LoadingSunflower（:52041-52060：Frame(1,19,0,(帧/3+10)%19)，53px/帧=1007/19）
    if ((flowerImg.width > 0) && flowerImg.width) {
      const row = (Math.floor(t / 16.67 / 3) + 10) % 19;
      fctx.clearRect(0, 0, 52, 53);
      fctx.drawImage(flowerImg, 0, row * 53, 52, 53, 0, 0, 52, 53);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);

  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((r) => { resolveFinished = r; });
  const remove = () => {
    if (removed) return;
    removed = true;
    root.remove();
    document.documentElement.style.removeProperty('--sw-splash-alpha'); // 角标回满亮(菜单态)
    resolveFinished();
  };
  return {
    done: remove, // 旁路立即收场（正常路径不调——时序尽自收场）
    revealBehind: () => {
      menuBehind = true;
      if (fadeOutStarted) goTransparent(); // 渐隐已开始（下载等待跨段）→ 立即补课
    },
    finished,
  };
}
