from __future__ import annotations

"""Global-rules presentation model.

The editor treats [General] plus the dedicated global sections used by the old Qt editor
as one conceptual workspace.  For [General] itself, the official rulesmd.ini comment
blocks are the primary source of grouping because they reflect the engine authors'
intent more accurately than broad generic option categories.

Some TS/Tiberian-era carry-over keys still exist in the stock file.  They are hidden from
the friendly table/catalog only; the raw INI remains untouched and lossless.
"""


GLOBAL_RULE_VIEWS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("全部", "General", ()),
    ("伞兵设置", "General", ("Para", "Pilot", "PParatrooper")),
    ("秘密科技", "General", ("Secret",)),
    ("定义单位", "General", ("Shipyard", "RepairBay", "BaseUnit", "HarvesterUnit", "PadAircraft", "Prerequisite")),
    ("老兵设置", "General", ("Veteran",)),
    ("随机超武", "General", ("Meteorites", "IonStorms")),
    ("多人游戏对话框设置", "MultiplayerDialogSettings", ()),
    ("难度设置-简单", "Easy", ()),
    ("难度设置-普通", "Normal", ()),
    ("难度设置-冷酷", "Difficult", ()),
    ("奖励箱规则", "CrateRules", ()),
    ("电脑AI设置", "AI", ()),
    ("电脑IQ设置", "IQ", ()),
    ("Jumpjet飞行规则", "JumpjetControls", ()),
    ("超级武器规则", "SpecialWeapons", ()),
    ("音频视频规则", "AudioVisual", ()),
    ("战斗与伤害规则", "CombatDamage", ()),
    ("辐射设置", "Radiation", ()),
    ("颜色主题", "Colors", ()),
)

GLOBAL_RULE_SECTION_LABELS = {
    section.casefold(): label
    for label, section, _ in GLOBAL_RULE_VIEWS
    if section.casefold() != "general"
}
GLOBAL_RULE_SUBSECTIONS = frozenset(GLOBAL_RULE_SECTION_LABELS)
GLOBAL_RULE_ALL_SECTIONS = frozenset({"general", *GLOBAL_RULE_SUBSECTIONS})


# [General] categories derived from the official rulesmd.ini comment blocks.  The more
# specific blocks intentionally precede broad groups such as AI or movement.
_OFFICIAL_GENERAL_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("老兵设置", ("veteran", "initialveteran")),
    ("修理与补给", (
        "refundpercent", "reloadrate", "repairpercent", "repairrate", "repairstep",
        "urepairrate", "irepairrate", "irepairstep", "selfheal",
    )),
    ("经济与生产", (
        "buildspeed", "builduptime", "separateaircraft", "alliedsurvivordivisor",
        "sovietsurvivordivisor", "thirdsurvivordivisor", "placementdelay",
        "multiplefactory", "minlowpowerproductionspeed", "maxlowpowerproductionspeed",
        "lowpowerpenaltymodifier", "campaignmoneydelta", "aialternateproductioncreditcutoff",
    )),
    ("天气控制", ("lightning",)),
    ("力场护盾", ("forceshield",)),
    ("光棱塔规则", ("prism",)),
    ("V3火箭规则", ("v3rocket",)),
    ("无畏级导弹规则", ("dmisl",)),
    ("巡航导弹规则", ("cmisl",)),
    ("伞兵设置", (
        "paradropradius", "pilot", "pparatrooper", "amerparadrop", "allyparadrop",
        "sovparadrop", "yuriparadrop",
    )),
    ("秘密科技", ("secretinfantry", "secretunits", "secretbuildings")),
    ("间谍与伪装", (
        "allieddisguise", "sovietdisguise", "thirddisguise", "spypowerblackout",
        "spymoneystealpercent", "attackcursorondisguise", "defaultmiragedisguises",
        "infantryblinkdisguisetime", "disableddisguisedetectionpercent",
    )),
    ("超时空传送", (
        "chronodelay", "chronoreinfdelay", "chronodistancefactor", "chronotrigger",
        "chronominimumdelay", "chronorangeminimum",
    )),
    ("定义单位", (
        "shipyard", "repairbay", "baseunit", "harvesterunit", "padaircraft",
        "nodregularpower", "nodadvancedpower", "gdipowerplant", "thirdpowerplant",
        "alligedgateone", "alligedgatetwo", "gdigateone", "gdigatetwo", "nodgateone",
        "nodgatetwo", "walltower",
    )),
    ("资源与采集", (
        "slaveminer", "harvestersperrefinery", "aiextrarefineries", "aislaveminernumber",
        "purifierbonus", "growthrate",
    )),
    ("运动与载具", (
        "curleyshuffle", "closeenough", "gamespeedbias", "stray", "relaxedstray",
        "cloakdelay", "flightlevel", "parachutemaxfallrate", "noparachutemaxfallrate",
        "guardmodestray", "missilespeedvar", "missilerotvar", "missilesafetyaltitude",
        "hover", "balloonhover", "tunnelspeed", "trackeduphill", "trackeddownhill",
        "wheeleduphill", "wheeleddownhill", "leptonspersightincrease",
        "leptonsperfireincrease", "attackingaircraftsightrange",
    )),
    ("电脑AI设置", (
        "teamdelays", "aihatedelays", "aibuildswalls", "nodaibuildswalls", "multiplayaicm",
        "aivirtualpurifiers", "healscanradius", "fillearliestteamprobability",
        "minimumaidefensiveteams", "maximumaidefensiveteams", "totalaiteamcap",
        "usemindefenserule", "dissolveunfilledteamdelay", "aiioncannon", "aisafedistance",
        "aiminorsuperreadypercent", "harvestertoofardistance", "chronoharvtoofardistance",
        "alliedbasedefensecounts", "sovietbasedefensecounts", "thirdbasedefensecounts",
        "aipickwalldefensepercent", "airestrictreplacetime", "threatperoccupant",
        "approachtargetresetmultiplier", "guardareatargetingdelay", "normaltargetingdelay",
        "ainavalyardadjacency", "aiautodeployframedelay", "maximumbuildingplacementfailures",
        "aisuperdefense", "aicapture", "basebias", "basedefensedelay", "suspenddelay",
        "suspendpriority",
    )),
    ("战斗与伤害规则", (
        "mutateexplosion", "crewes cape", "crewescape", "damage", "warhead",
    )),
    ("环境与地图", (
        "fogofwar", "camerarange", "treestrength", "winddirection", "blendedfog",
        "cliffbackimpassability", "icecrackingweight", "icebreakingweight",
        "shipsinkingweight", "cloakingstages", "treeflammability", "bridgevoxelmax",
    )),
)

# Clearly obsolete/legacy carry-overs in the stock YR [General] section.  These are not
# deleted and are still visible in Raw view.  This list is intentionally conservative:
# old GDI/Nod-named aliases are NOT hidden merely because their names are inherited.
_HIDDEN_GENERAL_EXACT = frozenset({
    "survivorrate",          # official comment: "This is no longer used"
    "weedcapacity",          # TS weed / chemical missile carry-over
    "largevisceroid",
    "smallvisceroid",
    "visceroids",
    "meteorites",
    "ionstorms",
    "craterlevel",           # meteorite cratering carry-over
    "droppodweapon",
    "droppodheight",
    "droppodspeed",
    "droppodangle",
})

# All Tiberium-named General settings are legacy-facing in Yuri's Revenge.  Hiding them
# matches the editor's RA2/YR vocabulary while preserving them verbatim in the file.
_HIDDEN_GENERAL_PREFIXES = ("tiberium",)


# Stable UI order: official [General] blocks first, then the dedicated global sections
# retained from the Qt editor.  Duplicates are removed while preserving first occurrence.
_GENERAL_OFFICIAL_ORDER = (
    "老兵设置",
    "修理与补给",
    "经济与生产",
    "电脑AI设置",
    "运动与载具",
    "天气控制",
    "力场护盾",
    "光棱塔规则",
    "V3火箭规则",
    "无畏级导弹规则",
    "巡航导弹规则",
    "伞兵设置",
    "秘密科技",
    "间谍与伪装",
    "超时空传送",
    "定义单位",
    "资源与采集",
    "战斗与伤害规则",
    "环境与地图",
    "常规全局设置",
)


def _dedupe(values: tuple[str, ...]) -> tuple[str, ...]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return tuple(result)


GLOBAL_RULE_CATEGORY_ORDER = _dedupe(
    _GENERAL_OFFICIAL_ORDER + tuple(label for label, _, _ in GLOBAL_RULE_VIEWS[6:])
)


def is_global_rule_section(section: str) -> bool:
    return section.strip().casefold() in GLOBAL_RULE_ALL_SECTIONS


def is_global_rule_subsection(section: str) -> bool:
    return section.strip().casefold() in GLOBAL_RULE_SUBSECTIONS


def is_hidden_legacy_global_option(section: str, key: str) -> bool:
    """Return True when a stock legacy General key should be hidden from friendly UI."""
    if section.strip().casefold() != "general":
        return False
    folded = key.strip().casefold()
    return folded in _HIDDEN_GENERAL_EXACT or folded.startswith(_HIDDEN_GENERAL_PREFIXES)


def global_rule_category(section: str, key: str) -> str:
    """Return the user-facing global category, preferring official rulesmd structure."""
    folded_section = section.strip().casefold()
    if folded_section != "general":
        return GLOBAL_RULE_SECTION_LABELS.get(folded_section, "常规全局设置")

    folded_key = key.strip().casefold()
    for label, tokens in _OFFICIAL_GENERAL_RULES:
        if any(token in folded_key for token in tokens):
            return label
    return "常规全局设置"


def global_rule_sections_in_order() -> tuple[str, ...]:
    seen: set[str] = set()
    result: list[str] = []
    for _, section, _ in GLOBAL_RULE_VIEWS:
        folded = section.casefold()
        if folded in seen:
            continue
        seen.add(folded)
        result.append(section)
    return tuple(result)
