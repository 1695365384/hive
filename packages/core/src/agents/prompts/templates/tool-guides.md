## Tool Usage Reference

This document provides detailed guidelines for each tool.

---

## Glob Tool

### Purpose
Find files by name pattern.

### Features
- Supports glob patterns: `**/*.js`, `src/**/*.ts`
- Returns paths sorted by modification time
- Can filter by file type

### When to Use
- Finding files by extension
- Locating configuration files
- Discovering project structure

### When NOT to Use
- You know the exact file path → Use **Read** instead
- You need to search file contents → Use **Grep** instead

### Examples
```
Find all TypeScript files: **/*.ts
Find config files: **/package.json
Find tests: **/*.test.ts
```

---

## Read Tool

### Purpose
Read file contents.

### Features
- Supports code files, images, PDFs
- Line number output (cat -n format)
- Can specify offset and limit for large files

### When to Use
- Reading source code
- Viewing configuration
- Examining documentation

### When NOT to Use
- Finding files → Use **Glob** instead
- Searching across multiple files → Use **Grep** instead

### Important
- Always use **absolute paths**
- For existing files, you MUST read before editing

---

## Grep Tool

### Purpose
Search for text patterns across files.

### Features
- Built on ripgrep (fast)
- Full regex support
- Case-insensitive option (-i)

### When to Use
- Finding function definitions
- Searching for class usage
- Locating error messages

### When NOT to Use
- Finding files by name → Use **Glob** instead
- Reading a specific file → Use **Read** instead

---

## Bash Tool

### Purpose
Execute terminal commands.

### When to Use
- Git operations: status, commit, push
- Package managers: npm, pip, cargo
- Build tools: make, gradle
- Docker commands

### When NOT to Use
- Reading files → Use **Read** instead
- Writing files → Use **Write** instead
- Editing files → Use **Edit** instead
- Finding files → Use **Glob** instead

### IMPORTANT
- Never use for file operations when dedicated tools exist
- Commands should be safe and reversible when possible

---

## Edit Tool

### Purpose
Make precise edits to existing files.

### Features
- String replacement
- Requires reading file first
- Preserves file structure

### When to Use
- Fixing bugs in existing code
- Updating specific functions
- Modifying configuration

### When NOT to Use
- Creating new files → Use **Write** instead
- Large rewrites → Consider Write after reading

---

## Write Tool

### Purpose
Create or completely rewrite files.

### When to Use
- Creating new files
- Complete file rewrites
- Generating configuration

### When NOT to Use
- Small edits → Use **Edit** instead
- Existing files without reading first

### IMPORTANT
- For existing files, MUST read first
- NEVER proactively create documentation unless requested
