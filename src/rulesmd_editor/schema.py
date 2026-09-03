from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import configparser
import json


@dataclass(frozen=True)
class OptionMeta:
    name: str
    description: str = ""
    help_text: str = ""
    category: str = "特殊"
    source: str = "YR"
    values: tuple[tuple[str, str], ...] = ()
    value_type: str = "text"
    applies_to: tuple[str, ...] = ()
    default: str = ""
    docs: str = ""


BOOL_VALUES = (("yes", "是"), ("no", "否"))


def ares(
    name: str,
    label: str,
    help_text: str,
    category: str,
    value_type: str,
    applies_to: tuple[str, ...],
    default: str = "",
    values: tuple[tuple[str, str], ...] = (),
    docs: str = "",
) -> OptionMeta:
    return OptionMeta(
        name=name,
        description=label,
        help_text=help_text,
        category=category,
        source="Ares",
        values=values,
        value_type=value_type,
        applies_to=applies_to,
        default=default,
        docs=docs,
    )


ARES_OPTIONS: dict[str, OptionMeta] = {
    # AttachEffect
    "AttachEffect.Animation": ares(
        "AttachEffect.Animation", "附加效果动画",
        "效果存在期间附着在目标上的动画；目标隐形时动画会隐藏，但效果本身仍然存在。",
        "Ares · AttachEffect", "animation", ("TechnoType", "Warhead"), "none",
        docs="new/attacheffect.html",
    ),
    "AttachEffect.Duration": ares(
        "AttachEffect.Duration", "附加效果持续时间",
        "效果持续帧数。-1 表示无限持续，0 表示不持续。",
        "Ares · AttachEffect", "integer", ("TechnoType", "Warhead"), "0",
        docs="new/attacheffect.html",
    ),
    "AttachEffect.TemporalHidesAnim": ares(
        "AttachEffect.TemporalHidesAnim", "超时空时隐藏动画",
        "目标被 Temporal 武器传送/扭曲时，是否暂时隐藏 AttachEffect 动画。",
        "Ares · AttachEffect", "boolean", ("TechnoType", "Warhead"), "no", BOOL_VALUES,
        docs="new/attacheffect.html",
    ),
    "AttachEffect.SpeedMultiplier": ares(
        "AttachEffect.SpeedMultiplier", "移动速度倍率",
        "AttachEffect 生效期间的移动速度倍率，1.0 表示不改变。",
        "Ares · AttachEffect", "float", ("TechnoType", "Warhead"), "1.0",
        docs="new/attacheffect.html",
    ),
    "AttachEffect.ArmorMultiplier": ares(
        "AttachEffect.ArmorMultiplier", "防御倍率",
        "AttachEffect 生效期间的承伤倍率修正，1.0 表示不改变。",
        "Ares · AttachEffect", "float", ("TechnoType", "Warhead"), "1.0",
        docs="new/attacheffect.html",
    ),
    "AttachEffect.FirepowerMultiplier": ares(
        "AttachEffect.FirepowerMultiplier", "火力倍率",
        "AttachEffect 生效期间的火力倍率，1.0 表示不改变。",
        "Ares · AttachEffect", "float", ("TechnoType", "Warhead"), "1.0",
        docs="new/attacheffect.html",
    ),
    "AttachEffect.ROFMultiplier": ares(
        "AttachEffect.ROFMultiplier", "射速倍率",
        "AttachEffect 生效期间的装填时间倍率。倍率会在一次装填开始时计算。",
        "Ares · AttachEffect", "float", ("TechnoType", "Warhead"), "1.0",
        docs="new/attacheffect.html",
    ),
    "AttachEffect.Cloakable": ares(
        "AttachEffect.Cloakable", "效果期间可隐形",
        "启用后，目标在 AttachEffect 持续期间获得隐形能力。",
        "Ares · AttachEffect", "boolean", ("TechnoType", "Warhead"), "no", BOOL_VALUES,
        docs="new/attacheffect.html",
    ),
    "AttachEffect.ForceDecloak": ares(
        "AttachEffect.ForceDecloak", "施加时强制显形",
        "AttachEffect 被施加时强制目标解除隐形。",
        "Ares · AttachEffect", "boolean", ("TechnoType", "Warhead"), "no", BOOL_VALUES,
        docs="new/attacheffect.html",
    ),
    "AttachEffect.DiscardOnEntry": ares(
        "AttachEffect.DiscardOnEntry", "进入载具/建筑时移除",
        "目标进入建筑或其他载具并从地图上移除时，是否清除该效果。",
        "Ares · AttachEffect", "boolean", ("TechnoType", "Warhead"), "no", BOOL_VALUES,
        docs="new/attacheffect.html",
    ),
    "AttachEffect.PenetratesIronCurtain": ares(
        "AttachEffect.PenetratesIronCurtain", "可穿透铁幕",
        "是否允许效果施加到铁幕或力场护盾保护中的单位/建筑。",
        "Ares · AttachEffect", "boolean", ("TechnoType", "Warhead"), "no", BOOL_VALUES,
        docs="new/attacheffect.html",
    ),
    "AttachEffect.Delay": ares(
        "AttachEffect.Delay", "效果重建延迟",
        "仅 TechnoType：上一次效果结束后等待多少帧再次在自身创建效果。负数表示不再重建。",
        "Ares · AttachEffect", "integer", ("TechnoType",), "0",
        docs="new/attacheffect.html",
    ),
    "AttachEffect.InitialDelay": ares(
        "AttachEffect.InitialDelay", "首次效果延迟",
        "仅 TechnoType：对象首次创建后等待多少帧再生成 AttachEffect。",
        "Ares · AttachEffect", "integer", ("TechnoType",), "0",
        docs="new/attacheffect.html",
    ),
    "AttachEffect.Cumulative": ares(
        "AttachEffect.Cumulative", "效果可叠加",
        "仅 Warhead：允许同一种 AttachEffect 在同一目标上叠加多个实例。",
        "Ares · AttachEffect", "boolean", ("Warhead",), "no", BOOL_VALUES,
        docs="new/attacheffect.html",
    ),
    "AttachEffect.AnimResetOnReapply": ares(
        "AttachEffect.AnimResetOnReapply", "重复施加时重置动画",
        "仅 Warhead：不可叠加的效果再次施加时，是否从头播放附加动画。",
        "Ares · AttachEffect", "boolean", ("Warhead",), "no", BOOL_VALUES,
        docs="new/attacheffect.html",
    ),

    # EMP
    "EMP.Duration": ares(
        "EMP.Duration", "EMP 持续时间",
        "仅 Warhead：EMP 对目标增加或减少的停机帧数。正数造成 EMP，负数可用于解除 EMP。",
        "Ares · EMP", "integer", ("Warhead",), "0", docs="restored/emp.html",
    ),
    "EMP.Cap": ares(
        "EMP.Cap", "EMP 累积上限",
        "仅 Warhead：控制 EMP 是否可累积及上限。-1 为绝对持续时间，0 为无限累积，正数为累积上限。",
        "Ares · EMP", "integer", ("Warhead",), "-1", docs="restored/emp.html",
    ),
    "ImmuneToEMP": ares(
        "ImmuneToEMP", "免疫 EMP",
        "仅 TechnoType：强制指定该对象是否免疫 EMP，而不是使用 Ares 按对象类型推导的默认规则。",
        "Ares · EMP", "boolean", ("TechnoType",), "", BOOL_VALUES, docs="restored/emp.html",
    ),
    "EMP.Modifier": ares(
        "EMP.Modifier", "EMP 时长倍率",
        "仅 TechnoType：目标受到的正向 EMP 持续时间倍率，例如 50% 表示持续时间减半。",
        "Ares · EMP", "percent", ("TechnoType",), "100%", docs="restored/emp.html",
    ),
    "EMP.Threshold": ares(
        "EMP.Threshold", "EMP 摧毁阈值",
        "仅 TechnoType：设置 EMP 超过多少帧后摧毁对象；yes=1，no=0，inair=-1，也可直接填写整数。",
        "Ares · EMP", "enum-or-integer", ("TechnoType",), "inair",
        (("no", "禁用"), ("yes", "立即摧毁"), ("inair", "仅空中立即摧毁")), docs="restored/emp.html",
    ),
    "EMP.Sparkles": ares(
        "EMP.Sparkles", "EMP 火花动画",
        "TechnoType 上定义默认 EMP 动画；Warhead 上可覆盖目标默认动画。",
        "Ares · EMP", "animation", ("TechnoType", "Warhead"), "", docs="restored/emp.html",
    ),

    # Bounty
    "Bounty": ares(
        "Bounty", "启用击杀赏金",
        "仅 TechnoType：该对象击杀敌方单位或建筑时是否获得赏金。",
        "Ares · 赏金", "boolean", ("TechnoType",), "no", BOOL_VALUES, docs="new/bounty.html",
    ),
    "Bounty.Display": ares(
        "Bounty.Display", "显示赏金金额",
        "仅 TechnoType：击杀目标时是否显示获得的赏金数值。",
        "Ares · 赏金", "boolean", ("TechnoType",), "", BOOL_VALUES, docs="new/bounty.html",
    ),
    "Bounty.Value": ares(
        "Bounty.Value", "被击杀赏金",
        "仅 TechnoType：该对象作为受害者被赏金猎手击杀时奖励的基础金额，可为负数。",
        "Ares · 赏金", "integer", ("TechnoType",), "0", docs="new/bounty.html",
    ),
    "Bounty.RookieValue": ares(
        "Bounty.RookieValue", "新兵赏金",
        "仅 TechnoType：新兵等级对象被击杀时的赏金；未设置时继承 Bounty.Value。",
        "Ares · 赏金", "integer", ("TechnoType",), "", docs="new/bounty.html",
    ),
    "Bounty.VeteranValue": ares(
        "Bounty.VeteranValue", "老兵赏金",
        "仅 TechnoType：老兵等级对象被击杀时的赏金；未设置时继承 Bounty.Value。",
        "Ares · 赏金", "integer", ("TechnoType",), "", docs="new/bounty.html",
    ),
    "Bounty.EliteValue": ares(
        "Bounty.EliteValue", "精英赏金",
        "仅 TechnoType：精英等级对象被击杀时的赏金；未设置时继承 Bounty.Value。",
        "Ares · 赏金", "integer", ("TechnoType",), "", docs="new/bounty.html",
    ),
    "BountyEnablers": ares(
        "BountyEnablers", "赏金启用建筑",
        "仅 [General]：玩家拥有列表中的任意建筑后才启用赏金；留空表示始终启用。",
        "Ares · 赏金", "list-building", ("General",), "", docs="new/bounty.html",
    ),
    "BountyDisplay": ares(
        "BountyDisplay", "全局显示赏金",
        "仅 [AudioVisual]：全局默认是否显示击杀获得的赏金金额。",
        "Ares · 赏金", "boolean", ("AudioVisual",), "no", BOOL_VALUES, docs="new/bounty.html",
    ),
    "GivesBounty": ares(
        "GivesBounty", "该国家提供赏金",
        "仅 Country：设为 no 后，击杀该国家拥有的对象不会获得赏金。",
        "Ares · 赏金", "boolean", ("Country",), "yes", BOOL_VALUES, docs="new/bounty.html",
    ),

    # Build time
    "BuildTime.Speed": ares(
        "BuildTime.Speed", "建造速度基准",
        "仅 TechnoType：生产一个价值 1000 的对象所需分钟数。设置后作为该类型最终建造速度基准。",
        "Ares · 建造", "float", ("TechnoType",), "", docs="new/buildtime.html",
    ),
    "BuildTime.Cost": ares(
        "BuildTime.Cost", "建造时间计算成本",
        "仅 TechnoType：只用于计算建造时间的虚拟价格，不改变实际 Cost。",
        "Ares · 建造", "integer", ("TechnoType",), "", docs="new/buildtime.html",
    ),
    "BuildTime.LowPowerPenalty": ares(
        "BuildTime.LowPowerPenalty", "低电力建造惩罚",
        "仅 TechnoType：低电力时应用到建造时间的倍率。",
        "Ares · 建造", "float", ("TechnoType",), "", docs="new/buildtime.html",
    ),
    "BuildTime.MinLowPower": ares(
        "BuildTime.MinLowPower", "低电力最小生产倍率",
        "仅 TechnoType：低电力修正后的生产倍率下限。",
        "Ares · 建造", "float", ("TechnoType",), "", docs="new/buildtime.html",
    ),
    "BuildTime.MaxLowPower": ares(
        "BuildTime.MaxLowPower", "低电力最大生产倍率",
        "仅 TechnoType：低电力修正后的生产倍率上限。",
        "Ares · 建造", "float", ("TechnoType",), "", docs="new/buildtime.html",
    ),
    "BuildTime.MultipleFactory": ares(
        "BuildTime.MultipleFactory", "多工厂建造倍率",
        "仅 TechnoType：每增加一个同类工厂后乘到建造时间上的倍率。",
        "Ares · 建造", "float", ("TechnoType",), "", docs="new/buildtime.html",
    ),

    # UI / payload
    "EnemyUIName": ares(
        "EnemyUIName", "敌方显示名称",
        "仅 BuildingType：敌人看到的替代名称；盟友、观察者或已渗透该建筑的玩家仍看到真实 UIName。",
        "Ares · 界面", "csf", ("BuildingType",), "", docs="new/enemyuiname.html",
    ),
    "InitialPayload.Types": ares(
        "InitialPayload.Types", "初始载荷类型",
        "TechnoType 创建时自动装入的对象类型列表。步兵本身不能拥有初始载荷，建筑只允许步兵载荷。",
        "Ares · 载荷", "list-techno", ("VehicleType", "AircraftType", "BuildingType"), "", docs="new/initialpayload.html",
    ),
    "InitialPayload.Nums": ares(
        "InitialPayload.Nums", "初始载荷数量",
        "与 InitialPayload.Types 一一对应的数量列表；数量项不足时，最后一个数量会用于后续类型。",
        "Ares · 载荷", "list-integer", ("VehicleType", "AircraftType", "BuildingType"), "", docs="new/initialpayload.html",
    ),

    # Prerequisites / factory ownership
    "Prerequisite.RequiredTheaters": ares(
        "Prerequisite.RequiredTheaters", "允许建造的地图环境",
        "仅 TechnoType：限制对象只在指定 Theater 中可建造。",
        "Ares · 前置", "multi-enum", ("TechnoType",), "",
        (("TEMPERATE", "温带"), ("SNOW", "雪地"), ("URBAN", "城市"), ("DESERT", "沙漠"), ("LUNAR", "月球"), ("NEWURBAN", "新城市")),
        docs="new/prerequisites.html",
    ),
    "Prerequisite.Negative": ares(
        "Prerequisite.Negative", "禁止前置建筑",
        "仅 TechnoType：玩家拥有列表中的任意建筑时，该对象反而不可建造。",
        "Ares · 前置", "list-building", ("TechnoType",), "", docs="new/prerequisites.html",
    ),
    "Prerequisite.Lists": ares(
        "Prerequisite.Lists", "额外前置方案数量",
        "仅 TechnoType：启用多少组额外的 Prerequisite.List# 可选前置方案。任一方案满足即可建造。",
        "Ares · 前置", "integer", ("TechnoType",), "0", docs="new/prerequisites.html",
    ),
    "Prerequisite.List#": ares(
        "Prerequisite.List#", "额外前置方案 #",
        "仅 TechnoType：第 # 组可选前置建筑列表。插入时编辑器会要求选择序号并生成真实键名。",
        "Ares · 前置", "indexed-list-building", ("TechnoType",), "", docs="new/prerequisites.html",
    ),
    "Prerequisite.StolenTechs": ares(
        "Prerequisite.StolenTechs", "需要窃取的科技",
        "仅 TechnoType：必须已经窃取的科技类型编号列表。",
        "Ares · 前置", "list-integer", ("TechnoType",), "", docs="new/prerequisites.html",
    ),
    "FactoryOwners.HasAllPlans": ares(
        "FactoryOwners.HasAllPlans", "提供原始国家全部生产蓝图",
        "仅 BuildingType：拥有该建筑时，视为拥有其初始所属国家全部工厂类型的生产蓝图。",
        "Ares · 前置", "boolean", ("BuildingType",), "no", BOOL_VALUES, docs="new/prerequisites.html",
    ),
    "FactoryOwners.Permanent": ares(
        "FactoryOwners.Permanent", "占领后永久获得蓝图",
        "仅 BuildingType：占领该建筑后是否永久获得其初始所属国家的生产蓝图。",
        "Ares · 前置", "boolean", ("BuildingType",), "no", BOOL_VALUES, docs="new/prerequisites.html",
    ),
    "FactoryOwners": ares(
        "FactoryOwners", "允许生产的工厂国家",
        "仅 TechnoType：只有由列表中国家建造的工厂或已获得相应国家蓝图时才能生产该对象。",
        "Ares · 前置", "list-country", ("TechnoType",), "", docs="new/prerequisites.html",
    ),
    "FactoryOwners.Forbidden": ares(
        "FactoryOwners.Forbidden", "禁止生产的工厂国家",
        "仅 TechnoType：如果玩家只有列表中国家的工厂/蓝图，则禁止生产该对象。",
        "Ares · 前置", "list-country", ("TechnoType",), "", docs="new/prerequisites.html",
    ),

    # Existing common Ares-facing metadata kept for compatibility.
    "Armor": ares(
        "Armor", "装甲类型", "Ares 支持通过 [ArmorTypes] 扩展装甲类型。",
        "Ares · 通用", "armor", ("TechnoType",), "",
    ),
    "VeteranAbilities": ares(
        "VeteranAbilities", "老兵能力", "Ares 扩展了可用的老兵能力组合。",
        "Ares · 晋升", "list-ability", ("TechnoType",), "",
    ),
    "EliteAbilities": ares(
        "EliteAbilities", "精英能力", "Ares 扩展了可用的精英能力组合。",
        "Ares · 晋升", "list-ability", ("TechnoType",), "",
    ),
}


class SchemaCatalog:
    def __init__(self, resource_dir: Path | None = None):
        self.options: dict[str, OptionMeta] = dict(ARES_OPTIONS)
        self.name_desc: dict[str, str] = {}
        self.resource_dir = resource_dir
        if resource_dir:
            self._load_legacy(resource_dir)
        self._load_json_overlay()

    @staticmethod
    def _read_ini(path: Path) -> configparser.ConfigParser | None:
        if not path.exists():
            return None
        cp = configparser.ConfigParser(interpolation=None, strict=False, delimiters=("=",))
        cp.optionxform = str
        for enc in ("utf-8-sig", "gb18030", "cp1252"):
            try:
                cp.read(path, encoding=enc)
                return cp
            except UnicodeDecodeError:
                cp.clear()
        return None

    def _load_legacy(self, root: Path) -> None:
        desc = self._read_ini(root / "OptionsDesc.ini")
        help_ini = self._read_ini(root / "HelpInfor.ini")
        names = self._read_ini(root / "NamesDesc.ini")
        categories = self._read_ini(root / "OptionCategory.ini")
        category_map: dict[str, str] = {}
        if categories and categories.has_section("UnitOptions"):
            labels = {"General": "通用", "Owner": "阵营", "Weapon": "武器", "MoveType": "运动", "Visual": "视觉", "Audio": "声音"}
            for key, label in labels.items():
                for option in categories.get("UnitOptions", key, fallback="").split(","):
                    if option.strip():
                        category_map[option.strip()] = label
        if desc and desc.has_section("OptionDesc"):
            for key, text in desc.items("OptionDesc"):
                old = self.options.get(key)
                help_text = ""
                values: list[tuple[str, str]] = []
                if help_ini and help_ini.has_section("HelpInfo"):
                    help_text = help_ini.get("HelpInfo", key, fallback="").replace("\\n", "\n")
                list_section = f"{key}_List"
                if desc.has_section(list_section):
                    values = list(desc.items(list_section))
                self.options[key] = OptionMeta(
                    key,
                    text,
                    help_text or (old.help_text if old else ""),
                    category_map.get(key, old.category if old else "特殊"),
                    old.source if old else "YR",
                    tuple(values) or (old.values if old else ()),
                    old.value_type if old else "text",
                    old.applies_to if old else (),
                    old.default if old else "",
                    old.docs if old else "",
                )
        if names and names.has_section("NameDesc"):
            self.name_desc.update(dict(names.items("NameDesc")))

    def _load_json_overlay(self) -> None:
        if not self.resource_dir:
            return
        path = self.resource_dir / "ares_options.json"
        if not path.exists():
            return
        try:
            data = json.loads(path.read_text("utf-8"))
        except Exception:
            return
        for key, row in data.items():
            old = self.options.get(key)
            self.options[key] = OptionMeta(
                key,
                row.get("description", old.description if old else ""),
                row.get("help", old.help_text if old else ""),
                row.get("category", old.category if old else "特殊"),
                row.get("source", "Ares"),
                tuple(tuple(x) for x in row.get("values", old.values if old else ())),
                row.get("value_type", old.value_type if old else "text"),
                tuple(row.get("applies_to", old.applies_to if old else ())),
                row.get("default", old.default if old else ""),
                row.get("docs", old.docs if old else ""),
            )

    def option(self, key: str) -> OptionMeta:
        if key in self.options:
            return self.options[key]
        folded = key.casefold()
        for name, meta in self.options.items():
            if name.casefold() == folded:
                return meta
        if folded.startswith("prerequisite.list") and folded[len("prerequisite.list"):].isdigit():
            return self.options["Prerequisite.List#"]
        source = "Ares/扩展" if "." in key else "自定义"
        return OptionMeta(key, source=source)

    def available_options(
        self,
        *,
        query: str = "",
        applies_to: str | None = None,
        source: str | None = None,
    ) -> list[OptionMeta]:
        q = query.strip().casefold()
        result: list[OptionMeta] = []
        for meta in self.options.values():
            if source and meta.source.casefold() != source.casefold():
                continue
            if applies_to and meta.applies_to and applies_to not in meta.applies_to and "TechnoType" not in meta.applies_to:
                continue
            if q:
                haystack = " ".join((meta.name, meta.description, meta.help_text, meta.category)).casefold()
                if q not in haystack:
                    continue
            result.append(meta)
        return sorted(result, key=lambda item: (item.category, item.description or item.name, item.name))

    def section_description(self, section: str) -> str:
        return self.name_desc.get(section, "")
