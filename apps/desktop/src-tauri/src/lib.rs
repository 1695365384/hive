use std::sync::Arc;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

// ============================================
// Server State
// ============================================

struct ServerState {
    child: tokio::sync::Mutex<Option<tokio::process::Child>>,
    entry: String,
    project_root: String,
    /// App resources path (set at runtime via tauri path API, used for SEA binary)
    resource_root: std::sync::Mutex<Option<String>>,
    status: tokio::sync::watch::Sender<ServerStatus>,
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

async fn spawn_server(state: &ServerState) -> Result<(), String> {
    let _ = state.status.send(ServerStatus {
        state: "starting".to_string(),
        pid: None,
        restart_count: 0,
    });

    // 确保 port 空闲（启动前 + 重启前都要做）
    kill_port_processes(4450).await;

    // Resolve server binary:
    // - Bundled app (SEA): directly execute hive-server binary, cwd = bundle dir (for node_modules/)
    // - Dev mode: use system node to run entry script
    let spawn_info = {
        let res_root = state.resource_root.lock().unwrap();
        if let Some(ref res_root) = *res_root {
            let sea_bin = format!("{}/server/hive-server", res_root);
            (sea_bin, Vec::<&str>::new(), res_root.clone())
        } else {
            ("node".to_string(), vec![state.entry.as_str()], state.project_root.clone())
        }
    };
    let result = do_spawn(&spawn_info.0, &spawn_info.1, &spawn_info.2).await;

    match result {
        Ok(child) => {
            let pid = child.id();
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

/// 杀掉占用指定 port 的进程
async fn kill_port_processes(port: u16) {
    if let Ok(output) = tokio::process::Command::new("lsof")
        .args(["-ti", &format!(":{}", port)])
        .output()
        .await
    {
        let pids_str = String::from_utf8_lossy(&output.stdout).to_string();
        for pid in pids_str.lines().filter(|l| !l.is_empty()) {
            eprintln!("[hive] Killing process {} on port {}", pid, port);
            let _ = tokio::process::Command::new("kill")
                .args(["-9", pid])
                .output()
                .await;
        }
    }
}

// ============================================
// Auto Restart Watcher (Task 5.3)
// ============================================

async fn watch_server(app: AppHandle, state: Arc<ServerState>) {
    let max_restarts: u32 = 5;
    let restart_delay = std::time::Duration::from_millis(500);
    let mut consecutive_restarts: u32 = 0;
    let mut last_restart = std::time::Instant::now();

    loop {
        // 1. 尽快获取 child 所有权并释放锁（锁只在这里短暂持有）
        let opt_child = {
            let mut guard = state.child.lock().await;
            guard.take() // 取出所有权，guard 变为 None，scope 结束时锁立即释放
        };

        // 2. 锁已释放，安全地等待进程退出（不占锁）
        if let Some(mut child) = opt_child {
            match child.wait().await {
                Ok(status) => eprintln!("[hive] Server exited with status: {}", status),
                Err(e) => eprintln!("[hive] Server error: {}", e),
            }
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
            let _ = app.emit("sidecar-status", ServerStatus {
                state: "failed".to_string(),
                pid: None,
                restart_count: consecutive_restarts,
            });
            break;
        }

        tokio::time::sleep(restart_delay).await;
        consecutive_restarts += 1;
        last_restart = std::time::Instant::now();

        eprintln!("[hive] Auto-restarting server ({}/{})", consecutive_restarts, max_restarts);

        let _ = app.emit("sidecar-status", ServerStatus {
            state: "starting".to_string(),
            pid: None,
            restart_count: consecutive_restarts,
        });

        // spawn_server 内部会确保 port 空闲
        match spawn_server(&state).await {
            Ok(()) => {
                // Health check polling (Task 5.2)
                let mut health_ok = false;
                for _ in 0..30 {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    if health_check(4450).await {
                        health_ok = true;
                        break;
                    }
                }

                if health_ok {
                    let _ = app.emit("sidecar-status", ServerStatus {
                        state: "running".to_string(),
                        pid: None,
                        restart_count: consecutive_restarts,
                    });
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
async fn get_server_status(state: tauri::State<'_, Arc<ServerState>>) -> Result<ServerStatus, String> {
    let is_running = {
        let mut guard = state.child.lock().await;
        if let Some(ref mut c) = *guard {
            c.try_wait().map_err(|e| e.to_string())?.is_none()
        } else {
            false
        }
    };

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

    // 1. 取出 child（watch_server 不再持锁，所以这里能立即拿到）
    let opt_child = {
        let mut guard = state.child.lock().await;
        guard.take()
    };

    // 2. 杀掉并等待进程退出（不占锁）
    if let Some(mut child) = opt_child {
        eprintln!("[hive] Killing server for restart...");
        let _ = child.start_kill();
        match tokio::time::timeout(std::time::Duration::from_secs(2), child.wait()).await {
            Ok(Ok(status)) => eprintln!("[hive] Server killed, exited: {}", status),
            Ok(Err(e)) => eprintln!("[hive] Server wait error: {}", e),
            Err(_) => eprintln!("[hive] Server kill timed out (force exit)"),
        }
    }

    // 3. spawn_server 会 kill port + 等 port 空闲后启动
    spawn_server(&state).await.map_err(|e| {
        eprintln!("[hive] spawn_server failed: {}", e);
        e
    })
}

// ============================================
// System Tray (Task 8.1)
// ============================================

fn build_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "重启服务", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show, &PredefinedMenuItem::separator(app)?, &restart, &PredefinedMenuItem::separator(app)?, &quit],
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
                        // Re-spawn: kill and restart
                        {
                            let mut guard = s.child.lock().await;
                            if let Some(ref mut c) = *guard {
                                let _ = c.start_kill();
                                let _ = tokio::time::timeout(std::time::Duration::from_secs(2), c.wait()).await;
                                *guard = None;
                            }
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                        let _ = spawn_server(&s).await;
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
        entry: server_entry,
        project_root: project_root_str,
        resource_root: std::sync::Mutex::new(None),
        status: tokio::sync::watch::Sender::new(ServerStatus {
            state: "starting".to_string(),
            pid: None,
            restart_count: 0,
        }),
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
        .invoke_handler(tauri::generate_handler![get_server_status, restart_server])
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
                    // Kill leftover process on port 4450
                    eprintln!("[hive] Checking port 4450...");
                    if let Ok(output) = tokio::process::Command::new("lsof")
                        .args(["-ti", ":4450"])
                        .output()
                        .await
                    {
                        let pids_str = String::from_utf8_lossy(&output.stdout).to_string();
                        let pids: Vec<&str> = pids_str.lines().filter(|l| !l.is_empty()).collect();
                        for pid in &pids {
                            eprintln!("[hive] Killing leftover pid {}", pid);
                            let _ = tokio::process::Command::new("kill")
                                .args(["-9", pid])
                                .output()
                                .await;
                        }
                        if !pids.is_empty() {
                            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        }
                    }

                    // Spawn initial server (bundle is pre-built, no runtime build needed)
                    match spawn_server(&spawn_state).await {
                        Ok(()) => {
                            // Health check polling (Task 5.2)
                            for _ in 0..30 {
                                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                                if health_check(4450).await {
                                    eprintln!("[hive] Server health check passed");
                                    let _ = app_handle.emit("sidecar-status", ServerStatus {
                                        state: "running".to_string(),
                                        pid: None,
                                        restart_count: 0,
                                    });
                                    break;
                                }
                            }

                            // Start auto-restart watcher (Task 5.3)
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
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async {
                    let mut guard = cleanup_state.child.lock().await;
                    if let Some(ref mut c) = *guard {
                        eprintln!("[hive] Killing server on app exit...");
                        let _ = c.start_kill();
                    }
                });
            }
        });
}
