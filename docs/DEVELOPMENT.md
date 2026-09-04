# Rulesmd Editor 开发文档

本文档用于记录 Rulesmd Editor 的开发环境、架构决策、构建方案和重要踩坑经验。面向项目开发维护，不作为用户 README。

## 当前技术架构

- 前端：React + TypeScript + Vite
- 桌面壳：Tauri 2
- 后端：Python
- 前后端通信：Python stdio JSON bridge
- UI 组件：`Terry_React_UI_Library`
- 主分支：`main`
- Windows 一键开发启动：根目录 `启动项目.bat`

## 当前优先级：先完成 rulesmd.ini 编辑闭环

当前阶段先不扩展游戏启动、备份、Mental Omega 特化等外围能力，优先保证以下完整闭环：

```text
新建完整 rulesmd.ini
        ↓
读取 / 分类 / 中文名称
        ↓
按旧 Web 规则生成正确控件
        ↓
编辑 + 修改状态 + 还原
        ↓
右侧中文帮助
        ↓
保存 / 另存为
        ↓
重新打开后值与控件一致
```

闭环验收重点：

1. `新建` 不是创建空 `[General]`，而是使用清洗后的完整原版 `rulesmd.pre`。
2. `打开` 保持用户文件的注释、顺序、未知标签、重复 Key 等数据，不进行破坏性格式整理。
3. 控件类型由旧版 Web 的 `OptionsDesc.ini` 规则驱动，不由前端猜测。
4. 修改后的值实时写入 Python 无损文档模型。
5. 只有当前值与打开/保存时原值不同时，UI Library 控件才显示还原图标。
6. 保存后当前值成为新的原值，修改状态清空。
7. 保存文件重新打开后，值、对象分类、下拉/多选/开关类型必须保持一致。
8. 右侧帮助来自真实旧资源与 Ares 内置说明，不使用临时占位文案作为主要数据。

## rules 资源体系

旧项目的以下资源仍然具有价值：

```text
RulesmdEditor/Resources/
```

主要包括：

- `rulesmd.pre`：原版 `rulesmd.ini`，仅改了扩展名。
- `OptionsDesc.ini`：参数中文名、候选列表等。
- `HelpInfor.ini`：参数详细中文帮助。
- `NamesDesc.ini`：Section / 对象中文名称。
- `OptionCategory.ini`：参数分类。
- `IdentType.ini`：对象类型识别资料。
- `ModDesc.ini`：旧版 Mod 元数据。

另外，旧 Web：

```text
RulesmdEditorWeb/desc/OptionsDesc.ini
```

是控件显示关系的重要权威来源。

### 目录约定

运行资源分两层：

```text
src/rulesmd_editor/resources/
  legacy/
    HelpInfor.ini
    IdentType.ini
    ModDesc.ini
    NamesDesc.ini
    OptionCategory.ini
    OptionsDesc.ini
    rulesmd.pre

  generated/
    control_schema.json
    rules_schema.json
    section_names.json
    identify_rules.json
    mod_metadata.json
    rulesmd.template.ini
    build_report.json
```

含义：

- `legacy/` 保存旧版原始资料，便于追溯，不作为普通运行时反复解析的数据源设计目标。
- `generated/` 保存规范化后的运行资源。
- `control_schema.json` 由旧 Web 控件 DSL 转换而来。
- `rulesmd.template.ini` 是新建文件的默认完整模板。

资源编译工具：

```text
tools/build_rule_resources.py
tools/build_control_schema.py
```

开发启动器发现模板/规则帮助资源缺失时，会自动运行资源编译器；生成后不需要每次重新下载。

## rulesmd.pre 默认模板策略

`rulesmd.pre` 的含义固定为：**原版 Yuri's Revenge `rulesmd.ini` 的模板来源**。

处理流程：

```text
旧版 rulesmd.pre
      ↓
仅用于模板生成的清洗
      ↓
rulesmd.template.ini
      ↓
用户点击“新建”
      ↓
创建完整 rulesmd.ini 文档模型
```

清洗只用于默认模板，不用于用户自己打开的文件。

模板清洗采用 ModEnc `CorrectRulesCode.py` 的核心思想，并做安全修正：

- 删除 Tab 和无意义尾部空格。
- 规范 `=` 两侧空格。
- 去除纯注释与值尾 `;` 注释。
- 无效、没有 `=` 的 Section 内容行删除。
- 重复 Section 合并。
- 同一 Section 重复 Key 按后定义覆盖前定义，符合原清洗脚本字典语义。
- Key/Value 按第一个 `=` 分割，避免值内部包含 `=` 时被错误截断。
- 生成 UTF-8 + CRLF 模板。

`RulesWorkspace.new_document()` 加载生成后的完整模板后，会将 `document.path` 清空，因此第一次保存会要求选择新的 `rulesmd.ini`，不会覆盖项目模板。

## 旧 Web 控件 DSL → UI Library

控件类型必须忠实继承旧 Web，而不是根据 Key 名随意猜测。

### 1. 布尔开关

值语义为 Yes/No：

```ini
Cloakable=yes
Trainable=no
```

映射：

```text
BoolSwitch
```

### 2. `[Key_List]` 单选菜单

例如：

```text
Armor_List       -> Armor
TechLevel_List   -> TechLevel
MovementZone_List -> MovementZone
Locomotor_List   -> Locomotor
BuildCat_List    -> BuildCat
InfDeath_List    -> InfDeath
```

映射：

```text
Select
```

### 3. `[MultipleMenu]` 多选菜单

旧 Web 关系：

```text
Country_Type
  Owner
  RequiredHouses
  ForbiddenHouses
  SecretHouses
    -> Country_List

Abilities_Type
  VeteranAbilities
  EliteAbilities
    -> Abilities_List

Buildings_Type
  Prerequisite
  PrerequisiteOverride
  Dock
    -> Buildings_List + 当前 rulesmd.ini 动态建筑
```

映射：

```text
MultiSelect
```

例如：

```ini
Owner=British,French,Americans
```

必须显示为国家多选菜单，而不是普通文本框或 Section 引用单选。

**控件优先级固定为：布尔 → MultipleMenu 多选 → Key_List 单选 → UnitMenu/引用选择 → 数值 → 文本。**

这条优先级很重要：`Owner=YuriCountry` 这类单值内容虽然恰好能命中某个 Section，也不能让“引用识别”抢走 `Country_Type` 的多选语义。前端必须先服从后端 `widget`，只有没有明确菜单控件时才做引用型选择增强。

### 4. `[UnitMenu]` 动态对象选择

候选项来自当前打开的 `rulesmd.ini`：

```text
Enslaves       -> Infantry
UndeploysInto  -> Vehicle
DeploysInto    -> Building
Spawns         -> Aircraft
Warhead        -> Warhead
Projectile     -> Projectile
SuperWeapon    -> SuperWeapon
```

映射：

```text
Select
```

### 5. 数值

旧 Web 中普通数值编辑使用滑块风格。当前数据层输出：

```text
widget = slider
```

映射：

```text
Slider
```

普通整数范围按旧 Web 的初始值×4，小数按初始值×6；有明确官方限制的参数由 schema 覆盖通用范围。拖动过程中范围不得随当前值再次膨胀。

### 6. 其他

没有明确菜单/布尔/数值关系的参数：

```text
TextField
```

### 前后端职责

Python 后端返回明确：

```json
{
  "widget": "multi-select",
  "values": [
    {"value": "British", "label": "英国"}
  ]
}
```

React 不应重新根据 Key 猜控件，应优先服从 `widget`。

UI 控件本身来自：

```text
Terry_React_UI_Library
```

通用控件视觉、尺寸、动效和交互问题应优先修 UI Library，不在 Rulesmd Editor 内写近似组件或覆盖补丁。

`BoolSwitch` 默认是紧凑开关，但允许业务通过公开宽度变量提供上下文总宽度；Track/Knob 几何仍属于 UI Library。参数表使用 180px，总设置页使用 78px。

`PropertyRow` 不属于通用 UI 控件，不应重新加入 UI Library。复制等业务操作同样不能污染通用控件 API。

## BoolSwitch：直接继承旧 Web 形态

BoolSwitch 的视觉结构以旧 `RulesmdEditorWeb/css/widgets.css` 中 `.edit-wg-check` 为权威来源，不再“近似重画”。

固定原则：

- Track 使用旧 Web 四段式内凹槽：浅边 → 深槽 → 深槽 → 浅边。
- OFF Knob 使用横向 `深 → 亮 → 深` 灰色浮雕渐变。
- ON Knob 使用横向 `深青 → 高亮青 → 深青` 渐变。
- Knob 宽度比例约为旧版 `90 / 220 ≈ 40.9%`，而不是简单 50%。
- ON 状态移动到右侧并保留小边距。
- 暗色与亮色必须保持**完全相同的几何、比例、渐变方向和立体结构**，只替换颜色值。
- 主项目业务 CSS只能提供 `--tc-bool-width`，禁止再次覆盖 Knob 宽度、left/right 或运动距离。

## 修改与还原语义

加载一个 Section 时，前端记录每条 `line_id` 对应的原始值。

规则：

```text
current == rawValue
    -> 未修改
    -> 不显示还原按钮

current != rawValue
    -> 已修改
    -> UI Library 控件显示还原图标
```

点击还原会通过正常 `onChange(rawValue)` 路径写回 Python 文档模型，不做只改 UI 的假还原。

保存成功后：

```text
当前值 -> 新 rawValue
changed -> 清空
```

## 中文名称与帮助信息

### 参数中文名

来源：

```text
OptionsDesc.ini [OptionDesc]
```

### 参数详细帮助

来源：

```text
HelpInfor.ini [HelpInfo]
```

`\n` 转换为真实换行后显示在右侧帮助面板。

### 对象 / Section 中文名

来源：

```text
NamesDesc.ini [NameDesc]
```

左侧对象树同时显示：

```text
中文名称
Section ID
```

### Ares

Ares 与 YR 在前端使用同一个参数目录和帮助体验，但数据层分离：YR 规则与 Ares `ares_schema.json` 独立维护。

Ares 开关的含义只影响：

- 参数推荐
- 参数插入
- Ares 帮助辅助

关闭 Ares 后，用户文件里已有或手写的 Ares/第三方标签仍必须无损读取、编辑和保存。

## Windows 开发启动

日常测试直接双击根目录：

```text
启动项目.bat
```

实际逻辑位于：

```text
scripts/start-dev.ps1
```

启动器负责：

1. 检查 Node / npm / Rust / Cargo / Python。
2. 首次创建 `.venv`。
3. 首次以 editable 模式注册 Python backend。
4. 若 rules 运行资源不存在，下载旧资料、生成帮助数据库和清洗后的完整默认模板。
5. `package.json` 变化时自动更新前端依赖，包括 UI Library 固定提交版本。
6. 同步旧 Web 图标资源。
7. 仅在 `frontend/src-tauri/app-icon.png` 指纹变化或生成图标缺失时调用 Tauri 官方 `tauri icon`；普通启动禁止重复生成整套图标。
8. 预取 Rust/Cargo 依赖。
9. 启动 `tauri dev`。

## Cargo / crates.io 网络问题与最终解决方案

### 症状

在 Windows 开发环境中，Cargo 从官方 crates.io 下载依赖时曾频繁出现：

```text
spurious network error
SSL connect error
Timeout was reached
failed to get <crate> as a dependency
failed to download from https://index.crates.io/...
```

表现包括：

- HTTP/2 framing error。
- TLS handshake 被远端提前关闭。
- 单个 crate 等待 20～60 秒后超时。
- 即使 `127.0.0.1:7897` 本地代理可用，官方 crates.io 仍可能不稳定。
- 仅通过 `CARGO_REGISTRIES_CRATES_IO_INDEX`、临时 `--config` 或代理环境变量，并不能可靠保证所有 crates.io 请求都真正切到镜像；日志中仍可能回到 `index.crates.io`。

### 最终方案

项目级固定使用 RsProxy 的 sparse registry，通过 Cargo 官方支持的 `source.replace-with` 机制替换 crates.io。

配置文件：

```text
.cargo/config.toml
```

核心配置：

```toml
[source.crates-io]
replace-with = "rsproxy-sparse"

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[http]
multiplexing = false

[net]
retry = 2
```

重点：**真正解决问题的是 `source.crates-io.replace-with`，而不是只修改 registry 环境变量。**

这样即使 `Cargo.lock` 或依赖元数据以 crates.io 为来源，Cargo 也会将下载请求路由到 RsProxy。

### 本机代理策略

开发机本地代理地址：

```text
http://127.0.0.1:7897
```

启动器会检测该端口是否可用，但代理只承担网络传输，不再负责“切换 registry”。Registry 始终由项目级 `.cargo/config.toml` 固定为 RsProxy。

Cargo 依赖预取采用两级路线：

1. RsProxy 直连。
2. 若失败且检测到 7897，则使用 RsProxy + `127.0.0.1:7897`。

不再自动回退官方 `index.crates.io`，避免重新进入已验证不稳定的下载路线。

### 如何判断配置是否真正生效

正常情况下，依赖下载过程不应再出现：

```text
https://index.crates.io/...
```

如果仍出现 `index.crates.io`，优先检查是否存在本机 Cargo 全局配置覆盖项目配置，例如：

```text
%USERPROFILE%\.cargo\config.toml
%USERPROFILE%\.cargo\config
```

以及相关环境变量。

### 为什么禁用 HTTP/2 multiplexing

启动环境保持：

```text
CARGO_HTTP_MULTIPLEXING=false
```

原因是此前在当前网络环境中反复出现 HTTP/2 framing / TLS 连接异常。关闭 multiplexing 可以降低部分代理和中间网络设备对 Cargo HTTP/2 请求的兼容问题。

## Tauri 图标生成约定

只维护一个源图标：

```text
frontend/src-tauri/app-icon.png
```

不要手工维护 Windows `icon.ico`。启动器对源 PNG 计算 SHA256，并将指纹保存在被 Git 忽略的本地 stamp 中。

只有源 PNG 指纹变化或生成产物缺失时才执行：

```text
tauri icon src-tauri/app-icon.png --output src-tauri/icons
```

这样既避免每次启动重复生成所有平台图标，也避免：

- `icons/icon.ico not found`
- Windows Resource Compiler 的 `RC2176: old DIB`
- 手工 ICO 编码不兼容

源 PNG 必须是可正常解码的标准 PNG。若 Tauri 报 `CRC error`、`Unknown filter method` 等，先直接检查 `app-icon.png` 是否损坏，而不是继续排查 Rust 编译。

## Git 工作流

当前项目只维护一个主分支：

```text
main
```

后续正常开发直接提交到 `main`，不再创建长期开发分支。

本地更新：

```bash
git pull
```

如果明确希望完全丢弃本地修改并与远端一致：

```bash
git fetch origin
git reset --hard origin/main
git clean -fd
```

注意：上述命令会删除未提交的本地修改和未跟踪文件。

## 维护原则

- README 只保留项目简介、用户入口和最基本使用说明。
- 构建方案、开发环境、架构决策和踩坑记录统一写入本文件。
- 启动器能自动处理的开发环境问题，不要求开发者重复手工输入命令。
- 网络、图标、sidecar、资源生成、控件映射等稳定方案形成后，应同步记录在本文件。
- UI Library 属于通用层的问题必须回到 `Terry_React_UI_Library` 修复，Rulesmd Editor 不维护一套“看起来像”的替代实现。
