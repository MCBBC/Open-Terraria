#!/bin/sh
# pre-commit hook:gitleaks 暂存区扫描(2026-10-18 用户令:敏感提交防线)
# 安装:sh scripts/git-hook-pre-commit.sh --install
# 语义:提交前对【已暂存内容】跑 gitleaks protect --staged;命中→exit 1 阻断提交。
# 出口:①gitleaks 未安装→只警告不阻断(防线降级但不卡提交,提示 brew install gitleaks)
#      ②真泄露→撤内容后重提;历史已有的按 gitleaks 官方流程处置(改密优先于清史)
#      ③误报→在 .gitleaks.toml allowlist 加定向豁免(必须带案件注释),勿用 --no-verify 绕过
set -e

# ─── 自安装(首次): sh scripts/git-hook-pre-commit.sh --install ───
# (幂等;hook 文件在 .git/hooks/ 不入库,脚本本体入库供协作者同样安装)
if [ "${1:-}" = "--install" ]; then
  HOOK="$(git rev-parse --git-dir)/hooks/pre-commit"
  mkdir -p "$(dirname "$HOOK")"
  cp -- "$0" "$HOOK" && chmod +x "$HOOK"
  echo "[pre-commit] 已安装 → $HOOK"
  exit 0
fi

GITLEAKS="$(command -v gitleaks || true)"
if [ -z "$GITLEAKS" ]; then
  echo "[pre-commit] ⚠ gitleaks 未安装——敏感检测跳过(建议:brew install gitleaks)"
  exit 0
fi

# --staged 只扫暂存区;--redact 输出脱敏;gitleaks 发现泄露时退出码非 0
if ! "$GITLEAKS" protect --staged --redact --no-banner \
    -c "$(git rev-parse --show-toplevel)/.gitleaks.toml"; then
  echo ""
  echo "[pre-commit] ✗ gitleaks 命中敏感内容——提交已阻断。"
  echo "  · 真泄露:git reset HEAD <file> 后修改内容再提交;密钥已泄的立即作废轮换"
  echo "  · 误报:在 .gitleaks.toml 的 allowlist 加定向豁免(必须带案件注释)"
  echo "  · 应急绕过(仅限确认安全):git commit --no-verify(勿常用)"
  exit 1
fi
exit 0
