from __future__ import annotations

"""Chinese presentation overlay for legacy Yuri's Revenge metadata.

The historical desktop/web INIs are the primary source. This module corrects known
misleading/blank legacy labels and fills untranslated engine/object identifiers for the
presentation layer only. Engine keys, Section ids and user files are never rewritten.

Reference priority:
1. Legacy RulesmdEditor / RulesmdEditorWeb Chinese resources.
2. Verified vanilla/YR object mappings from rulesmd.ini.
3. Conservative token-based fallback for readable identifiers.

The fallback is deliberately presentation-only: a guessed label may help recognition,
but the exact engine identifier remains visible beside it and remains the saved value.
"""

from dataclasses import replace
import re

from .schema import OptionMeta


PARAMETER_LABEL_FIXES: dict[str, str] = {
    "UIName": "游戏内名称",
    "Name": "内部注释",
    "Category": "对象分类",
    "IsSelectableCombatant": "可作为战斗单位选择",
    "Owner": "可拥有的国家",
    "UseOwnName": "使用自身名称",
    "ImmuneToPsionics": "免疫心灵控制",
    "ImmuneToPsionicWeapons": "免疫心灵武器",
    "ImmuneToVeins": "免疫矿脉伤害",
    "ImmuneToRadiation": "免疫辐射伤害",
    "RadarInvisible": "雷达隐形",
    "OmniCrushResistant": "抵抗全类型碾压",
    "CanPassiveAquire": "可自动索敌",
    "CanRetaliate": "可自动反击",
    "TypeImmune": "免疫同类型伤害",
    "ZFudgeColumn": "柱状物 Z 轴修正",
    "ZFudgeTunnel": "隧道 Z 轴修正",
    "ZFudgeBridge": "桥梁 Z 轴修正",
    "DeathWeaponDamageModifier": "死亡武器伤害倍率",
    "RefinerySmokeOffsetOne": "矿场冒烟偏移 1",
    "RefinerySmokeOffsetTwo": "矿场冒烟偏移 2",
    "RejoinTeamIfLimboed": "离开 Limbo 后重新加入小队",
    "Slaved": "奴隶从属状态",
    "HarvestRate": "采矿效率",
    "SinkingSound": "沉没音效",
    "NaturalSmokeLocation": "自然冒烟位置",
    "DamageSmokeOffset": "受损冒烟偏移",
    "NumberImpassableRows": "不可通行占位行数",
    "EligibileForAllyBuilding": "允许盟友利用建筑",
    "ThreatAvoidanceCoefficient": "威胁规避系数",
    "DeaccelerationFactor": "减速度系数",
    "AccelerationFactor": "加速度系数",
    "LeadershipRating": "领导力等级",
    "PhysicalSize": "物理尺寸",
    "SizeLimit": "最大装载体积",
    "MoveToShroud": "主动探索黑幕",
    "DefaultToGuardArea": "默认区域警戒",
    "HasStupidGuardMode": "禁用主动警戒",
    "ConsideredAircraft": "按飞行单位处理",
    "PixelSelectionBracketDelta": "选择框像素偏移",
    "ResourceDestination": "资源卸载目标",
    "ResourceGatherer": "资源采集单位",
    "BuildTimeMultiplier": "建造时间倍率",
    "FireAngle": "开火俯仰角",
    "SuppressionThreshold": "压制阈值",
    "ChargedAnimTime": "充能动画时间",
    "SpawnRegenRate": "子机再生时间",
    "SpawnReloadRate": "子机装填时间",
    "WeaponCount": "武器数量",
    "TurretCount": "炮塔数量",
    "NoSpawnAlt": "无子机时使用替代图像",
    "OrePurifier": "矿石精炼器",
    "RechargeTime": "充能时间",
    "ProneDamage": "匍匐承伤倍率",
    "PercentAtMax": "最大效果百分比",
    "CellRangefinding": "按格测距",
    "AmbientDamage": "持续环境伤害",
    "SubjectToElevation": "受高低地修正",
    "SubjectToCliffs": "受悬崖阻挡",
    "SubjectToWalls": "受围墙阻挡",
    "FirersPalette": "开火者调色板",
    "DeformThreshhold": "地形变形阈值",
    "MultiplayPassive": "多人游戏被动单位",
    "InitialVeteran": "初始老兵等级",
}


# Canonical/common object names. These are display aliases only. IDs remain untouched.
SECTION_NAME_FIXES: dict[str, str] = {
    # Countries.
    "Alliance": "韩国",
    "Americans": "美国",
    "British": "英国",
    "French": "法国",
    "Germans": "德国",
    "Russians": "苏联",
    "Confederation": "古巴",
    "Africans": "利比亚",
    "Arabs": "伊拉克",
    "YuriCountry": "尤里",

    # Infantry.
    "E1": "美国大兵",
    "E2": "动员兵",
    "ENGINEER": "工程师",
    "SNIPE": "狙击手",
    "FLAKT": "防空步兵",
    "SHK": "磁爆步兵",
    "IVAN": "疯狂伊文",
    "DESO": "辐射工兵",
    "TERROR": "恐怖分子",
    "SPY": "间谍",
    "CLEG": "超时空军团兵",
    "SEAL": "海豹部队",
    "TANY": "谭雅",
    "GGI": "重装大兵",
    "BORIS": "鲍里斯",
    "INIT": "尤里新兵",
    "SLAV": "奴隶",
    "BRUTE": "狂兽人",
    "VIRUS": "病毒狙击手",
    "YURI": "尤里复制人",
    "YURIPR": "尤里改",
    "YENGINEER": "尤里工程师",
    "DOG": "军犬",
    "ADOG": "盟军军犬",

    # Vehicles / aircraft / navy.
    "MTNK": "灰熊坦克",
    "HTNK": "犀牛坦克",
    "FV": "多功能步兵车",
    "SREF": "光棱坦克",
    "MGTK": "幻影坦克",
    "TNKD": "坦克杀手",
    "APOC": "天启坦克",
    "HTK": "防空履带车",
    "V3": "V3 火箭发射车",
    "DRON": "恐怖机器人",
    "HARV": "武装采矿车",
    "CMIN": "超时空采矿车",
    "LTNK": "狂风坦克",
    "YTNK": "盖特坦克",
    "TELE": "磁电坦克",
    "CAOS": "神经突击车",
    "MIND": "精神控制车",
    "DISK": "镭射幽浮",
    "BFRT": "战斗要塞",
    "ORCA": "入侵者战机",
    "BEAG": "黑鹰战机",
    "BEAGLE": "黑鹰战机",
    "ZEP": "基洛夫空艇",
    "CARRIER": "航空母舰",
    "AEGIS": "神盾巡洋舰",
    "DEST": "驱逐舰",
    "DRED": "无畏级战舰",
    "SUB": "台风级攻击潜艇",
    "DLPH": "海豚",
    "SQD": "巨型乌贼",
    "BSUB": "雷鸣攻击潜艇",
    "SCHP": "武装直升机",
    "HYD": "海蝎",
    "LCRF": "两栖运输艇",
    "AMCV": "盟军机动基地车",
    "SMCV": "苏联机动基地车",
    "PCV": "尤里机动基地车",
    "YHVR": "尤里采矿车",

    # Common weapons. These are technical Section names, not rewritten INI values.
    "DefaultDeathWeapon": "默认死亡武器",
    "OilExplosion": "油井爆炸",
    "BarrelExplosion": "油桶爆炸",
    "TerrorBomb": "恐怖分子炸弹",
    "Minigun": "机枪",
    "BAZOOKA": "火箭筒",
    "PsychicJab": "心灵冲击",
    "PsychicJabE": "精英心灵冲击",
    "UCPsychicJab": "驻军心灵冲击",
    "UCElitePsychicJab": "精英驻军心灵冲击",
    "AWP": "狙击步枪",
    "AWPE": "精英狙击步枪",
    "RedEye2": "防空导弹",
    "GrandCannonWeapon": "巨炮",
    "AKM": "AKM 步枪",
    "Flare": "信号弹",
    "Punch": "重拳",
    "Smash": "猛击",
    "Virusgun": "病毒狙击枪",
    "VirusGun": "病毒狙击枪",
    "MindControl": "心灵控制",
    "SuperMindControl": "超级心灵控制",
    "RadBeamWeapon": "辐射射线",
    "RadBeamWeaponE": "精英辐射射线",
    "RadEruptionWeapon": "辐射爆发",
    "SHOVEL": "铁锹",
}


TOKEN_ZH: dict[str, str] = {
    "Max": "最大", "Min": "最小", "Number": "数量", "Count": "数量", "Rate": "速率",
    "Speed": "速度", "Damage": "伤害", "Weapon": "武器", "Warhead": "弹头", "Projectile": "抛射体",
    "Sound": "音效", "Voice": "语音", "Build": "建造", "Time": "时间", "Multiplier": "倍率",
    "Factor": "系数", "Range": "范围", "Sight": "视野", "Size": "尺寸", "Level": "等级",
    "Power": "电力", "Ammo": "弹药", "Passengers": "乘客", "Delay": "延迟", "Duration": "持续时间",
    "Radius": "半径", "Type": "类型", "Image": "图像", "Anim": "动画", "Owner": "所属国家",
    "Required": "需要", "Forbidden": "禁止", "Secret": "秘密", "Elite": "精英", "Veteran": "老兵",
    "Primary": "主武器", "Secondary": "副武器", "Deploy": "部署", "Undeploy": "解除部署",
    "Spawn": "生成", "Reload": "装填", "Regen": "再生", "Turret": "炮塔", "Armor": "装甲",
    "Cost": "造价", "Strength": "生命值", "Crush": "碾压", "Immune": "免疫", "Radar": "雷达",
    "Invisible": "隐形", "Selectable": "可选择", "Capturable": "可占领", "Repairable": "可维修",
    "Storage": "储存量", "Fire": "开火", "Target": "目标", "Move": "移动", "Turn": "转向",
    "Height": "高度", "Width": "宽度", "Offset": "偏移", "Threshold": "阈值", "Bonus": "加成",
    "Modifier": "修正", "Aircraft": "飞机", "Infantry": "步兵", "Vehicle": "载具", "Building": "建筑",
}

# Used only when a technical Section id has no source-backed Chinese name.
REFERENCE_TOKEN_ZH: dict[str, str] = {
    **TOKEN_ZH,
    "Default": "默认", "Death": "死亡", "Oil": "油井", "Barrel": "油桶", "Explosion": "爆炸",
    "Terror": "恐怖分子", "Bomb": "炸弹", "Mini": "迷你", "Gun": "枪", "Cannon": "火炮",
    "Jump": "跳跃", "Psychic": "心灵", "Jab": "冲击", "UC": "驻军", "Virus": "病毒",
    "Mind": "心灵", "Control": "控制", "Super": "超级", "Rad": "辐射", "Beam": "射线",
    "Eruption": "爆发", "Punch": "重拳", "Smash": "猛击", "Flare": "信号弹", "Shovel": "铁锹",
}


def _has_cjk(text: str) -> bool:
    return bool(re.search(r"[\u3400-\u9fff]", text))


def _camel_tokens(key: str) -> list[str]:
    clean = re.sub(r"[^A-Za-z0-9]+", " ", key).strip()
    if not clean:
        return []
    tokens: list[str] = []
    for part in clean.split():
        tokens.extend(re.findall(r"[A-Z]+(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|\d+", part))
    return tokens


def _fallback_parameter_label(key: str) -> str | None:
    tokens = _camel_tokens(key)
    if not tokens:
        return None
    translated: list[str] = []
    for token in tokens:
        value = TOKEN_ZH.get(token)
        if value is None:
            return None
        translated.append(value)
    return "".join(translated)


def guess_section_name(section: str) -> str | None:
    """Return a conservative Chinese display guess for a readable technical id."""
    direct = SECTION_NAME_FIXES.get(section)
    if direct:
        return direct
    tokens = _camel_tokens(section)
    if not tokens:
        return None
    translated: list[str] = []
    for token in tokens:
        value = REFERENCE_TOKEN_ZH.get(token)
        if value is None:
            return None
        translated.append(value)
    result = "".join(translated).strip()
    return result if result and result.casefold() != section.casefold() else None


def normalize_parameter_label(key: str, label: str) -> str:
    fixed = PARAMETER_LABEL_FIXES.get(key)
    if fixed:
        return fixed
    cleaned = label.replace("$-", "").strip()
    if cleaned and cleaned.casefold() != key.casefold() and _has_cjk(cleaned):
        return cleaned
    return _fallback_parameter_label(key) or cleaned or key


def apply_yr_translations(options: dict[str, OptionMeta], names: dict[str, str]) -> None:
    for key, meta in list(options.items()):
        label = normalize_parameter_label(key, meta.description)
        if label != meta.description:
            options[key] = replace(meta, description=label)

    for key, value in SECTION_NAME_FIXES.items():
        names[key] = value

    for key, value in list(names.items()):
        cleaned = value.strip()
        if cleaned:
            names[key] = cleaned
