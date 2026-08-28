#!/bin/bash
# ============================================================
# SandboxWorld 零壳启动器（macOS）—— 方案 C 兜底件。
# 独立 profile + 性能旗集打开现网站点，语义同 Windows 版 .cmd。
# 安装：双击本文件或 `chmod +x` 后放入“应用程序”旁；正式桌面版以 .dmg 为准。
# ============================================================
APPURL="https://sandbox.vinlic.com/"
PROFILE="$HOME/Library/Application Support/SandboxWorld/Profile"
# ★2026-08-29 判例：不加 --disable-frame-rate-limit/--disable-gpu-vsync！
#   游戏菜单背景循环无自身节流门,解锁后 rAF 近千帧空转会整机卡顿。
FLAGS=(--disable-background-timer-throttling
  --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
  --disable-features=CalculateNativeWinOcclusion,MemorySaver)

CHROME=""
for C in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
  [ -x "$C" ] && CHROME="$C" && break
done

if [ -z "$CHROME" ]; then
  echo "未找到 Chrome / Edge，请先安装其中之一。" >&2
  exit 1
fi

mkdir -p "$PROFILE"
exec "$CHROME" --app="$APPURL" --user-data-dir="$PROFILE" "${FLAGS[@]}" "$@"
