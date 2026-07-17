import type { ChatMessage, ContentPart } from "../types/chat";

export function patchAssistantMessage(
  messages: ChatMessage[],
  assistantMsgId: string | undefined,
  patch: (content: ContentPart[]) => ContentPart[],
): ChatMessage[] {
  if (messages.length === 0) return messages;
  let idx = assistantMsgId
    ? messages.findIndex((m) => m.id === assistantMsgId && m.role === "assistant")
    : -1;
  if (idx < 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === "assistant") {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return messages;
  const target = messages[idx]!;
  const nextContent = patch(target.content);
  if (nextContent === target.content) return messages;
  const next = messages.slice();
  next[idx] = { ...target, content: nextContent };
  return next;
}

export function appendContentPart(content: ContentPart[], part: ContentPart): ContentPart[] {
  const updated = content.slice();
  if (part.type === "text") {
    const lastPart = updated[updated.length - 1];
    if (lastPart?.type === "text") {
      updated[updated.length - 1] = { ...lastPart, text: lastPart.text + part.text };
    } else {
      updated.push(part);
    }
  } else if (part.type === "reasoning") {
    const lastPart = updated[updated.length - 1];
    if (lastPart?.type === "reasoning") {
      updated[updated.length - 1] = { ...lastPart, text: lastPart.text + part.text };
    } else {
      updated.push(part);
    }
  } else if (part.type === "office-progress") {
    const lastPart = updated[updated.length - 1];
    if (lastPart?.type === "office-progress") {
      updated[updated.length - 1] = part;
    } else {
      updated.push(part);
    }
  } else {
    updated.push(part);
  }
  return updated;
}
