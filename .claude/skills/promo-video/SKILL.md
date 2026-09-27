---
name: promo-video
description: 为网页或 Web 应用制作宣传片 / 产品演示视频 / 功能预告片，用确定性逐帧录屏（headless Chromium + BeginFrame + 虚拟时间）驱动真实页面交互，配 CSS 3D 运镜、慢镜头速度坡度、标题字幕，以及 numpy 合成的配乐和与 DOM 状态同步的 UI 音效，输出 H.264+AAC MP4。当用户要"给这个页面/应用做个宣传片""录一段产品演示视频""做功能展示动画""确定性录屏/逐帧渲染网页"时使用。
---

# 网页产品宣传片（确定性渲染流水线）

画面 = 导演页（`director.html`）在时间 `t` 的确定性函数：被展示的页面放在同源 iframe 里，导演脚本派发真实的 Pointer/Mouse/Keyboard 事件驱动交互；外层用 CSS 3D 做镜头、景深、动态模糊、标题、颗粒。`render.mjs` 逐帧调用 `DIRECTOR.frame(t)`、截图、按速度坡度推进浏览器虚拟时间，帧交给 ffmpeg。`audio.py` 按导演页观察 DOM 得到的 `cues.json` 合成音效与配乐。

目录：

| 路径 | 作用 |
| --- | --- |
| `SPEC.template.md` | 空白 SPEC，复制为 `SPEC.md`（位置见下）后填写 |
| `SPEC.example.md` | 完整范例：`trello/index.html` 的 58 秒看板宣传片（成片源码在仓库 `video/`） |
| `template/cdp.mjs` | 极简 CDP 客户端（headless_shell、确定性模式、BeginFrame 控制） |
| `template/render.mjs` | 静态服务器 + 逐帧渲染 + 导出 cues.json |
| `template/director.template.html` | 导演页引擎 + 8 秒示例剧本（默认展示 `demo.html`；`?smoke` 开关、`typeAt` 逐字输入） |
| `template/demo.html` | 自带演示页（Pointer 事件拖拽卡片，类名与 `observe()` 一致），模板在任何仓库都能直接跑通 |
| `template/check.py` | 自动自查：时长/分辨率/fps/编码/音视频差/黑场/定格/过渡 cue 对（`<x>Start→<x>`）时间差/文件大小，一张 PASS/FAIL 表 |
| `template/audio.template.py` | 乐器、UI 音效、混响、母带；配乐由节拍表 `SECTIONS` 驱动 |
| `template/fetch-fonts.sh` / `make.sh` | 字体下载 / 一键全流程（末尾自动跑 check.py） |

## 开始一个新项目

`$V` 是放导演页等源码的目录：被展示页面在仓库根目录附近时用 `video`；页面在子目录（如 `demo-app/index.html`）时用 `demo-app/video`，SPEC 也放 `demo-app/SPEC.md`，保持根目录干净。

```bash
V=video                                                          # 或 <子目录>/video
cp .claude/skills/promo-video/SPEC.template.md "$(dirname $V)/SPEC.md"   # 先写 SPEC（参考 SPEC.example.md）
mkdir -p $V && cp -r .claude/skills/promo-video/template/. $V/
mv $V/director.template.html $V/director.html
mv $V/audio.template.py $V/audio.py
grep -qxF '**/video/out/' .gitignore 2>/dev/null || echo '**/video/out/' >> .gitignore   # 渲染产物不提交
pip install -q numpy scipy imageio-ffmpeg && $V/fetch-fonts.sh
```

- 先不改任何东西跑一次 `ROOT=. SCALE=0.25 $V/make.sh` 验证环境（约 1 分钟，check.py 应 ALL PASS）。make.sh 会先 `cd` 到 `$V`，`ROOT` 相对 `$V` 解析：这里 `ROOT=.` 是让服务器从 `$V` 提供自带的 `demo.html`；正式项目用默认 `ROOT=..`（`$V` 的上一级，要能覆盖被展示页面）。
- 然后在 `$V/director.html` 里把 `APP` 指向被展示页面（**相对导演页**，如 `'../index.html'`；必须在 ROOT 之内、同源），再按 SPEC 分镜表逐段写剧本。
- **被展示页面的视口是 1440×810**（导演页 `#rig`/`#app` 的尺寸），剧本里的指针坐标、镜头 `{x,y}` 都是这个视口里的 CSS 像素；新做的页面按这个尺寸设计，不要出现滚动条。
- 导演页往 iframe 注入的是 `:root{--font: Inter, "Noto Sans SC", sans-serif}`：页面的 `font-family` 要写成 `var(--font)` 才会换成下载的字体（否则用系统字体，容易出方块字）。

下文命令都在 `$V` 的上一级目录（即默认 `ROOT`）里执行，命令里的 `video/` 就是 `$V` 相对这一级的路径（`$V=demo-app2/video` 时先 `cd demo-app2`，仍写 `video/...`）。环境验证通过后可删掉 `$V/demo.html`，免得把示例页一起提交。

**量坐标**（写 SPEC 镜头 `{x,y}` 和指针路径要用）：在冒烟分支里 `at(.1, () => console.log(JSON.stringify(Object.fromEntries(['#a', '.b'].map(s => [s, rect(q(s))])))))`，用 `--no-video --to 1` 渲染，从 stderr 的 `[page]` 行读 1440×810 视口里的 CSS 像素。

`render.mjs` 参数：`--root <服务根目录，默认 cwd> --page <相对 root 的导演页，默认 video/director.html，可带 ?app=...> --outdir <默认导演页旁的 out/> --out <mp4> --scale <0.25 等，只缩小输出视频> --width 1920 --height 1080 --crf 15 --from <秒> --to <秒> --stills 3.9,11.8 --no-video`。FPS 和时长来自 `DIRECTOR.FPS / DIRECTOR.DURATION`。

## 工作流程

1. **写 SPEC**（主会话）：规格、被展示页面与示例数据、分镜表（时间码 | 镜头 | 交互 | 速度坡度 | 标题 | 音乐/音效）、开场结尾文案、风险点、验收清单。分镜表是唯一事实来源，剧本和 `SECTIONS` 都从它翻译。
2. **冒烟测试风险点**：对每个"没把握的交互"（拖拽库是否认合成事件、过渡是否跟虚拟时间、字体是否加载）写一个 2–3 秒的最小剧本，用 `--scale 0.25 --to 3` 渲染，看 cue 时间差（见下）和几张 still。不通过就先改引擎/剧本，**不要**带着疑问跑全片。约定：导演页模板有 `SMOKE = ?smoke` 开关，剧本写成 `if (SMOKE) {...冒烟...} else {...全片...}`，`DURATION`/`RATE`/`END` 用 `SMOKE ? a : b` 在**块外**声明（`drawEnd` 和 `DIRECTOR` 在块外引用它们；块内 `const` 会 ReferenceError，`node --check` 查不出）。运行：
   `cd <ROOT> && node video/render.mjs --root . --page 'video/director.html?smoke' --outdir video/out/smoke --scale 0.25 --stills 0.5,1.2,2.2`，然后看 `video/out/smoke/cues.json`。页面脚本报错时 render.mjs 会在 1 秒内以退出码 1 结束，原因只在 stderr 的 `[page-exc]` 行里。
3. **低分辨率关键帧预览**：`node video/render.mjs --no-video --stills 1,5.5,11.8,...`（`--no-video` 不会覆盖 cues.json），再拼成一张图看构图、标题是否压主体：
   `"$FFMPEG" -pattern_type glob -i 'video/out/stills/*.jpg' -vf "scale=480:-1,tile=4x3" -frames:v 1 video/out/contact.jpg`
   注意：`--stills` 仍要从 0 跑到最后一个 still（状态是累积的），只是不编码视频。
4. **全片渲染**：`NAME=<SPEC 的输出名> MAX_DURATION=<秒> EXPECT_TRANSITION=<关键过渡秒数> video/make.sh`（渲染→音频→混流→分享版→check.py 一步完成，第 5–7 步不用再单独跑；也可单独 `node video/render.mjs`）。1080p 约 0.3 s/帧，58 s×30 fps ≈ 10 分钟 —— 用 `run_in_background` 启动，等完成通知，**不要**写 sleep/until 轮询。
5. **音频**：`python3 video/audio.py video/out/cues.json video/out/audio.wav`（节拍表 `SECTIONS`/`HITS` 从 SPEC 的音乐段落抄）。
6. **混流**：make.sh 输出 `out/$NAME.mp4`（AAC 256k）和分享版 `out/$NAME-share.mp4`。
7. **自查**：跑下面的清单。
8. **交付**：见"交付"。只提交源码，不提交 MP4 和 `video/out/`（加进 `.gitignore`）。

## 已知坑（每条都付出过代价）

- **浏览器**：用 Playwright 自带的 `chromium_headless_shell`（`/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`，或设 `HEADLESS_SHELL`）。cdp.mjs 的自动探测**只找 `/opt/pw-browsers`**（云端容器的路径）；本地要先 `npx playwright install chromium-headless-shell`，再把 `HEADLESS_SHELL` 设成它装出来的 `headless_shell` 路径（如 `~/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell`，macOS 为 `chrome-mac/headless_shell`）。参数 `--deterministic-mode --enable-begin-frame-control --run-all-compositor-stages-before-draw --disable-threaded-animation`。页面要在**新的 browser context** 里用 `Target.createTarget({ enableBeginFrameControl: true })` 创建。**导航期间也必须持续调用 `HeadlessExperimental.beginFrame`**，否则页面永远不加载（cdp.mjs 的 `navigate` 已处理）。
- **时间控制**：`Emulation.setVirtualTimePolicy` 先 `pause`，每帧 `advance` 并传 `budget = 1000/fps × rate`，等 `Emulation.virtualTimeBudgetExpired` 事件。这样 setTimeout、CSS 过渡、`performance.now()` 都跟随虚拟时间，慢镜头是真实慢放而不是插帧。
- **`frameTimeTicks` 必须等于 `ORIGIN + 页面的 performance.now()`**。ORIGIN 要在**暂停虚拟时间之前**测：`process.hrtime` 取两次夹住一次 `evaluate('performance.now()')`，`ORIGIN = 中点 - pn`。否则合成器线程上的动画（比如带 `will-change: transform` 的拖拽幽灵元素的落位过渡）按真实时钟走，会瞬间结束 —— 上一轮因此白跑了一次全片渲染。冒烟测试一定要验这一条。
- **iframe 必须同源**才能被导演脚本控制，所以要用 http 服务器（render.mjs 自带），不能用 `file://`。
- **`transform-style: preserve-3d` 会裁切**：旋转元素会和背景平面在 3D 里相交而被裁掉。开场终端这类独立场景用 `perspective`，不要用 preserve-3d。
- **大标题别压在主体上**：上一轮"拿起"一开始挡住了卡片。拖拽特写时标题用 `title side`（画面左侧），关键帧预览时专门检查。
- **不要 `pkill -f <含命令关键字的模式>`**：模式会匹配到执行它的 shell 自己，把会话的 shell 杀掉。用 `killall -9 headless_shell` 或按 pid 杀。
- **ffmpeg**：用 `pip install imageio-ffmpeg` 自带的二进制（`python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'`），没有 ffprobe，用 `ffmpeg -i x 2>&1 | grep Duration` 代替。
- **字体**：`fetch-fonts.sh` 用 Google Fonts CSS API 下载到 `~/.fonts`（Noto Sans SC / Inter / JetBrains Mono，均 SIL OFL），导演页往 iframe 注入字体样式；`DIRECTOR.ready` 等两个文档的 `fonts.ready`。
- **过渡要整段落在恒定速率里**：check.py 用 `<x>Start` 那一刻的 `r` 算 `Δ × r`；过渡跨越速度坡度的斜坡时只是近似（冒烟里 0.3×→1× 的斜坡让 0.3 s 过渡算成 0.27 s）。要精确验证就让慢镜头窗口比过渡长一截。
- **音画同步**：音效提示点由导演页 `observe()` 观察真实 DOM 状态生成（幽灵元素出现、加上 `lifted`/`dropping` 类、占位符换位置），不要按剧本时间硬写。每条 cue 带当时的速率 `r`，audio.py 在慢镜头里把音效按 `1/r` 拉长。换了被展示页面就要改 `observe()` 的选择器。
- **合成事件**：拖拽库若检查 `isTrusted` 就驱动不了，先冒烟测试；需要时改用 CDP `Input.dispatchMouseEvent`（但那样指针坐标要换算到 iframe）。
- **性能参考**：1920×1080 约 0.3 s/帧，58 s×30 fps 全片约 10 分钟。预览只截 still，不渲染视频；用时间范围（`--to 3`）而不是分辨率来缩短冒烟测试。
- **`--scale` 不会加快渲染**：BeginFrame 截图忽略 `deviceScaleFactor < 1`（实测仍输出 1920×1080），所以 `--scale` 只是让 ffmpeg 把输出缩小（0.25 → 480×270），stills 仍是全分辨率。

## 自查清单（交付前逐项跑，结果写进汇报）

make.sh 结束时会自动运行（也可单独跑）：

```bash
python3 video/check.py video/out/promo.mp4 video/out/cues.json --max-duration 60 --expect-transition 0.2
```

输出一张 PASS/FAIL 表，任一 FAIL 则退出码非 0：

- **时长**（≤ `--max-duration`）、**分辨率**、**fps = 30**、**h264 + aac**、**音视频时长差 < 0.1 s**。
- **blackdetect**：开场淡入（前 0.5 s）和结尾卡（导演页 `END.from` 起，render.mjs 写进 cues.json 的 `endFrom`；也可 `--allow-black-from`）以外不应有黑场；**freezedetect**：列出定格段，超过 3 s 判 FAIL（结尾字幕等有意定格注意时长）。
- **过渡 cue 时间差**（证明合成器动画没被跳过）：每对 `<x>Start → <x>`（拖拽是 `dropStart → drop`，开关可以是 `toggleStart → toggle`）的 Δ 与页面时间 `Δ × r`。Δ ≤ 1.5 帧 = 落位动画瞬间结束（ORIGIN 没对齐）→ FAIL；给了 `--expect-transition`（页面自身过渡时长，看板/demo 落位是 0.2 s；make.sh 用 `EXPECT_TRANSITION=` 传）时还要求 `Δ × r` 在容差内。
- **文件大小**：分享版（`<NAME>-share.mp4`）必须 < 30 MB。

check.py 管不到的，仍需人工看静帧（先缩小再看）：

- **结尾文字**：截结尾 still 核对文案逐字一致（包括大小写和括号）。
- **标题不压主体**、没有未加载字体的方块字、没有滚动条：看关键帧拼图。
- `lift`、`flip` 等其他 cue 存在且顺序正确。
- **`[page-exc]`**：渲染日志里不应有页面异常；`frame N: no damage` 偶尔出现可以接受，大量出现说明画面没更新。

## 给新页面写 observe()

`observe()` 每帧在 `frame(t)` 里跑一次，比较上一帧与这一帧的 DOM 状态，状态**变化**的那一帧打 cue。换页面时先弄清"交互开始/结束"在 DOM 上表现为什么：

1. **看类名**：写一个 2–3 秒的小剧本只做一次拖拽，`--no-video --stills 1.9,2.5,3.1` 截几张图，同时在剧本里 `during(1.8, 3.2, () => console.log(D.body.innerHTML.length, [...D.querySelectorAll('[class]')].filter(e => /drag|ghost|lift|drop|placeholder/i.test(e.className)).map(e => e.className)))`，render.mjs 会把页面 console 以 `[page]` 前缀转发到 stderr。
2. **或挂 MutationObserver**：在 `ready` 之后 `new W.MutationObserver(ms => ms.forEach(m => console.log(T.toFixed(3), m.type, m.target.className, m.attributeName || [...m.addedNodes].map(n => n.className)))).observe(D.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] })`，从 `[page]` 日志里找出拿起/落位/占位换位对应的类或节点增删，确认后删掉。

非拖拽页面（点击弹层、开关、输入）同样按状态转换打 cue，例如 `#sheet` 加上 `.open` → `pop`、开关加上 `.on` → `toggleStart`、过渡结束 → `toggle`。过渡结束在 DOM 上没有痕迹时，可以在页面里用 `transitionend` 写一个标记（如 `body.dataset.settled`）供 observe() 读取——这正是要验证的"合成器动画跟随虚拟时间"。成对的 `<x>Start`/`<x>` 会被 check.py 自动检查。新 cue 类型要在 audio.py 的 `SFX` 里加映射，否则被跳过并打印 `unknown cue type`；模板已有：`click grab lift flip dropStart drop whoosh slowdown speedup impact end key enter tick tool swish cut pop check swatch hit riser section`，`<x>Start`/`<x>` 可以直接复用（如 `toggleStart` → `_sfx_click`，`toggle` → `_sfx_drop`）。标记在点击时先删掉、过渡结束再写回的，只在它 false→true 的那一帧打 `<x>`。

`slowdown`/`speedup`/`whoosh`/`end` 这类跟速度坡度或剪辑点走的 cue 不是 DOM 状态，直接在剧本里 `at(t, () => cue('slowdown'))` 手打，时间取 SPEC 分镜表。

规则：

- **按状态转换打 cue，不按剧本时间打**：`at(4.2, release)` 之后落位动画何时结束由页面（和速度坡度）决定，只有观察 DOM 才对得上。
- **每条 cue 自动带 `r`**（`cue()` 已写入当前速率），audio.py 据此在慢镜头里拉长音效；不要自己换算时间。
- **一次转换只打一条**：用 `watch` 记住上一帧状态，只在 false→true（或节点消失）那一帧打；轮询条件本身不要打 cue。
- **isTrusted 兜底**：若页面检查 `event.isTrusted`（合成事件被忽略、幽灵不出现），改用可信输入：导演页的 `fire()` 不直接 dispatchEvent，而是把 `{type, x, y, buttons}` 推进 `window.PENDING_INPUT`，render.mjs 在每帧 `frame(t)` 之后取出并用 CDP `Input.dispatchMouseEvent`（`mousePressed/mouseMoved/mouseReleased`）派发；坐标 = iframe 内坐标 + iframe 在导演页中的偏移（导演页相机有 3D 变换时要按未变换的布局坐标算，最好在派发那几帧把相机置为单位变换）。observe() 不用改。

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
