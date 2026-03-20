//! 通信协议定义
//!
//! 定义前端、Rust 后端和 Node.js Service 之间的通信协议

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// 请求类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequestType {
    /// 对话请求
    Chat,
    /// 探索请求
    Explore,
    /// 计划请求
    Plan,
    /// 工作流请求
    Workflow,
    /// 停止请求
    Stop,
    /// 获取配置
    GetConfig,
}

/// 请求结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    /// 请求 ID
    pub id: String,
    /// 请求类型
    #[serde(rename = "type")]
    pub request_type: RequestType,
    /// 请求参数
    pub payload: serde_json::Value,
    /// 是否流式请求
    #[serde(default)]
    pub stream: bool,
}

impl Request {
    /// 创建新请求
    pub fn new(request_type: RequestType, payload: serde_json::Value) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            request_type,
            payload,
            stream: false,
        }
    }

    /// 创建流式请求
    pub fn new_stream(request_type: RequestType, payload: serde_json::Value) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            request_type,
            payload,
            stream: true,
        }
    }

    /// 设置为流式请求
    pub fn with_stream(mut self, stream: bool) -> Self {
        self.stream = stream;
        self
    }
}

/// 流式事件类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StreamEventType {
    /// 思考中
    Thinking,
    /// 内容块
    Chunk,
    /// 工具调用
    ToolUse,
    /// 进度更新
    Progress,
    /// 错误
    Error,
    /// 完成
    Done,
}

/// 流式事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamEvent {
    /// 对应请求 ID
    pub id: String,
    /// 事件类型
    pub event: StreamEventType,
    /// 事件数据
    pub data: serde_json::Value,
}

impl StreamEvent {
    /// 创建新事件
    pub fn new(id: String, event: StreamEventType, data: serde_json::Value) -> Self {
        Self { id, event, data }
    }

    /// 创建思考事件
    pub fn thinking(id: &str, content: impl Into<String>) -> Self {
        Self::new(
            id.to_string(),
            StreamEventType::Thinking,
            serde_json::json!({ "content": content.into() }),
        )
    }

    /// 创建内容块事件
    pub fn chunk(id: &str, content: impl Into<String>) -> Self {
        Self::new(
            id.to_string(),
            StreamEventType::Chunk,
            serde_json::json!({ "content": content.into() }),
        )
    }

    /// 创建工具调用事件
    pub fn tool_use(id: &str, tool_name: &str, tool_input: serde_json::Value) -> Self {
        Self::new(
            id.to_string(),
            StreamEventType::ToolUse,
            serde_json::json!({
                "tool_name": tool_name,
                "tool_input": tool_input
            }),
        )
    }

    /// 创建进度事件
    pub fn progress(id: &str, current: usize, total: usize, message: &str) -> Self {
        Self::new(
            id.to_string(),
            StreamEventType::Progress,
            serde_json::json!({
                "current": current,
                "total": total,
                "message": message
            }),
        )
    }

    /// 创建错误事件
    pub fn error(id: &str, error: impl Into<String>) -> Self {
        Self::new(
            id.to_string(),
            StreamEventType::Error,
            serde_json::json!({ "error": error.into() }),
        )
    }

    /// 创建完成事件
    pub fn done(id: &str) -> Self {
        Self::new(id.to_string(), StreamEventType::Done, serde_json::json!({}))
    }
}

/// Service 状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ServiceStatus {
    /// 已停止
    Stopped,
    /// 启动中
    Starting,
    /// 运行中
    Running,
    /// 停止中
    Stopping,
    /// 错误
    Error,
}

impl Default for ServiceStatus {
    fn default() -> Self {
        Self::Stopped
    }
}

/// Chat 请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatPayload {
    /// 用户输入
    pub prompt: String,
    /// 提供商 ID（可选）
    pub provider_id: Option<String>,
    /// 模型 ID（可选）
    pub model_id: Option<String>,
    /// 会话 ID（可选）
    pub session_id: Option<String>,
}

/// Stop 请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopPayload {
    /// 要停止的请求 ID
    pub request_id: String,
}

/// 模型信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    /// 模型 ID
    pub id: String,
    /// 模型名称
    pub name: String,
}

/// 提供商信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    /// 提供商 ID
    pub id: String,
    /// 提供商名称
    pub name: String,
    /// 可用模型列表
    pub models: Vec<Model>,
}

/// Agent 类型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentType {
    /// Agent ID
    pub id: String,
    /// Agent 名称
    pub name: String,
    /// Agent 描述
    pub description: String,
}

/// 配置信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// 可用提供商列表
    pub providers: Vec<Provider>,
    /// 可用 Agent 列表
    pub agents: Vec<AgentType>,
}
