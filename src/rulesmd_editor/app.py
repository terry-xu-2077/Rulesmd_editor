from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys

from PySide6 import QtCore, QtGui, QtWidgets

from .ini_document import IniDocument, categorized_sections
from .schema import SchemaCatalog

APP_NAME = "Rulesmd Editor"
ORG_NAME = "TerryTools"


class ValueEditorDialog(QtWidgets.QDialog):
    def __init__(self, title: str, value: str, choices: list[tuple[str, str]] | None = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.resize(560, 220)
        layout = QtWidgets.QVBoxLayout(self)
        self.combo = None
        if choices:
            self.combo = QtWidgets.QComboBox()
            for raw, label in choices:
                self.combo.addItem(f"{label}    [{raw}]", raw)
            idx = self.combo.findData(value)
            if idx >= 0:
                self.combo.setCurrentIndex(idx)
            layout.addWidget(self.combo)
        self.edit = QtWidgets.QLineEdit(value)
        layout.addWidget(self.edit)
        buttons = QtWidgets.QDialogButtonBox(QtWidgets.QDialogButtonBox.Ok | QtWidgets.QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
        if self.combo:
            self.combo.currentIndexChanged.connect(lambda: self.edit.setText(str(self.combo.currentData())))

    def value(self) -> str:
        return self.edit.text()


class GlobalSearchDialog(QtWidgets.QDialog):
    jumpRequested = QtCore.Signal(str)

    def __init__(self, doc: IniDocument, parent=None):
        super().__init__(parent)
        self.doc = doc
        self.setWindowTitle("全局规则 / 全局查找")
        self.resize(980, 620)
        layout = QtWidgets.QVBoxLayout(self)
        self.search = QtWidgets.QLineEdit()
        self.search.setPlaceholderText("搜索 Section、参数名或值……")
        layout.addWidget(self.search)
        self.table = QtWidgets.QTableWidget(0, 3)
        self.table.setHorizontalHeaderLabels(["Section", "参数", "值"])
        self.table.horizontalHeader().setSectionResizeMode(0, QtWidgets.QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(1, QtWidgets.QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(2, QtWidgets.QHeaderView.Stretch)
        self.table.setEditTriggers(QtWidgets.QAbstractItemView.NoEditTriggers)
        layout.addWidget(self.table)
        self.search.textChanged.connect(self.refresh)
        self.table.cellDoubleClicked.connect(self._jump)
        self.refresh()

    def refresh(self):
        q = self.search.text().casefold().strip()
        rows = []
        for sec in self.doc.sections():
            for key, val in self.doc.items(sec):
                if not q or q in sec.casefold() or q in key.casefold() or q in val.casefold():
                    rows.append((sec, key, val))
        self.table.setRowCount(len(rows))
        for r, row in enumerate(rows):
            for c, text in enumerate(row):
                self.table.setItem(r, c, QtWidgets.QTableWidgetItem(text))

    def _jump(self, row: int, _column: int):
        item = self.table.item(row, 0)
        if item:
            self.jumpRequested.emit(item.text())
            self.accept()


class SettingsDialog(QtWidgets.QDialog):
    def __init__(self, settings: QtCore.QSettings, parent=None):
        super().__init__(parent)
        self.settings = settings
        self.setWindowTitle("设置")
        self.resize(620, 260)
        form = QtWidgets.QFormLayout(self)
        row = QtWidgets.QHBoxLayout()
        self.game = QtWidgets.QLineEdit(str(settings.value("gamePath", "")))
        browse = QtWidgets.QPushButton("浏览…")
        browse.clicked.connect(self._browse_game)
        row.addWidget(self.game)
        row.addWidget(browse)
        form.addRow("游戏程序 / 启动器", row)
        self.autosave = QtWidgets.QCheckBox("编辑后自动保存 rules 文件")
        self.autosave.setChecked(settings.value("autoSaveRules", False, bool))
        form.addRow("", self.autosave)
        self.dark = QtWidgets.QCheckBox("深色模式")
        self.dark.setChecked(settings.value("darkMode", False, bool))
        form.addRow("", self.dark)
        box = QtWidgets.QDialogButtonBox(QtWidgets.QDialogButtonBox.Save | QtWidgets.QDialogButtonBox.Cancel)
        box.accepted.connect(self.accept)
        box.rejected.connect(self.reject)
        form.addRow(box)

    def _browse_game(self):
        path, _ = QtWidgets.QFileDialog.getOpenFileName(self, "选择游戏或启动器", "", "程序 (*.exe);;所有文件 (*)")
        if path:
            self.game.setText(path)

    def save(self):
        self.settings.setValue("gamePath", self.game.text())
        self.settings.setValue("autoSaveRules", self.autosave.isChecked())
        self.settings.setValue("darkMode", self.dark.isChecked())


class MainWindow(QtWidgets.QMainWindow):
    def __init__(self):
        super().__init__()
        self.settings = QtCore.QSettings(ORG_NAME, APP_NAME)
        self.doc = IniDocument.new()
        self.current_section = "General"
        self.current_option = ""
        self.history: list[str] = []
        self.history_index = -1
        resources = Path(__file__).resolve().parent / "resources"
        self.catalog = SchemaCatalog(resources)
        self.setWindowTitle("rulesmd 编辑器 · Yuri's Revenge / Ares")
        self.resize(1600, 940)
        self.setMinimumSize(1120, 700)
        ico = resources / "app.ico"
        if ico.exists():
            self.setWindowIcon(QtGui.QIcon(str(ico)))
        self._build_ui()
        self._build_actions()
        self._apply_theme()
        self.refresh_all()
        last = str(self.settings.value("lastFile", ""))
        if last and Path(last).exists():
            QtCore.QTimer.singleShot(0, lambda: self.open_file(last))

    def _build_ui(self):
        root = QtWidgets.QWidget()
        root_layout = QtWidgets.QVBoxLayout(root)
        root_layout.setContentsMargins(12, 10, 12, 12)
        root_layout.setSpacing(8)

        toolbar = QtWidgets.QHBoxLayout()
        self.open_btn = QtWidgets.QPushButton("打开")
        self.new_btn = QtWidgets.QPushButton("新建")
        self.save_btn = QtWidgets.QPushButton("保存")
        self.save_as_btn = QtWidgets.QPushButton("另存为")
        self.global_btn = QtWidgets.QPushButton("全局查找")
        self.run_btn = QtWidgets.QPushButton("启动游戏")
        self.settings_btn = QtWidgets.QPushButton("设置")
        for w in (self.open_btn, self.new_btn, self.save_btn, self.save_as_btn, self.global_btn):
            toolbar.addWidget(w)
        toolbar.addStretch()
        toolbar.addWidget(self.run_btn)
        toolbar.addWidget(self.settings_btn)
        root_layout.addLayout(toolbar)

        split = QtWidgets.QSplitter(QtCore.Qt.Horizontal)
        split.setChildrenCollapsible(False)

        left = QtWidgets.QWidget()
        ll = QtWidgets.QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 0, 0)
        self.section_search = QtWidgets.QLineEdit()
        self.section_search.setPlaceholderText("搜索单位 / Section / 注册 ID…")
        ll.addWidget(self.section_search)
        self.tree = QtWidgets.QTreeWidget()
        self.tree.setHeaderLabels(["描述 / 名称", "Section", "ID"])
        self.tree.setColumnWidth(0, 220)
        self.tree.setColumnWidth(1, 190)
        self.tree.setAlternatingRowColors(True)
        ll.addWidget(self.tree)
        section_buttons = QtWidgets.QHBoxLayout()
        self.add_section_btn = QtWidgets.QPushButton("+ Section")
        self.remove_section_btn = QtWidgets.QPushButton("删除")
        self.export_section_btn = QtWidgets.QPushButton("备份")
        self.import_section_btn = QtWidgets.QPushButton("替换")
        for b in (self.add_section_btn, self.remove_section_btn, self.export_section_btn, self.import_section_btn):
            section_buttons.addWidget(b)
        ll.addLayout(section_buttons)
        split.addWidget(left)

        center = QtWidgets.QWidget()
        cl = QtWidgets.QVBoxLayout(center)
        cl.setContentsMargins(0, 0, 0, 0)
        title_row = QtWidgets.QHBoxLayout()
        self.back_btn = QtWidgets.QToolButton()
        self.back_btn.setText("‹")
        self.forward_btn = QtWidgets.QToolButton()
        self.forward_btn.setText("›")
        self.section_title = QtWidgets.QLabel()
        font = self.section_title.font(); font.setPointSize(14); font.setBold(True); self.section_title.setFont(font)
        self.section_desc = QtWidgets.QLineEdit()
        self.section_desc.setPlaceholderText("自定义描述（不会写入 rulesmd.ini）")
        title_row.addWidget(self.back_btn)
        title_row.addWidget(self.forward_btn)
        title_row.addWidget(self.section_title)
        title_row.addWidget(self.section_desc, 1)
        cl.addLayout(title_row)

        filter_row = QtWidgets.QHBoxLayout()
        self.category = QtWidgets.QComboBox()
        self.category.addItems(["全部", "通用", "阵营", "武器", "运动", "视觉", "声音", "特殊", "Ares/扩展", "自定义"])
        self.option_search = QtWidgets.QLineEdit()
        self.option_search.setPlaceholderText("搜索参数或值…")
        filter_row.addWidget(self.category)
        filter_row.addWidget(self.option_search, 1)
        cl.addLayout(filter_row)

        self.table = QtWidgets.QTableWidget(0, 4)
        self.table.setHorizontalHeaderLabels(["参数", "说明", "值", "来源"])
        self.table.horizontalHeader().setSectionResizeMode(0, QtWidgets.QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(1, QtWidgets.QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(2, QtWidgets.QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(3, QtWidgets.QHeaderView.ResizeToContents)
        self.table.verticalHeader().setVisible(False)
        self.table.setSelectionBehavior(QtWidgets.QAbstractItemView.SelectRows)
        self.table.setAlternatingRowColors(True)
        cl.addWidget(self.table)
        option_buttons = QtWidgets.QHBoxLayout()
        self.add_option_btn = QtWidgets.QPushButton("+ 参数")
        self.remove_option_btn = QtWidgets.QPushButton("删除参数")
        self.refs_btn = QtWidgets.QPushButton("查找引用")
        self.smart_edit_btn = QtWidgets.QPushButton("辅助编辑")
        option_buttons.addWidget(self.add_option_btn)
        option_buttons.addWidget(self.remove_option_btn)
        option_buttons.addStretch()
        option_buttons.addWidget(self.refs_btn)
        option_buttons.addWidget(self.smart_edit_btn)
        cl.addLayout(option_buttons)
        split.addWidget(center)

        right = QtWidgets.QWidget()
        rl = QtWidgets.QVBoxLayout(right)
        rl.setContentsMargins(0, 0, 0, 0)
        head = QtWidgets.QLabel("参数帮助")
        hf = head.font(); hf.setBold(True); head.setFont(hf)
        rl.addWidget(head)
        self.help = QtWidgets.QTextBrowser()
        self.help.setOpenExternalLinks(True)
        rl.addWidget(self.help, 1)
        self.raw_preview = QtWidgets.QPlainTextEdit()
        self.raw_preview.setReadOnly(True)
        self.raw_preview.setMaximumBlockCount(10000)
        rl.addWidget(QtWidgets.QLabel("当前 Section 原文"))
        rl.addWidget(self.raw_preview, 1)
        split.addWidget(right)

        split.setStretchFactor(0, 0)
        split.setStretchFactor(1, 1)
        split.setStretchFactor(2, 0)
        split.setSizes([360, 900, 360])
        root_layout.addWidget(split, 1)
        self.setCentralWidget(root)
        self.status = self.statusBar()

    def _build_actions(self):
        self.open_btn.clicked.connect(self.choose_open)
        self.new_btn.clicked.connect(self.new_file)
        self.save_btn.clicked.connect(self.save)
        self.save_as_btn.clicked.connect(self.save_as)
        self.run_btn.clicked.connect(self.run_game)
        self.settings_btn.clicked.connect(self.show_settings)
        self.global_btn.clicked.connect(self.show_global_search)
        self.tree.itemSelectionChanged.connect(self.tree_selected)
        self.section_search.textChanged.connect(self.refresh_tree)
        self.option_search.textChanged.connect(self.refresh_table)
        self.category.currentTextChanged.connect(self.refresh_table)
        self.table.itemSelectionChanged.connect(self.table_selected)
        self.table.itemChanged.connect(self.table_changed)
        self.table.cellDoubleClicked.connect(self.smart_edit)
        self.add_section_btn.clicked.connect(self.add_section)
        self.remove_section_btn.clicked.connect(self.remove_section)
        self.export_section_btn.clicked.connect(self.export_section)
        self.import_section_btn.clicked.connect(self.import_section)
        self.add_option_btn.clicked.connect(self.add_option)
        self.remove_option_btn.clicked.connect(self.remove_option)
        self.refs_btn.clicked.connect(self.show_references)
        self.smart_edit_btn.clicked.connect(self.smart_edit)
        self.back_btn.clicked.connect(lambda: self.navigate_history(-1))
        self.forward_btn.clicked.connect(lambda: self.navigate_history(1))

    def _apply_theme(self):
        dark = self.settings.value("darkMode", False, bool)
        if dark:
            self.setStyleSheet("""
                QMainWindow,QWidget{background:#202124;color:#e8eaed} QLineEdit,QPlainTextEdit,QTextBrowser,QTreeWidget,QTableWidget,QComboBox{background:#292a2d;border:1px solid #3c4043;border-radius:6px;padding:5px;color:#e8eaed} QPushButton,QToolButton{background:#303134;border:1px solid #4b4d50;border-radius:6px;padding:6px 10px} QPushButton:hover,QToolButton:hover{background:#3c4043} QHeaderView::section{background:#2b2c2f;padding:7px;border:0;border-bottom:1px solid #3c4043} QTreeWidget::item:selected,QTableWidget::item:selected{background:#3f536f}
            """)
        else:
            self.setStyleSheet("""
                QWidget{font-family:'Segoe UI','Microsoft YaHei';font-size:13px} QLineEdit,QPlainTextEdit,QTextBrowser,QTreeWidget,QTableWidget,QComboBox{border:1px solid #d7dbe0;border-radius:6px;padding:5px;background:#fff} QPushButton,QToolButton{border:1px solid #d7dbe0;border-radius:6px;padding:6px 10px;background:#f7f8fa} QPushButton:hover,QToolButton:hover{background:#eef1f4} QHeaderView::section{background:#f5f6f8;padding:7px;border:0;border-bottom:1px solid #dfe3e8} QTreeWidget::item:selected,QTableWidget::item:selected{background:#dce8f7;color:#111}
            """)

    def maybe_save(self) -> bool:
        if not self.doc.dirty:
            return True
        result = QtWidgets.QMessageBox.question(self, "未保存修改", "当前文件有未保存修改，是否保存？",
                                                QtWidgets.QMessageBox.Save | QtWidgets.QMessageBox.Discard | QtWidgets.QMessageBox.Cancel)
        if result == QtWidgets.QMessageBox.Cancel:
            return False
        if result == QtWidgets.QMessageBox.Save:
            return self.save()
        return True

    def new_file(self):
        if not self.maybe_save(): return
        self.doc = IniDocument.new(); self.current_section = "General"; self.refresh_all()

    def choose_open(self):
        if not self.maybe_save(): return
        path, _ = QtWidgets.QFileDialog.getOpenFileName(self, "打开 rulesmd.ini", "", "INI (*.ini *.pre);;所有文件 (*)")
        if path: self.open_file(path)

    def open_file(self, path: str):
        try:
            self.doc = IniDocument.load(path)
        except Exception as exc:
            QtWidgets.QMessageBox.critical(self, "无法打开", str(exc)); return
        self.settings.setValue("lastFile", str(path))
        self.current_section = "General" if self.doc.has_section("General") else (self.doc.sections()[0] if self.doc.sections() else "")
        self.history = []; self.history_index = -1
        self.refresh_all()
        self.status.showMessage(f"已打开 {path} · 编码 {self.doc.encoding}", 5000)

    def save(self) -> bool:
        if self.doc.path is None: return self.save_as()
        try: self.doc.save()
        except Exception as exc:
            QtWidgets.QMessageBox.critical(self, "保存失败", str(exc)); return False
        self.status.showMessage("已保存", 2500); return True

    def save_as(self) -> bool:
        path, _ = QtWidgets.QFileDialog.getSaveFileName(self, "另存为", str(self.doc.path or "rulesmd.ini"), "INI (*.ini);;所有文件 (*)")
        if not path: return False
        try: self.doc.save(path)
        except Exception as exc:
            QtWidgets.QMessageBox.critical(self, "保存失败", str(exc)); return False
        self.settings.setValue("lastFile", path); return True

    def refresh_all(self):
        self.refresh_tree(); self.select_section(self.current_section, push_history=False)
        title = self.doc.path.name if self.doc.path else "未命名"
        self.setWindowTitle(f"{title}{' *' if self.doc.dirty else ''} · rulesmd 编辑器 · Ares")

    def refresh_tree(self):
        q = self.section_search.text().casefold().strip() if hasattr(self, "section_search") else ""
        selected = self.current_section
        self.tree.blockSignals(True); self.tree.clear()
        for group, sections in categorized_sections(self.doc).items():
            visible = []
            for sec, reg in sections:
                desc = self.catalog.section_description(sec) or self.doc.get(sec, "Name", "") or self.doc.get(sec, "UIName", "")
                text = f"{desc} {sec} {reg}".casefold()
                if not q or q in text: visible.append((sec, reg, desc))
            if not visible: continue
            parent = QtWidgets.QTreeWidgetItem([f"{group}  ({len(visible)})", "", ""]); parent.setFirstColumnSpanned(True)
            self.tree.addTopLevelItem(parent)
            for sec, reg, desc in visible:
                child = QtWidgets.QTreeWidgetItem([desc or sec, sec, reg]); child.setData(0, QtCore.Qt.UserRole, sec); parent.addChild(child)
                if sec == selected: self.tree.setCurrentItem(child)
            parent.setExpanded(True)
        self.tree.blockSignals(False)

    def select_section(self, section: str, *, push_history: bool = True):
        if not section or not self.doc.has_section(section): return
        if push_history and (self.history_index < 0 or self.history[self.history_index] != section):
            self.history = self.history[:self.history_index + 1]; self.history.append(section); self.history_index = len(self.history) - 1
        self.current_section = section
        self.section_title.setText(f"[{section}]")
        self.section_desc.setText(self.catalog.section_description(section))
        self.raw_preview.setPlainText(self.doc.clone_section_text(section))
        self.refresh_table()

    def tree_selected(self):
        item = self.tree.currentItem()
        if item:
            sec = item.data(0, QtCore.Qt.UserRole)
            if sec: self.select_section(sec)

    def refresh_table(self):
        sec = self.current_section
        q = self.option_search.text().casefold().strip() if hasattr(self, "option_search") else ""
        category = self.category.currentText() if hasattr(self, "category") else "全部"
        rows = []
        for key, value in self.doc.items(sec):
            meta = self.catalog.option(key)
            if category != "全部" and category not in (meta.category, meta.source): continue
            if q and q not in key.casefold() and q not in value.casefold() and q not in meta.description.casefold(): continue
            rows.append((key, meta.description, value, meta.source))
        self.table.blockSignals(True); self.table.setRowCount(len(rows))
        for r, row in enumerate(rows):
            for c, text in enumerate(row):
                item = QtWidgets.QTableWidgetItem(text)
                if c != 2: item.setFlags(item.flags() & ~QtCore.Qt.ItemIsEditable)
                self.table.setItem(r, c, item)
        self.table.blockSignals(False)
        self.raw_preview.setPlainText(self.doc.clone_section_text(sec))

    def table_selected(self):
        row = self.table.currentRow()
        if row < 0: return
        key_item = self.table.item(row, 0)
        if not key_item: return
        self.current_option = key_item.text(); meta = self.catalog.option(self.current_option)
        refs = self.doc.references_to(self.table.item(row, 2).text() if self.table.item(row, 2) else "")
        text = f"<h3>{meta.description or meta.name}</h3><p><b>参数：</b>{meta.name}</p><p><b>来源：</b>{meta.source}</p><p>{meta.help_text or '暂无内置说明；该标签仍可完整编辑和保存。'}</p>"
        if refs: text += "<p><b>当前值被引用：</b>" + "、".join(f"[{s}] {k}" for s, k in refs[:20]) + "</p>"
        self.help.setHtml(text)

    def table_changed(self, item: QtWidgets.QTableWidgetItem):
        if item.column() != 2: return
        key = self.table.item(item.row(), 0).text(); self.doc.set(self.current_section, key, item.text())
        self._after_edit()

    def _after_edit(self):
        self.raw_preview.setPlainText(self.doc.clone_section_text(self.current_section))
        self.setWindowTitle(f"{self.doc.path.name if self.doc.path else '未命名'} * · rulesmd 编辑器 · Ares")
        if self.settings.value("autoSaveRules", False, bool) and self.doc.path: self.save()

    def add_section(self):
        name, ok = QtWidgets.QInputDialog.getText(self, "新建 Section", "Section 名称：")
        if not ok or not name.strip(): return
        name = name.strip()
        if self.doc.has_section(name): QtWidgets.QMessageBox.warning(self, "已存在", f"[{name}] 已存在"); return
        self.doc.add_section(name); self.current_section = name; self.refresh_all(); self.select_section(name)

    def remove_section(self):
        if not self.current_section: return
        if QtWidgets.QMessageBox.question(self, "删除 Section", f"确定删除 [{self.current_section}]？\n注册表中的引用不会自动删除。") != QtWidgets.QMessageBox.Yes: return
        self.doc.remove_section(self.current_section); self.current_section = self.doc.sections()[0] if self.doc.sections() else ""; self.refresh_all()

    def add_option(self):
        key, ok = QtWidgets.QInputDialog.getText(self, "添加参数", "参数名（支持 Ares 点号标签）：")
        if not ok or not key.strip(): return
        value, ok = QtWidgets.QInputDialog.getText(self, "添加参数", "初始值：")
        if ok: self.doc.set(self.current_section, key.strip(), value); self._after_edit(); self.refresh_table()

    def remove_option(self):
        row = self.table.currentRow()
        if row < 0: return
        key = self.table.item(row, 0).text(); self.doc.remove_option(self.current_section, key); self._after_edit(); self.refresh_table()

    def smart_edit(self, *_):
        row = self.table.currentRow()
        if row < 0: return
        key = self.table.item(row, 0).text(); value = self.table.item(row, 2).text(); meta = self.catalog.option(key)
        choices = list(meta.values)
        # Reference-aware generic pickers replace the legacy dedicated weapon/warhead/projectile windows.
        lk = key.casefold()
        if not choices and any(x in lk for x in ("weapon", "warhead", "projectile", "image", "sound", "voice")):
            candidates = []
            for sec in self.doc.sections():
                if lk.endswith("warhead") and self.doc.has_option(sec, "Verses"): candidates.append((sec, sec))
                elif "projectile" in lk and self.doc.has_option(sec, "Image"): candidates.append((sec, sec))
                elif "weapon" in lk and self.doc.has_option(sec, "Warhead"): candidates.append((sec, sec))
            choices = candidates[:1000]
        dlg = ValueEditorDialog(f"{meta.description or key} · {key}", value, choices, self)
        if dlg.exec() == QtWidgets.QDialog.Accepted:
            self.doc.set(self.current_section, key, dlg.value()); self._after_edit(); self.refresh_table()

    def show_references(self):
        row = self.table.currentRow()
        value = self.table.item(row, 2).text() if row >= 0 and self.table.item(row, 2) else self.current_section
        refs = self.doc.references_to(value)
        if not refs: QtWidgets.QMessageBox.information(self, "引用", f"没有找到对 “{value}” 的直接引用。"); return
        box = QtWidgets.QMessageBox(self); box.setWindowTitle("引用"); box.setText(f"“{value}” 被以下项目引用：\n\n" + "\n".join(f"[{s}]  {k}" for s, k in refs[:80])); box.exec()

    def export_section(self):
        if not self.current_section: return
        path, _ = QtWidgets.QFileDialog.getSaveFileName(self, "备份当前 Section", f"{self.current_section}.ini", "INI (*.ini)")
        if path: Path(path).write_text(self.doc.clone_section_text(self.current_section), encoding="utf-8")

    def import_section(self):
        if not self.current_section: return
        path, _ = QtWidgets.QFileDialog.getOpenFileName(self, "从备份替换", "", "INI (*.ini *.pre)")
        if not path: return
        incoming = IniDocument.load(path); sections = incoming.sections()
        if not sections: QtWidgets.QMessageBox.warning(self, "无效备份", "文件中没有 Section。"); return
        source = self.current_section if incoming.has_section(self.current_section) else sections[-1]
        if QtWidgets.QMessageBox.question(self, "替换", f"使用备份中的 [{source}] 替换当前 [{self.current_section}]？") != QtWidgets.QMessageBox.Yes: return
        for key, _ in list(self.doc.items(self.current_section)): self.doc.remove_option(self.current_section, key)
        for key, value in incoming.items(source): self.doc.set(self.current_section, key, value)
        self._after_edit(); self.refresh_table()

    def show_global_search(self):
        dlg = GlobalSearchDialog(self.doc, self); dlg.jumpRequested.connect(self.select_section); dlg.exec()

    def navigate_history(self, delta: int):
        idx = self.history_index + delta
        if 0 <= idx < len(self.history): self.history_index = idx; self.select_section(self.history[idx], push_history=False)

    def show_settings(self):
        dlg = SettingsDialog(self.settings, self)
        if dlg.exec() == QtWidgets.QDialog.Accepted: dlg.save(); self._apply_theme()

    def run_game(self):
        game = str(self.settings.value("gamePath", ""))
        if not game or not Path(game).exists():
            self.show_settings(); game = str(self.settings.value("gamePath", ""))
        if game and Path(game).exists():
            try: subprocess.Popen([game], cwd=str(Path(game).parent))
            except Exception as exc: QtWidgets.QMessageBox.critical(self, "启动失败", str(exc))

    def closeEvent(self, event: QtGui.QCloseEvent):
        event.accept() if self.maybe_save() else event.ignore()


def main():
    app = QtWidgets.QApplication(sys.argv)
    app.setApplicationName(APP_NAME); app.setOrganizationName(ORG_NAME)
    app.setStyle("Fusion")
    win = MainWindow(); win.show()
    raise SystemExit(app.exec())


if __name__ == "__main__":
    main()
