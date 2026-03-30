use std::sync::Arc;

struct ServerState {
    child: tokio::sync::Mutex<Option<tokio::process::Child>>,
    entry: String,
    project_root: String,
}

async fn do_spawn(entry: &str, cwd: &str) -> Result<tokio::process::Child, String> {
    eprintln!("[hive-desktop] Starting server: node {} (cwd: {})", entry, cwd);

    let child = tokio::process::Command::new("node")
        .arg(entry)
        .current_dir(cwd)
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Failed to spawn server: {}", e))?;

    if let Some(pid) = child.id() {
        eprintln!("[hive-desktop] Server started with pid {}", pid);
    }

    Ok(child)
}

async fn spawn_server(state: &ServerState) -> Result<(), String> {
    match do_spawn(&state.entry, &state.project_root).await {
        Ok(child) => {
            *state.child.lock().await = Some(child);
            eprintln!("[hive-desktop] Server is running");
            Ok(())
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
async fn get_server_status(state: tauri::State<'_, Arc<ServerState>>) -> Result<bool, String> {
    let mut guard = state.child.lock().await;
    if let Some(ref mut c) = *guard {
        let status = c.try_wait().map_err(|e| e.to_string())?;
        Ok(status.is_none())
    } else {
        Ok(false)
    }
}

#[tauri::command]
async fn restart_server(state: tauri::State<'_, Arc<ServerState>>) -> Result<(), String> {
    // Kill existing child
    {
        let mut guard = state.child.lock().await;
        if let Some(ref mut c) = *guard {
            eprintln!("[hive-desktop] Killing server for restart...");
            let _ = c.start_kill();
            let _ = tokio::time::timeout(
                std::time::Duration::from_secs(2),
                c.wait(),
            )
            .await;
            *guard = None;
        }
    }

    tokio::time::sleep(std::time::Duration::from_secs(1)).await;

    spawn_server(&state).await
}

fn resolve_project_root() -> std::path::PathBuf {
    std::env::current_dir()
        .unwrap_or_default()
        .parent()
        .map(|p| p.parent())
        .flatten()
        .map(|p| p.parent())
        .flatten()
        .unwrap_or(&std::env::current_dir().unwrap_or_default())
        .to_path_buf()
}

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
    });

    let cleanup_state = server_state.clone();
    let spawn_state = server_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(server_state)
        .invoke_handler(tauri::generate_handler![get_server_status, restart_server])
        .setup(move |_app| {
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
                rt.block_on(async {
                    // Kill leftover process on port 4450
                    eprintln!("[hive-desktop] Checking port 4450...");
                    if let Ok(output) = tokio::process::Command::new("lsof")
                        .args(["-ti", ":4450"])
                        .output()
                        .await
                    {
                        let pids_str = String::from_utf8_lossy(&output.stdout).to_string();
                        let pids: Vec<&str> = pids_str.lines().filter(|l| !l.is_empty()).collect();
                        for pid in &pids {
                            eprintln!("[hive-desktop] Killing leftover pid {}", pid);
                            let _ = tokio::process::Command::new("kill")
                                .args(["-9", pid])
                                .output()
                                .await;
                        }
                        if !pids.is_empty() {
                            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        }
                    }

                    // Build server
                    eprintln!("[hive-desktop] Building server...");
                    let root = resolve_project_root();
                    match tokio::process::Command::new("pnpm")
                        .args(["--filter", "@hive/server", "build"])
                        .current_dir(&root)
                        .output()
                        .await
                    {
                        Ok(output) if output.status.success() => {
                            eprintln!("[hive-desktop] Server build complete");
                        }
                        Ok(output) => {
                            eprintln!("[hive-desktop] Server build failed: {}", String::from_utf8_lossy(&output.stderr));
                        }
                        Err(e) => eprintln!("[hive-desktop] Server build skipped: {}", e),
                    }

                    // Spawn initial server
                    match spawn_server(&spawn_state).await {
                        Ok(()) => {}
                        Err(e) => eprintln!("[hive-desktop] {}", e),
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
                        eprintln!("[hive-desktop] Killing server on app exit...");
                        let _ = c.start_kill();
                    }
                });
            }
        });
}
