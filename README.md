# Rulesmd Editor

现代化的《红色警戒 2：尤里的复仇》`rulesmd.ini` 桌面编辑器，兼容 **Ares** 扩展规则。

这是旧仓库 `terry-xu-2077/RulesmdEditor` 的重写版。新版本继续使用 Python，但 UI 从 PyQt5 迁移到 **PySide6 / Qt 6**，并重新设计了 INI 数据层。

## 设计目标

- 保留旧版主要工作流：单位分类树、Section/参数搜索、参数说明、添加/删除、Section 备份与替换、引用查找/跳转、全局查找、游戏启动、辅助值编辑等。
- 继续复用旧版的规则说明数据库与图标资源，而不是把旧 PyQt5 UI 代码一起搬过来。
- 支持 Ares 与大型 MOD 的未知标签、自定义标签和点号标签。
- **无损编辑**：不使用 `configparser` 重写整个文件，尽可能保留原始注释、顺序、空行、重复键、行尾注释、换行格式和文件编码。
- 未收录在内置说明数据库中的 Ares/自定义字段仍然可以正常显示、编辑和保存，不会被过滤或删除。

## 运行

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e .
rulesmd-editor
```

也可以：

```bash
python -m rulesmd_editor.app
```

## 导入旧版资源

由于资源版权和历史兼容性由原项目自身承接，仓库提供了导入工具：

```bash
python tools/import_legacy_resources.py
```

它会从旧仓库复制以下资源到 `src/rulesmd_editor/resources/`：

- `OptionsDesc.ini`
- `HelpInfor.ini`
- `NamesDesc.ini`
- `IdentType.ini`
- `ModDesc.ini`
- `OptionCategory.ini`
- `app.ico`
- `icons-normal.png`
- `ra2md.csf`
- `rulesmd.pre`

新版本只读取这些资源数据，不依赖旧版生成的 PyQt5 UI 文件。

## Ares 兼容策略

Ares 对 Yuri's Revenge 的规则系统加入了大量新逻辑。编辑器采用两层支持：

1. **数据层完全开放**：任意未知 Section、任意未知 Key、Ares 点号标签、MOD 自定义标签均被保留。
2. **元数据层可扩展**：`schema.py` 内置常见 Ares 字段说明，并支持后续通过 `ares_options.json` 扩充字段描述和候选值，而无需修改解析器。

因此，即使某个 Ares 标签暂时没有中文说明，也不会影响文件正确编辑。

参考资料：

- ModEnc `Rules.ini`: https://modenc.renegadeprojects.com/Rules.ini
- Ares Docs: https://ares-developers.github.io/Ares-docs/

## 开发

```bash
pip install -e .[dev]
pytest
```

当前代码入口：

- `src/rulesmd_editor/ini_document.py`：无损 Westwood/Ares INI 模型
- `src/rulesmd_editor/schema.py`：原版 + Ares 参数元数据
- `src/rulesmd_editor/app.py`：PySide6 桌面界面
- `tests/test_ini_document.py`：无损往返、重复键、Ares 自定义标签测试
