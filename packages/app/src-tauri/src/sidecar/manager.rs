//! Sidecar 进程管理
//!
//! 负责启动、停止、重启 Node.js Service 子进程
//! 通过 WebSocket 与 Service 通信

use crate::protocol::{Request, ServiceStatus, StreamEvent};
use crate::sidecar::bridge::MessageBridge;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
#[cfg(not(debug_assertions))]
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tokio::sync::{broadcast, Mutex, RwLock};
use tokio::time::sleep;
use tracing::{debug, error, info, warn};

/// Sidecar 管理器
pub struct SidecarManager {
    /// Tauri 应用句柄
    app: AppHandle,
    /// 子进程句柄
    child: Arc<Mutex<Option<CommandChild>>>,
    /// 消息桥接
    bridge: Arc<MessageBridge>,
    /// 运行状态（Arc 包装以便在 async 任务中更新）
    running: Arc<AtomicBool>,
    /// 当前状态
    status: Arc<RwLock<ServiceStatus>>,
    /// 停止信号
    stop_tx: broadcast::Sender<()>,
    /// WebSocket 端口
    ws_port: Arc<RwLock<Option<u16>>>,
}

impl SidecarManager {
    /// 创建新的 Sidecar 管理器
    pub fn new(app: AppHandle) -> Self {
        let (stop_tx, _) = broadcast::channel(1);
        Self {
            app,
            child: Arc::new(Mutex::new(None)),
            bridge: Arc::new(MessageBridge::new()),
            running: Arc::new(AtomicBool::new(false)),
            status: Arc::new(RwLock::new(ServiceStatus::Stopped)),
            stop_tx,
            ws_port: Arc::new(RwLock::new(None)),
        }
    }

    /// 获取当前状态
    pub async fn status(&self) -> ServiceStatus {
        // 顺便清理已完成的 channel
        self.bridge.cleanup_completed().await;
        self.status.read().await.clone()
    }

    /// 启动 Sidecar
    pub async fn start(&self) -> Result<(), String> {
        // 简单检查是否已运行
        if self.running.load(Ordering::SeqCst) {
            info!("Sidecar already running, skipping...");
            return Ok(());
        }

        // 设置运行标志
        self.running.store(true, Ordering::SeqCst);

        // 更新状态
        *self.status.write().await = ServiceStatus::Starting;
        info!("Starting sidecar service...");

        // 获取配置文件路径
        let providers_path = self.get_providers_path();
        if let Some(ref path) = providers_path {
            info!("Setting AICLAW_PROVIDERS_PATH: {}", path);
        }

        // 启动 sidecar 并设置环境变量，传递 --ws 参数
        let sidecar = self
            .app
            .shell()
            .sidecar("node-service")
            .map_err(|e| {
                self.running.store(false, Ordering::SeqCst);
                format!("Failed to create sidecar: {}", e)
            })?;

        // 设置参数和环境变量
        let sidecar = sidecar.args(["--ws"]);
        let sidecar = if let Some(path) = providers_path {
            sidecar.env("AICLAW_PROVIDERS_PATH", path)
        } else {
            sidecar
        };

        let (mut rx, child) = sidecar.spawn().map_err(|e| {
            self.running.store(false, Ordering::SeqCst);
            format!("Failed to spawn sidecar: {}", e)
        })?;

        // 存储子进程
        *self.child.lock().await = Some(child);

        // 等待 WebSocket 端口信息
        let ws_port = self.wait_for_ws_port(&mut rx).await?;
        *self.ws_port.write().await = Some(ws_port);
        info!("Service WebSocket port: {}", ws_port);

        // 连接 WebSocket
        let ws_url = format!("ws://127.0.0.1:{}", ws_port);
        self.bridge.connect(&ws_url).await.map_err(|e| {
            self.running.store(false, Ordering::SeqCst);
            format!("Failed to connect WebSocket: {}", e)
        })?;

        // 更新状态
        *self.status.write().await = ServiceStatus::Running;
        info!("Sidecar service started successfully");

        // 克隆必要的数据
        let app = self.app.clone();
        let running = self.running.clone();
        let status = self.status.clone();
        let stop_rx = self.stop_tx.subscribe();
        let bridge = self.bridge.clone();

        // 启动事件处理任务（处理 sidecar 进程事件）
        tauri::async_runtime::spawn(async move {
            let _stop_rx = stop_rx;
            loop {
                match rx.recv().await {
                    Some(event) => {
                        match event {
                            CommandEvent::Stdout(line) => {
                                // WebSocket 模式下，stdout 主要用于启动时的端口信息
                                debug!("Sidecar stdout: {}", String::from_utf8_lossy(&line));
                            }
                            CommandEvent::Stderr(line) => {
                                let stderr = String::from_utf8_lossy(&line);
                                // 区分日志级别
                                if stderr.contains("error") || stderr.contains("Error") {
                                    error!("Sidecar stderr: {}", stderr);
                                } else {
                                    debug!("Sidecar stderr: {}", stderr);
                                }

                                // 广播错误到前端
                                let _ = app.emit(
                                    "agent-error",
                                    serde_json::json!({ "error": stderr }),
                                );
                            }
                            CommandEvent::Error(error) => {
                                error!("Sidecar error: {}", error);
                                let _ = app.emit(
                                    "agent-error",
                                    serde_json::json!({ "error": error.to_string() }),
                                );
                            }
                            CommandEvent::Terminated(payload) => {
                                info!("Sidecar terminated: {:?}", payload);
                                running.store(false, Ordering::SeqCst);
                                *status.write().await = ServiceStatus::Stopped;
                                bridge.disconnect().await;
                                break;
                            }
                            _ => {}
                        }
                    }
                    None => {
                        info!("Sidecar channel closed");
                        running.store(false, Ordering::SeqCst);
                        *status.write().await = ServiceStatus::Stopped;
                        bridge.disconnect().await;
                        break;
                    }
                }
            }
        });

        // 启动 WebSocket 事件接收任务
        self.start_ws_event_loop().await;

        Ok(())
    }

    /// 等待 WebSocket 端口信息
    async fn wait_for_ws_port(&self, rx: &mut tokio::sync::mpsc::Receiver<CommandEvent>) -> Result<u16, String> {
        let timeout_duration = Duration::from_secs(10);
        let start = std::time::Instant::now();

        loop {
            if start.elapsed() > timeout_duration {
                return Err("Timeout waiting for WebSocket port".to_string());
            }

            match tokio::time::timeout(Duration::from_millis(100), rx.recv()).await {
                Ok(Some(event)) => {
                    if let CommandEvent::Stdout(line) = event {
                        let output = String::from_utf8_lossy(&line);
                        // 解析 AICLAW_WS_PORT=xxx
                        if let Some(port_str) = output.strip_prefix("AICLAW_WS_PORT=") {
                            let port_str = port_str.trim();
                            if let Ok(port) = port_str.parse::<u16>() {
                                return Ok(port);
                            }
                        }
                    }
                }
                Ok(None) => {
                    return Err("Sidecar channel closed before port was received".to_string());
                }
                Err(_) => {
                    // 超时，继续等待
                }
            }
        }
    }

    /// 启动 WebSocket 事件循环
    async fn start_ws_event_loop(&self) {
        let bridge = self.bridge.clone();
        let app = self.app.clone();

        tauri::async_runtime::spawn(async move {
            loop {
                match bridge.recv_event().await {
                    Ok(Some(event)) => {
                        // 发送到对应的 channel
                        if let Err(e) = bridge.send_event(&event).await {
                            warn!("Failed to send event to channel: {}", e);
                        }

                        // 同时广播到前端（用于调试）
                        if let Err(e) = app.emit("agent-event", &event) {
                            warn!("Failed to emit event: {}", e);
                        }
                    }
                    Ok(None) => {
                        // WebSocket 已关闭
                        info!("WebSocket event stream closed");
                        break;
                    }
                    Err(e) => {
                        error!("Error receiving WebSocket event: {}", e);
                        // 短暂等待后重试
                        sleep(Duration::from_millis(100)).await;
                    }
                }
            }
        });
    }

    /// 停止 Sidecar
    pub async fn stop(&self) -> Result<(), String> {
        if !self.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        info!("Stopping sidecar service...");
        *self.status.write().await = ServiceStatus::Stopping;

        // 发送停止信号
        let _ = self.stop_tx.send(());

        // 断开 WebSocket 连接
        self.bridge.disconnect().await;

        // 停止子进程
        let mut child = self.child.lock().await;
        if let Some(mut child) = child.take() {
            // 尝试优雅关闭
            if let Err(e) = child.write(b"quit\n".to_vec().as_slice()) {
                warn!("Failed to send quit command: {}", e);
            }

            // 等待一段时间
            sleep(Duration::from_secs(2)).await;
        }

        self.running.store(false, Ordering::SeqCst);
        *self.status.write().await = ServiceStatus::Stopped;
        *self.ws_port.write().await = None;
        info!("Sidecar service stopped");

        Ok(())
    }

    /// 发送请求到 Service
    pub async fn send(&self, request: &Request) -> Result<(), String> {
        info!("Sending request to sidecar: type={:?}, id={}", request.request_type, request.id);

        if !self.running.load(Ordering::SeqCst) {
            return Err("Service is not running".to_string());
        }

        self.bridge.send_request(request).await
    }

    /// 注册 Channel 监听器
    pub async fn register_channel(
        &self,
        request_id: String,
        sender: tauri::ipc::Channel<StreamEvent>,
    ) {
        self.bridge.register_channel(request_id, sender).await;
    }

    /// 取消 Channel 监听器
    pub async fn unregister_channel(&self, request_id: &str) {
        self.bridge.unregister_channel(request_id).await;
    }

    /// 注册响应等待器
    pub async fn register_waiter(&self, request_id: &str) -> tokio::sync::oneshot::Receiver<Result<serde_json::Value, String>> {
        self.bridge.register_waiter(request_id.to_string()).await
    }

    /// 取消响应等待器
    pub async fn unregister_waiter(&self, request_id: &str) {
        self.bridge.unregister_waiter(request_id).await;
    }

    /// 等待非流式请求的响应
    #[allow(dead_code)]
    pub async fn wait_for_response(
        &self,
        request_id: &str,
        timeout: std::time::Duration,
    ) -> Result<serde_json::Value, String> {
        // 注册等待器
        let rx = self.bridge.register_waiter(request_id.to_string()).await;

        // 等待响应或超时
        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => {
                self.bridge.unregister_waiter(request_id).await;
                Err("Response channel closed unexpectedly".to_string())
            }
            Err(_) => {
                self.bridge.unregister_waiter(request_id).await;
                Err(format!("Request timed out after {:?}", timeout))
            }
        }
    }

    /// 重启 Sidecar
    pub async fn restart(&self) -> Result<(), String> {
        info!("Restarting sidecar service...");
        self.stop().await?;

        // 等待一段时间
        sleep(Duration::from_secs(1)).await;

        self.start().await
    }

    /// 获取 providers.json 路径
    fn get_providers_path(&self) -> Option<String> {
        // 1. 开发环境：项目根目录
        #[cfg(debug_assertions)]
        {
            let manifest_dir = env!("CARGO_MANIFEST_DIR");
            let manifest_path = PathBuf::from(manifest_dir);

            // 向上 3 级: src-tauri -> app -> packages -> root
            if let Some(app_dir) = manifest_path.parent() {
                if let Some(packages_dir) = app_dir.parent() {
                    if let Some(root_dir) = packages_dir.parent() {
                        let providers_path = root_dir.join("providers.json");
                        info!("Checking project root: {:?}", providers_path);
                        if providers_path.exists() {
                            info!("Found providers.json in project root: {:?}", providers_path);
                            return Some(providers_path.to_string_lossy().to_string());
                        }
                    }
                }
            }

            // 备用：当前工作目录
            if let Ok(cwd) = std::env::current_dir() {
                let providers_path = cwd.join("providers.json");
                info!("Checking cwd: {:?}", providers_path);
                if providers_path.exists() {
                    info!("Found providers.json in cwd: {:?}", providers_path);
                    return Some(providers_path.to_string_lossy().to_string());
                }
            }
        }

        // 2. 生产环境：Tauri 资源目录
        #[cfg(not(debug_assertions))]
        {
            if let Ok(resource_dir) = self.app.path().resource_dir() {
                let providers_path = resource_dir.join("providers.json");
                if providers_path.exists() {
                    info!("Found providers.json in resource dir: {:?}", providers_path);
                    return Some(providers_path.to_string_lossy().to_string());
                }
            }
        }

        // 3. 回退：让 service 使用默认路径
        info!("No providers.json found, service will use default path");
        None
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        // 确保进程被停止
        let _ = self.stop_tx.send(());
    }
}
