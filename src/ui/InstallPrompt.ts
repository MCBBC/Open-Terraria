// PWA 安装提示条(2026-09-04 用户要求"像 GitHub 那样弹安装提示")。
//  · Chromium 系:捕获 beforeinstallprompt——浏览器在 PWA 条件满足+参与度
//    启发式达标时派发(首次访问可能不触发,交互几轮后出现;事件到 → 顶部
//    横幅,点击 = 原生安装对话框,可强制授予持久化存储)
//  · iOS Safari:无该事件 → 4s 后显示"分享 → 添加到主屏幕"引导(仅文案)
//  · 已安装(standalone 运行)/ 7 天内关闭过 → 本会话+期间不再提示
//  · 像素风与站点一致;调试工具属性文案硬编码不走 l10n
import { swTrace } from '../net/AssetCache';

const DISMISS_KEY = 'swInstallDismissedAt';
const DISMISS_COOLDOWN = 7 * 86_400_000;

export function mountInstallPrompt(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  if (!import.meta.env.PROD) return;
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone) return;   // 已安装运行中
  try {
    const dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dismissed && Date.now() - dismissed < DISMISS_COOLDOWN) return;
  } catch { /* */ }

  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1);

  type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  let deferred: BIPEvent | null = null;
  let bar: HTMLElement | null = null;

  const dismiss = (why: string) => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* */ }
    swTrace(`安装提示关闭(${why})`);
    bar?.remove(); bar = null;
  };
  const show = (iosGuide: boolean) => {
    if (bar || document.getElementById('sw-install-bar')) return;
    bar = document.createElement('div');
    bar.id = 'sw-install-bar';
    bar.innerHTML = `
      <style>
        #sw-install-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 45;
          display: flex; align-items: center; justify-content: center; gap: 14px;
          background: #141028; border-bottom: 2px solid #7d92d6;
          padding: 8px 14px; color: #e8ecf8;
          font-family: "Fusion Pixel 12px", "Microsoft YaHei", sans-serif; font-size: 13px;
          user-select: none; }
        #sw-install-bar .t { text-shadow: 1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000; }
        #sw-install-bar button { background: #3a2a5a; color: #fff; border: 2px solid #7d92d6;
          padding: 5px 16px; cursor: pointer; font-family: inherit; font-size: 13px; }
        #sw-install-bar button:hover { background: #4a3a7a; border-color: #ffd76e; }
        #sw-install-bar .x { background: none; border: none; color: #9fb0e0; font-size: 16px;
          padding: 2px 6px; cursor: pointer; }
      </style>
      <span class="t">${iosGuide
        ? '添加到主屏幕:点 Safari 底部「分享」→「添加到主屏幕」,离线可玩、独占全屏'
        : '将 SandboxWorld 安装到桌面——离线可玩、独立窗口、不再重复下载'}</span>
      ${iosGuide ? '' : '<button data-a="install">安装</button>'}
      <button class="x" data-a="x">✕</button>
    `;
    document.body.appendChild(bar);
    if (!iosGuide) {
      bar.querySelector('[data-a=install]')?.addEventListener('click', async () => {
        if (!deferred) return;
        try {
          await deferred.prompt();
          const choice = await deferred.userChoice;
          swTrace(`安装对话框结果: ${choice.outcome}`);
          if (choice.outcome === 'accepted') { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* */ } }
          deferred = null;
        } catch { /* */ }
        bar?.remove(); bar = null;
      });
    }
    bar.querySelector('[data-a=x]')?.addEventListener('click', () => dismiss('用户关闭'));
    swTrace(iosGuide ? '安装提示显示(iOS 引导)' : '安装提示显示(beforeinstallprompt)');
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    if (!iOS) show(false);
  });
  if (iOS) setTimeout(() => { if (!deferred) show(true); }, 4000);
  window.addEventListener('appinstalled', () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* */ }
    swTrace('PWA 已安装(appinstalled)');
    bar?.remove(); bar = null;
  });
}
