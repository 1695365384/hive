import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import { chatStream } from '../services/api';

export function useChat() {
  const {
    messages,
    isLoading,
    error,
    abortController,
    addMessage,
    updateMessage,
    setLoading,
    setError,
    setAbortController,
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
      const controller = new AbortController();
      setAbortController(controller);

      let fullContent = '';
      try {
        await chatStream(
          content,
          (event) => {
            if (event.type === 'text' && event.content) {
              fullContent += event.content;
              updateMessage(assistantId, fullContent, true);
            } else if (event.type === 'error') {
              setError(event.message || 'Unknown error');
              updateMessage(assistantId, fullContent || '发生错误', false);
            } else if (event.type === 'done') {
              updateMessage(assistantId, fullContent, false);
            }
          },
          controller.signal
        );
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // 用户取消，不显示错误
          updateMessage(assistantId, fullContent + '\n\n[已取消]', false);
        } else {
          const errorMessage = err instanceof Error ? err.message : '请求失败';
          setError(errorMessage);
          updateMessage(assistantId, fullContent || errorMessage, false);
        }
      } finally {
        setLoading(false);
        setAbortController(null);
      }
    },
    [
      isLoading,
      addMessage,
      updateMessage,
      setLoading,
      setError,
      setAbortController,
    ]
  );

  const stopGeneration = useCallback(() => {
    if (abortController) {
      abortController.abort();
    }
  }, [abortController]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
  };
}
