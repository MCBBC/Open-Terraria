// 启动加载画面（1457 Main.DrawSplash :53297-53430 1:1，DOM 覆盖层实现）：
//  每次启动 UnifiedRandom.Next(1,11) 随机一组三件套 {Back 1920×1080 cover /
//  Tree 512×512 contain 锚右下 / Front 1920×1080 contain 中心}；Splash_1 是
//  16:9 快淡入变体（num3/4/5/6/7 = 0/75/200/75/75，其余 90/410/620/60/120——
//  单位帧≈16.67ms）。淡入 [num3..num4] → 持满至 num5-num6 → num6 内淡出；
//  异步加载未完则全暗 + LoadingSunflower（52×1007 竖条，19 帧环形取
//  (t/3+10)%19，底中锚缩放；:53417-53422 显隐门 1:1）。
//  RE-LOGIC 字样烘在 Splash_N_2 前景层（透明底 PNG）；vanilla-ui/logo_1..8.png
//  是死资产（AssetInitializer.cs:84 加载后无绘制点），不使用。
export interface SplashHandle { done(): void }

/** 每次启动随机一组（Main.cs：UnifiedRandom.Next(1,11)） */
export function pickSplashSet(rand: () => number): number {
  return 1 + Math.floor(rand() * 10);
}

/** 淡入淡出 alpha 曲线（:51963-51985，帧→ms；wide169=Splash_1 特例档） */
export function splashAlphaAt(tMs: number, wide169: boolean): number {
  const [n3, n4, n5, n6] = wide169 ? [0, 75, 200, 75] : [90, 410, 620, 60];
  const t = tMs / 16.67;
  if (t < n3) return 0;
  if (t <= n4) return ((t - n3) / (n4 - n3)) * 255;
  if (t <= n5 - n6) return 255;
  if (t <= n5) return ((n6 - (t - (n5 - n6))) / n6) * 255;
  return -1;   // 时序走完（加载完成则收场，未完归零）
}

export function showSplash(opts: {
  /** 异步加载完成信号（Promise resolve 后进入淡出） */
  loading: Promise<unknown> | null;
  /** 随机源（默认 Math.random——原版 UnifiedRandom） */
  rand?: () => number;
}): SplashHandle {
  const rand = opts.rand ?? Math.random;
  const root = document.createElement('div');
  root.id = 'sw-splash';
  // 三件套层级：Back(cover 铺满) / Tree(contain) / Front(front 铺满)
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
  const back = root.querySelector('.back') as HTMLDivElement;
  const tree = root.querySelector('.tree') as HTMLDivElement;
  const front = root.querySelector('.front') as HTMLDivElement;
  const flower = root.querySelector('.flower') as HTMLCanvasElement;

  const set = pickSplashSet(rand);
  const wide169 = set === 1;
  const base = `sprites/vanilla/SplashScreens_Splash_${set}_`;
  back.style.backgroundImage = `url(${base}0.png)`;
  tree.style.backgroundImage = `url(${base}1.png)`;
  front.style.backgroundImage = `url(${base}2.png)`;

  // 时序（帧→ms；:51947-51965：默认 90/410/620/60/120，16:9 路径 0/75/200/75/75）
  const [n3, n4, n5, n6] = wide169 ? [0, 75, 200, 75].map((v) => v * 16.67) : [90, 410, 620, 60].map((v) => v * 16.67);
  const flowerImg = new Image();
  flowerImg.src = 'sprites/vanilla-ui/UI_Sunflower_Loading.png';   // UI/ 子目录展平在 vanilla-ui/
  const fctx = flower.getContext('2d')!;

  let loadingDone = false;
  let removed = false;
  void Promise.resolve(opts.loading).then(() => { loadingDone = true; });

  const t0 = performance.now();
  let b = 0;            // white alpha 0..255
  let timelineOver = false;
  /** 提前收场（done() 于保持期满调用）：起点时刻与当时 alpha——400ms 快淡出
   *  替代原版 num6=60f≈1s（保持期常在淡入中途，全速淡出会硬切） */
  let fadeoutAt = -1;
  let fadeoutB = 0;
  const apply = () => {
    back.style.opacity = front.style.opacity = String(b / 255);
    tree.style.opacity = String(Math.min(1, b / 255));
    // LoadingSunflower 显隐（Main.cs:53417-53422 1:1）：时序走完且未加载完 →
    // Color.White 全亮（num==1 分支）；时序内但已超 10s（num2>num）→ 随 b 淡显；
    // 前 10s 不画。加载完 → 隐（收场在即）
    flower.style.opacity = loadingDone ? '0'
      : timelineOver ? '1'
        : ((performance.now() - t0) > 10000 ? String(b / 255) : '0');
  };
  const step = () => {
    if (removed) return;
    const t = performance.now() - t0;
    if (fadeoutAt >= 0) {
      b = Math.max(0, Math.round(fadeoutB * (1 - (t - fadeoutAt) / 400)));
      if (b === 0) { remove(); return; }
    } else {
      const a = splashAlphaAt(t, wide169);
      if (a < 0) { if (!loadingDone) { b = 0; timelineOver = true; } else { remove(); return; } }
      else b = Math.round(a);
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

  const remove = () => {
    removed = true;
    root.remove();
  };
  return {
    /** 收场：保持期满调用——400ms 快淡出后移除（幂等；时序已自然走完则立即移除） */
    done: () => {
      if (removed || fadeoutAt >= 0) return;
      fadeoutAt = performance.now() - t0;
      fadeoutB = b;
    },
  };
}
