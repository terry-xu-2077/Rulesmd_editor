from __future__ import annotations

"""Presentation-only Chinese metadata for dynamic / dotted Ares keys.

The generated Ares schema remains authoritative for exact, documented keys.  This
module only fills keys that are structurally valid Ares extensions but absent from the
snapshot, especially mod-defined ``Versus.<Armor>`` and country-specific paradrops.
No key or value is rewritten.
"""

from dataclasses import replace
import re

from .schema import OptionMeta


FAMILY_LABELS: dict[str, str] = {
    "AI": "AI",
    "Abductor": "绑架",
    "Academy": "学院",
    "AttachEffect": "附加效果",
    "BallisticScatter": "弹道散布",
    "Battery": "电池/增幅",
    "Beam": "光束",
    "Bolt": "电弧",
    "Bounty": "赏金",
    "BuildTime": "建造时间",
    "CampaignScore": "战役结算",
    "CanPassiveAquire": "自动索敌",
    "CellSpread": "范围伤害",
    "Chronoshift": "超时空传送",
    "Chronosphere": "超时空仪",
    "Cloakable": "隐形",
    "Convert": "单位转换",
    "CrushDamage": "碾压伤害",
    "Cursor": "鼠标指针",
    "Deliver": "单位投送",
    "DieSound": "死亡音效",
    "DisableWeapons": "武器禁用",
    "Dominator": "心灵控制器",
    "Drain": "充能抽取",
    "DropPod": "空投舱",
    "EMP": "EMP",
    "EMPulse": "EMP 脉冲",
    "EVA": "EVA 语音",
    "Experience": "经验",
    "FallRate": "坠落速度",
    "File": "界面文件",
    "Firestorm": "火风暴",
    "Flash": "闪光",
    "ForceShield": "力场护盾",
    "Gattling": "盖特循环",
    "HealthBar": "生命条",
    "HunterSeeker": "猎杀者",
    "InitialPayload": "初始载荷",
    "Insignia": "军衔标记",
    "IronCurtain": "铁幕",
    "IvanBomb": "伊文炸弹",
    "KillDriver": "击杀驾驶员",
    "Light": "光照",
    "Lightning": "闪电风暴",
    "LightningRod": "避雷针",
    "LoadScreenText": "载入画面文字",
    "MenuText": "菜单文字",
    "Message": "提示消息",
    "MindControl": "心灵控制",
    "Missile": "自定义导弹",
    "Money": "资金",
    "MultiplayerScore": "多人结算",
    "Nuke": "核弹",
    "OmniCrusher": "全类型碾压",
    "ParaDrop": "伞兵空投",
    "Parachute": "降落伞",
    "Passengers": "乘客",
    "Prerequisite": "建造前提",
    "PrismForwarding": "光棱转发",
    "Promote": "晋升",
    "Protect": "防护超级武器",
    "Refinery": "矿厂",
    "RelativeDamage": "相对伤害",
    "Ripple": "水波纹",
    "SW": "超级武器",
    "SecretLab": "秘密实验室",
    "SelfHealing": "自我修复",
    "Sidebar": "侧边栏",
    "Smoke": "烟雾",
    "Sonar": "声呐",
    "SonarPulse": "声呐脉冲",
    "Spotlight": "探照灯",
    "SpyEffect": "间谍渗透效果",
    "SpyPlane": "侦察机",
    "Strafing": "扫射",
    "Survivor": "幸存乘员",
    "Temporal": "超时空武器",
    "Text": "超级武器文字",
    "UC": "驻军战斗",
    "UnitLost": "单位损失",
    "VehicleThief": "载具窃取",
    "Versus": "自定义护甲倍率",
    "Wave": "波束",
}

TOKEN_ZH: dict[str, str] = {
    "AI": "AI", "EVA": "EVA", "EMP": "EMP", "PAL": "调色板", "ROF": "射速",
    "Abort": "中止", "Acceleration": "加速度", "Activate": "激活", "Activated": "已激活",
    "Activation": "激活", "Active": "生效", "Affects": "影响", "Aggressive": "主动攻击",
    "Aircraft": "飞机", "Allow": "允许", "Allowed": "允许", "Altitude": "高度", "Ambient": "环境光",
    "Amount": "数额", "Amplitude": "振幅", "Anim": "动画", "Animation": "动画", "Armor": "护甲",
    "Attach": "附着", "Attack": "攻击", "Auto": "自动", "Aux": "辅助", "Background": "背景",
    "Bars": "条形图", "Base": "基地", "Below": "低于", "Blue": "蓝色", "Body": "本体",
    "Bolt": "电弧", "Bolts": "电弧", "Break": "解除", "Brief": "简报", "Building": "建筑",
    "Buildings": "建筑", "By": "按", "Can": "允许", "Cannons": "炮台", "Cap": "上限",
    "Capture": "控制", "Captures": "控制", "Chance": "概率", "Change": "改变", "Charge": "充能",
    "Charging": "充能中", "Cloakable": "可隐形", "Cloud": "云层", "Clouds": "云层", "Color": "颜色",
    "Control": "控制", "Count": "数量", "Create": "创建", "Crushable": "可被碾压", "Cumulative": "可叠加",
    "Custom": "启用自定义", "Cycle": "循环", "Damage": "伤害", "Dead": "死亡", "Debris": "碎片",
    "Deferment": "延迟生效", "Delay": "延迟", "Deploy": "部署", "Designators": "目标指示单位",
    "Destroys": "摧毁", "Detachable": "可拆除", "Detected": "被侦测", "Detonate": "引爆",
    "Disallowed": "禁止", "Discard": "移除", "Display": "显示", "Distance": "距离", "Duration": "持续时间",
    "Elite": "精英", "Enabled": "启用", "Enemy": "敌方", "Enter": "进入", "Fire": "发射",
    "Firepower": "火力", "Firer": "发射者", "First": "第一阶段", "Flag": "旗帜", "Forbidden": "禁止",
    "Force": "强制", "From": "来自", "Generate": "生成", "Green": "绿色", "Group": "分组",
    "Guard": "警戒", "Health": "生命值", "Height": "高度", "Hide": "隐藏", "Hit": "命中",
    "House": "阵营", "Houses": "国家", "Ignore": "忽略", "Image": "图像", "Infantry": "步兵",
    "Initial": "初始", "Inhibitors": "抑制建筑", "Is": "作为", "Kill": "击杀", "Land": "陆地",
    "Launch": "发射", "Lazy": "缓弯", "Length": "长度", "List": "列表", "Lists": "列表组数",
    "Load": "载入", "Local": "本地", "Lose": "失败", "Manual": "手动", "Max": "最大", "Maximum": "最大",
    "Min": "最小", "Minimum": "最小", "Mind": "心灵控制", "Mission": "任务", "Mix": "MIX",
    "Modifier": "倍率", "Move": "移动", "Multiple": "多工厂", "Name": "名称", "Neg": "禁止",
    "No": "禁止", "Num": "数量", "Nums": "数量", "Observer": "观察者", "One": "一次性",
    "Out": "范围外", "Over": "超过", "Override": "覆盖", "Owner": "所属方", "Palette": "调色板",
    "Parachute": "降落伞", "Passenger": "乘客", "Passengers": "乘客", "Pass": "穿透", "Pause": "停顿",
    "Payload": "载荷", "Penetrates": "穿透", "Percent": "百分比", "Permanent": "永久", "Pilot": "驾驶员",
    "Pitch": "俯仰", "Play": "播放", "Post": "后置", "Power": "电力", "Preparing": "准备中",
    "Print": "显示", "Promote": "晋升", "Psi": "心灵", "Pulse": "脉冲", "Radar": "雷达",
    "Radius": "半径", "Raise": "抬升", "Random": "随机", "Range": "范围", "Rate": "速率",
    "Ready": "就绪", "Reapply": "重新施加", "Reconsider": "重新判定", "Red": "红色", "Required": "需要",
    "Requires": "要求", "Reset": "重置", "Reveal": "揭示", "Reverse": "反向", "Ripple": "水波纹",
    "Rookie": "新兵", "Scatter": "散布", "Second": "第二阶段", "Separation": "间隔", "Seperation": "间隔",
    "Shots": "次数", "Show": "显示", "Side": "阵营", "Silo": "发射井", "Sound": "音效", "Sounds": "音效",
    "Sparkles": "火花动画", "Spawn": "生成单位", "Special": "特殊", "Speed": "速度", "Spy": "间谍",
    "Stages": "阶段数", "Start": "起始", "Status": "状态", "Stolen": "窃取", "Support": "支援",
    "Suppress": "抑制", "Tag": "标签", "Take": "起飞", "Target": "目标", "Temporal": "超时空",
    "Text": "文字", "Threshold": "阈值", "Ticking": "倒计时", "Tilt": "倾斜", "To": "对",
    "Trailer": "尾迹", "Transition": "过渡", "Turn": "转向", "Type": "类型", "Types": "类型",
    "Undo": "撤销", "Unit": "单位", "Unstoppable": "不可中止", "Use": "使用", "Value": "数值",
    "Vehicle": "载具", "Vehicles": "载具", "Veteran": "老兵", "Veterancy": "经验等级", "Wall": "墙",
    "Warhead": "弹头", "Water": "水面", "Win": "胜利", "Yuri": "尤里",
}

# Exact suffixes whose compact wording is clearer than token-by-token concatenation.
SUFFIX_LABELS: dict[str, str] = {
    "AITargeting": "AI 目标选择模式",
    "AITargeting.Constraints": "AI 目标选择约束",
    "AIRequiresHouse": "AI 要求的目标阵营",
    "AIRequiresTarget": "AI 要求的目标类型",
    "AffectsHouse": "影响的阵营",
    "AffectsTarget": "影响的目标类型",
    "AllowAI": "允许 AI 使用",
    "AllowPlayer": "允许玩家使用",
    "AnimationHeight": "动画高度",
    "ArmorMultiplier": "护甲倍率",
    "AttackOutOfRange": "超出射程攻击指针",
    "AutoFire": "自动发射",
    "BaseDefenseCounts": "基地防御数量",
    "BaseDefenses": "基地防御建筑",
    "BlowUnplaceable": "摧毁无法放置的单位",
    "BreakMindControl": "解除心灵控制",
    "CanDetonateTimeBomb": "允许引爆定时炸弹",
    "CaptureImmuneToPsionics": "可控制心灵免疫目标",
    "CaptureMindControlled": "可控制已被心控目标",
    "CapturePermaMindControlled": "可控制永久心控目标",
    "ChargeToDrainRatio": "充能/抽取比例",
    "CreateRadarEvent": "创建雷达事件",
    "DamageMultiplier": "伤害倍率",
    "DestroysBridges": "可摧毁桥梁",
    "DetonateOnSell": "出售时引爆",
    "DiscardOnEntry": "进入载具时移除效果",
    "ElitePassengerChance": "精英乘客幸存概率",
    "ElitePilotChance": "精英驾驶员幸存概率",
    "ElitePromoted": "晋升精英 EVA",
    "FireAtPercentage": "动画进度触发百分比",
    "FireIntoShroud": "允许向黑幕发射",
    "FirepowerMultiplier": "火力倍率",
    "ForceDecloak": "强制解除隐形",
    "FromAirstrike": "来自空袭的经验",
    "GenerateOnCapture": "占领时生成",
    "IgnoreLightningRod": "忽略避雷针",
    "InitialDelay": "首次延迟",
    "InitialReady": "首次立即就绪",
    "KillBelowPercent": "低于生命百分比时击杀驾驶员",
    "LazyCurve": "使用 V3 式缓弯弹道",
    "MaxAffect": "最大影响数量",
    "MaxChainLength": "最大支援链长度",
    "MindControlSelfModifier": "心控自身经验倍率",
    "MixFileIndex": "MIX 文件索引",
    "MultipleFactory": "多工厂建造时间倍率",
    "NoParachuteMax": "无降落伞最大坠落速度",
    "ObserverBackground": "观察者背景",
    "ObserverFlag": "观察者旗帜",
    "ParachuteMax": "降落伞最大坠落速度",
    "PassiveAcquire": "允许自动索敌",
    "PenetratesIronCurtain": "可穿透铁幕",
    "PermanentCapture": "永久控制",
    "PitchFinal": "最终俯仰角",
    "PitchInitial": "初始俯仰角",
    "PlayFadeSoundTime": "淡出音效提前时间",
    "PowerOutageDuration": "断电持续时间",
    "PromotePassengers": "乘客随载具晋升",
    "RadarOutageAffects": "雷达断电影响阵营",
    "RangeMaximum": "最大发射距离",
    "RangeMinimum": "最小发射距离",
    "RequiredTheaters": "允许的地图环境",
    "ResetSuperweapons": "重置超级武器",
    "RevealProduction": "揭示生产信息",
    "ROFMultiplier": "射速倍率",
    "RookiePassengerChance": "新兵乘客幸存概率",
    "RookiePilotChance": "新兵驾驶员幸存概率",
    "ShowCameo": "显示侧边栏图标",
    "ShowEnemy": "向敌人显示经验",
    "SpawnOwnerModifier": "生成单位拥有者经验倍率",
    "SpeedMultiplier": "速度倍率",
    "StolenMoneyAmount": "窃取资金数额",
    "StolenTechIndex": "被盗科技索引",
    "TemporalHidesAnim": "超时空作用时隐藏动画",
    "TrailerSeparation": "尾迹生成间隔",
    "UndoReverseEngineer": "撤销逆向工程",
    "UnitVeterancy": "提升单位经验等级",
    "UseAITargeting": "使用 AI 自动选点",
    "UseStorage": "使用矿石储存逻辑",
    "VeteranPassengerChance": "老兵乘客幸存概率",
    "VeteranPilotChance": "老兵驾驶员幸存概率",
    "VeteranPromoted": "晋升老兵 EVA",
    "YuriFileNames": "使用尤里复仇文件名规则",
}

FAMILY_DOCS: dict[str, str] = {
    "AttachEffect": "new/attacheffect.html",
    "Chronoshift": "new/chronoshift.html",
    "Missile": "new/custommissiles.html",
    "SW": "new/superweapons/general.html",
    "SonarPulse": "new/superweapons/types/sonarpulse.html",
    "Dominator": "new/superweapons/types/psychicdominator.html",
    "EMPulse": "new/superweapons/types/empulse.html",
    "HunterSeeker": "new/superweapons/types/hunterseeker.html",
}


def _camel_tokens(text: str) -> list[str]:
    clean = re.sub(r"[^A-Za-z0-9]+", " ", text).strip()
    if not clean:
        return []
    tokens: list[str] = []
    for part in clean.split():
        tokens.extend(re.findall(r"[A-Z]+(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|\d+", part))
    return tokens


def _translate_suffix(suffix: str) -> str | None:
    direct = SUFFIX_LABELS.get(suffix)
    if direct:
        return direct
    parts = suffix.split(".")
    translated_parts: list[str] = []
    for part in parts:
        tokens = _camel_tokens(part)
        if not tokens:
            return None
        translated: list[str] = []
        for token in tokens:
            label = TOKEN_ZH.get(token)
            if label is None:
                return None
            translated.append(label)
        translated_parts.append("".join(translated))
    return " · ".join(translated_parts)


def _generic_help(key: str, family_label: str, detail: str) -> str:
    return (
        f"Ares 的{family_label}相关参数。此条目未出现在当前内置精确元数据快照中，"
        f"中文名由参数族与 Key 结构生成：{detail}。实际取值范围、默认值和适用 Section "
        "请以对应 Ares 文档或 MOD 定义为准；编辑器不会改写原始 Key。"
    )


def synthesize_ares_option(key: str) -> OptionMeta | None:
    """Build conservative metadata for a dotted Ares key missing from exact schema."""
    if "." not in key:
        return None

    parts = key.split(".")
    family = parts[0]
    family_label = FAMILY_LABELS.get(family)
    if not family_label:
        return None

    # Ares custom armor keys are intrinsically dynamic: the middle part is a user/MOD
    # ArmorTypes id, not a fixed engine token and therefore must never be translated as
    # if it were an Ares keyword.
    if family.casefold() == "versus" and len(parts) >= 2:
        armor = parts[1]
        behavior = parts[2] if len(parts) >= 3 else ""
        if not behavior:
            return OptionMeta(
                name=key,
                description=f"对 {armor} 护甲伤害倍率",
                help_text=(
                    f"设置当前弹头对自定义护甲“{armor}”的伤害倍率。100% 为正常伤害，"
                    "0% 表示不造成常规伤害；自动索敌、反击和强制攻击可由对应的 "
                    "Versus.<Armor>.* 开关独立控制。"
                ),
                category="Ares · 自定义护甲",
                source="Ares",
                value_type="percent",
                applies_to=("Warhead",),
                default="100%",
                docs="new/additionalarmortypesandverses.html",
            )
        behavior_labels = {
            "passiveacquire": ("允许自动索敌", "决定使用该弹头的单位是否会主动将这种护甲的目标纳入自动索敌。"),
            "retaliate": ("允许反击", "决定这种护甲的目标遭到该弹头攻击后是否允许按 Verses 规则反击。"),
            "forcefire": ("允许强制攻击", "决定玩家是否可以对这种护甲的目标执行强制攻击。"),
        }
        row = behavior_labels.get(behavior.casefold())
        if row:
            return OptionMeta(
                name=key,
                description=f"对 {armor} 护甲{row[0]}",
                help_text=row[1],
                category="Ares · 自定义护甲",
                source="Ares",
                value_type="boolean",
                applies_to=("Warhead",),
                values=(("yes", "是"), ("no", "否")),
                docs="new/additionalarmortypesandverses.html",
            )

    # Country-specific paradrop overrides are also dynamic.  Keep the country id visible
    # because mods can invent arbitrary Country ids.
    if family.casefold() == "paradrop" and len(parts) == 3:
        country, field = parts[1], parts[2]
        field_rows = {
            "types": ("空降单位类型", "为该国家覆盖伞兵空投的单位类型列表。", "list-techno"),
            "num": ("空降单位数量", "与 Types 一一对应，指定各类型的空降数量。", "list-integer"),
            "aircraft": ("空投飞机", "为该国家覆盖执行伞兵空投的飞机类型。", "aircraft"),
        }
        row = field_rows.get(field.casefold())
        if row:
            return OptionMeta(
                name=key,
                description=f"{country} · {row[0]}",
                help_text=row[1],
                category="Ares · 伞兵空投",
                source="Ares",
                value_type=row[2],
                docs="new/sidescountries/defaultcountry.html",
            )

    suffix = ".".join(parts[1:])
    detail = _translate_suffix(suffix)
    if not detail:
        # Still provide a useful Chinese family name without pretending the unknown tail
        # has been semantically verified.
        detail = suffix
    description = f"{family_label} · {detail}"
    return OptionMeta(
        name=key,
        description=description,
        help_text=_generic_help(key, family_label, detail),
        category=f"Ares · {family_label}",
        source="Ares",
        docs=FAMILY_DOCS.get(family, ""),
    )


def audit_ares_meta(meta: OptionMeta) -> OptionMeta:
    """Apply source-verified corrections above manually translated schema rows.

    Exact generated JSON is useful, but not infallible.  Audited overrides intentionally
    sit above it so a known mistranslation can be corrected without regenerating the broad
    schema snapshot.
    """
    corrections: dict[str, dict[str, str]] = {
        "AttachEffect.ArmorMultiplier": {
            "description": "护甲倍率",
            "help_text": "AttachEffect 生效期间应用的护甲倍率。1.0 表示不修改护甲效果。",
        },
        "AttachEffect.ROFMultiplier": {
            "description": "攻击间隔倍率",
            "help_text": "AttachEffect 生效期间修改武器 ROF（攻击间隔）。数值越小通常射击越快；1.0 表示不变。",
        },
        "Chronoshift.Crushable": {
            "description": "可被超时空传送碾压",
            "help_text": "设为 no 后，单位不会被传送到其所在位置的单位碾死；反而会摧毁被传送进来的单位。建筑不适用。",
        },
    }
    patch = corrections.get(meta.name)
    return replace(meta, **patch) if patch else meta
