import { describe, expect, it } from "vitest";
import {
  buildOfficePreviewQuery,
  encodeFilesUrl,
  parseStagedFilename,
  resolveArtifactHttpUrl,
  resolveArtifactLocalPath,
} from "./artifact-file";
import { fileExtension } from "./artifact-open-apps";

describe("encodeFilesUrl", () => {
  it("encodes CJK filenames in /files/ URLs", () => {
    const url = encodeFilesUrl("/files/abc123_PPT实力展示.pptx");
    expect(url).toBe(
      "http://127.0.0.1:4450/files/abc123_PPT%E5%AE%9E%E5%8A%9B%E5%B1%95%E7%A4%BA.pptx"
    );
    expect(url).not.toContain("实力");
  });

  it("encodes spaces in filenames", () => {
    const url = encodeFilesUrl("/files/my report.pptx");
    expect(url).toBe("http://127.0.0.1:4450/files/my%20report.pptx");
  });

  it("passes through absolute http URLs", () => {
    const url = encodeFilesUrl("http://example.com/file.pptx");
    expect(url).toBe("http://example.com/file.pptx");
  });

  it("does not double-encode already-encoded filenames", () => {
    const encoded = "/files/uuid_" + encodeURIComponent("汇报.pptx");
    const url = encodeFilesUrl(encoded);
    expect(url).toBe(`http://127.0.0.1:4450/files/uuid_${encodeURIComponent("汇报.pptx")}`);
    expect(url.match(/%25/g)?.length ?? 0).toBe(0);
  });
});

describe("parseStagedFilename", () => {
  it("decodes percent-encoded staged names", () => {
    expect(parseStagedFilename("/files/uuid_" + encodeURIComponent("汇报.pptx"))).toBe(
      "uuid_汇报.pptx"
    );
  });
});

describe("buildOfficePreviewQuery", () => {
  it("prefers servedPath over staged src", () => {
    const q = buildOfficePreviewQuery({
      src: "/files/uuid_汇报.pptx",
      servedPath: "/tmp/uuid_汇报.pptx",
    });
    expect(q).toMatch(/^path=/);
    expect(q).toContain(encodeURIComponent("/tmp/uuid_汇报.pptx"));
  });

  it("falls back to file= for staged src", () => {
    const q = buildOfficePreviewQuery({ src: "/files/uuid_汇报.pptx" });
    expect(q).toMatch(/^file=/);
    expect(q).toContain(encodeURIComponent("uuid_汇报.pptx"));
  });
});

describe("resolveArtifactHttpUrl", () => {
  it("returns encoded URL for staged src", () => {
    expect(resolveArtifactHttpUrl(undefined, "/files/uuid_汇报.pptx")).toMatch(
      /%E6%B1%87%E6%8A%A5/
    );
  });

  it("returns null when no src", () => {
    expect(resolveArtifactHttpUrl(undefined, undefined)).toBeNull();
  });
});

describe("resolveArtifactLocalPath", () => {
  it("prefers servedPath over path", () => {
    expect(
      resolveArtifactLocalPath({
        name: "a.docx",
        servedPath: "/tmp/staged.docx",
        path: "/workspace/a.docx",
      }),
    ).toBe("/tmp/staged.docx");
  });
});

describe("artifact-open-apps", () => {
  it("extracts file extension", () => {
    expect(fileExtension("report.docx")).toBe("docx");
    expect(fileExtension("noext")).toBe("");
  });
});
