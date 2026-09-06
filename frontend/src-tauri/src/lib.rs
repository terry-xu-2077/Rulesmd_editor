use serde_json::{json, Value};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use tauri::State;

struct BackendProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

impl BackendProcess {
    fn spawn() -> Result<Self, String> {
        let python = env::var("RULESMD_PYTHON").unwrap_or_else(|_| "python".to_string());
        let mut child = Command::new(&python)
            .args(["-m", "rulesmd_editor.desktop_bridge"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|err| format!("无法启动 Python 后端 ({python}): {err}"))?;

        let stdin = child.stdin.take().ok_or("无法连接 Python 后端 stdin")?;
        let stdout = child.stdout.take().ok_or("无法连接 Python 后端 stdout")?;
        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_id: 1,
        })
    }

    fn call(&mut self, method: &str, params: Value) -> Result<Value, String> {
        if self.child.try_wait().map_err(|e| e.to_string())?.is_some() {
            return Err("Python 后端已经退出，请重新启动编辑器。".to_string());
        }

        let id = self.next_id;
        self.next_id += 1;
        let request = json!({"id": id, "method": method, "params": params});
        let line = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        writeln!(self.stdin, "{line}").map_err(|e| format!("写入 Python 后端失败: {e}"))?;
        self.stdin.flush().map_err(|e| e.to_string())?;

        let mut response_line = String::new();
        self.stdout
            .read_line(&mut response_line)
            .map_err(|e| format!("读取 Python 后端失败: {e}"))?;
        if response_line.trim().is_empty() {
            return Err("Python 后端没有返回数据。".to_string());
        }
        let response: Value = serde_json::from_str(&response_line)
            .map_err(|e| format!("Python 后端返回了无效 JSON: {e}"))?;
        if response.get("ok").and_then(Value::as_bool) == Some(true) {
            Ok(response.get("result").cloned().unwrap_or(Value::Null))
        } else {
            let message = response
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("未知后端错误");
            Err(message.to_string())
        }
    }
}

type BackendState = Mutex<Option<BackendProcess>>;

#[tauri::command]
fn backend_status(state: State<'_, BackendState>) -> Value {
    let mut guard = state.lock().unwrap();
    if guard.is_none() {
        *guard = BackendProcess::spawn().ok();
    }
    json!({"desktop": "ok", "python": if guard.is_some() { "ok" } else { "unavailable" }})
}

#[tauri::command]
fn backend_call(method: String, params: Option<Value>, state: State<'_, BackendState>) -> Result<Value, String> {
    let mut guard = state.lock().map_err(|_| "后端状态锁定失败".to_string())?;
    if guard.is_none() {
        *guard = Some(BackendProcess::spawn()?);
    }
    guard
        .as_mut()
        .ok_or_else(|| "Python 后端不可用".to_string())?
        .call(&method, params.unwrap_or_else(|| json!({})))
}

#[tauri::command]
fn pick_rules_file(window: tauri::Window) -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .set_parent(&window)
        .set_title("打开 Rules / 地图 / MIX 文件")
        .add_filter("Rules / RA2-YR 地图 / MIX", &["ini", "map", "mpr", "yrm", "mix"])
        .add_filter("Rules INI", &["ini"])
        .add_filter("RA2 / YR 地图", &["map", "mpr", "yrm"])
        .add_filter("Westwood MIX", &["mix"])
        .pick_file();
    Ok(path.map(|value| value.to_string_lossy().into_owned()))
}

#[tauri::command]
fn pick_save_file(window: tauri::Window, default_name: Option<String>) -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .set_parent(&window)
        .set_title("保存 Rules 文件")
        .set_file_name(default_name.unwrap_or_else(|| "rulesmd.ini".to_string()))
        .add_filter("INI 文件", &["ini"])
        .save_file();
    Ok(path.map(|value| value.to_string_lossy().into_owned()))
}

#[tauri::command]
fn pick_game_executable(window: tauri::Window) -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new()
        .set_parent(&window)
        .set_title("选择游戏启动程序")
        .add_filter("Windows 程序", &["exe"])
        .pick_file();
    Ok(path.map(|value| value.to_string_lossy().into_owned()))
}

fn normalize_executable_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.len() >= 2 {
        let bytes = trimmed.as_bytes();
        let wrapped_in_double_quotes = bytes.first() == Some(&b'"') && bytes.last() == Some(&b'"');
        let wrapped_in_single_quotes = bytes.first() == Some(&b'\'') && bytes.last() == Some(&b'\'');
        if wrapped_in_double_quotes || wrapped_in_single_quotes {
            return trimmed[1..trimmed.len() - 1].trim().to_string();
        }
    }
    trimmed.to_string()
}

#[tauri::command]
fn launch_game(path: String) -> Result<(), String> {
    let normalized = normalize_executable_path(&path);
    if normalized.is_empty() {
        return Err("请先在设置中选择游戏启动程序。".to_string());
    }

    let executable = PathBuf::from(&normalized);
    if !executable.is_file() {
        return Err(format!("游戏启动程序不存在：{}", executable.display()));
    }

    let parent = executable
        .parent()
        .ok_or_else(|| format!("无法确定游戏启动目录：{}", executable.display()))?;

    let direct = Command::new(&executable)
        .current_dir(parent)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();

    if direct.is_ok() {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        // 部分 CnCNet / 整合包启动器需要由 Windows Shell 间接启动。
        // PowerShell Start-Process 只接收环境变量里的路径，避免路径空格或特殊字符被再次解析。
        let fallback = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Process -FilePath $env:RULESMD_GAME_EXE -WorkingDirectory $env:RULESMD_GAME_DIR",
            ])
            .env("RULESMD_GAME_EXE", &executable)
            .env("RULESMD_GAME_DIR", parent)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();

        if let Ok(status) = fallback {
            if status.success() {
                return Ok(());
            }
        }
    }

    let direct_error = direct.err().map(|err| err.to_string()).unwrap_or_else(|| "未知错误".to_string());
    Err(format!(
        "启动游戏失败：{direct_error}。已确认路径存在，但系统未能启动该程序。"
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(None::<BackendProcess>))
        .invoke_handler(tauri::generate_handler![
            backend_status,
            backend_call,
            pick_rules_file,
            pick_save_file,
            pick_game_executable,
            launch_game
        ])
        .run(tauri::generate_context!())
        .expect("error while running Rulesmd Editor");
}
