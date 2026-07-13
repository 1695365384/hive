export function preprocessFileLinks(text: string): string {
  return text.replace(
    /\[File: ([^\]]+)\] (\/[^\s<]+)/g,
    (_match, name, fullPath) => {
      const fileName = fullPath.split("/").pop() || fullPath;
      return `[${name}](http://127.0.0.1:4450/files/${fileName})`;
    }
  );
}
