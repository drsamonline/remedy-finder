#!/usr/bin/env python3
"""Remedy Finder — portable desktop launcher.

Serves the bundled single-file app from memory on a random localhost port and
opens your default browser. No installation, no admin rights, no network access.

Built into RemedyFinder.exe by .github/workflows/build-exe.yml (PyInstaller).
"""
import http.server
import os
import socket
import sys
import threading
import webbrowser

APP = os.path.join(getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__))), "remedy-finder.html")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            with open(APP, "rb") as fh:
                body = fh.read()
        except OSError:
            self.send_error(500, "remedy-finder.html not found next to the launcher")
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def main():
    if not os.path.exists(APP):
        print("remedy-finder.html not found:", APP)
        input("Press Enter to close…")
        return 1
    port = free_port()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{port}/"
    print("Remedy Finder running at", url)
    print("Close this window to stop.")
    webbrowser.open(url)
    try:
        while True:
            threading.Event().wait(3600)
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
