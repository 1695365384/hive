//! 消息桥接
//!
//! 负责通过 WebSocket 与 Service 通信，并将消息转发到对应的 Tauri Channel

use crate::protocol::{Request, StreamEvent, StreamEventType};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex, RwLock};
use tokio_tungstenite::{connect_async, tungstenite::Message as WsMessage};
use tracing::{debug, error, info, warn};

/// WebSocket 请求帧
#[derive(Debug, serde::Serialize)]
struct WsRequestFrame {
    kind: &'static str,
    data: Request,
}

/// WebSocket 事件帧
#[derive(Debug, serde::Deserialize)]
struct WsEventFrame {
    kind: String,
    data: StreamEvent,
}

/// 响应等待器
struct ResponseWaiter {
    /// 用于发送响应
    tx: Mutex<Option<oneshot::Sender<Result<Value, String>>>>,
    /// 累积的 chunk 数据
    chunks: Mutex<Vec<Value>>,
}

/// WebSocket 连接状态
struct WsConnection {
    /// WebSocket 发送器
    tx: Mutex<
        futures_util::stream::SplitSink<
            tokio_tungstenite::WebSocketStream<
                tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
            >,
            WsMessage,
        >,
    >,
    /// WebSocket 接收器
    rx: Mutex<
        Option<
            futures_util::stream::SplitStream<
                tokio_tungstenite::WebSocketStream<
                    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
                >,
            >,
        >,
    >,
}

/// 消息桥接器
pub struct MessageBridge {
    /// WebSocket 连接
    ws: RwLock<Option<Arc<WsConnection>>>,
    /// 请求 ID -> Channel 映射
    channels: RwLock<HashMap<String, tauri::ipc::Channel<StreamEvent>>>,
    /// 请求 ID -> 响应等待器映射（用于非流式请求）
    waiters: RwLock<HashMap<String, Arc<ResponseWaiter>>>,
}

impl MessageBridge {
    /// 创建新的消息桥接器
    pub fn new() -> Self {
        Self {
            ws: RwLock::new(None),
            channels: RwLock::new(HashMap::new()),
            waiters: RwLock::new(HashMap::new()),
        }
    }

    /// 连接到 WebSocket 服务器
    pub async fn connect(&self, url: &str) -> Result<(), String> {
        info!("Connecting to WebSocket: {}", url);

        let (ws_stream, _) = connect_async(url)
            .await
            .map_err(|e| format!("Failed to connect WebSocket: {}", e))?;

        let (tx, rx) = ws_stream.split();

        let connection = Arc::new(WsConnection {
            tx: Mutex::new(tx),
            rx: Mutex::new(Some(rx)),
        });

        *self.ws.write().await = Some(connection);

        info!("WebSocket connected successfully");
        Ok(())
    }

    /// 断开 WebSocket 连接
    pub async fn disconnect(&self) {
        let mut ws_guard = self.ws.write().await;
        if let Some(ws) = ws_guard.take() {
            // 尝试关闭连接
            let mut tx = ws.tx.lock().await;
            let _ = tx.close().await;
            info!("WebSocket disconnected");
        }
    }

    /// 发送请求
    pub async fn send_request(&self, request: &Request) -> Result<(), String> {
        let ws_guard = self.ws.read().await;
        let ws = ws_guard
            .as_ref()
            .ok_or_else(|| "WebSocket not connected".to_string())?;

        let frame = WsRequestFrame {
            kind: "request",
            data: request.clone(),
        };

        let json = serde_json::to_string(&frame)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        let mut tx = ws.tx.lock().await;
        tx.send(WsMessage::Text(json))
            .await
            .map_err(|e| format!("Failed to send WebSocket message: {}", e))?;

        debug!("Sent request via WebSocket: {:?}", request.id);
        Ok(())
    }

    /// 接收一个事件
    pub async fn recv_event(&self) -> Result<Option<StreamEvent>, String> {
        let ws_guard = self.ws.read().await;

        let ws = match ws_guard.as_ref() {
            Some(ws) => ws,
            None => return Ok(None),
        };

        let mut rx_guard = ws.rx.lock().await;
        let rx = match rx_guard.as_mut() {
            Some(rx) => rx,
            None => return Ok(None),
        };

        match rx.next().await {
            Some(Ok(WsMessage::Text(text))) => {
                let frame: WsEventFrame = serde_json::from_str(&text)
                    .map_err(|e| format!("Failed to parse WebSocket message: {}", e))?;

                if frame.kind == "event" {
                    Ok(Some(frame.data))
                } else {
                    debug!("Ignoring non-event WebSocket frame: {}", frame.kind);
                    Ok(None)
                }
            }
            Some(Ok(WsMessage::Ping(_))) => {
                // 忽略 ping
                Ok(None)
            }
            Some(Ok(WsMessage::Pong(_))) => {
                // 忽略 pong
                Ok(None)
            }
            Some(Ok(WsMessage::Close(_))) => {
                info!("WebSocket close frame received");
                Ok(None)
            }
            Some(Err(e)) => {
                error!("WebSocket error: {}", e);
                Err(format!("WebSocket error: {}", e))
            }
            None => {
                info!("WebSocket stream ended");
                Ok(None)
            }
            _ => Ok(None),
        }
    }

    /// 注册 Channel
    pub async fn register_channel(
        &self,
        request_id: String,
        channel: tauri::ipc::Channel<StreamEvent>,
    ) {
        let mut channels = self.channels.write().await;
        channels.insert(request_id.clone(), channel);
        debug!("Registered channel for request: {}", request_id);
    }

    /// 取消注册 Channel
    pub async fn unregister_channel(&self, request_id: &str) {
        let mut channels = self.channels.write().await;
        channels.remove(request_id);
        debug!("Unregistered channel for request: {}", request_id);
    }

    /// 注册响应等待器（用于非流式请求）
    pub async fn register_waiter(
        &self,
        request_id: String,
    ) -> oneshot::Receiver<Result<Value, String>> {
        let (tx, rx) = oneshot::channel();
        let waiter = Arc::new(ResponseWaiter {
            tx: Mutex::new(Some(tx)),
            chunks: Mutex::new(Vec::new()),
        });

        let mut waiters = self.waiters.write().await;
        waiters.insert(request_id, waiter);
        debug!("Registered waiter for request");
        rx
    }

    /// 取消注册响应等待器
    pub async fn unregister_waiter(&self, request_id: &str) {
        let mut waiters = self.waiters.write().await;
        waiters.remove(request_id);
        debug!("Unregistered waiter for request");
    }

    /// 发送事件到对应的 Channel
    pub async fn send_event(&self, event: &StreamEvent) -> Result<(), String> {
        // 系统事件不发送到 channel
        if event.id == "system" {
            debug!("Received system event: {:?}", event.event);
            return Ok(());
        }

        // 首先检查是否有等待器
        {
            let waiters = self.waiters.read().await;
            if let Some(waiter) = waiters.get(&event.id) {
                match event.event {
                    StreamEventType::Chunk => {
                        // 累积 chunk 数据
                        let mut chunks = waiter.chunks.lock().await;
                        chunks.push(event.data.clone());
                    }
                    StreamEventType::Done => {
                        // 完成时，合并所有 chunks 并发送响应
                        let chunks = {
                            let mut ch = waiter.chunks.lock().await;
                            std::mem::take(&mut *ch)
                        };
                        // 如果只有一个 chunk，直接使用它的数据
                        let result = if chunks.len() == 1 {
                            Ok(chunks.into_iter().next().unwrap())
                        } else {
                            // 多个 chunks，合并为数组
                            Ok(serde_json::json!(chunks))
                        };
                        // 取出 sender 并发送
                        let tx = {
                            let mut sender = waiter.tx.lock().await;
                            sender.take()
                        };
                        if let Some(tx) = tx {
                            let _ = tx.send(result);
                        }
                        // 需要在 drop waiters 后移除
                        drop(waiters);
                        self.unregister_waiter(&event.id).await;
                    }
                    StreamEventType::Error => {
                        let error_msg = event
                            .data
                            .get("error")
                            .and_then(|v| v.as_str())
                            .unwrap_or("Unknown error")
                            .to_string();
                        // 取出 sender 并发送
                        let tx = {
                            let mut sender = waiter.tx.lock().await;
                            sender.take()
                        };
                        if let Some(tx) = tx {
                            let _ = tx.send(Err(error_msg));
                        }
                        drop(waiters);
                        self.unregister_waiter(&event.id).await;
                    }
                    _ => {}
                }
                return Ok(());
            }
        }

        // 没有 waiter，检查是否有 channel
        let channels = self.channels.read().await;

        if let Some(channel) = channels.get(&event.id) {
            channel
                .send(event.clone())
                .map_err(|e| format!("Failed to send event: {}", e))?;
            debug!("Sent event to channel: {} -> {:?}", event.id, event.event);
        } else {
            warn!("No channel registered for request: {}", event.id);
        }

        Ok(())
    }

    /// 清理所有已完成的 Channel
    pub async fn cleanup_completed(&self) {
        let channels = self.channels.read().await;
        debug!("Current active channels: {}", channels.len());
    }
}

impl Default for MessageBridge {
    fn default() -> Self {
        Self::new()
    }
}
