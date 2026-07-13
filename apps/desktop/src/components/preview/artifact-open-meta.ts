/** File open metadata passed from preview store to renderers. */
export type ArtifactOpenMeta = {
  name: string;
  path?: string;
  servedPath?: string;
  artifactSrc?: string;
  officeCliHint?: string;
};
