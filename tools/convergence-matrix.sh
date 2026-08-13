#!/bin/zsh
# 收敛矩阵工具（#22）：批量采集原版真值 + oracle 输出 + 头部对拍。
# 用法：
#   zsh tools/convergence-matrix.sh gen <seed...>     # 采集：服务器世界 + oracle 批量（跳过已有）
#   zsh tools/convergence-matrix.sh cmp               # 对拍：输出 (ws,rl,id,moon) 差值表
# 纪律：每条子命令带超时；完成打标记；结束查进程归零。
set -u
GAME=/Users/vinlic/Project/GLM/SandboxWorld/game
VSRV=/tmp/vserver
ORACLE_RUNFILE_GLOB="/Users/vinlic/Library/Application Support/dotnet/runfile/caves-oracle-*/bin/debug/caves-oracle"
TIMEOUT_WRAP() { local cmd=$1 limit=$2; ( eval "$cmd" & p=$!; sleep "$limit"; kill $p 2>/dev/null ) & wait; }

cmd=${1:-cmp}
mkdir -p "$VSRV"

if [ "$cmd" = gen ]; then
  shift
  for seed in "$@"; do
    # ① 原版服务器世界（≥200s；完成标志=文件存在且 >2.5MB）
    if [ ! -s "$VSRV/s$seed.wld" ] || [ "$(stat -f%z "$VSRV/s$seed.wld" 2>/dev/null || echo 0)" -lt 2500000 ]; then
      print "GEN server $seed ..."
      ( cd "$HOME/Library/Application Support/Steam/steamapps/common/Terraria/Terraria.app/Contents/MacOS" && \
        ./TerrariaServer.bin.osx -world "$VSRV/s$seed.wld" -autocreate 1 -seed "$seed" -port 7797 -players 1 < /dev/null > "$VSRV/log_$seed.txt" 2>&1 & echo $! > "$VSRV/pid_$seed"; sleep 220; kill $(cat "$VSRV/pid_$seed") 2>/dev/null )
    fi
    # ② oracle 全链（金标旁路输出到 /tmp；用 runfile 二进制避免重建）
    if [ ! -s "$VSRV/oracle_$seed.txt" ]; then
      ORACLE=$(ls -td /Users/vinlic/Library/Application\ Support/dotnet/runfile/caves-oracle-* 2>/dev/null | head -1)/bin/debug/caves-oracle
      print "GEN oracle $seed ..."
      ( "$ORACLE" "$seed" 0 "$VSRV/chain_$seed.json" > "$VSRV/oracle_$seed.txt" 2>&1 & p=$!; sleep 400; kill $p 2>/dev/null ) & wait
    fi
  done
  print "GEN-DONE"
fi

if [ "$cmd" = cmp ]; then
  # ③ 对拍（vitest 侧提取 wld 头 + oracle 行）——留给 tools/_matrixcmp.test.ts
  print "对照工具：cd $GAME && npx vitest run tools/_matrixcmp.test.ts"
fi
print "MATRIX-OK"
