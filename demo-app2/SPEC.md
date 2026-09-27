# SPEC：番茄专注 10 秒宣传片

> 源码目录 `$V = demo-app2/video`；本文件是剧本（`$V/director.html`）和配乐节拍表（`$V/audio.py`）的唯一事实来源。

## 1. 规格

| 项 | 值 |
| --- | --- |
| 分辨率 / 帧率 | 1920×1080，30 fps |
| 时长 | ≤ 10 s（`DURATION = SMOKE ? 3 : 10`） |
| 编码 | 母版 H.264 crf 15 + AAC 256k；分享版两遍编码 3.7 Mbps（10 s ≈ 5 MB，< 30 MB） |
| 输出文件名（`NAME`） | `tomato-promo`（`demo-app2/video/out/tomato-promo.mp4`、`tomato-promo-share.mp4`，不提交） |
| 字体 | Inter、Noto Sans SC、JetBrains Mono（`fetch-fonts.sh`） |
| 基调 | 暗场 + 暖橙辉光（番茄红）；配乐 120 BPM，A 小调 |

## 2. 被展示的页面与示例数据

- 页面路径：`demo-app2/index.html`；导演页 `APP = '../index.html'`；make.sh 用默认 `ROOT=..`（即 `demo-app2/`，包含页面与导演页，同源）。
- 页面视口 1440×810，主要元素（CSS 像素，左/上/宽/高）：
  - Logo `.logo` 64,25,158,38；专注模式开关 `#switch` 1300,24,76,40（中心 ≈ 1338,44）
  - 表盘 `.dial` 84,112,520,520（中心 ≈ 344,372）；时间 `#time`、当前任务 `#now` 在表盘中间
  - 任务列表 `#tasks` 680,178,696,250；「＋ 添加任务」`#add` 680,446,696,78（中心 ≈ 1028,485）；统计 `.stats` 680,552
  - 弹窗 `#modal` 打开后 ≈ 410,255,620,300（中心 ≈ 720,405），输入框 `#taskInput`
- 示例数据：页面自带 3 条任务，不需要预置。
- 剧本用到的元素：`#add`（点击打开弹窗）、`#taskInput`（逐字输入，`key('Enter')` 提交；页面在 document 上监听 keydown）、`#focusToggle`/`#switch`（点击切换专注模式）。
- 需要注入的样式：模板默认注入的 `--font` 与隐藏滚动条即可（页面已用 `var(--font)`）。
- `observe()` 要观察的状态：

  | DOM 变化 | cue | 音效 |
  | --- | --- | --- |
  | `#modal` 加上 `.open` | `pop` | ui_pop |
  | `#modal` 去掉 `.open` | `swish` | 短 whoosh |
  | 列表出现新的 `li.new` | `check` | 双铃 |
  | `#switch` 加上 `.on` | `toggleStart` | 点击声 |
  | `body.dataset.settled === 'on'`（旋钮 transform 过渡的 transitionend） | `toggle` | 落位"咔哒"（同 drop） |

- 关键过渡时长：开关旋钮 `transform .3s` → `EXPECT_TRANSITION=0.3`。慢镜头 0.25× 窗口 6.15–7.5 s 完整盖住（0.3 s ÷ 0.25 = 1.2 s，6.2 → 7.4）。

## 3. 分镜表

镜头参数同 SPEC.example.md：`{x,y}` 为页面坐标中的画面中心，`z` 缩放，`rx/ry/rz` 度。

| 时间码 | 镜头（`{x,y,z,rx,ry,rz}`、缓动、dof、bars） | 交互动作 | 速度坡度 | 标题 / 文案（位置、字号） | 音乐段落 / 音效 |
| --- | --- | --- | --- | --- | --- |
| 0–1.6 | `{720,405,z.6,rx40,ry8,rz−8}` → `{720,405,z1.05,rx12,ry−4,rz−1}`，`E.outExpo`，0–1.6 全段；dof 6，`fx.grid` 淡入淡出 | 0 起指针可见，停在 (1150,700) | 1× | 0.15–1.6 `title side` 左下（top 660px，110px）："番茄专注" / `TOMATO FOCUS` | ambient |
| 1.6–2.9 | → `{1000,470,z1.75,rx10,ry−8,rz−1}`，`E.io`，1.6–2.4，之后保持到 2.9 | 指针 1.6→2.4 移到 `#add` 中心（E.io），2.55 `click()` | 1× | — | build 起；`click`、`pop`（observe） |
| 2.9–4.6 | → `{720,405,z1.55,rx6,ry4,rz0}`，`E.io`，2.9–3.3，之后保持 | 3.3 起 `typeAt(3.3, #taskInput, '写宣传片分镜', .12)`（结束 ≈ 3.9）；4.3 `key('Enter')` | 1× | 3.3–4.6 caption 左下："QUICK ADD" / "回车即添加任务" | 每字 `key`；4.3 `swish`、`check`（observe） |
| 4.6–5.5 | → `{960,360,z1.3,rx8,ry−6,rz0}`，`E.io`，4.6–5.2，保持 | 指针 4.7→5.4 移到 `#switch` 中心 (1338,44)（E.io） | 1× | — | 4.6 drop 段（鼓组进入） |
| 5.5–7.6 | → `{1230,110,z2.4,rx8,ry−10,rz−1}`，`E.io`，5.5–6.1，保持到 7.6；dof 5，bars 5.9–7.5 淡入淡出 | 6.2 `click()` 专注模式开关 | 6.0 **1×** → 6.15 **0.25×**，保持到 7.5，7.65 回 1× | 6.3–7.5 `title side`（top 700px，120px）："一键专注" / `FOCUS MODE`（在画面左侧，不压开关） | 6.0 `slowdown`（剧本手打）；`toggleStart`、`toggle`（observe）；7.5 `speedup`（手打） |
| 7.6–8.5 | → `{720,500,z.8,rx14,ry6,rz2}`（页面在画面上部，给下方标题留位），`E.outExpo`，7.6–8.3，保持；glowC 0.6 | 指针 7.6 隐藏；倒计时在走 | 1× | 7.75–8.5 下方标题（top 840px，88px；预览发现居中会压住表盘）："专注，从一个番茄开始。" / `ONE TOMATO AT A TIME` | 7.6 `whoosh`（手打） |
| 8.5–10 | 黑底结尾卡（`END.from = 8.5`） | — | 1× | `build by Opus5.5(medium)`（Opus5.5 高亮） | 8.6 `end`（手打），outro |

`RATE` 表：

```js
SMOKE ? [[0,1],[1.4,1],[1.5,.25],[3,.25]]
      : [[0,1],[6.0,1],[6.15,.25],[7.5,.25],[7.65,1],[10,1]]
```

音乐节拍表（`SECTIONS` / `HITS`）：

| 段落类型 | 时间 | 和弦 / 内容 |
| --- | --- | --- |
| ambient | 0–1.6 | Am |
| build | 1.6–4.6 | F |
| drop | 4.6–8.5 | C |
| outro | 8.5–DUR | Am |

HITS：7.6 boom。

## 4. 开场与结尾文案（逐字）

- 开场：`番茄专注` / `TOMATO FOCUS`
- 各段标题：caption `QUICK ADD` / `回车即添加任务`；`一键专注` / `FOCUS MODE`；`专注，从一个番茄开始。` / `ONE TOMATO AT A TIME`
- 输入文字：`写宣传片分镜`
- 结尾：`build by Opus5.5(medium)`

## 5. 风险点与冒烟测试计划

冒烟剧本写在导演页 `if (SMOKE)` 分支里，用 `--page 'video/director.html?smoke'` 渲染（3 s，全景镜头 `{720,405,z1}` 不动）：0.5 点击 `#add`；0.8 起 `typeAt` 输入"测试"；1.3 `key('Enter')`；1.6 点击开关（此时 0.25×）。

| 风险 | 冒烟测试（`--scale 0.25`，3 s） | 通过标准 |
| --- | --- | --- |
| 页面是否接受合成点击 / 键盘事件 | 同上 | cues 依次有 `click`、`pop`、`key`×2、`swish`、`check`、`click`、`toggleStart`、`toggle` |
| 合成器动画是否跟随虚拟时间 | 开关在 0.25× 中切换 | `(toggle − toggleStart) × r ≈ 0.3 s`（Δ ≈ 1.2 s） |
| `typeInto` 不 focus，Enter 能否提交 | 页面监听 document keydown；still 1.2 / 2.0 | 1.2 弹窗里有"测试"，2.0 列表首项为"测试" |
| 字体 / 方块字 | stills 0.5,1.2,2.0,2.9 | 中文为 Noto Sans SC |

## 6. 验收清单

- [ ] 时长 10.0 s / 1920×1080 / 30 fps / h264 + aac；分享版 < 30 MB
- [ ] blackdetect 只在 0–0.35 s 淡入与 8.5 s 起结尾卡命中；freezedetect 无 > 3 s
- [ ] `(toggle − toggleStart) × r` ≈ 0.3 s
- [ ] 标题不压主体（6.8 s still 里开关完整可见）；无滚动条；无方块字
- [ ] 结尾文字逐字为 `build by Opus5.5(medium)`
- [ ] 渲染日志无 `[page-exc]`
- [ ] 未提交 MP4 / `$V/out/`（`.gitignore` 有 `**/video/out/`）
