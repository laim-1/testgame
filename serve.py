#!/usr/bin/env python3
import http.server, sys

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, fmt, *args):
        pass  # suppress request spam in terminal

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
print(f'Serving on http://localhost:{port}  (Ctrl+C to stop)')
http.server.test(HandlerClass=NoCacheHandler, port=port, bind='localhost')
