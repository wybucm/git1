#!/usr/bin/env bash
# 一键生成宣传片：字体 → 逐帧渲染 → 合成音频 → 混流
set -euo pipefail
cd "$(dirname "$0")"
pip install -q numpy scipy imageio-ffmpeg >/dev/null 2>&1 || true
[ -d "${HOME}/.fonts/kanban-promo" ] || ./fetch-fonts.sh
FFMPEG="$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')"
mkdir -p out
node render.mjs --out out/video.mp4          # 视频画面 + out/cues.json（音效提示点）
python3 audio.py out/cues.json out/audio.wav  # 代码合成的配乐与音效
"$FFMPEG" -y -loglevel error -i out/video.mp4 -i out/audio.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart out/kanban-promo.mp4
echo "✔ out/kanban-promo.mp4"
