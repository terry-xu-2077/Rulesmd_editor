from pathlib import Path

from rulesmd_editor.export_bridge import ExportBridge
from rulesmd_editor.workspace import RulesWorkspace


def _bridge(tmp_path: Path) -> tuple[ExportBridge, Path]:
    source = tmp_path / "rulesmd.ini"
    source.write_text(
        "[InfantryTypes]\n"
        "0=E1\n"
        "\n"
        "[E1]\n"
        "Cost=200\n"
        "Strength=125\n",
        encoding="utf-8",
    )
    bridge = ExportBridge(RulesWorkspace())
    bridge.rpc_open_file(str(source))
    return bridge, source


def test_fragment_contains_only_changed_and_added_rules(tmp_path: Path):
    bridge, _ = _bridge(tmp_path)
    doc = bridge.workspace._doc()

    cost_line = next(
        line for line in doc.section_lines("E1", keys_only=True)
        if (line.key or "").casefold() == "cost"
    )
    bridge.rpc_set_value(cost_line.line_id, "1")

    doc.set("InfantryTypes", "1", "MYE1")
    doc.add_section("MYE1")
    doc.set("MYE1", "UIName", "Name:MYE1")
    doc.set("MYE1", "Cost", "50")

    target = tmp_path / "GlobalCode.ini"
    result = bridge.rpc_save_fragment(str(target))
    text = target.read_text(encoding="utf-8")

    assert result["mode"] == "fragment"
    assert "[E1]\nCost=1\n" in text
    assert "Strength=125" not in text
    assert "[InfantryTypes]\n1=MYE1\n" in text
    assert "[MYE1]\nUIName=Name:MYE1\nCost=50\n" in text


def test_fragment_ignores_deleted_baseline_key_and_keeps_other_changes(tmp_path: Path):
    bridge, _ = _bridge(tmp_path)
    doc = bridge.workspace._doc()
    strength_line = next(
        line for line in doc.section_lines("E1", keys_only=True)
        if (line.key or "").casefold() == "strength"
    )
    cost_line = next(
        line for line in doc.section_lines("E1", keys_only=True)
        if (line.key or "").casefold() == "cost"
    )
    bridge.rpc_remove_line(strength_line.line_id)
    bridge.rpc_set_value(cost_line.line_id, "1")

    target = tmp_path / "GlobalCode.ini"
    bridge.rpc_save_fragment(str(target))
    text = target.read_text(encoding="utf-8")

    assert "Cost=1" in text
    assert "Strength" not in text


def test_fragment_preserves_stopped_baseline_key_as_editor_comment(tmp_path: Path):
    bridge, _ = _bridge(tmp_path)
    doc = bridge.workspace._doc()
    strength_line = next(
        line for line in doc.section_lines("E1", keys_only=True)
        if (line.key or "").casefold() == "strength"
    )
    cost_line = next(
        line for line in doc.section_lines("E1", keys_only=True)
        if (line.key or "").casefold() == "cost"
    )
    bridge.rpc_set_line_disabled(strength_line.line_id, True)
    bridge.rpc_set_value(cost_line.line_id, "1")

    target = tmp_path / "GlobalCode.ini"
    bridge.rpc_save_fragment(str(target))
    text = target.read_text(encoding="utf-8")

    assert "Cost=1" in text
    assert ";@rulesmd-disabled Strength=125" in text


def test_fragment_export_does_not_rebind_full_document_path(tmp_path: Path):
    bridge, source = _bridge(tmp_path)
    doc = bridge.workspace._doc()
    cost_line = next(
        line for line in doc.section_lines("E1", keys_only=True)
        if (line.key or "").casefold() == "cost"
    )
    bridge.rpc_set_value(cost_line.line_id, "1")

    target = tmp_path / "GlobalCode.ini"
    bridge.rpc_save_fragment(str(target))

    assert bridge.workspace._doc().path == source
    assert bridge.workspace.info().dirty is True
