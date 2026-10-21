#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
扫描 words/ 目录，生成 manifest.json。

用法：
    python tools/make_manifest.py
    python tools/make_manifest.py --dir words --ext txt
    python tools/make_manifest.py --count      # 同时统计每个词库的单词数

什么时候需要：
  * 部署到 GitHub Pages（不支持目录列表）
  * IIS / nginx 没有开启目录浏览
  * 想让加载顺序稳定（按文件名自然排序）
"""

import argparse
import json
import os
import re
from datetime import datetime


def natural_key(text):
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", text)]


def count_words(path):
    n = 0
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith(("#", "//", ";")):
                    n += 1
    except OSError:
        return 0
    return n


def main():
    ap = argparse.ArgumentParser(description="扫描词库目录生成 manifest.json")
    ap.add_argument("--root", default=".", help="站点根目录（默认当前目录）")
    ap.add_argument("--dir", default="words", help="词库目录（默认 words）")
    ap.add_argument("--ext", default="txt", help="扩展名白名单，逗号分隔")
    ap.add_argument("--out", default="manifest.json", help="输出文件名")
    ap.add_argument("--count", action="store_true", help="顺带统计单词数")
    args = ap.parse_args()

    root = os.path.abspath(args.root)
    target = os.path.join(root, args.dir)
    exts = {e.strip().lower().lstrip(".") for e in args.ext.split(",") if e.strip()}

    if not os.path.isdir(target):
        print("[!] 目录不存在：%s" % target)
        return 1

    items = []
    for name in sorted(os.listdir(target), key=natural_key):
        if name.startswith("."):
            continue
        path = os.path.join(target, name)
        if not os.path.isfile(path):
            continue
        if os.path.splitext(name)[1].lower().lstrip(".") not in exts:
            continue

        item = {
            "path": "%s/%s" % (args.dir.strip("/"), name),
            "name": name,
            "base": os.path.splitext(name)[0],
            "ext": os.path.splitext(name)[1].lower().lstrip("."),
            "size": os.path.getsize(path),
        }
        if args.count:
            item["count"] = count_words(path)
        items.append(item)

    data = {
        "generated": datetime.now().isoformat(timespec="seconds"),
        "count": len(items),
        "items": items,
    }

    out_path = os.path.join(root, args.out)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print("[+] 已生成 %s" % args.out)
    print("    词库 %d 个" % len(items))
    for it in items:
        extra = (" · %d 词" % it["count"]) if it.get("count") else ""
        print("    - %s%s" % (it["path"], extra))
    if not items:
        print("    提示：%s 里没有 .%s 文件" % (args.dir, ",".join(sorted(exts))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
