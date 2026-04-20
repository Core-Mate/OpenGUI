# Trace ID Logger Module

本模块提供基于 trace_id 的日志追踪功能。

## 功能特性

- ✅ 自动为每个请求生成唯一的 trace_id
- ✅ 同一请求的所有日志自动注入相同的 trace_id
- ✅ 支持通过请求头传递 trace_id（用于跨服务追踪）
- ✅ 所有日志自动包含 trace_id 标识

## 核心组件

### TraceIdInterceptor

全局拦截器，负责：
- 为每个 HTTP 请求生成或提取 trace_id
- 将 trace_id 存储在 AsyncLocalStorage 中
- 收集请求上下文信息（userId, path, method 等）

### AppLogger

自定义 Logger 服务，负责：
- 在所有日志中自动注入 trace_id
- 提供标准的日志方法：log, error, warn, debug, verbose
- 提供 logWithMetadata 方法用于记录带元数据的日志

## 使用方法

### 基础使用

在任何 NestJS 服务中注入 `AppLogger`：

```typescript
import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/common/aliyun-log';

@Injectable()
export class YourService {
    constructor(private readonly logger: AppLogger) {
        this.logger.setContext(YourService.name);
    }

    async someMethod() {
        // 所有日志会自动包含 trace_id
        this.logger.log('This is a log message');
        this.logger.warn('This is a warning');
        this.logger.error('This is an error', error.stack);
    }
}
```

### 带元数据的日志

```typescript
this.logger.logWithMetadata('User action completed', {
    userId: '12345',
    action: 'purchase',
    amount: 99.99,
});
```

### 跨服务 Trace ID 传递

```typescript
import { getTraceId } from '@/common/aliyun-log';

async callDownstreamService() {
    const traceId = getTraceId();

    const response = await axios.get('https://api.example.com/endpoint', {
        headers: {
            'x-trace-id': traceId,  // 传递给下游服务
        },
    });
}
```

### 获取请求上下文

```typescript
import { getRequestContext } from '@/common/aliyun-log';

async someMethod() {
    const context = getRequestContext();
    console.log(context.traceId);    // 当前请求的 trace_id
    console.log(context.requestId);  // 请求 ID
    console.log(context.userId);     // 用户 ID
    console.log(context.path);       // 请求路径
    console.log(context.method);     // 请求方法
}
```

## Trace ID 生成规则

1. **优先使用请求头中的 trace_id**：
   - 从请求头 `x-trace-id` 或 `trace-id` 中读取
   - 用于跨服务调用链路追踪

2. **自动生成**：
   - 如果请求头中没有 trace_id，系统会自动生成 UUID v4 格式的 trace_id

## 日志格式

所有日志会自动添加 trace_id 前缀：

```
[TraceId: 550e8400-e29b-41d4-a716-446655440000] Your log message here
```

## 架构

```
HTTP Request
    │
    ▼
TraceIdInterceptor (生成/提取 trace_id)
    │
    ▼
AsyncLocalStorage (存储 trace_id 和上下文)
    │
    ▼
AppLogger (读取 trace_id 并注入到日志中)
    │
    ▼
Console Output (带 trace_id 的日志)
```

## 示例

```typescript
// 请求开始
[TraceId: abc-123] [WorkflowService] Starting workflow execution
[TraceId: abc-123] [PlannerAgent] Planning task steps
[TraceId: abc-123] [ExecutorAgent] Executing step 1
[TraceId: abc-123] [WorkflowService] Workflow completed

// 通过 trace_id 可以追踪整个请求链路
```

## 注意事项

1. **模块全局注册**：TraceIdInterceptor 已在 AppModule 中全局注册
2. **跨服务追踪**：调用下游服务时需要手动传递 trace_id
3. **非 HTTP 请求**：如果不在 HTTP 请求上下文中，trace_id 将为 undefined
