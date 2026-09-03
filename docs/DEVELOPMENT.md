# Rulesmd Editor 开发文档

本文档用于记录 Rulesmd Editor 的开发环境、架构决策、构建方案和重要踩坑经验。面向项目开发维护，不作为用户 README。

## 当前技术架构

- 前端：React + TypeScript + Vite
- 桌面壳：Tauri 2
- 后端：Python
- 前后端通信：Python stdio JSON bridge
- 主分支：`main`
- Windows 一键开发启动：根目录 `启动项目.bat`

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
4. 首次安装前端依赖。
5. 由 `frontend/src-tauri/app-icon.png` 调用 Tauri 官方 `tauri icon` 生成平台图标。
6. 预取 Rust/Cargo 依赖。
7. 启动 `tauri dev`。

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

不要手工维护 Windows `icon.ico`。开发启动时由 Tauri 官方命令生成完整平台资源：

```text
tauri icon src-tauri/app-icon.png --output src-tauri/icons
```

这样可以避免：

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
- 网络、图标、sidecar 等环境问题一旦形成稳定方案，应同步记录在此文档，避免未来重复排查。
