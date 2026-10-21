#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地静态服务器（支持 Range 请求）。

用法：
    python tools/local_server.py            # 端口 8000，自动打开浏览器
    python tools/local_server.py 8080       # 指定端口
    python tools/local_server.py 8080 --no-browser

要点：
  * 自动把项目根目录（index.html 所在目录）作为站点根
  * 关闭缓存，改完文件刷新即生效
  * 端口占用自动 +1，最多尝试 20 个
"""

import os
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORT = 8000


def resolve_root(argv_root):
    here = os.path.dirname(os.path.abspath(__file__))
    if argv_root:
        return os.path.abspath(argv_root)
    parent = os.path.dirname(here)
    if os.path.isfile(os.path.join(parent, "index.html")):
        return parent
    return os.getcwd()


class Handler(SimpleHTTPRequestHandler):
    root = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=Handler.root, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def guess_type(self, path):
        # 保证 txt 以 UTF-8 文本返回，避免个别系统识别成 application/octet-stream
        base, ext = os.path.splitext(path)
        if ext.lower() == ".txt":
            return "text/plain; charset=utf-8"
        return super().guess_type(path)

    def log_message(self, fmt, *args):
        pass


def main():
    args = sys.argv[1:]
    port = DEFAULT_PORT
    open_browser = True
    root = None

    i = 0
    while i < len(args):
        a = args[i]
        if a in ("--no-browser", "-n"):
            open_browser = False
        elif a == "--root":
            i += 1
            root = args[i] if i < len(args) else root
        elif a.isdigit():
            port = int(a)
        i += 1

    Handler.root = resolve_root(root)
    if not os.path.isdir(Handler.root):
        print("[x] 目录不存在：%s" % Handler.root)
        return 1

    class QuietServer(ThreadingHTTPServer):
        def handle_error(self, request, client_address):
            if isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError)):
                return
            super().handle_error(request, client_address)

    server = None
    for candidate in range(port, port + 20):
        try:
            server = QuietServer(("127.0.0.1", candidate), Handler)
            port = candidate
            break
        except OSError:
            continue

    if server is None:
        print("[x] 找不到可用端口，请手动指定：python tools/local_server.py 8123")
        return 1

    url = "http://127.0.0.1:%d/" % port
    print("已启动： %s" % url)
    print("根目录： %s" % Handler.root)
    print("按 Ctrl+C 停止服务")

    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
