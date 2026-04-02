import { useState, useCallback } from "react";

export interface UploadedFile {
  name: string;
  savedName: string;
  path: string;
  size: number;
  mimeType: string;
  type: "image" | "file";
  src: string;
}

const SERVER_BASE = "http://127.0.0.1:4450";

export function useFileUpload() {
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const uploadFile = useCallback(async (file: File): Promise<UploadedFile | null> => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${SERVER_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        console.error(`Upload failed: ${res.status}`);
        return null;
      }
      return await res.json();
    } catch (err) {
      console.error("Upload error:", err);
      return null;
    }
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    const results: UploadedFile[] = [];

    for (const file of Array.from(files)) {
      const result = await uploadFile(file);
      if (result) {
        results.push(result);
      }
    }

    setPendingFiles((prev) => [...prev, ...results]);
    setUploading(false);
  }, [uploadFile]);

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setPendingFiles([]);
  }, []);

  return { pendingFiles, uploading, addFiles, removeFile, clearFiles };
}
