#!/usr/bin/env python3
"""Headless LibreOffice UNO lifecycle smoke.

The Node adapter owns checker settings and match normalization. This process
proves the other half of the native boundary with the actual LibreOffice
Writer runtime: connect over UNO, locate a text range, Apply a replacement,
and verify the local HTTP checker contract in the same container.
"""

import json
import os
import subprocess
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Checker(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 - stdlib callback name
        length = int(self.headers.get("content-length", "0"))
        body = urllib.parse.parse_qs(self.rfile.read(length).decode("utf-8"))
        text = body.get("text", [""])[0]
        offset = text.find("results is")
        matches = [] if offset < 0 else [{
            "offset": offset,
            "length": 10,
            "message": "Use a plural verb.",
            "replacements": [{"value": "results are"}],
            "rule": {"id": "AGREEMENT", "category": {"id": "GRAMMAR"}},
        }]
        payload = json.dumps({"matches": matches}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        return


def property_value(uno, name, value):
    prop = uno.createUnoStruct("com.sun.star.beans.PropertyValue")
    prop.Name = name
    prop.Value = value
    return prop


def main():
    import uno  # pylint: disable=import-outside-toplevel

    checker = ThreadingHTTPServer(("127.0.0.1", 8097), Checker)
    threading.Thread(target=checker.serve_forever, daemon=True).start()
    request_text = "The results is ready."
    request = urllib.request.Request(
        "http://127.0.0.1:8097/v2/check",
        data=urllib.parse.urlencode({"text": request_text, "language": "en-US"}).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=5) as response:
        payload = json.loads(response.read().decode("utf-8"))
    match = payload["matches"][0]
    checker_process = subprocess.Popen([
        "soffice", "--headless", "--norestore", "--nofirststartwizard", "--nodefault",
        "--invisible", "--accept=socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    doc = None
    try:
        local_context = uno.getComponentContext()
        resolver = local_context.ServiceManager.createInstanceWithContext(
            "com.sun.star.bridge.UnoUrlResolver", local_context
        )
        context = None
        for _ in range(60):
            try:
                context = resolver.resolve(
                    "uno:socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext"
                )
                break
            except Exception:
                time.sleep(0.25)
        if context is None:
            raise RuntimeError("LibreOffice UNO listener did not start")

        desktop = context.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", context)
        doc = desktop.loadComponentFromURL(
            "private:factory/swriter", "_blank", 0,
            (property_value(uno, "Hidden", True),),
        )
        body = doc.Text
        body.String = request_text
        cursor = body.createTextCursor()
        cursor.goRight(4, False)
        cursor.goRight(10, True)
        if cursor.String != "results is":
            raise AssertionError(f"UNO range projection mismatch: {cursor.String!r}")

        cursor.String = match["replacements"][0]["value"]
        if body.String != "The results are ready.":
            raise AssertionError(f"UNO Apply mismatch: {body.String!r}")
        print("LibreOffice UNO smoke passed: headless Writer, loopback /v2/check, text range projection, and Apply.")
    finally:
        if doc is not None:
            doc.close(True)
        checker.server_close()
        checker_process.terminate()
        try:
            checker_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            checker_process.kill()


if __name__ == "__main__":
    main()
