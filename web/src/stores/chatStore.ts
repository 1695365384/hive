import { create } from 'zustand';
import type { Message } from '../types';

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  abortController: AbortController | null;

  // Actions
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string, isStreaming?: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setAbortController: (controller: AbortController | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  error: null,
  abortController: null,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  updateMessage: (id, content, isStreaming) =>
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, content, isStreaming } : msg
      ),
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  setAbortController: (controller) => set({ abortController: controller }),

  clearMessages: () => set({ messages: [], error: null }),
}));
