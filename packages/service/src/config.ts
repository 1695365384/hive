/**
 * 配置管理模块
 *
 * 负责 Service 的配置初始化、验证和默认值管理
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * 服务配置接口
 */
export interface ServiceConfig {
  /** Provider 配置文件路径（providers.json） */
  providersPath?: string;
  /** 默认提供商 ID */
  defaultProvider?: string;
  /** 默认 API Key（用于默认提供商） */
  defaultApiKey?: string;

  /** 会话存储目录 */
  sessionDir?: string;
  /** 自动恢复上次会话 */
  autoResume?: boolean;

  /** 工作空间路径 */
  workspace?: string;

  /** API 调用超时（毫秒） */
  apiTimeout?: number;
  /** 执行超时（毫秒） */
  executionTimeout?: number;
  /** 心跳间隔（毫秒） */
  heartbeatInterval?: number;
  /** 无进展超时（毫秒） */
  stallTimeout?: number;
}

/**
 * 配置验证结果
 */
export interface ValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息列表 */
  errors: string[];
  /** 警告信息列表 */
  warnings: string[];
}

/**
 * 获取默认工作空间目录
 */
function getDefaultWorkspace(): string {
  return path.join(getClaudeConfigDir(), 'workspace');
}

/**
 * 默认配置值
 */
const DEFAULT_CONFIG: Required<ServiceConfig> = {
  providersPath: '',
  defaultProvider: '',
  defaultApiKey: '',
  sessionDir: '',
  autoResume: false,
  workspace: '',  // 在 initializeConfig 中设置
  apiTimeout: 120000,       // 2 分钟
  executionTimeout: 600000, // 10 分钟
  heartbeatInterval: 30000, // 30 秒
  stallTimeout: 60000,      // 1 分钟
};

/**
 * 全局配置实例
 */
let globalConfig: Required<ServiceConfig> | null = null;

/**
 * 获取 AIClaw 配置目录
 */
function getClaudeConfigDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.aiclaw');
}

/**
 * 获取默认 providers.json 路径
 *
 * 查找优先级：
 * 1. 环境变量 AICLAW_PROVIDERS_PATH
 * 2. 当前工作目录下的 providers.json（项目目录/开发环境）
 * 3. Tauri 资源目录（生产环境）
 *    - macOS: app.app/Contents/Resources/
 *    - Windows/Linux: 可执行文件同级的 resources/
 * 4. ~/.aiclaw/providers.json（全局配置）
 */
function getDefaultProvidersPath(): string {
  // 1. 检查环境变量
  if (process.env.AICLAW_PROVIDERS_PATH) {
    return process.env.AICLAW_PROVIDERS_PATH;
  }

  // 2. 当前工作目录（开发环境）
  const cwdProvidersPath = path.join(process.cwd(), 'providers.json');
  if (fs.existsSync(cwdProvidersPath)) {
    return cwdProvidersPath;
  }

  // 3. Tauri 资源目录查找
  const exePath = process.execPath;
  const exeDir = path.dirname(exePath);

  
  // macOS: 可执行文件在 Contents/MacOS/，资源在 Contents/Resources/
  if (process.platform === 'darwin') {
    // 检查是否在 .app bundle 中
    if (exePath.includes('.app/Contents/MacOS/')) {
      const contentsDir = path.dirname(exeDir); // Contents
      const resourcesPath = path.join(contentsDir, 'Resources', 'providers.json');
      if (fs.existsSync(resourcesPath)) {
        return resourcesPath;
      }
    }
  }

  // Windows/Linux: 资源在可执行文件同级的 resources/ 目录
  const resourcesPath = path.join(exeDir, 'resources', 'providers.json');
  if (fs.existsSync(resourcesPath)) {
    return resourcesPath;
  }

  // 检查上级目录的 resources（某些打包结构）
  const parentDir = path.dirname(exeDir);
  const parentResourcesPath = path.join(parentDir, 'resources', 'providers.json');
  if (fs.existsSync(parentResourcesPath)) {
    return parentResourcesPath;
  }

  // 4. 回退到全局配置目录
  return path.join(getClaudeConfigDir(), 'providers.json');
}

/**
 * 获取默认会话目录
 */
function getDefaultSessionDir(): string {
  return path.join(getClaudeConfigDir(), 'sessions');
}

/**
 * 从环境变量读取配置
 */
function loadFromEnv(): Partial<ServiceConfig> {
  const config: Partial<ServiceConfig> = {};

  // Provider 相关
  if (process.env.AICLAW_PROVIDERS_PATH) {
    config.providersPath = process.env.AICLAW_PROVIDERS_PATH;
  }
  if (process.env.AICLAW_DEFAULT_PROVIDER) {
    config.defaultProvider = process.env.AICLAW_DEFAULT_PROVIDER;
  }
  if (process.env.AICLAW_API_KEY) {
    config.defaultApiKey = process.env.AICLAW_API_KEY;
  }

  // 会话相关
  if (process.env.AICLAW_SESSION_DIR) {
    config.sessionDir = process.env.AICLAW_SESSION_DIR;
  }
  if (process.env.AICLAW_AUTO_RESUME) {
    config.autoResume = process.env.AICLAW_AUTO_RESUME === 'true';
  }

  // 工作空间
  if (process.env.AICLAW_WORKSPACE) {
    config.workspace = process.env.AICLAW_WORKSPACE;
  }

  // 超时配置
  if (process.env.AICLAW_API_TIMEOUT) {
    const timeout = parseInt(process.env.AICLAW_API_TIMEOUT, 10);
    if (!isNaN(timeout)) {
      config.apiTimeout = timeout;
    }
  }
  if (process.env.AICLAW_EXECUTION_TIMEOUT) {
    const timeout = parseInt(process.env.AICLAW_EXECUTION_TIMEOUT, 10);
    if (!isNaN(timeout)) {
      config.executionTimeout = timeout;
    }
  }

  return config;
}

/**
 * 解析 providers.json 路径
 */
function resolveProvidersPath(providersPath?: string): string {
  if (!providersPath) {
    return getDefaultProvidersPath();
  }

  // 如果是相对路径，转换为绝对路径
  if (!path.isAbsolute(providersPath)) {
    return path.resolve(process.cwd(), providersPath);
  }

  return providersPath;
}

/**
 * 解析会话目录路径
 */
function resolveSessionDir(sessionDir?: string): string {
  if (!sessionDir) {
    return getDefaultSessionDir();
  }

  // 如果是相对路径，转换为绝对路径
  if (!path.isAbsolute(sessionDir)) {
    return path.resolve(process.cwd(), sessionDir);
  }

  return sessionDir;
}

/**
 * 确保目录存在
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 初始化配置
 *
 * 配置来源优先级（从高到低）：
 * 1. 传入的配置对象
 * 2. 环境变量（AICLAW_*）
 * 3. 默认值
 */
export async function initializeConfig(config?: ServiceConfig): Promise<void> {
  // 从环境变量加载
  const envConfig = loadFromEnv();

  // 合并配置：传入配置 > 环境变量 > 默认值
  const mergedConfig: Required<ServiceConfig> = {
    ...DEFAULT_CONFIG,
    ...envConfig,
    ...config,
  };

  // 解析路径
  mergedConfig.providersPath = resolveProvidersPath(mergedConfig.providersPath);
  mergedConfig.sessionDir = resolveSessionDir(mergedConfig.sessionDir);

  // 设置默认工作空间（使用用户数据目录，避免触发 Tauri 文件监听）
  if (!mergedConfig.workspace) {
    mergedConfig.workspace = getDefaultWorkspace();
  }

  // 确保工作空间是绝对路径
  if (mergedConfig.workspace && !path.isAbsolute(mergedConfig.workspace)) {
    mergedConfig.workspace = path.resolve(process.cwd(), mergedConfig.workspace);
  }

  // 确保工作空间目录存在
  ensureDir(mergedConfig.workspace);

  // 确保会话目录存在
  ensureDir(mergedConfig.sessionDir);

  globalConfig = mergedConfig;

  // 输出配置信息（调试用）
  console.error('[Config] Configuration initialized:');
  console.error(`  - Workspace: ${mergedConfig.workspace}`);
  console.error(`  - Session Dir: ${mergedConfig.sessionDir}`);
  console.error(`  - Providers Path: ${mergedConfig.providersPath}`);
  if (mergedConfig.defaultProvider) {
    console.error(`  - Default Provider: ${mergedConfig.defaultProvider}`);
  }
}

/**
 * 获取当前配置
 */
export function getConfig(): Required<ServiceConfig> {
  if (!globalConfig) {
    // 如果未初始化，使用默认配置
    const defaultConfig = {
      ...DEFAULT_CONFIG,
      providersPath: getDefaultProvidersPath(),
      sessionDir: getDefaultSessionDir(),
    };
    globalConfig = defaultConfig;
  }
  return globalConfig;
}

/**
 * 验证配置
 */
export function validateConfig(): ValidationResult {
  const config = getConfig();
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查工作空间
  if (!fs.existsSync(config.workspace)) {
    errors.push(`Workspace directory does not exist: ${config.workspace}`);
  }

  // 检查 providers.json
  if (config.providersPath && !fs.existsSync(config.providersPath)) {
    warnings.push(`Providers file not found: ${config.providersPath}`);
  }

  // 检查默认提供商配置
  if (config.defaultProvider && !config.defaultApiKey) {
    // 如果有默认提供商但没有 API Key，检查 providers.json 是否存在
    if (!config.providersPath || !fs.existsSync(config.providersPath)) {
      warnings.push(
        `Default provider "${config.defaultProvider}" specified but no API key provided and no providers.json found`
      );
    }
  }

  // 检查超时配置合理性
  if (config.apiTimeout <= 0) {
    errors.push('API timeout must be positive');
  }
  if (config.executionTimeout <= 0) {
    errors.push('Execution timeout must be positive');
  }
  if (config.heartbeatInterval <= 0) {
    errors.push('Heartbeat interval must be positive');
  }
  if (config.stallTimeout <= 0) {
    errors.push('Stall timeout must be positive');
  }

  // 超时关系检查
  if (config.apiTimeout > config.executionTimeout) {
    warnings.push(
      `API timeout (${config.apiTimeout}ms) is greater than execution timeout (${config.executionTimeout}ms)`
    );
  }
  if (config.stallTimeout < config.heartbeatInterval) {
    warnings.push(
      `Stall timeout (${config.stallTimeout}ms) is less than heartbeat interval (${config.heartbeatInterval}ms)`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 重置配置（用于测试）
 */
export function resetConfig(): void {
  globalConfig = null;
}

/**
 * 更新配置（部分更新）
 */
export function updateConfig(updates: Partial<ServiceConfig>): void {
  const currentConfig = getConfig();
  globalConfig = {
    ...currentConfig,
    ...updates,
  };
}

/**
 * 获取 AIClaw 配置目录
 */
export function getClaudeDir(): string {
  return getClaudeConfigDir();
}

/**
 * Provider 配置接口
 */
export interface ProviderConfig {
  id: string;
  name: string;
  models: Array<{
    id: string;
    name: string;
  }>;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * 从 providers.json 加载配置
 */
export async function loadProvidersConfig(): Promise<ProviderConfig[]> {
  const config = getConfig();
  const providersPath = config.providersPath;

  if (!providersPath) {
    console.error('[Config] No providers path configured');
    return [];
  }

  if (!fs.existsSync(providersPath)) {
    console.error(`[Config] Providers file not found: ${providersPath}`);
    return [];
  }

  try {
    const content = await fs.promises.readFile(providersPath, 'utf-8');
    const providers = JSON.parse(content);

    // 验证配置格式
    if (!Array.isArray(providers)) {
      console.error('[Config] Invalid providers.json: expected an array');
      return [];
    }

    // 过滤敏感信息（API Key）
    return providers.map((p: ProviderConfig) => ({
      id: p.id,
      name: p.name,
      models: p.models || [],
    }));
  } catch (error) {
    console.error(`[Config] Failed to load providers.json:`, error);
    return [];
  }
}
