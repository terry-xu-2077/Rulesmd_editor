from __future__ import annotations

"""Chinese presentation overlay for legacy Yuri's Revenge metadata.

The historical desktop/web INIs are the primary source.  This module only corrects
known misleading/blank legacy labels and fills obvious untranslated engine keys.  It is
a presentation overlay: engine keys and user files are never rewritten.

Reference sources:
- RulesmdEditor/Resources/OptionsDesc.ini + HelpInfor.ini + NamesDesc.ini
- RulesmdEditorWeb/desc/OptionsDesc.ini + HelpInfor.ini + NamesDesc.ini
"""

from dataclasses import replace
import re

from .schema import OptionMeta


# Short user-facing parameter names.  Most legacy labels are already useful Chinese;
# only entries known to be blank, misleading, or awkward are overridden here.
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


# A small correction layer for common object names where the old resource set used
# inconsistent transliterations or alternate IDs. Existing translated names not listed
# here remain untouched.
SECTION_NAME_FIXES: dict[str, str] = {
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
    "BEAG": "黑鹰战机",
    "BEAGLE": "黑鹰战机",
    "BORIS": "鲍里斯",
    "BRUTE": "狂兽人",
    "INIT": "尤里新兵",
    "SLAV": "奴隶",
    "VIRUS": "病毒狙击手",
    "YURIPR": "尤里改",
    "BFRT": "战斗要塞",
    "DISK": "镭射幽浮",
    "MIND": "精神控制车",
    "YTNK": "盖特坦克",
    "YHVR": "尤里采矿车",
    "PCV": "苏联机动基地车",
    "SMCV": "尤里机动基地车",
    "AMCV": "盟军机动基地车",
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

    # Normalize obvious untranslated object-name rows without inventing gameplay names.
    # Unknown IDs stay as IDs until a source-backed translation is added.
    for key, value in list(names.items()):
        cleaned = value.strip()
        if cleaned:
            names[key] = cleaned
