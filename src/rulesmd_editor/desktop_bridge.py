from __future__ import annotations

import json
import sys
from typing import TextIO

from .bridge import Bridge
from .mix_workspace import MixRulesWorkspace


def serve(stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout) -> None:
    bridge = Bridge(MixRulesWorkspace())
    for raw in stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            request = json.loads(raw)
            if not isinstance(request, dict):
                raise ValueError("Request must be a JSON object")
            response = bridge.dispatch(request)
        except Exception as exc:
            response = {
                "id": None,
                "ok": False,
                "error": {"type": type(exc).__name__, "message": str(exc)},
            }
        stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        stdout.flush()


def main() -> None:
    serve()


if __name__ == "__main__":
    main()
