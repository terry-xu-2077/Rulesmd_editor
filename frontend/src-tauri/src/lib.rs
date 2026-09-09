mod diagnostics;

use serde_json::{json, Value};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use tauri::State;

#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Shell::ShellExecuteW;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(target_os = "windows")]
const SW_SHOWNORMAL: i32 = 1;

fn packaged_layout_paths() -> Result<(PathBuf, PathBuf), String> {
    let executable = env::current_exe().map_err(|err| format!("无法确定编辑器程序位置: {err}"))?;
    let app_dir = executable
        .parent()
        .ok_or_else(|| format!("无法确定编辑器所在目录: {}", executable.display()))?;

    let mut backend = app_dir.join("runtime").join("rulesmd-backend");
    #[cfg(target_os = "windows")]
    backend.set_extension("exe");

    let resources = app_dir.join("resources");
    Ok((backend, resources))
}

fn backend_command() -> Result<(Command, String), String> {
    if let Ok(python) = env::var("RULESMD_PYTHON") {
        if !python.trim().is_empty() {
            diagnostics::backend(format!("using development Python backend: {python}"));
            let mut command = Command::new(&python);
            command.args(["-m", "rulesmd_editor.desktop_bridge"]);
            return Ok((command, format!("Python 后端 ({python})")));
        }
    }

    let (backend, resources) = packaged_layout_paths()?;
    diagnostics::backend(format!("packaged backend={}", backend.display()));
    diagnostics::backend(format!("resources={}", resources.display()));
    diagnostics::backend(format!("backend_exists={}", backend.is_file()));
    diagnostics::backend(format!("resources_exists={}", resources.is_dir()));

    if !backend.is_file() {
        return Err(format!(
            "内置后端不存在：{}。绿色版可能没有完整解压，请保留 runtime 文件夹与主程序在同一目录。",
            backend.display()
        ));
    }
    if !resources.is_dir() {
        return Err(format!(
            "规则资源目录不存在：{}。绿色版可能没有完整解压，请保留 resources 文件夹与主程序在同一目录。",
            resources.display()
        ));
    }

    let mut command = Command::new(&backend);
    if let Some(parent) = backend.parent() {
        command.current_dir(parent);
    }
    command.env("RULESMD_RESOURCES_DIR", &resources);
    Ok((command, format!("内置后端 ({})", backend.display())))
}

fn configure_backend_environment(command: &mut Command) {
    command
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONFAULTHANDLER", "1");
}

fn suppress_console(command: &mut Command) {
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

struct BackendProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

impl BackendProcess {
    fn spawn() -> Result<Self, String> {
        diagnostics::backend("=== backend spawn ===");
        let (mut command, backend_name) = backend_command().map_err(|err| {
            diagnostics::backend(format!("backend command failed: {err}"));
            err
        })?;
        configure_backend_environment(&mut command);
        suppress_console(&mut command);
        let stderr_log = diagnostics::open_backend_stderr().map_err(|err| {
            diagnostics::backend(format!("unable to open backend stderr log: {err}"));
            err
        })?;
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(stderr_log))
            .spawn()
            .map_err(|err| {
                let message = format!("无法启动 {backend_name}: {err}");
                diagnostics::backend(format!("spawn failed: {message}"));
                message
            })?;

        diagnostics::backend(format!("spawned pid={} name={backend_name}", child.id()));
        let stdin = child.stdin.take().ok_or_else(|| {
            let message = "无法连接 Python 后端 stdin".to_string();
            diagnostics::backend(&message);
            message
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            let message = "无法连接 Python 后端 stdout".to_string();
            diagnostics::backend(&message);
            message
        })?;
        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_id: 1,
        })
    }

    fn call(&mut self, method: &str, params: Value) -> Result<Value, String> {
        match self.child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => {
                diagnostics::backend(format!("backend exited before rpc method={method} status={status}"));
                return Err("Python 后端已经退出，请重新启动编辑器。详情请查看 logs/backend.log。".to_string());
            }
            None => {}
        }

        let id = self.next_id;
        self.next_id += 1;
        diagnostics::backend(format!("rpc request id={id} method={method}"));
        let request = json!({"id": id, "method": method, "params": params});
        let line = serde_json::to_string(&request).map_err(|e| {
            diagnostics::backend(format!("rpc encode failed id={id} method={method}: {e}"));
            e.to_string()
        })?;
        writeln!(self.stdin, "{line}").map_err(|e| {
            diagnostics::backend(format!("rpc write failed id={id} method={method}: {e}"));
            format!("写入 Python 后端失败: {e}")
        })?;
        self.stdin.flush().map_err(|e| {
            diagnostics::backend(format!("rpc flush failed id={id} method={method}: {e}"));
            e.to_string()
        })?;

        let mut response_line = String::new();
        self.stdout
            .read_line(&mut response_line)
            .map_err(|e| {
                diagnostics::backend(format!("rpc read failed id={id} method={method}: {e}"));
                format!("读取 Python 后端失败: {e}")
            })?;
        if response_line.trim().is_empty() {
            let status = self
                .child
                .try_wait()
                .ok()
                .flatten()
                .map(|value| value.to_string())
                .unwrap_or_else(|| "still-running-or-unknown".to_string());
            diagnostics::backend(format!(
                "rpc empty response id={id} method={method} backend_status={status}"
            ));
            return Err("Python 后端没有返回数据。详情请查看 logs/backend.log。".to_string());
        }
        let response: Value = serde_json::from_str(&response_line).map_err(|e| {
            diagnostics::backend(format!("rpc invalid json id={id} method={method}: {e}"));
            format!("Python 后端返回了无效 JSON: {e}")
        })?;
        if response.get("ok").and_then(Value::as_bool) == Some(true) {
            diagnostics::backend(format!("rpc ok id={id} method={method}"));
            Ok(response.get("result").cloned().unwrap_or(Value::Null))
        } else {
            let error_type = response
                .pointer("/error/type")
                .and_then(Value::as_str)
                .unwrap_or("UnknownError");
            let message = response
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("未知后端错误");
            diagnostics::backend(format!(
                "rpc error id={id} method={method} type={error_type} message={message}"
            ));
            Err(message.to_string())
        }
    }
}

type BackendState = Mutex<Option<BackendProcess>>;

#[tauri::command]
fn backend_status(state: State<'_, BackendState>) -> Value {
    let mut guard = state.lock().unwrap();
    if guard.is_none() {
        match BackendProcess::spawn() {
            Ok(process) => *guard = Some(process),
            Err(err) => diagnostics::backend(format!("backend_status spawn failed: {err}")),
        }
    }
    json!({"desktop": "ok", "python": if guard.is_some() { "ok" } else { "unavailable" }})
}

#[tauri::command]
fn backend_call(method: String, params: Option<Value>, state: State<'_, BackendState>) -> Result<Value, String> {
    let mut guard = state.lock().map_err(|_| {
        diagnostics::backend("backend state mutex poisoned");
        "后端状态锁定失败".to_string()
    })?;
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
        .set_title("选择游戏启动入口")
        .add_filter("游戏启动入口", &["exe", "bat", "cmd"])
        .add_filter("Windows 程序", &["exe"])
        .add_filter("批处理脚本", &["bat", "cmd"])
        .pick_file();
    Ok(path.map(|value| value.to_string_lossy().into_owned()))
}

fn normalize_launcher_path(path: &str) -> String {
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

fn launch_batch_script(script: &PathBuf, parent: &std::path::Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // BAT/CMD launchers such as RunAres.bat must behave exactly like a user double-click.
        // A hidden child cmd.exe changes the console/stdio environment enough to break some
        // Syringe/Ares launch chains, so delegate the file association to Windows Shell.
        let verb: Vec<u16> = std::ffi::OsStr::new("open").encode_wide().chain(Some(0)).collect();
        let file: Vec<u16> = script.as_os_str().encode_wide().chain(Some(0)).collect();
        let directory: Vec<u16> = parent.as_os_str().encode_wide().chain(Some(0)).collect();
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                file.as_ptr(),
                std::ptr::null(),
                directory.as_ptr(),
                SW_SHOWNORMAL,
            )
        };
        let code = result as isize;
        if code > 32 {
            Ok(())
        } else {
            Err(format!(
                "Windows Shell 无法启动批处理入口 {}（ShellExecute 错误码 {code}）。",
                script.display()
            ))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (script, parent);
        Err("BAT/CMD 启动入口仅支持 Windows。".to_string())
    }
}

fn launch_executable(executable: &PathBuf, parent: &std::path::Path) -> Result<(), String> {
    let direct = Command::new(executable)
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
        // Some CnCNet / mod-pack launchers need Windows Shell semantics.
        let fallback = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Process -FilePath $env:RULESMD_GAME_EXE -WorkingDirectory $env:RULESMD_GAME_DIR",
            ])
            .env("RULESMD_GAME_EXE", executable)
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

    let direct_error = direct
        .err()
        .map(|err| err.to_string())
        .unwrap_or_else(|| "未知错误".to_string());
    Err(format!(
        "启动游戏失败：{direct_error}。已确认入口存在，但系统未能启动该程序。"
    ))
}

#[tauri::command]
fn launch_game(path: String) -> Result<(), String> {
    let normalized = normalize_launcher_path(&path);
    if normalized.is_empty() {
        return Err("请先在设置中选择游戏启动入口。".to_string());
    }

    let launcher = PathBuf::from(&normalized);
    if !launcher.is_file() {
        return Err(format!("游戏启动入口不存在：{}", launcher.display()));
    }

    let parent = launcher
        .parent()
        .ok_or_else(|| format!("无法确定游戏启动目录：{}", launcher.display()))?;
    let extension = launcher
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    match extension.as_str() {
        "exe" => launch_executable(&launcher, parent),
        "bat" | "cmd" => launch_batch_script(&launcher, parent),
        _ => Err(format!(
            "不支持的游戏启动入口：{}。请选择 EXE、BAT 或 CMD 文件。",
            launcher.display()
        )),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    diagnostics::initialize();
    diagnostics::startup("initializing Tauri runtime");

    tauri::Builder::default()
        .manage(Mutex::new(None::<BackendProcess>))
        .setup(|_| {
            diagnostics::startup("Tauri setup complete");
            Ok(())
        })
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
