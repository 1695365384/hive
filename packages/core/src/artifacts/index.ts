export {
  ARTIFACT_EXTENSIONS,
  CHAT_AUTO_EMIT_EXTENSIONS,
  isArtifactExtension,
  isExistingArtifactFile,
  isOfficeDocumentPath,
  isChatAutoEmitPath,
  shouldEmitArtifactToChat,
  extractArtifactPathsFromText,
  detectArtifactsFromToolCall,
} from './artifact-detector.js';
export { ArtifactEmitter, createArtifactEmitter, type EmitFileFn } from './ArtifactEmitter.js';
