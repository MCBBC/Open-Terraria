#!/bin/sh
# game/dist → APK assets 根(平铺,★非 dist/ 子目录:vite base='/' 绝对路径产物
# 经 WebViewAssetLoader "/" 映射后 /sprites/... 才可达,见 app/build.gradle.kts 注)。
# 剔除 assets-zip(SW 缓存链专用分片,包内 fetch 直读平铺资产,流水线由 ?nosw 整体短路)。
set -eu

ROOT="$(cd "$(dirname "$0")" && pwd)"
# 迁移后本工程位于 game/mobile/android-shell,../../ 即 game/
SRC="$ROOT/../../dist"
DST="$ROOT/app/src/main/assets"

[ -d "$SRC" ] || { echo "缺 $SRC,先在 game/ 下跑 vite build"; exit 1; }

rm -rf "$DST"
mkdir -p "$DST"
rsync -a --exclude 'assets-zip' "$SRC/" "$DST/"

echo "dist synced -> $DST : $(du -sh "$DST" | cut -f1)"
echo "(assets-zip excluded; Source set = src/main/assets flat)"
