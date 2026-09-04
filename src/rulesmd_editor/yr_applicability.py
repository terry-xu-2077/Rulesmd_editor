from __future__ import annotations

"""High-confidence original Yuri's Revenge option applicability hints.

This module supplements the legacy HelpInfor.ini metadata and runtime observation.
It intentionally stays conservative: broad/common flags are marked TechnoType, while
class-exclusive flags are only listed when the old help text or ModEnc/DeeZire data is
clear. Unknown flags should fall back to exact-type observation in the opened rulesmd.
"""

import re

TECHNO = ("TechnoType",)
INFANTRY = ("InfantryType",)
VEHICLE = ("VehicleType",)
AIRCRAFT = ("AircraftType",)
BUILDING = ("BuildingType",)

# Common TechnoType flags confirmed by the YR applicable-flag tables / individual
# ModEnc flag pages. This list is deliberately narrower than the full engine table;
# anything omitted can still be admitted by exact-type observation at runtime.
TECHNO_KEYS = {
    "Name", "UIName", "Image", "Armor", "Strength", "RadarInvisible", "Selectable",
    "LegalTarget", "LandTargeting", "NavalTargeting", "SpeedType", "TypeImmune",
    "WalkRate", "MoveRate", "MoveToShroud", "IsTrain", "DoubleOwned", "GuardRange",
    "Explodes", "DeathWeapon", "DeathWeaponDamageModifier", "FlightLevel", "IsDropship",
    "Owner", "RequiredHouses", "ForbiddenHouses", "SecretHouses", "Cost", "Soylent",
    "Points", "ThreatPosed", "Trainable", "Repairable", "SelfHealing", "ROT",
    "Passengers", "FireAngle", "DeployTime", "UndeployDelay", "Disableable", "ToProtect",
    "AllowedToStartInMultiplayer", "TargetLaser", "Crusher", "OmniCrusher",
    "OmniCrushResistant", "ImmuneToRadiation", "ImmuneToPsionics",
    "ImmuneToPsionicWeapons", "Organic", "ImmuneToPoison", "SuppressionThreshold",
    "NoShadow", "OpportunityFire", "VeteranAbilities", "EliteAbilities",
    "SpecialThreatValue", "IsSelectableCombatant", "Enslaves", "Spawns",
}

# Flags documented in the InfantryTypes YR applicable table as InfantryType-specific.
INFANTRY_KEYS = {
    "DeadBodies", "DeathAnims", "Cyborg", "NotHuman", "EnterWaterSound",
    "LeaveWaterSound", "Fearless", "Fraidycat", "Infiltrate", "Ivan", "Occupier",
    "Assaulter", "DetectionDistance", "HarvestRate", "C4", "Civilian", "Engineer",
    "TiberiumProof", "Agent", "Thief", "VehicleThief", "Doggie", "Deployer",
    "DeployedCrushable", "UseOwnName", "JumpJetTurn",
}

# High-confidence class-specific legacy flags from HelpInfor/DeeZire conventions.
VEHICLE_KEYS = {
    "DeploysInto", "Harvester", "Weeder", "CarriesCrate", "TiltsWhenCrushes",
    "Accelerates", "TurretRecoil", "TurretTravel", "TurretCompressFrames",
    "TurretHoldFrames", "TurretRecoverFrames", "BarrelTravel", "BarrelCompressFrames",
    "BarrelHoldFrames", "BarrelRecoverFrames",
}

AIRCRAFT_KEYS = {
    "AirportBound", "Fighter", "Landable", "FlyBy", "FlyBack", "Carryall",
    "AirRangeBonus", "EliteAirstrikeTeamType", "AirstrikeRechargeTime",
    "EliteAirstrikeRechargeTime",
}

BUILDING_KEYS = {
    "ConstructionYard", "Wall", "Factory", "FactoryPlant", "Cloning", "Capturable",
    "Radar", "Powered", "BaseNormal", "ProtectWithWall", "Adjacent", "Power",
}

EXACT: dict[str, tuple[str, ...]] = {}
EXACT.update({key: TECHNO for key in TECHNO_KEYS})
EXACT.update({key: INFANTRY for key in INFANTRY_KEYS})
EXACT.update({key: VEHICLE for key in VEHICLE_KEYS})
EXACT.update({key: AIRCRAFT for key in AIRCRAFT_KEYS})
EXACT.update({key: BUILDING for key in BUILDING_KEYS})

_STRONG_PATTERNS: tuple[tuple[re.Pattern[str], tuple[str, ...]], ...] = (
    (re.compile(r"(?:仅|只|只能).{0,10}(?:用于|用在|适用于).{0,8}(?:步兵|士兵)"), INFANTRY),
    (re.compile(r"(?:仅|只|只能).{0,10}(?:用于|用在|适用于).{0,8}(?:车辆|战车|载具)"), VEHICLE),
    (re.compile(r"(?:仅|只|只能).{0,10}(?:用于|用在|适用于).{0,8}(?:飞机|战机|航空器)"), AIRCRAFT),
    (re.compile(r"(?:仅|只|只能).{0,10}(?:用于|用在|适用于).{0,8}(?:建筑|建筑物)"), BUILDING),
)


def infer_yr_applies_to(key: str, help_text: str = "") -> tuple[str, ...]:
    """Return only high-confidence applicability hints for an original YR key."""
    direct = EXACT.get(key)
    if direct:
        return direct
    text = help_text.replace("\n", " ")
    for pattern, applies_to in _STRONG_PATTERNS:
        if pattern.search(text):
            return applies_to
    return ()
