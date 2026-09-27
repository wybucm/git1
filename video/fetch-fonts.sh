#!/usr/bin/env bash
# 下载视频用到的免费商用字体（SIL OFL）：Noto Sans SC、Inter、JetBrains Mono
# 安装到 ~/.fonts，供导演页和看板页面共同使用
set -euo pipefail
DEST="${HOME}/.fonts/kanban-promo"
mkdir -p "$DEST"
fetch() { # $1=family query  $2=name prefix
  curl -sS -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=$1&display=swap" |
    grep -oE "font-weight: [0-9]+|url\([^)]+\.ttf\)" | paste - - |
    while read -r _ w url; do
      url="${url#url(}"; url="${url%)}"
      curl -sS -o "$DEST/$2-${w}.ttf" "$url"
    done
}
fetch "Noto+Sans+SC:wght@400;500;700;900" NotoSansSC
fetch "Inter:wght@400;500;600;800;900" Inter
fetch "JetBrains+Mono:wght@400;700" JetBrainsMono
fc-cache -f "$DEST" >/dev/null
ls "$DEST"
