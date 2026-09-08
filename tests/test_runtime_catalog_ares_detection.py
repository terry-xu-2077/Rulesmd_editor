from rulesmd_editor.runtime_catalog import RuntimeSchemaCatalog


def test_unknown_dotted_key_is_classified_as_ares():
    catalog = RuntimeSchemaCatalog()
    meta = catalog.option("Uncatalogued.Feature")
    assert meta.source == "Ares"


def test_plain_unknown_key_remains_custom():
    catalog = RuntimeSchemaCatalog()
    meta = catalog.option("UncataloguedFeature")
    assert meta.source == "自定义"
