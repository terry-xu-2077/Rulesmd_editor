from __future__ import annotations

"""Legacy Qt global-rules information architecture.

The old desktop editor exposed [General] plus a set of dedicated global sections through
one “全局设置” selector.  The React editor keeps the same conceptual workspace, so these
names are data rather than ad-hoc frontend labels.
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

_GENERAL_FILTERS = GLOBAL_RULE_VIEWS[1:6]


def is_global_rule_section(section: str) -> bool:
    return section.strip().casefold() in GLOBAL_RULE_ALL_SECTIONS


def is_global_rule_subsection(section: str) -> bool:
    return section.strip().casefold() in GLOBAL_RULE_SUBSECTIONS


def global_rule_category(section: str, key: str) -> str:
    """Return the exact old-Qt category for a global-rule line.

    Dedicated global sections map one-to-one to their Qt selector item. [General] used
    substring filters; unmatched keys remain under “全部” rather than being reclassified
    by the generic unit semantic categories.
    """
    folded_section = section.strip().casefold()
    if folded_section != "general":
        return GLOBAL_RULE_SECTION_LABELS.get(folded_section, "全部")

    folded_key = key.strip().casefold()
    for label, _, tokens in _GENERAL_FILTERS:
        if any(token.casefold() in folded_key for token in tokens):
            return label
    return "全部"


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
