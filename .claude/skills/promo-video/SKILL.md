---
name: promo-video
description: 为网页或 Web 应用制作宣传片 / 产品演示视频 / 功能预告片，用确定性逐帧录屏（headless Chromium + BeginFrame + 虚拟时间）驱动真实页面交互，配 CSS 3D 运镜、慢镜头速度坡度、标题字幕，以及 numpy 合成的配乐和与 DOM 状态同步的 UI 音效，输出 H.264+AAC MP4。当用户要"给这个页面/应用做个宣传片""录一段产品演示视频""做功能展示动画""确定性录屏/逐帧渲染网页"时使用。
---

# 网页产品宣传片（确定性渲染流水线）

画面 = 导演页（`director.html`）在时间 `t` 的确定性函数：被展示的页面放在同源 iframe 里，导演脚本派发真实的 Pointer/Mouse/Keyboard 事件驱动交互；外层用 CSS 3D 做镜头、景深、动态模糊、标题、颗粒。`render.mjs` 逐帧调用 `DIRECTOR.frame(t)`、截图、按速度坡度推进浏览器虚拟时间，帧交给 ffmpeg。`audio.py` 按导演页观察 DOM 得到的 `cues.json` 合成音效与配乐。

目录：

| 路径 | 作用 |
| --- | --- |
| `SPEC.template.md` | 空白 SPEC，复制到仓库根目录 `SPEC.md` 后填写 |
| `SPEC.example.md` | 完整范例：`trello/index.html` 的 58 秒看板宣传片（成片源码在仓库 `video/`） |
| `template/cdp.mjs` | 极简 CDP 客户端（headless_shell、确定性模式、BeginFrame 控制） |
| `template/render.mjs` | 静态服务器 + 逐帧渲染 + 导出 cues.json |
| `template/director.template.html` | 导演页引擎 + 2–3 段示例剧本 |
| `template/audio.template.py` | 乐器、UI 音效、混响、母带；配乐由节拍表 `SECTIONS` 驱动 |
| `template/fetch-fonts.sh` / `make.sh` | 字体下载 / 一键全流程 |

## 开始一个新项目

```bash
cp .claude/skills/promo-video/SPEC.template.md SPEC.md          # 先写 SPEC（参考 SPEC.example.md）
mkdir -p video && cp -r .claude/skills/promo-video/template/. video/
mv video/director.template.html video/director.html
mv video/audio.template.py video/audio.py
pip install -q numpy scipy imageio-ffmpeg && ./video/fetch-fonts.sh
```

在 `video/director.html` 里把 `APP` 指向被展示的页面（相对导演页、必须同源，由 render.mjs 的服务器从 `--root` 提供），再按 SPEC 分镜表逐段写剧本。

`render.mjs` 参数：`--root <服务根目录，默认 cwd> --page <相对 root 的导演页，默认 video/director.html，可带 ?app=...> --outdir <默认导演页旁的 out/> --out <mp4> --scale <0.25 等，只缩小输出视频> --width 1920 --height 1080 --crf 15 --from <秒> --to <秒> --stills 3.9,11.8 --no-video`。FPS 和时长来自 `DIRECTOR.FPS / DIRECTOR.DURATION`。

## 工作流程

1. **写 SPEC**（主会话）：规格、被展示页面与示例数据、分镜表（时间码 | 镜头 | 交互 | 速度坡度 | 标题 | 音乐/音效）、开场结尾文案、风险点、验收清单。分镜表是唯一事实来源，剧本和 `SECTIONS` 都从它翻译。
2. **冒烟测试风险点**：对每个"没把握的交互"（拖拽库是否认合成事件、过渡是否跟虚拟时间、字体是否加载）写一个 2–3 秒的最小剧本，用 `--scale 0.25 --to 3` 渲染，看 cue 时间差（见下）和几张 still。不通过就先改引擎/剧本，**不要**带着疑问跑全片。
3. **低分辨率关键帧预览**：`node video/render.mjs --no-video --stills 1,5.5,11.8,...`（`--no-video` 不会覆盖 cues.json），再拼成一张图看构图、标题是否压主体：
   `"$FFMPEG" -pattern_type glob -i 'video/out/stills/*.jpg' -vf "scale=480:-1,tile=4x3" -frames:v 1 video/out/contact.jpg`
   注意：`--stills` 仍要从 0 跑到最后一个 still（状态是累积的），只是不编码视频。
4. **全片渲染**：`./video/make.sh`（或单独 `node video/render.mjs`）。1080p 约 0.3 s/帧，58 s×30 fps ≈ 10 分钟 —— 用 `run_in_background` 启动，等完成通知，**不要**写 sleep/until 轮询。
5. **音频**：`python3 video/audio.py video/out/cues.json video/out/audio.wav`（节拍表 `SECTIONS`/`HITS` 从 SPEC 的音乐段落抄）。
6. **混流**：make.sh 输出 `out/$NAME.mp4`（AAC 256k）和分享版 `out/$NAME-share.mp4`。
7. **自查**：跑下面的清单。
8. **交付**：见"交付"。只提交源码，不提交 MP4 和 `video/out/`（加进 `.gitignore`）。

## 已知坑（每条都付出过代价）

- **浏览器**：用 Playwright 自带的 `chromium_headless_shell`（`/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`，或设 `HEADLESS_SHELL`），参数 `--deterministic-mode --enable-begin-frame-control --run-all-compositor-stages-before-draw --disable-threaded-animation`。页面要在**新的 browser context** 里用 `Target.createTarget({ enableBeginFrameControl: true })` 创建。**导航期间也必须持续调用 `HeadlessExperimental.beginFrame`**，否则页面永远不加载（cdp.mjs 的 `navigate` 已处理）。
- **时间控制**：`Emulation.setVirtualTimePolicy` 先 `pause`，每帧 `advance` 并传 `budget = 1000/fps × rate`，等 `Emulation.virtualTimeBudgetExpired` 事件。这样 setTimeout、CSS 过渡、`performance.now()` 都跟随虚拟时间，慢镜头是真实慢放而不是插帧。
- **`frameTimeTicks` 必须等于 `ORIGIN + 页面的 performance.now()`**。ORIGIN 要在**暂停虚拟时间之前**测：`process.hrtime` 取两次夹住一次 `evaluate('performance.now()')`，`ORIGIN = 中点 - pn`。否则合成器线程上的动画（比如带 `will-change: transform` 的拖拽幽灵元素的落位过渡）按真实时钟走，会瞬间结束 —— 上一轮因此白跑了一次全片渲染。冒烟测试一定要验这一条。
- **iframe 必须同源**才能被导演脚本控制，所以要用 http 服务器（render.mjs 自带），不能用 `file://`。
- **`transform-style: preserve-3d` 会裁切**：旋转元素会和背景平面在 3D 里相交而被裁掉。开场终端这类独立场景用 `perspective`，不要用 preserve-3d。
- **大标题别压在主体上**：上一轮"拿起"一开始挡住了卡片。拖拽特写时标题用 `title side`（画面左侧），关键帧预览时专门检查。
- **不要 `pkill -f <含命令关键字的模式>`**：模式会匹配到执行它的 shell 自己，把会话的 shell 杀掉。用 `killall -9 headless_shell` 或按 pid 杀。
- **ffmpeg**：用 `pip install imageio-ffmpeg` 自带的二进制（`python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'`），没有 ffprobe，用 `ffmpeg -i x 2>&1 | grep Duration` 代替。
- **字体**：`fetch-fonts.sh` 用 Google Fonts CSS API 下载到 `~/.fonts`（Noto Sans SC / Inter / JetBrains Mono，均 SIL OFL），导演页往 iframe 注入字体样式；`DIRECTOR.ready` 等两个文档的 `fonts.ready`。
- **音画同步**：音效提示点由导演页 `observe()` 观察真实 DOM 状态生成（幽灵元素出现、加上 `lifted`/`dropping` 类、占位符换位置），不要按剧本时间硬写。每条 cue 带当时的速率 `r`，audio.py 在慢镜头里把音效按 `1/r` 拉长。换了被展示页面就要改 `observe()` 的选择器。
- **合成事件**：拖拽库若检查 `isTrusted` 就驱动不了，先冒烟测试；需要时改用 CDP `Input.dispatchMouseEvent`（但那样指针坐标要换算到 iframe）。
- **性能参考**：1920×1080 约 0.3 s/帧，58 s×30 fps 全片约 10 分钟。预览只截 still，不渲染视频；用时间范围（`--to 3`）而不是分辨率来缩短冒烟测试。
- **`--scale` 不会加快渲染**：BeginFrame 截图忽略 `deviceScaleFactor < 1`（实测仍输出 1920×1080），所以 `--scale` 只是让 ffmpeg 把输出缩小（0.25 → 480×270），stills 仍是全分辨率。

## 自查清单（交付前逐项跑，结果写进汇报）

```bash
FF="$(python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')"
"$FF" -i video/out/promo.mp4 2>&1 | grep -E "Duration|Stream"          # 时长、1920x1080、30 fps、h264 + aac
"$FF" -i video/out/promo.mp4 -vf blackdetect=d=0.3:pix_th=0.05 -an -f null - 2>&1 | grep black_start   # 除开场淡入/有意黑场外应为空
"$FF" -i video/out/promo.mp4 -vf freezedetect=n=0.001:d=1.5 -an -f null - 2>&1 | grep freeze_start    # 定格只允许出现在结尾字幕等有意的地方
```

- **时长**：≤ SPEC 上限，音视频时长差 < 0.1 s。
- **关键交互的 cue 时间差**（证明合成器动画没被跳过）：从 `out/cues.json` 取每次拖拽的 `dropStart → drop`，换算成页面时间 `Δ × r` 应接近页面自身的落位过渡时长（看板是 ~0.2–0.3 s）；若 Δ ≈ 一帧（0.033 s）说明落位动画瞬间结束 = ORIGIN 没对齐。`lift`、`flip` 同理检查存在且顺序正确。
  ```bash
  python3 -c "import json;c=json.load(open('video/out/cues.json'))['cues'];[print(a['t'],b['t'],round(b['t']-a['t'],3),a['r']) for a,b in zip(c,c[1:]) if a['type']=='dropStart' and b['type']=='drop']"
  ```
- **结尾文字**：截结尾 still 核对文案逐字一致（包括大小写和括号）。
- **标题不压主体**、没有未加载字体的方块字、没有滚动条：看关键帧拼图。
- **`[page-exc]`**：渲染日志里不应有页面异常；`frame N: no damage` 偶尔出现可以接受，大量出现说明画面没更新。

## 交付

- 对话上传上限 **30 MB**：除高码率母版（crf 15，~60–100 MB）外，必须出分享版：两遍编码、视频约 **3.7 Mbps**、音频 AAC 192k（58 s ≈ 27 MB）。make.sh 已包含；时长更长时按 `目标码率 ≈ 28 MB × 8 / 秒数 − 192k` 重算。
- 用 SendUserFile 发送分享版；汇报时长、分辨率、文件大小、自查结果。

## 分工建议（控制成本）

| 步骤 | 谁做 |
| --- | --- |
| 写/改 SPEC、决定分镜与风险点、最终审阅成片 | 主会话 |
| 把 SPEC 分镜表翻译成剧本代码、`SECTIONS` 节拍表 | sonnet 子代理（给它 SPEC 路径 + 模板路径，只回报改了哪些段落） |
| 冒烟测试、关键帧 still 与拼图、全片渲染、混流、自查命令 | haiku 子代理（只回报数字：时长、cue 时间差、blackdetect/freezedetect 结果、文件大小） |
| 拼写、路径、文案逐字核对 | haiku 子代理 |

主会话不要整份读导演页（通常 800+ 行），用 grep 找段落标记 `/* ---------- a–bs：... ---------- */` 再按行号读；长任务后台跑、等通知。
