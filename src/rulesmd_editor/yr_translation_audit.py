from __future__ import annotations

"""Source-verified corrections above historical/manual YR translations.

Legacy OptionsDesc/HelpInfor data is valuable but not infallible.  Keep corrections in
one small reviewable overlay so generated metadata can be refreshed without restoring a
known mistranslation.  This module only changes presentation metadata.
"""

from dataclasses import replace

from .schema import OptionMeta


AUDITED_YR_OVERRIDES: dict[str, dict[str, str]] = {
    "AIBasePlanningSide": {
        "description": "AI 基地规划阵营",
        "help_text": (
            "指定 AI 基地规划时把建筑归入哪个 Side。-1 表示所有阵营，0=盟军，1=苏军，"
            "2=尤里；用于 BuildingType。非建筑对象上该值主要影响侧边栏图标排序。"
        ),
    },
    "CanPassiveAquire": {
        "description": "允许自动索敌",
        "help_text": (
            "决定单位是否会主动获取可攻击目标。原版 Key 的 Aquire 拼写就是如此，编辑器仅修正中文显示，"
            "不会改写实际 Key。"
        ),
    },
    "Category": {
        "description": "AI 战术分类",
        "help_text": "指定单位供 AI 目标选择、编队与生产逻辑使用的战术分类。它不是界面中的普通对象分类。",
    },
    "Owner": {
        "description": "可建造国家",
        "help_text": "列出哪些 Country 可以建造或拥有该对象。真实值仍使用国家 Section ID。",
    },
    "Strength": {
        "description": "生命值",
        "help_text": "对象的最大生命值。地图中对象的当前生命通常按此值的比例保存。",
    },
    "VeteranAbilities": {
        "description": "老兵能力",
        "help_text": "单位晋升老兵时获得的能力列表。老兵与精英能力不会简单叠加；精英阶段按 EliteAbilities 生效。",
    },
    "EliteAbilities": {
        "description": "精英能力",
        "help_text": "单位晋升精英时使用的能力列表。与 VeteranAbilities 的同名加成不会再次叠加。",
    },
}


def audit_yr_meta(meta: OptionMeta) -> OptionMeta:
    folded = meta.name.casefold()
    for key, patch in AUDITED_YR_OVERRIDES.items():
        if key.casefold() == folded:
            return replace(meta, **patch)
    return meta
