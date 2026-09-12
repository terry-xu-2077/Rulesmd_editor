from pathlib import Path

from rulesmd_editor import export_bridge
from rulesmd_editor.export_bridge import ExportMixRulesWorkspace


def test_reopened_custom_objects_are_prioritized_ahead_of_stock(monkeypatch, tmp_path: Path) -> None:
    template = tmp_path / "rulesmd.template.ini"
    template.write_text(
        "[VehicleTypes]\n"
        "0=MTNK\n"
        "1=HTNK\n"
        "[MTNK]\n"
        "Name=Grizzly\n"
        "[HTNK]\n"
        "Name=Rhino\n",
        encoding="utf-8",
    )
    rules = tmp_path / "rulesmd.ini"
    rules.write_text(
        "[VehicleTypes]\n"
        "0=MTNK\n"
        "1=HTNK\n"
        "2=MYCONA\n"
        "[MTNK]\n"
        "Name=Grizzly\n"
        "[HTNK]\n"
        "Name=Rhino\n"
        "[MYCONA]\n"
        "Name=我的挖掘机\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(export_bridge, "DEFAULT_TEMPLATE", template)

    workspace = ExportMixRulesWorkspace()
    snapshot = workspace.open_file(rules)

    vehicles = next(category for category in snapshot["categories"] if category["name"] == "载具")
    assert [item["section"] for item in vehicles["items"][:3]] == ["MYCONA", "MTNK", "HTNK"]
    assert [section for section, _ in workspace._catalog_categories_cache["载具"][:3]] == ["MYCONA", "MTNK", "HTNK"]
