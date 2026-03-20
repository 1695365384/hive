import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import { getChatApi, type UnifiedChatEvent } from '../api/chatAdapter';

export function useChat() {
  const {
    messages,
    isLoading,
    error,
    requestId,
    addMessage,
    updateMessage,
    setLoading,
    setError,
    setRequestId,
    clearMessages,
  } = useChatStore();

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      // 清除之前的错误
      setError(null);

      // 添加用户消息
      const userMessage = {
        id: `user-${Date.now()}`,
        role: 'user' as const,
        content: content.trim(),
        timestamp: Date.now(),
      };
      addMessage(userMessage);

      // 创建助手消息占位符
      const assistantId = `assistant-${Date.now()}`;
      addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      });

      // 设置加载状态
      setLoading(true);

      let fullContent = '';
      let thinkingContent = '';

      try {
        const chatApi = getChatApi();

        // 处理事件
        const handleEvent = (event: UnifiedChatEvent) => {
          switch (event.type) {
            case 'text':
              if (event.content) {
                fullContent += event.content;
                updateMessage(assistantId, fullContent, true);
              }
              break;
            case 'thinking':
              if (event.content) {
                thinkingContent = event.content;
                console.log('[Thinking]', thinkingContent);
              }
              break;
            case 'tool':
              console.log('[Tool]', event.metadata);
              break;
            case 'progress':
              console.log('[Progress]', event.metadata);
              break;
            case 'error':
              setError(event.message || 'Unknown error');
              updateMessage(assistantId, fullContent || '发生错误', false);
              break;
            case 'done':
              updateMessage(assistantId, fullContent, false);
              break;
          }
        };

        // 调用 IPC API
        const result = await chatApi.chatStream({
          prompt: content,
          onEvent: handleEvent,
        });

        // 保存 requestId 用于取消
        setRequestId(result);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '请求失败';
        setError(errorMessage);
        updateMessage(assistantId, fullContent || errorMessage, false);
      } finally {
        setLoading(false);
        setRequestId(null);
      }
    },
    [
      isLoading,
      addMessage,
      updateMessage,
      setLoading,
      setError,
      setRequestId,
    ]
  );

  const stopGeneration = useCallback(async () => {
    if (requestId) {
      try {
        const chatApi = getChatApi();
        await chatApi.stop(requestId);
      } catch (err) {
        console.error('Failed to stop request:', err);
      }
    }
  }, [requestId]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
  };
}
