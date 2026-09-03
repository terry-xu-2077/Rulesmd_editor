from __future__ import annotations

"""Functional categories for original Yuri's Revenge rules keys.

The old desktop metadata only classified a small hand-picked subset and left most
options in a catch-all ``特殊`` group.  The current editor needs task-oriented groups
that help users discover parameters without already knowing the engine key.

Ares has its own independent categories in ``ares_schema.json``; this module is YR-only.
"""


EXACT: dict[str, str] = {
    # Identity / basic metadata
    "UIName": "基础",
    "Name": "基础",
    "Category": "基础",
    "BuildCat": "基础",
    "TechLevel": "阵营与科技",
    "Owner": "阵营与科技",
    "RequiredHouses": "阵营与科技",
    "ForbiddenHouses": "阵营与科技",
    "SecretHouses": "阵营与科技",
    "Prerequisite": "阵营与科技",
    "PrerequisiteOverride": "阵营与科技",
    "Cost": "经济与建造",
    "Soylent": "经济与建造",
    "BuildLimit": "经济与建造",
    "Power": "经济与建造",
    "Strength": "生存与防御",
    "Armor": "生存与防御",
    "Points": "经济与建造",
    "Size": "部署与运输",
    "SizeLimit": "部署与运输",
    "Passengers": "部署与运输",
    "PipScale": "视觉",
    "Pip": "视觉",
    "Image": "视觉",
    "Primary": "武器与伤害",
    "Secondary": "武器与伤害",
    "ElitePrimary": "武器与伤害",
    "EliteSecondary": "武器与伤害",
    "DeathWeapon": "武器与伤害",
    "DeathWeaponDamageModifier": "武器与伤害",
    "Speed": "运动",
    "ROT": "运动",
    "Locomotor": "运动",
    "MovementZone": "运动",
    "SpeedType": "运动",
    "MovementRestrictedTo": "运动",
    "Sight": "火控与AI",
    "ThreatPosed": "火控与AI",
    "SpecialThreatValue": "火控与AI",
    "AIBasePlanningSide": "火控与AI",
    "ProtectWithWall": "火控与AI",
    "CanPassiveAquire": "火控与AI",
    "CanRetaliate": "火控与AI",
    "OpportunityFire": "火控与AI",
    "DeploysInto": "部署与运输",
    "UndeploysInto": "部署与运输",
    "Enslaves": "部署与运输",
    "Spawns": "部署与运输",
    "Dock": "部署与运输",
    "Factory": "生产与工厂",
    "FactoryPlant": "生产与工厂",
    "Cloning": "生产与工厂",
    "FreeUnit": "生产与工厂",
    "HarvestRate": "资源与采集",
    "Storage": "资源与采集",
    "ResourceGatherer": "资源与采集",
    "Harvester": "资源与采集",
    "VeteranAbilities": "经验与升级",
    "EliteAbilities": "经验与升级",
    "Trainable": "经验与升级",
    "Cloakable": "隐形与侦测",
    "CloakingSpeed": "隐形与侦测",
    "RadarInvisible": "隐形与侦测",
    "Sensors": "隐形与侦测",
    "SensorSight": "隐形与侦测",
}

TOKEN_RULES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("weapon", "warhead", "projectile", "damage", "burst", "rof", "range", "fire", "combat", "crush", "verses"), "武器与伤害"),
    (("threat", "target", "guard", "ai", "autofire", "retali", "passiveaquire", "opportunity"), "火控与AI"),
    (("armor", "strength", "immune", "resist", "healing", "selfheal", "selfhealing", "repair", "invulner", "chronoshift"), "生存与防御"),
    (("owner", "house", "prerequisite", "techlevel", "side", "required", "forbidden", "secretlab", "stolen"), "阵营与科技"),
    (("cost", "soylent", "power", "buildtime", "buildlimit", "refund", "money", "income", "cash"), "经济与建造"),
    (("factory", "clone", "produ", "construction", "buildcat", "freeunit"), "生产与工厂"),
    (("harvest", "ore", "tiber", "storage", "slave", "resource", "refinery"), "资源与采集"),
    (("speed", "locomotor", "movement", "rot", "accel", "decel", "turn", "walk", "teleport", "jumpjet", "balloon", "flight", "naval"), "运动"),
    (("passenger", "size", "dock", "deploy", "undeploy", "spawn", "carry", "open", "absorb", "enter", "exit", "transport"), "部署与运输"),
    (("cloak", "radar", "sensor", "disguise", "invisible", "stealth", "detect"), "隐形与侦测"),
    (("veteran", "elite", "trainable", "experience", "promot", "leadership"), "经验与升级"),
    (("image", "anim", "palette", "pip", "voxel", "turret", "shadow", "debris", "smoke", "particle", "flh", "remap", "draw", "zadjust", "zfudge", "cameo"), "视觉"),
    (("sound", "voice", "eva", "report", "ambient", "talk", "speak"), "声音"),
    (("name", "uiname", "category"), "基础"),
    (("ivan", "psionic", "temporal", "berserk", "magnet", "parasite", "bomb", "forcefield", "nuke", "chrono", "iron", "radiation"), "特殊能力"),
)

LEGACY_MAP = {
    "通用": "基础",
    "阵营": "阵营与科技",
    "武器": "武器与伤害",
    "运动": "运动",
    "视觉": "视觉",
    "声音": "声音",
}


def categorize_yr_option(key: str, legacy_category: str = "") -> str:
    """Return a stable, user-facing functional category for an original YR key."""
    if key in EXACT:
        return EXACT[key]
    folded = key.casefold()
    for tokens, category in TOKEN_RULES:
        if any(token in folded for token in tokens):
            return category
    mapped = LEGACY_MAP.get(legacy_category)
    if mapped:
        return mapped
    # Avoid the old misleading catch-all name. Unknown original keys remain discoverable
    # under a neutral bucket until a more specific rule is curated.
    return "其他"
