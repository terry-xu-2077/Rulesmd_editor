# CnCNet / RF-Client 规则覆盖兼容性记录

本文档记录 Rulesmd Editor 对 CnCNet 系客户端的规则加载、覆盖路径与已验证行为。这里优先记录源码确认和实机验证结果，避免后续开发再次基于原版 Yuri's Revenge 的松散 `rulesmd.ini` 行为做错误假设。

## 结论

不存在一个“所有 CnCNet 客户端、所有 fork / 整合版都保证以同一绝对路径无条件读取”的通用新 INI 文件。

但 XNA CnCNet Client 家族存在稳定的 **GlobalCode 全局 Map Code 注入机制**：客户端在每局生成 `spawnmap.ini` 时主动读取 GlobalCode，并把其中的 Section/Key 合并到运行时地图。

Rulesmd Editor 对现代 CnCNet 系客户端应优先采用该机制，而不是依赖游戏根目录松散 `rulesmd.ini`，也不应直接修改 `spawnmap.ini`。

## 官方 CnCNet Client

官方 `CnCNet/xna-cncnet-client` 源码在生成 `spawnmap.ini` 时固定读取：

```text
<游戏目录>\INI\Map Code\GlobalCode.ini
```

注意目录名是 `Map Code`，中间有空格。

官方游戏模式自己的 Map Code 文件位于同一 `INI\Map Code\` 体系，但文件名由 `MapCodeIniName` 配置决定；因此不能把 `Standard.ini` 等具体模式文件当作全局通用入口。

官方源码还存在：

```text
<游戏目录>\INI\Map Code\MultiplayerGlobalCode.ini
```

它用于多人相关的全局 Map Code。Rulesmd Editor 的普通全局覆盖优先考虑 `GlobalCode.ini`。

## 重聚未来 RF-Client

重聚未来客户端源码仓库：

```text
Snowy-Studio/RF-Client
```

该 fork 保留了 GlobalCode 机制，但修改了物理目录名。

### 已确认路径

```text
<游戏目录>\INI\MapCode\GlobalCode.ini
```

注意这里是 `MapCode`，没有空格。

RF-Client 源码在生成 `spawnmap.ini` 时固定执行 GlobalCode 合并；各具体游戏模式文件则位于：

```text
<游戏目录>\INI\Multi\MapCode\<模式>.ini
```

因此下面两个概念必须分开：

```text
全局规则：INI\MapCode\GlobalCode.ini
模式规则：INI\Multi\MapCode\*.ini
```

`INI\Cp\MapCode\` 也可能存在于整合版目录中，但不是此次验证出的全局规则入口。

## 2026-09-06 实机验证

在“红警2 重聚未来 1.5 究极整合版”中创建：

```text
INI\MapCode\GlobalCode.ini
```

内容：

```ini
[E1]
Cost=1
```

验证结果：

1. 客户端启动新一局后重新生成 `spawnmap.ini`。
2. 新生成的 `spawnmap.ini` 中出现：

```ini
[E1]
Cost=1
```

3. 修改 `GlobalCode.ini` 后，每次新开一局，`spawnmap.ini` 都会随最新 GlobalCode 内容重新生成和更新。

因此该链路已实机确认：

```text
INI\MapCode\GlobalCode.ini
        ↓
RF-Client 开局时固定读取
        ↓
合并到 spawnmap.ini
        ↓
游戏读取运行时地图规则
```

## 已排除的路径 / 假设

以下方案在当前测试环境中无效，后续不要再把它们当作 CnCNet 默认保存方案：

### 游戏根目录松散 rulesmd.ini

```text
<游戏目录>\rulesmd.ini
```

当前 CnCNet / Hardened Spawner 环境下未生效。

### 游戏根目录松散 rules_cncnet.ini

即使 `cncnet.mix` 内部 `rulesmd.ini` 存在 `[$Include]`，将同名 `rules_cncnet.ini` 放在游戏根目录的测试仍未生效。

### RF-Client 模式目录中的 GlobalCode.ini

以下路径均未进入 `spawnmap.ini`：

```text
INI\Multi\MapCode\GlobalCode.ini
INI\Cp\MapCode\GlobalCode.ini
```

RF-Client 已验证的全局入口是：

```text
INI\MapCode\GlobalCode.ini
```

## Rulesmd Editor 的目标保存模型

针对 CnCNet / RF-Client，MIX 应主要作为基础规则读取源：

```text
cncnet.mix / 其他基础 MIX
        ↓
读取完整 rulesmd / rulesmo
        ↓
Rulesmd Editor 中编辑
        ↓
计算相对基础规则的差异
        ↓
写入 GlobalCode.ini
        ↓
客户端每局重新生成 spawnmap.ini
```

### 不应做的事情

- 不直接写回 `cncnet.mix`，除非未来明确提供高级/手动 MIX 编辑模式。
- 不把完整 `rulesmd.ini` 复制到 GlobalCode。
- 不直接编辑 `spawnmap.ini`；它是客户端运行时生成物。
- 不默认修改 `Standard.ini`、`Naval War.ini` 等模式文件。

### 推荐写入形式

只保存用户真正修改的 Section/Key，例如：

```ini
[E1]
Cost=100
Strength=250

[HTNK]
Speed=7
```

已有 `GlobalCode.ini` 时必须合并，而不是整文件覆盖，以保留用户手写规则和其他工具写入内容。

## 客户端自动识别建议

第一阶段至少探测以下候选：

```text
INI\Map Code\GlobalCode.ini    # 官方 CnCNet Client
INI\MapCode\GlobalCode.ini     # RF-Client / 重聚未来
```

即使文件尚未存在，也可以通过父目录结构辅助判断：

```text
INI\Map Code\
INI\MapCode\
INI\Multi\MapCode\
```

但不要仅凭一个目录名宣称识别成功。后续可以结合客户端 exe、配置文件、GameMode 配置以及已知 fork 特征进行更可靠的 profile 识别。

如果存在多个候选，应让客户端 profile 决定目标，而不是同时写入多个 GlobalCode 文件。

## 开发原则

CnCNet 兼容以“客户端实际生成 `spawnmap.ini` 的源码链路 + 实机测试”为准。

每加入一种客户端 / fork，至少记录：

1. 基础 Rules 从哪里读取。
2. 全局规则覆盖文件的真实路径。
3. 游戏模式规则路径。
4. GlobalCode 是否实际进入 `spawnmap.ini`。
5. 修改 GlobalCode 后下一局是否重新生成并生效。
6. 是否存在更新器 / 完整性校验会还原该文件。

没有完成上述验证前，不把推测路径作为默认写入目标。