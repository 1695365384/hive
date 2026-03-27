## ADDED Requirements

### Requirement: ILogger 定义在独立类型模块
`ILogger` 接口和 `noopLogger` 实例 SHALL 定义在 `packages/core/src/types/logger.ts` 中，不依赖任何其他模块。

#### Scenario: 从 types/logger 导入
- **WHEN** 模块需要使用 ILogger
- **THEN** 可以从 `../types/logger.js` 导入，无需依赖 plugins 模块

#### Scenario: 向后兼容导入
- **WHEN** 现有代码从 `../plugins/types.js` 导入 ILogger
- **THEN** 导入仍然有效（通过重新导出）

### Requirement: noopLogger 提供默认空实现
`noopLogger` SHALL 实现 `ILogger` 接口的所有方法，所有方法体为空操作。

#### Scenario: 使用 noopLogger 作为默认值
- **WHEN** 调用方不提供自定义 logger
- **THEN** 系统使用 noopLogger，不产生任何日志输出

### Requirement: types 模块作为共享类型层
`packages/core/src/types/` 目录 SHALL 作为跨模块共享类型的归属地，不包含运行时逻辑。

#### Scenario: 类型模块无运行时副作用
- **WHEN** 导入 `types/logger.js`
- **THEN** 不触发任何副作用（无文件 I/O、无网络请求、无全局状态修改）
