use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

mod open_targets;

// ============================================
// Constants
// ============================================

const SERVER_PORT: u16 = 4450;
const NO_PID: u32 = 0;

// ============================================
// Helpers
// ============================================

/// Convert PID to i32 for libc calls, with defensive check.
/// OS PIDs fit in i32 on all supported platforms; u32::MAX cast to i32 becomes -1
/// which would signal the entire process group — this guard prevents that.
#[cfg(unix)]
fn pid_to_i32(pid: u32) -> Option<i32> {
    let p = pid as i32;
    if p > 0 { Some(p) } else { None }
}

/// Send a signal to a process (POSIX only).
///
/// # Safety
/// PID was obtained from a child process we spawned. There is a theoretical
/// PID reuse race (OS recycles PID between store and kill), but the window
/// is negligible for a short-lived desktop app sidecar.
#[cfg(unix)]
unsafe fn send_signal(pid: u32, signal: libc::c_int) {
    if let Some(p) = pid_to_i32(pid) {
        libc::kill(p, signal);
    }
}

// ============================================
// Server State
// ============================================

struct ServerState {
    /// Child process handle (owned by watch_server via take())
    child: tokio::sync::Mutex<Option<tokio::process::Child>>,
    /// Current server PID (independent of child ownership).
    /// Written by spawn_server (Release), read by restart_server/tray/exit (Acquire).
    server_pid: AtomicU32,
    entry: String,
    project_root: String,
    /// App resources path (set at runtime via tauri path API, used for Node.js sidecar).
    /// std::sync::Mutex is intentional: lock scope is small, never held across .await.
    resource_root: std::sync::Mutex<Option<String>>,
    status: tokio::sync::watch::Sender<ServerStatus>,
    /// Signals watch_server that the app is shutting down (don't restart)
    shutdown_requested: tokio::sync::watch::Sender<bool>,
}

#[derive(Clone, serde::Serialize)]
struct ServerStatus {
    state: String,
    pid: Option<u32>,
    restart_count: u32,
}

// ============================================
// Server Lifecycle
// ============================================

async fn do_spawn(bin: &str, args: &[&str], cwd: &str) -> Result<tokio::process::Child, String> {
    eprintln!("[hive] Starting server: {} {} (cwd: {})", bin, args.join(" "), cwd);

    let mut cmd = tokio::process::Command::new(bin);
    cmd.args(args)
        .current_dir(cwd)
        // Ensure file tools can read the project repo (README etc.), not only ~/.hive.
        .env("HIVE_WORKING_DIR", cwd)
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit());

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn server: {}", e))?;

    if let Some(pid) = child.id() {
        eprintln!("[hive] Server started with pid {}", pid);
    }

    Ok(child)
}

/// Kill processes occupying a port (for initial startup cleanup only)
async fn kill_port_processes(port: u16) {
    let pids = find_pids_on_port(port).await;
    for pid in pids {
        eprintln!("[hive] Force-killing leftover process {} on port {}", pid, port);
        #[cfg(unix)]
        let _ = tokio::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .await;
        #[cfg(windows)]
        let _ = tokio::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output()
            .await;
    }
}

/// Find PIDs listening on a TCP port (platform-specific).
async fn find_pids_on_port(port: u16) -> Vec<u32> {
    #[cfg(unix)]
    {
        if let Ok(output) = tokio::process::Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
            .await
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            return stdout
                .lines()
                .filter_map(|l| l.trim().parse::<u32>().ok())
                .collect();
        }
        vec![]
    }
    #[cfg(windows)]
    {
        // netstat -ano output: "  TCP    0.0.0.0:4450   0.0.0.0:0    LISTENING    1234"
        if let Ok(output) = tokio::process::Command::new("netstat")
            .args(["-ano"])
            .output()
            .await
        {
            let needle = format!(":{}", port);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return stdout
                .lines()
                .filter(|l| l.contains(&needle) && l.contains("LISTENING"))
                .filter_map(|l| l.split_whitespace().last()?.parse::<u32>().ok())
                .collect();
        }
        vec![]
    }
}

/// Check if a TCP port is in use (cross-platform, no external commands).
async fn is_port_in_use(port: u16) -> bool {
    tokio::net::TcpStream::connect(format!("127.0.0.1:{}", port))
        .await
        .is_ok()
}

/// Wait for port to become free (polls TcpStream::connect, respects graceful shutdown)
async fn wait_for_port(port: u16, timeout_ms: u64) -> bool {
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(timeout_ms);
    while start.elapsed() < timeout {
        if !is_port_in_use(port).await {
            return true;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    false
}

/// Spawn server process.
///
/// `force`: if true, SIGKILL any existing processes on port first (initial startup).
///         if false, wait for port to become available (graceful restart).
async fn spawn_server(state: &ServerState, force: bool) -> Result<(), String> {
    let _ = state.status.send(ServerStatus {
        state: "starting".to_string(),
        pid: None,
        restart_count: 0,
    });

    if force {
        // Initial startup: clean up any leftover processes from previous runs
        kill_port_processes(SERVER_PORT).await;
    } else {
        // Restart after graceful shutdown: wait for port to be released
        // The old process received SIGTERM and should close its server socket
        if !wait_for_port(SERVER_PORT, 10_000).await {
            eprintln!(
                "[hive] Port {} still in use after 10s, force killing",
                SERVER_PORT
            );
            kill_port_processes(SERVER_PORT).await;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    }

    // Resolve server binary:
    // - Release / bundled app: use bundled server resources if present
    //   (Node SEA packaging removed; pi kernel requires Bun — prefer dist/main.js / bun)
    // - Dev (debug build): ALWAYS use apps/server/dist/main.js — target/debug/server
    //   may contain a stale copy from tauri resources and must not override live dist.
    let spawn_info = {
        let res_root = state.resource_root.lock().unwrap();
        let use_bundled = if cfg!(debug_assertions) {
            false
        } else {
            match &*res_root {
                Some(ref root) => std::path::PathBuf::from(root)
                    .join("server")
                    .join("main.js")
                    .exists(),
                None => false,
            }
        };
        if use_bundled {
            let res_root = res_root.as_ref().unwrap();
            let server_dir = std::path::PathBuf::from(res_root).join("server");
            let server_dir_str = server_dir.to_string_lossy().to_string();
            // Node.js binary name: node-{os}-{arch}
            // e.g. node-darwin-arm64, node-linux-x64
            #[cfg(target_os = "macos")]
            let node_bin = if cfg!(target_arch = "aarch64") {
                server_dir.join("node-darwin-arm64").to_string_lossy().to_string()
            } else {
                server_dir.join("node-darwin-x64").to_string_lossy().to_string()
            };
            #[cfg(target_os = "linux")]
            let node_bin = if cfg!(target_arch = "x86_64") {
                server_dir.join("node-linux-x64").to_string_lossy().to_string()
            } else {
                server_dir.join("node-linux-arm64").to_string_lossy().to_string()
            };
            #[cfg(target_os = "windows")]
            let node_bin = {
                let with_ext = server_dir.join("node-win-x64.exe");
                let without_ext = server_dir.join("node-win-x64");
                if with_ext.exists() {
                    with_ext.to_string_lossy().to_string()
                } else {
                    // Fallback for older bundles that omitted the .exe suffix
                    without_ext.to_string_lossy().to_string()
                }
            };
            (node_bin, vec!["main.js"], server_dir_str)
        } else {
            eprintln!(
                "[hive] Dev server entry: {} (cwd: {})",
                state.entry, state.project_root
            );
            (
                "bun".to_string(),
                vec![state.entry.as_str()],
                state.project_root.clone(),
            )
        }
    };

    let result = do_spawn(&spawn_info.0, &spawn_info.1, &spawn_info.2).await;

    match result {
        Ok(child) => {
            let pid = child.id();
            state
                .server_pid
                .store(pid.unwrap_or(NO_PID), Ordering::Release);
            *state.child.lock().await = Some(child);
            eprintln!("[hive] Server is running");

            let _ = state.status.send(ServerStatus {
                state: "running".to_string(),
                pid,
                restart_count: 0,
            });
            Ok(())
        }
        Err(e) => {
            state.server_pid.store(NO_PID, Ordering::Release);
            let _ = state.status.send(ServerStatus {
                state: "failed".to_string(),
                pid: None,
                restart_count: 0,
            });
            Err(e)
        }
    }
}

async fn health_check(port: u16) -> bool {
    reqwest::get(&format!("http://localhost:{}/health", port))
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

async fn request_server_stop(state: &ServerState) {
    let pid = state.server_pid.load(Ordering::Acquire);
    if pid == NO_PID {
        return;
    }

    #[cfg(unix)]
    {
        eprintln!(
            "[hive] Sending SIGTERM to server (pid {}) for restart...",
            pid
        );
        // SAFETY: PID was obtained from a child we spawned.
        unsafe {
            send_signal(pid, libc::SIGTERM);
        }
    }

    #[cfg(windows)]
    {
        eprintln!(
            "[hive] Force-killing server on port {} for restart (pid {})...",
            SERVER_PORT, pid
        );
        kill_port_processes(SERVER_PORT).await;
    }
}

/// Check if a process is running (via signal 0, POSIX standard).
///
/// # Safety
/// Signal 0 doesn't actually send a signal — it just checks existence.
/// There is a theoretical PID reuse race, but acceptable for status polling.
fn is_process_running(pid: u32) -> bool {
    if pid == NO_PID {
        return false;
    }
    #[cfg(unix)]
    {
        // SAFETY: signal 0 is a no-op that only checks PID existence.
        // PID reuse risk is mitigated by server_pid being cleared on exit.
        unsafe {
            return pid_to_i32(pid).map_or(false, |p| libc::kill(p, 0) == 0);
        }
    }
    #[cfg(not(unix))]
    {
        // Windows: no kill(0), skip liveness check
        true
    }
}

// ============================================
// Auto Restart Watcher
// ============================================

/// The ONLY entity that spawns new server instances after the initial startup.
/// Owns the child process handle via take(), detects exits, and manages restarts.
async fn watch_server(app: AppHandle, state: Arc<ServerState>) {
    let max_restarts: u32 = 5;
    let restart_delay = std::time::Duration::from_millis(500);
    let mut consecutive_restarts: u32 = 0;
    let mut last_restart = std::time::Instant::now();
    let shutdown_rx = state.shutdown_requested.subscribe();

    loop {
        // 1. Take child ownership and release lock immediately
        let opt_child = {
            let mut guard = state.child.lock().await;
            guard.take()
        };

        // 2. Wait for process exit (without holding the lock)
        if let Some(mut child) = opt_child {
            match child.wait().await {
                Ok(status) => eprintln!("[hive] Server exited with status: {}", status),
                Err(e) => eprintln!("[hive] Server error: {}", e),
            }
        }

        // Clear PID — process is no longer running
        state.server_pid.store(NO_PID, Ordering::Release);

        // Check if app is shutting down — don't restart
        if *shutdown_rx.borrow() {
            eprintln!("[hive] App shutdown requested, not restarting");
            break;
        }

        // Reset counter if last restart was > 60s ago
        if last_restart.elapsed() > std::time::Duration::from_secs(60) {
            consecutive_restarts = 0;
        }

        if consecutive_restarts >= max_restarts {
            eprintln!("[hive] Max restart attempts ({}) reached", max_restarts);
            let _ = state.status.send(ServerStatus {
                state: "failed".to_string(),
                pid: None,
                restart_count: consecutive_restarts,
            });
            let _ = app.emit(
                "sidecar-status",
                ServerStatus {
                    state: "failed".to_string(),
                    pid: None,
                    restart_count: consecutive_restarts,
                },
            );
            break;
        }

        tokio::time::sleep(restart_delay).await;
        consecutive_restarts += 1;
        last_restart = std::time::Instant::now();

        eprintln!(
            "[hive] Auto-restarting server ({}/{})",
            consecutive_restarts, max_restarts
        );

        let _ = app.emit(
            "sidecar-status",
            ServerStatus {
                state: "starting".to_string(),
                pid: None,
                restart_count: consecutive_restarts,
            },
        );

        // Spawn WITHOUT force-killing — graceful shutdown should have released the port
        match spawn_server(&state, false).await {
            Ok(()) => {
                // Health check polling
                let mut health_ok = false;
                for _ in 0..30 {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    if health_check(SERVER_PORT).await {
                        health_ok = true;
                        break;
                    }
                }

                if health_ok {
                    let _ = app.emit(
                        "sidecar-status",
                        ServerStatus {
                            state: "running".to_string(),
                            pid: None,
                            restart_count: consecutive_restarts,
                        },
                    );
                } else {
                    eprintln!("[hive] Server health check failed after restart");
                }
            }
            Err(e) => eprintln!("[hive] Restart failed: {}", e),
        }
    }
}

// ============================================
// Tauri Commands
// ============================================

#[tauri::command]
fn copy_artifact_file(from: String, to: String) -> Result<(), String> {
    std::fs::copy(&from, &to).map_err(|e| format!("复制失败: {e}"))?;
    Ok(())
}

#[tauri::command]
fn write_artifact_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    std::fs::write(&path, data).map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

#[tauri::command]
fn get_open_targets(ext: String) -> Vec<open_targets::OpenTargetInfo> {
    open_targets::installed_for_extension(&ext)
}

/// Open a local file with the system default or a named app (bypasses opener plugin ACL).
#[tauri::command]
fn open_local_file(path: String, with: Option<String>) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("文件不存在: {path}"));
    }
    tauri_plugin_opener::open_path(p, with.as_deref()).map_err(|e| e.to_string())
}

/// Reveal a file in Finder / Explorer (bypasses opener plugin ACL).
#[tauri::command]
fn reveal_local_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("文件不存在: {path}"));
    }
    tauri_plugin_opener::reveal_item_in_dir(p).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| format!("Failed to show notification: {}", e))
}

#[tauri::command]
async fn get_server_status(
    state: tauri::State<'_, Arc<ServerState>>,
) -> Result<ServerStatus, String> {
    // Use server_pid (AtomicU32) instead of child lock
    // watch_server may own the child, making it inaccessible via lock
    let pid = state.server_pid.load(Ordering::Acquire);
    let is_running = is_process_running(pid);

    let current = state.status.borrow().clone();
    if !is_running && current.state == "running" {
        Ok(ServerStatus {
            state: "stopped".to_string(),
            pid: None,
            restart_count: current.restart_count,
        })
    } else {
        Ok(current)
    }
}

#[tauri::command]
async fn restart_server(state: tauri::State<'_, Arc<ServerState>>) -> Result<(), String> {
    eprintln!("[hive] restart_server called");

    if state.server_pid.load(Ordering::Acquire) != NO_PID {
        request_server_stop(&state).await;
        // watch_server will detect exit and handle the restart
    } else {
        eprintln!("[hive] No server running, starting fresh...");
        spawn_server(&state, true).await?;
    }

    Ok(())
}

// ============================================
// System Tray
// ============================================

fn build_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "重启服务", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show,
            &PredefinedMenuItem::separator(app)?,
            &restart,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Hive Desktop")
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "restart" => {
                    let app_clone = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let state = app_clone.state::<Arc<ServerState>>();
                        let s = (*state).clone();

                        // Read PID from AtomicU32 (not from child, which watch_server owns)
                        if s.server_pid.load(Ordering::Acquire) != NO_PID {
                            request_server_stop(&s).await;
                        }
                    });
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

// ============================================
// Project Root Resolution
// ============================================

fn resolve_project_root() -> std::path::PathBuf {
    std::env::current_dir()
        .unwrap_or_default()
        .ancestors()
        .nth(3)
        .unwrap_or(&std::env::current_dir().unwrap_or_default())
        .to_path_buf()
}

// ============================================
// App Entry
// ============================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let project_root = resolve_project_root();
    let server_entry = project_root
        .join("apps/server/dist/main.js")
        .to_string_lossy()
        .to_string();
    let project_root_str = project_root.to_string_lossy().to_string();

    let server_state = Arc::new(ServerState {
        child: tokio::sync::Mutex::new(None),
        server_pid: AtomicU32::new(NO_PID),
        entry: server_entry,
        project_root: project_root_str,
        resource_root: std::sync::Mutex::new(None),
        status: tokio::sync::watch::Sender::new(ServerStatus {
            state: "starting".to_string(),
            pid: None,
            restart_count: 0,
        }),
        shutdown_requested: tokio::sync::watch::Sender::new(false),
    });

    let cleanup_state = server_state.clone();
    let spawn_state = server_state.clone();
    let watch_state = server_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {
            // 第二个实例启动时，已有实例会收到回调
        }))
        .plugin(tauri_plugin_sql::Builder::new().build())
        .manage(server_state)
        .invoke_handler(tauri::generate_handler![
            get_server_status,
            restart_server,
            show_notification,
            copy_artifact_file,
            write_artifact_bytes,
            get_open_targets,
            open_local_file,
            reveal_local_file,
        ])
        .setup(move |app| {
            if let Err(e) = build_tray(app.handle()) {
                eprintln!("[hive] Failed to build tray: {}", e);
            }

            // Set resource_root from tauri path API (only available in bundled app)
            use tauri::path::BaseDirectory;
            if let Ok(res_path) = app.path().resolve(".", BaseDirectory::Resource) {
                let res_root = res_path.to_string_lossy().to_string();
                eprintln!("[hive] Resource root: {}", res_root);
                let state = app.state::<Arc<ServerState>>();
                *state.resource_root.lock().unwrap() = Some(res_root);
            }

            let app_handle = app.handle().clone();

            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async {
                    // Initial spawn with force mode (cleanup any leftover processes from previous runs)
                    match spawn_server(&spawn_state, true).await {
                        Ok(()) => {
                            // Health check polling
                            for _ in 0..30 {
                                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                                if health_check(SERVER_PORT).await {
                                    eprintln!("[hive] Server health check passed");
                                    let _ = app_handle.emit(
                                        "sidecar-status",
                                        ServerStatus {
                                            state: "running".to_string(),
                                            pid: None,
                                            restart_count: 0,
                                        },
                                    );
                                    break;
                                }
                            }

                            // Start auto-restart watcher
                            let watch_handle = app_handle.clone();
                            tauri::async_runtime::spawn(async move {
                                watch_server(watch_handle, watch_state).await;
                            });
                        }
                        Err(e) => eprintln!("[hive] {}", e),
                    }
                });
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Signal watch_server to stop restarting
                let _ = cleanup_state.shutdown_requested.send(true);

                let pid = cleanup_state.server_pid.load(Ordering::Acquire);
                if pid != NO_PID {
                    eprintln!(
                        "[hive] Sending SIGTERM to server (pid {}) on app exit...",
                        pid
                    );
                    // SAFETY: PID was obtained from a child we spawned.
                    #[cfg(unix)]
                    unsafe {
                        send_signal(pid, libc::SIGTERM);
                    }
                    #[cfg(not(unix))]
                    {
                        // Windows: force kill since SIGTERM isn't available.
                        // std::process::Command (not tokio) because this is a sync callback.
                        let _ = std::process::Command::new("taskkill")
                            .args(["/PID", &pid.to_string(), "/F"])
                            .output();
                    }
                }
                // Don't wait — the OS will clean up when the app exits
            }
        });
}
