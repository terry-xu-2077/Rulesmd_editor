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


ARES_OPTIONS: dict[str, OptionMeta] = {
    "Armor": OptionMeta("Armor", "装甲类型", "Ares 支持通过 [ArmorTypes] 定义额外装甲，并在 Warhead 的 Verses 中对应扩展。", "通用", "Ares"),
    "AttachEffect.Animation": OptionMeta("AttachEffect.Animation", "附加效果动画", "Ares AttachEffect 使用的动画。", "视觉", "Ares"),
    "AttachEffect.Duration": OptionMeta("AttachEffect.Duration", "附加效果持续时间", "AttachEffect 持续帧数。", "特殊", "Ares"),
    "AttachEffect.FirepowerMultiplier": OptionMeta("AttachEffect.FirepowerMultiplier", "火力倍率", "AttachEffect 对火力的倍率修正。", "武器", "Ares"),
    "AttachEffect.ArmorMultiplier": OptionMeta("AttachEffect.ArmorMultiplier", "防御倍率", "AttachEffect 对承伤的倍率修正。", "通用", "Ares"),
    "AttachEffect.SpeedMultiplier": OptionMeta("AttachEffect.SpeedMultiplier", "速度倍率", "AttachEffect 对移动速度的倍率修正。", "运动", "Ares"),
    "EMP.Duration": OptionMeta("EMP.Duration", "EMP 持续时间", "武器造成 EMP 的持续时间。", "武器", "Ares"),
    "ImmuneToEMP": OptionMeta("ImmuneToEMP", "免疫 EMP", "单位是否免疫 EMP。", "特殊", "Ares", (("yes", "是"), ("no", "否"))),
    "Bounty": OptionMeta("Bounty", "赏金", "控制击杀该对象获得的赏金逻辑。", "特殊", "Ares"),
    "Bounty.Value": OptionMeta("Bounty.Value", "赏金数值", "Ares 赏金数值。", "特殊", "Ares"),
    "EnemyUIName": OptionMeta("EnemyUIName", "敌方显示名称", "允许敌方看到与 UIName 不同的名称。", "视觉", "Ares"),
    "FactoryPlant.Multiplier": OptionMeta("FactoryPlant.Multiplier", "工厂折扣倍率", "Ares 对 FactoryPlant 效果的扩展倍率。", "通用", "Ares"),
    "BuildTime.Multiplier": OptionMeta("BuildTime.Multiplier", "建造时间倍率", "Ares 的建造时间倍率扩展。", "通用", "Ares"),
    "VeteranAbilities": OptionMeta("VeteranAbilities", "老兵能力", "Ares 扩展了可用的老兵能力组合。", "特殊", "Ares"),
    "EliteAbilities": OptionMeta("EliteAbilities", "精英能力", "Ares 扩展了可用的精英能力组合。", "特殊", "Ares"),
    "PassengerTurret": OptionMeta("PassengerTurret", "乘员炮塔", "Ares 乘员/载具炮塔相关扩展。", "武器", "Ares"),
    "InitialPayload.Types": OptionMeta("InitialPayload.Types", "初始载荷类型", "Ares 初始乘员/载荷类型列表。", "特殊", "Ares"),
    "InitialPayload.Nums": OptionMeta("InitialPayload.Nums", "初始载荷数量", "与 InitialPayload.Types 对应的数量。", "特殊", "Ares"),
    "SuperWeapon": OptionMeta("SuperWeapon", "超级武器", "对象关联超级武器。Ares 允许更多超级武器逻辑。", "特殊", "Ares"),
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
                self.options[key] = OptionMeta(key, text, help_text or (old.help_text if old else ""),
                                               category_map.get(key, old.category if old else "特殊"),
                                               old.source if old else "YR", tuple(values))
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
            self.options[key] = OptionMeta(key, row.get("description", ""), row.get("help", ""),
                                           row.get("category", "特殊"), "Ares",
                                           tuple(tuple(x) for x in row.get("values", [])))

    def option(self, key: str) -> OptionMeta:
        if key in self.options:
            return self.options[key]
        # Ares/custom tags frequently use dotted namespaces. Unknown tags are still first-class editable data.
        source = "Ares/扩展" if "." in key else "自定义"
        return OptionMeta(key, source=source)

    def section_description(self, section: str) -> str:
        return self.name_desc.get(section, "")
