import { AlertCircle, Trash2 } from 'lucide-react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import { useChat } from '../../hooks/useChat';

export function ChatContainer() {
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    stopGeneration,
    clearMessages,
  } = useChat();

  return (
    <div className="h-full flex flex-col">
      {/* 错误提示 */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 清空对话按钮 */}
      {messages.length > 0 && (
        <div className="px-4 pt-4 flex justify-end">
          <button
            onClick={clearMessages}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            清空对话
          </button>
        </div>
      )}

      {/* 消息列表 */}
      <MessageList messages={messages} />

      {/* 输入区域 */}
      <InputArea
        onSend={sendMessage}
        onStop={stopGeneration}
        isLoading={isLoading}
      />
    </div>
  );
}
