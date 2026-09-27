#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""宣传片质检脚本（无 ffprobe，全部从 ffmpeg stderr 解析）。

用法:
  python3 check.py <final.mp4> <cues.json> [--share <share.mp4>] \
      [--max-duration S] [--expect-transition S] [--tol 0.05] [--fps 30]

仅依赖标准库 + imageio_ffmpeg（用来定位 ffmpeg 可执行文件，环境没有 ffprobe）。
"""
import argparse
import json
import os
import re
import subprocess
import sys

try:
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG = "ffmpeg"

ROWS = []  # (name, value, status)


def add(name, value, status):
    ROWS.append((name, str(value), status))


def run(args):
    p = subprocess.run([FFMPEG, "-hide_banner"] + args, stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT, text=True)
    return p.stdout


def ffmpeg_info(path):
    """解析 `ffmpeg -i file` 的 stderr：时长/分辨率/帧率/编码。"""
    out = run(["-i", path])
    info = {"duration": None, "width": None, "height": None, "fps": None,
            "vcodec": None, "acodec": None}
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", out)
    if m:
        h, mi, s = m.groups()
        info["duration"] = int(h) * 3600 + int(mi) * 60 + float(s)
    m = re.search(r"Video:\s*(\w+).*?(\d{2,5})x(\d{2,5}).*?([\d.]+)\s*fps", out)
    if m:
        info["vcodec"], info["width"], info["height"] = m.group(1), int(m.group(2)), int(m.group(3))
        info["fps"] = float(m.group(4))
    m = re.search(r"Audio:\s*(\w+)", out)
    if m:
        info["acodec"] = m.group(1)
    return info


def stream_duration(path, mapspec):
    """通过解码整段流拿最后一个 time= 值，得到该流的真实时长。"""
    out = run(["-i", path, "-map", mapspec, "-stats", "-f", "null", "-"])
    times = re.findall(r"time=(\d+):(\d+):(\d+\.\d+)", out)
    if not times:
        return None
    h, mi, s = times[-1]
    return int(h) * 3600 + int(mi) * 60 + float(s)


def detect_segments(path, vf, start_key, end_key):
    out = run(["-i", path, "-vf", vf, "-f", "null", "-"])
    segs = []
    cur = {}
    for line in out.splitlines():
        m = re.search(start_key + r":\s*([\d.]+)", line)
        if m:
            cur = {"start": float(m.group(1))}
        m = re.search(end_key + r":\s*([\d.]+)", line)
        if m and "start" in cur:
            cur["end"] = float(m.group(1))
            segs.append(cur)
            cur = {}
    return segs


def load_cues(cues_path):
    """cues.json 通常是 {"duration","fps","rendered":[from,to],"cues":[...]}，
    但也兼容裸数组格式，返回 (cues_list, meta_fps_or_None)。"""
    with open(cues_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data, None
    return data.get("cues", []), data.get("fps")


def check_transitions(cues_path, fps, expect, tol):
    cues, _ = load_cues(cues_path)
    pairs = []
    pending = None
    for c in cues:
        t = c.get("type")
        if t == "dropStart":
            pending = c
        elif t == "drop":
            if pending is not None:
                pairs.append((pending, c))
                pending = None
    if pending is not None:
        add("拖拽变速 dropStart 未配对", "缺少后续 drop", "FAIL")
    if not pairs:
        add("拖拽变速", "无 dropStart/drop 配对", "INFO")
        return
    for i, (ds, dr) in enumerate(pairs, 1):
        delta = dr["t"] - ds["t"]
        r = ds.get("r", 0)
        page_s = delta * r
        name = f"drop#{i} @{ds['t']:.3f}s"
        val = f"Δ={delta:.3f}s r={r:.3g} Δ×r={page_s:.3f}s"
        if delta <= 1.5 / fps:
            add(name, val + "  (过渡塌陷)", "FAIL")
            continue
        status = "PASS"
        if expect is not None:
            thresh = max(tol, 1.5 * r / fps)
            if abs(page_s - expect) > thresh:
                status = "FAIL"
        add(name, val, status)


def fmt_row(name, value, status):
    return f"{name:<28} {value:<46} {status}"


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("final")
    ap.add_argument("cues")
    ap.add_argument("--share")
    ap.add_argument("--max-duration", type=float, default=None)
    ap.add_argument("--expect-transition", type=float, default=None)
    ap.add_argument("--tol", type=float, default=0.05)
    ap.add_argument("--fps", type=float, default=None)
    args = ap.parse_args()

    fps_from_cues = None
    if os.path.isfile(args.cues):
        try:
            _, fps_from_cues = load_cues(args.cues)
        except Exception:
            pass
    fps = args.fps if args.fps is not None else (fps_from_cues if fps_from_cues else 30.0)
    args.fps = fps

    if not os.path.isfile(args.final):
        add("文件存在性", args.final, "FAIL")
    else:
        info = ffmpeg_info(args.final)

        # 1. 时长
        dur = info["duration"]
        if dur is None:
            add("容器时长", "未解析到 Duration", "FAIL")
        else:
            status = "PASS"
            if args.max_duration is not None and dur > args.max_duration:
                status = "FAIL"
            add("容器时长", f"{dur:.3f}s (上限 {args.max_duration})" if args.max_duration else f"{dur:.3f}s", status)

        # 2. 分辨率 / 帧率 / 编码
        if info["width"] and info["height"]:
            add("分辨率", f"{info['width']}x{info['height']}", "INFO")
        else:
            add("分辨率", "未检测到视频流", "FAIL")

        if info["fps"] is None:
            add("帧率", "未检测到", "FAIL")
        else:
            status = "PASS" if abs(info["fps"] - args.fps) <= 0.01 else "FAIL"
            add("帧率", f"{info['fps']:.3f} (期望 {args.fps})", status)

        vcodec_ok = (info["vcodec"] or "").lower() == "h264"
        acodec_ok = (info["acodec"] or "").lower() == "aac"
        add("视频编码", info["vcodec"] or "无", "PASS" if vcodec_ok else "FAIL")
        add("音频编码", info["acodec"] or "无", "PASS" if acodec_ok else "FAIL")

        # 3. 音视频时长差
        vdur = stream_duration(args.final, "0:v:0")
        adur = stream_duration(args.final, "0:a:0")
        if vdur is None or adur is None:
            add("音视频时长差", "无法解析（可能缺少音频流）", "FAIL")
        else:
            diff = abs(vdur - adur)
            add("音视频时长差", f"v={vdur:.3f}s a={adur:.3f}s diff={diff:.3f}s",
                "PASS" if diff < 0.1 else "FAIL")

        # 4 & 5. 黑场 / 静止帧检测（一次 ffmpeg 完成）
        vf = "blackdetect=d=0.1:pix_th=0.10,freezedetect=n=0.001:d=1.0"
        out = run(["-i", args.final, "-vf", vf, "-f", "null", "-"])
        black_segs = []
        cur = {}
        for line in out.splitlines():
            if "black_start" in line:
                m = re.search(r"black_start:\s*([\d.]+)", line)
                cur = {"start": float(m.group(1))} if m else {}
            m = re.search(r"black_end:\s*([\d.]+)", line)
            if m and "start" in cur:
                cur["end"] = float(m.group(1))
                black_segs.append(cur)
                cur = {}
        freeze_segs = []
        cur = {}
        for line in out.splitlines():
            m = re.search(r"freeze_start:\s*([\d.]+)", line)
            if m:
                cur = {"start": float(m.group(1))}
            m = re.search(r"freeze_duration:\s*([\d.]+)", line)
            if m and "start" in cur:
                cur["dur"] = float(m.group(1))
            m = re.search(r"freeze_end:\s*([\d.]+)", line)
            if m and "start" in cur:
                cur["end"] = float(m.group(1))
                freeze_segs.append(cur)
                cur = {}

        bad_black = [s for s in black_segs if s.get("start", 0) > 0.5]
        add("黑场检测", f"{len(black_segs)} 段: " + str(black_segs) if black_segs else "0 段",
            "FAIL" if bad_black else "PASS")

        long_freeze = [s for s in freeze_segs if s.get("dur", 0) > 3.0]
        add("静止帧检测", f"{len(freeze_segs)} 段: " + str(freeze_segs) if freeze_segs else "0 段",
            "FAIL" if long_freeze else "INFO")

    # 6. cues.json 拖拽变速
    if not os.path.isfile(args.cues):
        add("cues.json", args.cues, "FAIL")
    else:
        check_transitions(args.cues, args.fps, args.expect_transition, args.tol)

    # 7. 文件大小
    if os.path.isfile(args.final):
        mb = os.path.getsize(args.final) / 1024 / 1024
        add("成片大小", f"{mb:.2f} MB", "INFO")

    share = args.share
    if share is None:
        stem, _ = os.path.splitext(args.final)
        guess = stem + "-share.mp4"
        if os.path.isfile(guess):
            share = guess
    if share:
        if not os.path.isfile(share):
            add("分享版大小", share, "FAIL")
        else:
            mb = os.path.getsize(share) / 1024 / 1024
            add("分享版大小", f"{mb:.2f} MB", "FAIL" if mb >= 30 else "PASS")

    # 输出表格
    print(fmt_row("检查项", "结果", "状态"))
    print("-" * 90)
    fails = 0
    for name, value, status in ROWS:
        print(fmt_row(name, value, status))
        if status == "FAIL":
            fails += 1

    print()
    print("ALL PASS" if fails == 0 else f"FAIL: {fails} 项")
    print("提醒：以下需人工确认——结尾字幕文案正确、标题不遮挡主体（看静帧）")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
