#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
深渊回廊 · 本地调试服务器
============================================================
为什么不用 python -m http.server：
  它只发 Last-Modified、**不发 Cache-Control**。手机浏览器会按"启发式缓存"
  把页面缓存很久 —— 表现就是「我改了代码，手机上刷新还是旧的」，
  排查时极其容易被误导（这次 2.7 的相机问题就差点栽在这上面）。
  本脚本给所有响应加 no-store，保证每次拿到的都是磁盘上的最新文件。

用法：
    python 其他/本地服务器.py [端口] [根目录]
    （默认端口 8123，默认根目录 = 本文件所在目录的上一级，即项目根）
"""
import os
import sys
import functools
import socketserver
import http.server

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 手机反复刷新时不要刷屏


class ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with ThreadingServer(('0.0.0.0', PORT), handler) as httpd:
        print('[深渊回廊] 本地服务器已启动 http://0.0.0.0:%d/  根目录 %s  （已禁用缓存）' % (PORT, ROOT))
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n[深渊回廊] 服务器已停止')
