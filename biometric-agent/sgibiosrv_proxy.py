"""
SGIBIOSRV Proxy — http://localhost:12345
Forwards /SGIFPCapture and /SGIMatchScore to https://localhost:8443,
adding Access-Control-Allow-Origin: * so the browser doesn't block it.
"""

import json
import ssl
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SGIBIOSRV   = "https://localhost:8443"
PROXY_PORT  = 12345
PROXY_PATHS = {"/SGIFPCapture", "/SGIMatchScore", "/SGIFPVerify"}

# SSL context that trusts the SGIBIOSRV self-signed cert
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode    = ssl.CERT_NONE


class ProxyHandler(BaseHTTPRequestHandler):

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            body = json.dumps({"status": "ok", "proxy": "sgibiosrv", "target": SGIBIOSRV}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in PROXY_PATHS:
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)

        req = urllib.request.Request(
            f"{SGIBIOSRV}{path}",
            data=body,
            headers={"Content-Type": "text/plain;charset=UTF-8"},
        )

        try:
            with urllib.request.urlopen(req, context=_ssl_ctx, timeout=15) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:
            error = json.dumps({"error": str(exc), "ErrorCode": -1}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(error)

    def log_message(self, fmt, *args):
        print(f"[Proxy] {self.address_string()} {self.path} → {args[1] if len(args) > 1 else ''}")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("localhost", PROXY_PORT), ProxyHandler)
    print(f"""
╔══════════════════════════════════════════════════════╗
║        SGIBIOSRV Proxy — AMS Biometric Agent         ║
╠══════════════════════════════════════════════════════╣
║  Proxy  : http://localhost:{PROXY_PORT}                    ║
║  Target : {SGIBIOSRV}              ║
║  Health : http://localhost:{PROXY_PORT}/health           ║
╚══════════════════════════════════════════════════════╝
""")
    server.serve_forever()
