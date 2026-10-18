#!/bin/bash
# 反编译本机 Steam Terraria (1.4.5.6) 的 NPC 类 → Terarria1405/NPC.145.cs
# 依赖：~/.dotnet（.NET 8 运行时）+ /tmp/ilspy/pkg（ilspycmd 9.1）
set -e
export DOTNET_ROOT="$HOME/.dotnet"
OUT="${SW_PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/Terarria1405/NPC.145.cs"   # ★C档可移植
EXE="$HOME/Library/Application Support/Steam/steamapps/common/Terraria/Terraria.app/Contents/Resources/Terraria.exe"
"$HOME/.dotnet/dotnet" /tmp/ilspy/pkg/tools/net8.0/any/ilspycmd.dll -t Terraria.NPC "$EXE" > "$OUT" 2>/tmp/ilspy/err.txt
echo "lines: $(wc -l < "$OUT")"
