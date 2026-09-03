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


def test_references_are_comma_aware():
    doc = IniDocument.from_text("[A]\nPrimary=GunA\n[B]\nList=GunA,GunB\n")
    assert doc.references_to("GunA") == [("A", "Primary"), ("B", "List")]
