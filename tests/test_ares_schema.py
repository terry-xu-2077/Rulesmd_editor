from rulesmd_editor.ares_schema import AresSchemaCatalog
from rulesmd_editor.runtime_catalog import RuntimeSchemaCatalog
from rulesmd_editor.schema import SchemaCatalog


def test_base_schema_does_not_embed_ares_rules():
    base = SchemaCatalog()
    assert "AttachEffect.Duration" not in base.options
    assert all(meta.source != "Ares" for meta in base.options.values())


def test_ares_schema_is_loaded_from_dedicated_catalog():
    ares = AresSchemaCatalog()
    duration = ares.option("AttachEffect.Duration")
    assert duration is not None
    assert duration.source == "Ares"
    assert duration.applies_to == ("TechnoType", "Warhead")


def test_runtime_catalog_unifies_both_sources_without_duplicate_shared_keys():
    runtime = RuntimeSchemaCatalog()
    assert runtime.option("AttachEffect.Duration").source == "Ares"
    rows = runtime.available_options(query="AttachEffect.Duration", applies_to="InfantryType")
    assert any(row.name == "AttachEffect.Duration" for row in rows)

    # Armor is an original YR key that Ares extends; it should not appear twice in the
    # unified UI catalog merely because Ares has extension metadata for it.
    armor_rows = [row for row in runtime.available_options(query="Armor", applies_to="InfantryType") if row.name == "Armor"]
    assert len(armor_rows) <= 1
