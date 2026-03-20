//! AIClaw Desktop Application
//!
//! Tauri 后端，使用 Channels + Sidecar 模式：
//! - 前端通过 Tauri IPC 与 Rust 后端通信
//! - Rust 后端通过 Sidecar 管理 Node.js service 子进程

mod commands;
mod protocol;
mod sidecar;

use sidecar::SidecarManager;
use std::sync::Arc;
use tauri::Manager;

/// 应用状态
pub struct AppState {
    pub sidecar: Arc<SidecarManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            tracing::info!("Initializing AIClaw application...");

            // 创建 Sidecar 管理器
            let sidecar = Arc::new(SidecarManager::new(app.handle().clone()));

            // 存储应用状态
            app.manage(AppState {
                sidecar: sidecar.clone(),
            });

            // 在后台自动启动 sidecar（避免阻塞 setup）
            let sidecar_clone = sidecar.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = sidecar_clone.start().await {
                    tracing::error!("Failed to start sidecar: {}", e);
                }
            });

            tracing::info!("Application initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::agent::chat,
            commands::agent::chat_stream,
            commands::agent::stop,
            commands::agent::start_service,
            commands::agent::stop_service,
            commands::agent::service_status,
            commands::agent::get_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
