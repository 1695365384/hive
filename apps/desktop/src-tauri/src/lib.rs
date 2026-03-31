use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

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
fn pid_to_i32(pid: u32) -> Option<i32> {
    let p = pid as i32;
    if p > 0 { Some(p) } else { None }
}

/// Send a signal to a process.
///
/// # Safety
/// PID was obtained from a child process we spawned. There is a theoretical
/// PID reuse race (OS recycles PID between store and kill), but the window
/// is negligible for a short-lived desktop app sidecar.
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
    /// App resources path (set at runtime via tauri path API, used for SEA binary).
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
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit());

    let child = cmd.spawn().map_err(|e| format!("Failed to spawn server: {}", e))?;

    if let Some(pid) = child.id() {
        eprintln!("[hive] Server started with pid {}", pid);
    }

    Ok(child)
}

/// Kill processes occupying a port (SIGKILL, for initial startup cleanup only)
async fn kill_port_processes(port: u16) {
    if let Ok(output) = tokio::process::Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .output()
        .await
    {
        let pids_str = String::from_utf8_lossy(&output.stdout).to_string();
        for pid in pids_str.lines().filter(|l| !l.is_empty()) {
            eprintln!("[hive] Force-killing leftover process {} on port {}", pid, port);
            let _ = tokio::process::Command::new("kill")
                .args(["-9", pid])
                .output()
                .await;
        }
    }
}

/// Wait for port to become free (polls lsof, respects graceful shutdown)
async fn wait_for_port(port: u16, timeout_ms: u64) -> bool {
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(timeout_ms);
    while start.elapsed() < timeout {
        if let Ok(output) = tokio::process::Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
            .await
        {
            if output.stdout.is_empty() {
                return true;
            }
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
    // - Bundled app (SEA): directly execute hive-server binary, cwd = bundle dir (for node_modules/)
    // - Dev mode: use system node to run entry script
    let spawn_info = {
        let res_root = state.resource_root.lock().unwrap();
        if let Some(ref res_root) = *res_root {
            let sea_bin = format!("{}/server/hive-server", res_root);
            (sea_bin, Vec::<&str>::new(), res_root.clone())
        } else {
            (
                "node".to_string(),
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

/// Check if a process is running (via signal 0, POSIX standard).
///
/// # Safety
/// Signal 0 doesn't actually send a signal — it just checks existence.
/// There is a theoretical PID reuse race, but acceptable for status polling.
fn is_process_running(pid: u32) -> bool {
    if pid == NO_PID {
        return false;
    }
    // SAFETY: signal 0 is a no-op that only checks PID existence.
    // PID reuse risk is mitigated by server_pid being cleared on exit.
    unsafe {
        pid_to_i32(pid).map_or(false, |p| libc::kill(p, 0) == 0)
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

    // Read PID from AtomicU32 (independent of child ownership)
    let pid = state.server_pid.load(Ordering::Acquire);

    if pid != NO_PID {
        eprintln!(
            "[hive] Sending SIGTERM to server (pid {}) for restart...",
            pid
        );
        // SAFETY: PID was obtained from a child we spawned.
        #[cfg(unix)]
        unsafe {
            send_signal(pid, libc::SIGTERM);
        }
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
                        let pid = s.server_pid.load(Ordering::Acquire);
                        if pid != NO_PID {
                            eprintln!(
                                "[hive] Tray: Sending SIGTERM to server (pid {})",
                                pid
                            );
                            // SAFETY: PID was obtained from a child we spawned.
                            #[cfg(unix)]
                            unsafe {
                                send_signal(pid, libc::SIGTERM);
                            }
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {
            // 第二个实例启动时，已有实例会收到回调
        }))
        .manage(server_state)
        .invoke_handler(tauri::generate_handler![get_server_status, restart_server, show_notification])
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
