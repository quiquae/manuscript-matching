"""Static server for local development.

python -m http.server sends Last-Modified and no Cache-Control, so browsers
heuristically cache ES modules and an edit appears not to have happened. This
sends no-store instead, which is wrong for production and right for iterating.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):        # keep the console readable
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8020
    directory = sys.argv[2] if len(sys.argv) > 2 else "site"
    handler = partial(NoCacheHandler, directory=directory)
    print(f"serving {directory} on http://localhost:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
