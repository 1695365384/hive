import { describe, expect, it } from "vitest";
import { collectSessionArtifacts } from "./ArtifactsStrip";
import type { ChatMessage } from "../../types/chat";

describe("collectSessionArtifacts", () => {
  it("keeps unique Office/PDF deliverables and skips images", () => {
    const messages: ChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        content: [
          {
            type: "file-attachment",
            name: "slide1.png",
            size: 10,
            mimeType: "image/png",
            path: "/tmp/slide1.png",
          },
          {
            type: "file-attachment",
            name: "deck.pptx",
            size: 100,
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            path: "/tmp/deck.pptx",
            src: "/files/deck.pptx",
          },
        ],
      },
      {
        id: "a2",
        role: "assistant",
        content: [
          {
            type: "file-attachment",
            name: "deck.pptx",
            size: 120,
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            path: "/tmp/deck.pptx",
            src: "/files/deck.pptx",
          },
          {
            type: "file-attachment",
            name: "notes.docx",
            size: 50,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            path: "/tmp/notes.docx",
          },
        ],
      },
    ];

    const arts = collectSessionArtifacts(messages);
    expect(arts.map((a) => a.name).sort()).toEqual(["deck.pptx", "notes.docx"]);
    expect(arts.find((a) => a.name === "deck.pptx")?.previewType).toBe("ppt");
  });

  it("ignores user uploads", () => {
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        content: [
          {
            type: "file-attachment",
            name: "input.pptx",
            size: 1,
            mimeType: "application/octet-stream",
            path: "/tmp/input.pptx",
          },
        ],
      },
    ];
    expect(collectSessionArtifacts(messages)).toEqual([]);
  });
});
