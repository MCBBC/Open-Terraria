// 启动加载画面（Main.DrawSplash :51908-52075 1:1，DOM 覆盖层实现）：
//  每次启动 UnifiedRandom.Next(1,11) 随机一组三件套 {Back 1920×1080 cover /
//  Tree 512×512 contain / Front 1920×1080 front}；Splash_1 是 16:9 快淡入变体
//  （num3/4/5/6/7 = 0/75/200/75/75，其余 90/410/620/60/120——单位帧≈16.67ms）。
//  淡入 [num3..num4] → 持满至 num5-num6 → num6 内淡出；异步加载未完则全暗 +
//  LoadingSunflower（52×1007 竖条，19 帧环形取 (t/3+10)%19，底中锚缩放）。
export interface SplashHandle { done(): void }

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
      #sw-splash { position: fixed; inset: 0; z-index: 9999; background: #000; }
      #sw-splash .layer { position: absolute; inset: 0; background-position: center; background-repeat: no-repeat; }
      #sw-splash .back  { background-size: cover; }
      #sw-splash .tree  { background-size: contain; }
      #sw-splash .front { background-size: cover; }
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

  const set = 1 + Math.floor(rand() * 10);          // Next(1,11)
  const wide169 = set === 1;
  const base = `sprites/vanilla/SplashScreens_Splash_${set}_`;
  back.style.backgroundImage = `url(${base}0.png)`;
  tree.style.backgroundImage = `url(${base}1.png)`;
  front.style.backgroundImage = `url(${base}2.png)`;

  // 时序（帧→ms；:51947-51965：默认 90/410/620/60/120，16:9 路径 0/75/200/75/75）
  const [n3, n4, n5, n6] = wide169 ? [0, 75, 200, 75].map((v) => v * 16.67) : [90, 410, 620, 60].map((v) => v * 16.67);
  const flowerImg = new Image();
  flowerImg.src = 'sprites/vanilla/UI_Sunflower_Loading.png';
  const fctx = flower.getContext('2d')!;

  let loadingDone = false;
  let removed = false;
  void Promise.resolve(opts.loading).then(() => { loadingDone = true; });

  const t0 = performance.now();
  let b = 0;            // white alpha 0..255
  const apply = () => {
    back.style.opacity = front.style.opacity = String(b / 255);
    tree.style.opacity = String(Math.min(1, b / 255));
    flower.style.opacity = loadingDone ? '0' : String(b / 255);
  };
  const step = () => {
    if (removed) return;
    const t = performance.now() - t0;
    // :51963-51985 淡入→持满→淡出（淡出段起点 = num5-num6）
    if (t < n3) b = 0;
    else if (t <= n4) b = Math.round(((t - n3) / (n4 - n3)) * 255);
    else if (t <= n5 - n6) b = 255;
    else if (t <= n5) b = Math.round(((n6 - (t - (n5 - n6))) / n6) * 255);
    else if (!loadingDone) b = 0;
    else { remove(); return; }
    apply();
    // LoadingSunflower（:52041-52060：Frame(1,19,0,(帧/3+10)%19)，53px/帧=1007/19）
    if (flowerImg.complete && flowerImg.naturalWidth) {
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
  return { done: remove };
}
