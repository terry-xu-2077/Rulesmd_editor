from __future__ import annotations

import struct

from rulesmd_editor.csf_file import CsfDocument, CsfLabel, CsfString


def test_csf_round_trip_chinese_and_extra_value():
    document = CsfDocument.new(language=9)
    document.set("Name:MYTANK", "我的测试坦克")
    document.set("GUI:Example", "示例文本", extra="metadata")

    data = document.to_bytes()
    assert data[:4] == b" FSC"
    version, labels, strings, unused, language = struct.unpack_from("<IIIII", data, 4)
    assert (version, labels, strings, unused, language) == (3, 2, 2, 0, 9)

    loaded = CsfDocument.from_bytes(data)
    assert loaded.get("name:mytank") == "我的测试坦克"
    assert loaded.get("GUI:EXAMPLE") == "示例文本"
    assert loaded.labels[1].strings[0].extra == "metadata"


def test_csf_duplicate_labels_resolve_and_update_last_definition():
    document = CsfDocument(
        labels=[
            CsfLabel("Name:DUP", [CsfString("旧值")]),
            CsfLabel("name:dup", [CsfString("后值")]),
        ]
    )

    assert document.get("NAME:DUP") == "后值"
    document.set("Name:DUP", "新值")

    assert document.labels[0].strings[0].value == "旧值"
    assert document.labels[1].strings[0].value == "新值"
    assert CsfDocument.from_bytes(document.to_bytes()).get("Name:DUP") == "新值"


def test_csf_file_save_and_load(tmp_path):
    path = tmp_path / "stringtable99.csf"
    document = CsfDocument.new()
    document.set("Name:TEST", "中文名称")
    document.save(path)

    assert CsfDocument.load(path).get("name:test") == "中文名称"
