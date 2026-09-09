use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

static LOG_DIR: OnceLock<PathBuf> = OnceLock::new();

fn unix_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0)
}

fn candidate_log_dir() -> PathBuf {
    if let Ok(executable) = std::env::current_exe() {
        if let Some(parent) = executable.parent() {
            let packaged_resources = parent.join("resources");
            if packaged_resources.is_dir() {
                return packaged_resources.join("logs");
            }
            return parent.join("logs");
        }
    }
    std::env::temp_dir().join("rulesmd-editor").join("logs")
}

fn ensure_writable_dir(path: &Path) -> bool {
    if fs::create_dir_all(path).is_err() {
        return false;
    }
    let probe = path.join(".write-test");
    match File::create(&probe) {
        Ok(mut file) => {
            let _ = file.write_all(b"ok");
            drop(file);
            let _ = fs::remove_file(probe);
            true
        }
        Err(_) => false,
    }
}

fn choose_log_dir() -> PathBuf {
    let preferred = candidate_log_dir();
    if ensure_writable_dir(&preferred) {
        return preferred;
    }

    let fallback = std::env::temp_dir().join("rulesmd-editor").join("logs");
    let _ = fs::create_dir_all(&fallback);
    fallback
}

pub fn log_dir() -> PathBuf {
    LOG_DIR.get_or_init(choose_log_dir).clone()
}

fn log_path(name: &str) -> PathBuf {
    log_dir().join(name)
}

fn truncate(name: &str) {
    let _ = File::create(log_path(name));
}

pub fn append(name: &str, message: impl AsRef<str>) {
    let path = log_path(name);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{}] {}", unix_millis(), message.as_ref());
        let _ = file.flush();
    }
}

pub fn startup(message: impl AsRef<str>) {
    append("startup.log", message);
}

pub fn backend(message: impl AsRef<str>) {
    append("backend.log", message);
}

pub fn crash(message: impl AsRef<str>) {
    append("crash.log", message);
}

pub fn open_backend_stderr() -> Result<File, String> {
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path("backend.log"))
        .map_err(|err| format!("无法创建后端日志文件: {err}"))
}

pub fn initialize() {
    let dir = log_dir();
    truncate("startup.log");
    truncate("backend.log");

    startup("=== Rulesmd Editor startup ===");
    startup(format!("version={}", env!("CARGO_PKG_VERSION")));
    startup(format!("os={} arch={}", std::env::consts::OS, std::env::consts::ARCH));
    startup(format!("debug_build={}", cfg!(debug_assertions)));
    startup(format!("log_dir={}", dir.display()));

    match std::env::current_exe() {
        Ok(path) => startup(format!("executable={}", path.display())),
        Err(err) => startup(format!("executable=<unavailable> error={err}")),
    }
    match std::env::current_dir() {
        Ok(path) => startup(format!("working_dir={}", path.display())),
        Err(err) => startup(format!("working_dir=<unavailable> error={err}")),
    }

    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        crash("=== Rust panic ===");
        crash(info.to_string());
        previous_hook(info);
    }));
}
