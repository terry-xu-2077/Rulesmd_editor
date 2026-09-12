from __future__ import annotations

from typing import Any

from .icon_resources_persistent import PersistentIconResourceService


class AppIconResourceService(PersistentIconResourceService):
    """Application-only custom icon service.

    Custom icons are editor UI resources only. Existing loose Mod PCX resources may still
    be read for display, but this service never writes PCX files, ArtMD icon keys or
    rulesmd File.Flag values into the game directory.
    """

    def __init__(self, workspace: Any):
        super().__init__(workspace)

    def import_custom_icon(
        self,
        kind: str,
        target_id: str,
        data_base64: str,
        filename: str = "",
        crop_zoom: float = 1.0,
        crop_x: float = 0.5,
        crop_y: float = 0.5,
    ) -> dict[str, Any]:
        return super().import_custom_icon(
            kind=kind,
            target_id=target_id,
            data_base64=data_base64,
            filename=filename,
            sync_game=False,
            variant="cameo",
            crop_zoom=crop_zoom,
            crop_x=crop_x,
            crop_y=crop_y,
        )

    def set_artmd_icon(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise RuntimeError("图标资源仅用于编辑器显示，不允许修改游戏 ArtMD。")
