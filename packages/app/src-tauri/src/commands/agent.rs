//! Agent 相关 IPC 命令

use crate::protocol::{ChatPayload, Config, Request, RequestType, ServiceStatus, StopPayload, StreamEvent};
use crate::AppState;
use tauri::ipc::Channel;
use tauri::State;

/// 发送对话请求（非流式）
#[tauri::command]
pub async fn chat(
    prompt: String,
    provider_id: Option<String>,
    model_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let payload = ChatPayload {
        prompt,
        provider_id,
        model_id,
        session_id: None,
    };

    let request = Request::new(
        RequestType::Chat,
        serde_json::to_value(payload).map_err(|e| e.to_string())?,
    );

    let request_id = request.id.clone();
    state.sidecar.send(&request).await?;

    // 对于非流式请求，返回请求 ID
    // 实际响应通过 Channel 接收
    Ok(request_id)
}

/// 发送流式对话请求
#[tauri::command]
pub async fn chat_stream(
    prompt: String,
    provider_id: Option<String>,
    model_id: Option<String>,
    session_id: Option<String>,
    on_event: Channel<StreamEvent>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // 检查服务状态
    let status = state.sidecar.status().await;
    if !matches!(status, ServiceStatus::Running) {
        return Err("Service is not running. Please start the service first.".to_string());
    }

    let payload = ChatPayload {
        prompt,
        provider_id,
        model_id,
        session_id,
    };

    let request = Request::new_stream(
        RequestType::Chat,
        serde_json::to_value(payload).map_err(|e| e.to_string())?,
    );

    let request_id = request.id.clone();

    // 注册 Channel
    state
        .sidecar
        .register_channel(request_id.clone(), on_event)
        .await;

    // 发送请求
    if let Err(e) = state.sidecar.send(&request).await {
        state.sidecar.unregister_channel(&request_id).await;
        return Err(e);
    }

    Ok(request_id)
}

/// 停止请求
#[tauri::command]
pub async fn stop(
    request_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let payload = StopPayload {
        request_id: request_id.clone(),
    };

    let request = Request::new(
        RequestType::Stop,
        serde_json::to_value(payload).map_err(|e| e.to_string())?,
    );

    state.sidecar.send(&request).await?;

    // 清理 Channel
    state.sidecar.unregister_channel(&request_id).await;

    Ok(())
}

/// 启动 Service
#[tauri::command]
pub async fn start_service(state: State<'_, AppState>) -> Result<(), String> {
    state.sidecar.start().await
}

/// 停止 Service
#[tauri::command]
pub async fn stop_service(state: State<'_, AppState>) -> Result<(), String> {
    state.sidecar.stop().await
}

/// 获取 Service 状态
#[tauri::command]
pub async fn service_status(state: State<'_, AppState>) -> Result<ServiceStatus, String> {
    Ok(state.sidecar.status().await)
}

/// 获取配置信息（从 Service 获取）
#[tauri::command]
pub async fn get_config(state: State<'_, AppState>) -> Result<Config, String> {
    // 检查服务状态
    let status = state.sidecar.status().await;
    if !matches!(status, ServiceStatus::Running) {
        return Err("Service is not running. Please start the service first.".to_string());
    }

    // 创建请求
    let request = Request::new(RequestType::GetConfig, serde_json::json!({}));
    let request_id = request.id.clone();

    // 先注册等待器，再发送请求（避免竞态条件）
    let rx = state.sidecar.register_waiter(&request_id).await;

    // 发送请求
    state.sidecar.send(&request).await?;

    // 等待配置响应
    let config_data = match tokio::time::timeout(std::time::Duration::from_secs(5), rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => {
            state.sidecar.unregister_waiter(&request_id).await;
            return Err("Response channel closed unexpectedly".to_string());
        }
        Err(_) => {
            state.sidecar.unregister_waiter(&request_id).await;
            return Err("Request timed out after 5s".to_string());
        }
    };

    // 解析配置
    let config: Config = serde_json::from_value(config_data?)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config)
}
