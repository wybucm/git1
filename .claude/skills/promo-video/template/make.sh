#!/usr/bin/env bash
# 一键生成宣传片：字体 → 逐帧渲染 → 合成音频 → 混流
# 在放置了模板文件的目录下运行（如 <repo>/video/）。
# 可配置环境变量：
#   NAME   输出文件名前缀，默认 promo
#   PAGE   导演页文件名（相对本目录），默认 director.html
#   ROOT   被 HTTP 服务器暴露的根目录（导演页里的 iframe 需要同源），默认 .. （仓库根目录）
#   SCALE  输出视频缩放比例，默认 1（冒烟测试用 0.25；截图本身仍是全分辨率）
#   MAX_DURATION       check.py 的时长上限（秒），默认不限
#   EXPECT_TRANSITION  check.py 期望的落位过渡页面时长（秒），默认 0.2（demo.html / 看板）；设为空则只查 Δ>1.5 帧
set -euo pipefail
cd "$(dirname "$0")"
NAME="${NAME:-promo}"
PAGE="${PAGE:-director.html}"
ROOT="${ROOT:-..}"
SCALE="${SCALE:-1}"
MAX_DURATION="${MAX_DURATION:-}"
EXPECT_TRANSITION="${EXPECT_TRANSITION-0.2}"

pip install -q numpy scipy imageio-ffmpeg >/dev/null 2>&1 || true
[ -d "${HOME}/.fonts/promo-video" ] || ./fetch-fonts.sh
FFMPEG="$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')"
mkdir -p out

ROOT_ABS="$(realpath "$ROOT")"
PAGE_REL="$(realpath --relative-to="$ROOT_ABS" "$PAGE")"
node render.mjs --root "$ROOT_ABS" --page "$PAGE_REL" --outdir out --out out/video.mp4 --scale "$SCALE"
python3 audio.py out/cues.json out/audio.wav  # 代码合成的配乐与音效

"$FFMPEG" -y -loglevel error -i out/video.mp4 -i out/audio.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "out/$NAME.mp4"
# 便于分享的压缩版（两遍编码，约数十 MB）
"$FFMPEG" -y -loglevel error -i out/video.mp4 -c:v libx264 -preset slower -b:v 3700k -pass 1 -passlogfile out/x264 -an -f null /dev/null
"$FFMPEG" -y -loglevel error -i out/video.mp4 -i out/audio.wav -map 0:v -map 1:a -c:v libx264 -preset slower -b:v 3700k -pass 2 \
  -passlogfile out/x264 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "out/$NAME-share.mp4"

echo "✔ out/$NAME.mp4  out/$NAME-share.mp4"

# 自动自查（任一 FAIL 则 make.sh 以非 0 退出）；结尾文案、标题是否压主体仍需人工看静帧
python3 check.py "out/$NAME.mp4" out/cues.json --share "out/$NAME-share.mp4" \
  ${MAX_DURATION:+--max-duration "$MAX_DURATION"} ${EXPECT_TRANSITION:+--expect-transition "$EXPECT_TRANSITION"}
