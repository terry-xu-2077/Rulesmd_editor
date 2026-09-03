import pytest

from rulesmd_editor.ini_document import IniDocument


def test_roundtrip_preserves_comments_order_duplicate_keys_and_unknown_ares_tags():
    source = (
        "; header\r\n"
        "[Unit]\r\n"
        "Name=Demo ; keep this\r\n"
        "AttachEffect.Duration=90\r\n"
        "Custom.Unknown.Tag=yes\r\n"
        "Weapon1=A\r\n"
        "Weapon1=B ; duplicate is legal data we must preserve\r\n"
    )
    doc = IniDocument.from_text(source)
    assert doc.to_text() == source
    doc.set("Unit", "AttachEffect.Duration", "120")
    out = doc.to_text()
    assert "AttachEffect.Duration=120\r\n" in out
    assert "Custom.Unknown.Tag=yes\r\n" in out
    assert out.count("Weapon1=") == 2
    assert "; keep this" in out


def test_set_only_changes_last_duplicate_key():
    doc = IniDocument.from_text("[A]\nX=1\nX=2 ; note\n")
    doc.set("A", "X", "3")
    assert doc.to_text() == "[A]\nX=1\nX=3 ; note\n"


def test_duplicate_occurrences_have_stable_ids_and_can_be_edited_individually():
    doc = IniDocument.from_text("[A]\nX=1\nX=2 ; note\n")
    items = doc.items_with_ids("a")
    assert len(items) == 2
    first_id, _, _ = items[0]
    second_id, _, _ = items[1]
    assert first_id != second_id

    doc.set_line_value(first_id, "9")
    assert doc.to_text() == "[A]\nX=9\nX=2 ; note\n"
    assert doc.line(second_id).value == "2"


def test_remove_single_duplicate_occurrence():
    doc = IniDocument.from_text("[A]\nX=1\nX=2\nX=3\n")
    doc.remove_option("a", "x", occurrence="first")
    assert doc.to_text() == "[A]\nX=2\nX=3\n"
    doc.remove_option("A", "X", occurrence="last")
    assert doc.to_text() == "[A]\nX=2\n"


def test_section_lookup_is_case_insensitive_but_preserves_spelling():
    doc = IniDocument.from_text("[MySection]\nValue=1\n")
    assert doc.has_section("mysection")
    assert doc.get("MYSECTION", "value") == "1"
    doc.set("mysection", "Other", "2")
    assert "[MySection]\n" in doc.to_text()
    assert "Other=2\n" in doc.to_text()


def test_save_does_not_silently_replace_unencodable_characters(tmp_path):
    doc = IniDocument.from_text("[A]\nName=Demo\n", encoding="cp1252")
    doc.set("A", "Name", "中文")
    with pytest.raises(UnicodeEncodeError):
        doc.save(tmp_path / "rulesmd.ini")


def test_references_are_comma_aware():
    doc = IniDocument.from_text("[A]\nPrimary=GunA\n[B]\nList=GunA,GunB\n")
    assert doc.references_to("GunA") == [("A", "Primary"), ("B", "List")]
