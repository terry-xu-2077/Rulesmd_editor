from __future__ import annotations

import os
from pathlib import Path


def runtime_resource_root() -> Path:
    """Return the rule metadata root for source/dev or the portable package.

    Development keeps using the package-local ``rulesmd_editor/resources`` tree.
    Portable builds set ``RULESMD_RESOURCES_DIR`` so the same backend reads the
    visible ``resources`` directory next to the main application executable.
    """
    configured = os.environ.get("RULESMD_RESOURCES_DIR", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parent / "resources"


RESOURCE_ROOT = runtime_resource_root()
