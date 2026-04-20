# 任务管理 API 对接文档

## 概述

本文档描述了 Mobile Agent V2 系统的任务管理 API，包括：
1. 任务卡片（UserTask）的增删改查
2. 任务执行（TaskExecution）的管理
3. Human-in-the-Loop 机制
4. 手动暂停/继续功能

**Base URL**: `/api`

**认证方式**: Bearer Token (在请求头中添加 `Authorization: Bearer <token>`)

---

## 一、任务卡片管理 API

### 1.1 创建任务

**Endpoint**: `POST /api/tasks`

**描述**: 创建一个新的用户任务卡片

**请求体**:
```json
{
    "taskName": "小红书发布动态",
    "taskDescription": "在小红书上发布一条关于今天天气很好的动态",
    "relatedPlatforms": ["XIAOHONGSHU"],
    "category": "CONTENT_PUBLISH"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| taskName | string | 是 | 任务名称，最大255字符 |
| taskDescription | string | 否 | 任务描述 |
| relatedPlatforms | string[] | 否 | 相关平台列表，见 [平台类型枚举](#平台类型枚举) |
| category | string | 否 | 任务类别，默认 `CUSTOM`，见 [任务类别枚举](#任务类别枚举) |

**响应** (201 Created):
```json
{
    "id": 1,
    "userId": 123,
    "taskName": "小红书发布动态",
    "taskDescription": "在小红书上发布一条关于今天天气很好的动态",
    "relatedPlatforms": ["XIAOHONGSHU"],
    "category": "CONTENT_PUBLISH",
    "totalExecutions": 0,
    "successCount": 0,
    "failCount": 0,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "publishedAt": null,
    "lastExecution": null,
    "isTemplate": false
}
```

---

### 1.2 获取任务列表

**Endpoint**: `GET /api/tasks`

**描述**: 获取当前用户的任务列表，支持分页和筛选

**查询参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| page | number | 否 | 1 | 页码 |
| pageSize | number | 否 | 20 | 每页数量 |
| category | string | 否 | - | 任务类别筛选 |
| platform | string | 否 | - | 平台筛选 |
| keyword | string | 否 | - | 搜索关键词 |

**响应** (200 OK):
```json
{
    "items": [
        {
            "id": 1,
            "userId": 123,
            "taskName": "小红书发布动态",
            "taskDescription": "在小红书上发布一条关于今天天气很好的动态",
            "relatedPlatforms": ["XIAOHONGSHU"],
            "category": "CONTENT_PUBLISH",
            "totalExecutions": 5,
            "successCount": 4,
            "failCount": 1,
            "createdAt": "2024-01-01T00:00:00.000Z",
            "updatedAt": "2024-01-01T00:00:00.000Z",
            "lastExecution": {
                "id": 10,
                "status": "FINISHED",
                "result": "SUCCEED",
                "finishedAt": "2024-01-02T00:00:00.000Z"
            },
            "isTemplate": false
        }
    ],
    "total": 50,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
}
```

---

### 1.3 获取任务详情

**Endpoint**: `GET /api/tasks/:id`

**描述**: 获取指定任务的详细信息

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 任务ID |

**响应** (200 OK):
```json
{
    "id": 1,
    "userId": 123,
    "taskName": "小红书发布动态",
    "taskDescription": "在小红书上发布一条关于今天天气很好的动态",
    "relatedPlatforms": ["XIAOHONGSHU"],
    "category": "CONTENT_PUBLISH",
    "totalExecutions": 5,
    "successCount": 4,
    "failCount": 1,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "lastExecution": {
        "id": 10,
        "status": "FINISHED",
        "result": "SUCCEED",
        "finishedAt": "2024-01-02T00:00:00.000Z"
    },
    "isTemplate": false
}
```

**错误响应** (404 Not Found):
```json
{
    "statusCode": 404,
    "message": "任务不存在"
}
```

---

### 1.4 更新任务

**Endpoint**: `PUT /api/tasks/:id`

**描述**: 更新指定任务的信息

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 任务ID |

**请求体**:
```json
{
    "taskName": "更新后的任务名称",
    "taskDescription": "更新后的任务描述",
    "relatedPlatforms": ["XIAOHONGSHU", "DOUYIN"],
    "category": "SOCIAL_INTERACT"
}
```

所有字段均为可选，只传需要更新的字段。

**响应** (200 OK): 返回更新后的任务对象

---

### 1.5 删除任务

**Endpoint**: `DELETE /api/tasks/:id`

**描述**: 删除指定任务

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 任务ID |

**响应** (200 OK):
```json
{
    "success": true,
    "message": "任务删除成功"
}
```

---

### 1.6 获取模板任务列表

**Endpoint**: `GET /api/tasks/templates`

**描述**: 获取系统预置的模板任务列表，这些任务是系统级别的示例任务，所有用户可见

**响应** (200 OK):
```json
[
    {
        "id": 1,
        "userId": 0,
        "taskName": "在小红书寻找租客",
        "taskDescription": "打开小红书，帮我找到在上海需要租房的人...",
        "relatedPlatforms": ["XIAOHONGSHU"],
        "category": "SOCIAL_INTERACT",
        "totalExecutions": 0,
        "successCount": 0,
        "failCount": 0,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "publishedAt": null,
        "lastExecution": null,
        "isTemplate": true
    },
    {
        "id": 2,
        "userId": 0,
        "taskName": "在小红书帮我找潜在的健身学员",
        "taskDescription": "打开小红书，帮我找到在上海对健身有需求的人...",
        "relatedPlatforms": ["XIAOHONGSHU"],
        "category": "SOCIAL_INTERACT",
        "totalExecutions": 0,
        "successCount": 0,
        "failCount": 0,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "publishedAt": null,
        "lastExecution": null,
        "isTemplate": true
    }
]
```

**说明**:
- 模板任务的 `userId` 为 0，表示系统级别任务
- 模板任务的 `isTemplate` 字段为 `true`
- 返回结果为数组（非分页），模板数量固定

---

## 二、任务执行 API

### 2.1 执行任务

**Endpoint**: `POST /api/tasks/:id/execute`

**描述**: 启动执行指定的任务，会创建一条 `TaskExecution` 记录

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 任务ID |

**请求体**:
```json
{
    "deviceId": "device_123",
    "taskDescriptionOverride": "临时修改的任务描述（可选）",
    "executionMode": "IMMEDIATE",
    "agentModelId": "uitars"
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| deviceId | string | 否 | - | 设备ID |
| taskDescriptionOverride | string | 否 | - | 覆盖任务描述（执行时临时修改） |
| executionMode | string | 否 | IMMEDIATE | 执行模式，见 [执行模式枚举](#执行模式枚举) |
| agentModelId | string | 否 | uitars | Agent模型ID |

**响应** (200 OK):
```json
{
    "success": true,
    "executionId": 100,
    "taskId": 1,
    "message": "任务执行已启动"
}
```

---

### 2.2 获取任务执行历史

**Endpoint**: `GET /api/tasks/:id/executions`

**描述**: 获取指定任务的执行历史记录

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 任务ID |

**查询参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| page | number | 否 | 1 | 页码 |
| pageSize | number | 否 | 20 | 每页数量 |
| status | string | 否 | - | 执行状态筛选 |
| result | string | 否 | - | 执行结果筛选 |

**响应** (200 OK):
```json
{
    "items": [
        {
            "id": 100,
            "taskId": 1,
            "userId": 123,
            "deviceId": "device_123",
            "executionMode": "IMMEDIATE",
            "executionStatus": "FINISHED",
            "statusMessage": null,
            "executionResult": "SUCCEED",
            "executionResultSummary": "成功发布动态",
            "errorMessage": null,
            "currentStep": null,
            "scheduledAt": null,
            "startedAt": "2024-01-01T00:00:00.000Z",
            "finishedAt": "2024-01-01T00:05:00.000Z",
            "tokenUsage": { "total": 1500 },
            "createdAt": "2024-01-01T00:00:00.000Z",
            "updatedAt": "2024-01-01T00:05:00.000Z"
        }
    ],
    "total": 10,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
}
```

---

### 2.3 获取执行详情

**Endpoint**: `GET /api/executions/:id`

**描述**: 获取指定执行记录的详细信息

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 执行记录ID |

**响应** (200 OK):
```json
{
    "id": 100,
    "taskId": 1,
    "userId": 123,
    "deviceId": "device_123",
    "executionMode": "IMMEDIATE",
    "executionStatus": "RUNNING",
    "statusMessage": "正在执行...",
    "executionResult": null,
    "executionResultSummary": null,
    "errorMessage": null,
    "currentStep": "点击发布按钮",
    "scheduledAt": null,
    "startedAt": "2024-01-01T00:00:00.000Z",
    "finishedAt": null,
    "tokenUsage": { "total": 500 },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:02:00.000Z"
}
```

---

## 三、执行控制 API

### 3.1 暂停执行

**Endpoint**: `PUT /api/executions/:id/pause`

**描述**: 手动暂停正在执行的任务。暂停后，执行状态变为 `USER_PAUSED`。

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 执行记录ID |

**响应** (200 OK):
```json
{
    "success": true,
    "message": "执行已暂停"
}
```

**错误响应** (400 Bad Request):
```json
{
    "statusCode": 400,
    "message": "无法暂停当前状态的执行"
}
```

**说明**: 只有状态为 `RUNNING` 的执行才能被暂停。

---

### 3.2 恢复执行

**Endpoint**: `PUT /api/executions/:id/resume`

**描述**: 恢复暂停的任务执行。支持以下两种场景：
1. 用户手动暂停后恢复（状态为 `USER_PAUSED`）
2. Agent 触发 `call_user` 后，用户操作完成后恢复（状态为 `SUSPENDED`）

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 执行记录ID |

**响应** (200 OK):
```json
{
    "success": true,
    "message": "执行已恢复"
}
```

**错误响应** (400 Bad Request):
```json
{
    "statusCode": 400,
    "message": "无法恢复当前状态的执行"
}
```

**说明**: 只有状态为 `USER_PAUSED` 或 `SUSPENDED` 的执行才能被恢复。

---

### 3.3 取消执行

**Endpoint**: `PUT /api/executions/:id/cancel`

**描述**: 取消正在执行或暂停的任务

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 执行记录ID |

**响应** (200 OK):
```json
{
    "success": true,
    "message": "执行已取消"
}
```

**错误响应** (400 Bad Request):
```json
{
    "statusCode": 400,
    "message": "无法取消当前状态的执行"
}
```

**说明**: 只有状态为 `RUNNING`、`SUSPENDED` 或 `USER_PAUSED` 的执行才能被取消。

---

### 3.4 批量取消执行

**Endpoint**: `PUT /api/executions/cancel-all`

**描述**: 批量取消当前用户的所有活动执行（状态为 RUNNING、SUSPENDED、USER_PAUSED 的执行）

**响应** (200 OK):
```json
{
    "success": true,
    "message": "成功取消 2 个执行，失败 0 个执行",
    "totalExecutions": 2,
    "cancelledExecutions": 2,
    "failedExecutions": 0,
    "details": [
        {
            "executionId": 100,
            "success": true,
            "message": "执行取消成功"
        },
        {
            "executionId": 101,
            "success": true,
            "message": "执行取消成功"
        }
    ]
}
```

**响应字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| success | boolean | 是否有执行被成功取消 |
| message | string | 操作结果描述 |
| totalExecutions | number | 活动执行总数 |
| cancelledExecutions | number | 成功取消的执行数 |
| failedExecutions | number | 取消失败的执行数 |
| details | array | 每个执行的取消详情（可选） |

**无活动执行时的响应**:
```json
{
    "success": true,
    "message": "没有需要取消的活动执行",
    "totalExecutions": 0,
    "cancelledExecutions": 0,
    "failedExecutions": 0
}
```

---

## 四、Human-in-the-Loop 机制

### 4.1 概述

当 Agent 在执行过程中遇到需要用户介入的情况（如登录、验证码、选择确认等），会触发 `call_user` action，此时：

1. 执行状态变为 `SUSPENDED`
2. Agent 暂停执行，等待用户操作
3. 用户完成操作后，调用恢复执行接口继续任务

### 4.2 触发场景

| 场景 | Agent 行为 | 用户操作 |
|------|-----------|---------|
| 需要登录 | 输出 `call_user(question='页面需要登录，请您手动登录')` | 用户登录后调用恢复接口 |
| 验证码 | 输出 `call_user(question='有验证码，请您手动输入')` | 用户输入验证码后调用恢复接口 |
| 需要确认 | 输出 `call_user(question='即将删除文件，是否继续？')` | 用户确认后调用恢复接口 |
| 信息不足 | 输出 `call_user(question='请问您需要下载哪个版本？')` | 用户回复后调用恢复接口 |

### 4.3 状态流转

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
                    ▼                                          │
              ┌──────────┐                                     │
              │  INITIAL │                                     │
              └────┬─────┘                                     │
                   │ 开始执行                                   │
                   ▼                                           │
              ┌──────────┐    用户暂停    ┌──────────────┐      │
              │ RUNNING  │ ────────────→ │ USER_PAUSED  │      │
              └────┬─────┘               └──────┬───────┘      │
                   │                           │ 用户恢复      │
                   │ ◀─────────────────────────┘               │
                   │                                           │
                   │ Agent 触发 call_user                      │
                   ▼                                           │
              ┌──────────┐                                     │
              │SUSPENDED │                                     │
              └────┬─────┘                                     │
                   │ 用户操作完成后恢复                          │
                   │                                           │
                   └───────────────────────────────────────────┘

                   │ 执行完成        │ 执行失败
                   ▼                 ▼
              ┌──────────┐      ┌──────────┐
              │ FINISHED │      │ FINISHED │
              │(SUCCEED) │      │(FAILED)  │
              └──────────┘      └──────────┘
```

### 4.4 客户端对接流程

1. **监听执行状态**: 客户端接收到 "wait_user" action 时，表示 Agent 需要用户介入

2. **获取 Agent 问题**: 从执行详情的 `actionInputs.content` 字段获取 Agent 的提示，参考数据结构如下：
    ```json
    ["action req",{"userId":"1","actionType":"call_user","actionInputs":{"start_x":0,"start_y":0,"end_x":0,"end_y":0,"content":"当前需要进行支付操作，涉及资金交易，需您亲自输入支付密码完成支付。","direction":"","app_name":""},"task_id":673}]
    ```

3. **展示给用户**: 在 UI 上展示 Agent 的问题，引导用户进行操作

4. **用户操作完成**: 用户完成操作后，调用 `PUT /api/executions/:id/resume` 恢复执行


---

## 五、枚举类型说明

### 平台类型枚举

| 值 | 说明 |
|---|---|
| XIAOHONGSHU | 小红书 |
| DOUYIN | 抖音 |
| KUAISHOU | 快手 |
| WECHAT | 微信 |
| GENERAL_APP | 通用应用 |
| OTHER | 其他 |

### 任务类别枚举

| 值 | 说明 |
|---|---|
| CONTENT_PUBLISH | 内容发布 |
| SOCIAL_INTERACT | 社交互动 |
| AUTO_REPLY | 自动回复 |
| DATA_COLLECT | 数据采集 |
| CUSTOM | 自定义 |

### 执行模式枚举

| 值 | 说明 |
|---|---|
| IMMEDIATE | 立即执行 |
| SCHEDULED | 定时执行 |
| RECURRING | 周期执行 |

### 执行状态枚举

| 值 | 说明 |
|---|---|
| INITIAL | 初始状态 |
| RUNNING | 执行中 |
| SUSPENDED | 挂起（Agent 触发 call_user 等待用户） |
| USER_PAUSED | 用户手动暂停 |
| FINISHED | 执行完成 |

### 执行结果枚举（TODO！！！！！ @Ben）

| 值 | 说明 |
|---|---|
| SUCCEED | 成功 |
| FAILED | 失败 |
| CANCELLED | 已取消 |
| TIMEOUT | 超时 |

---

## 六、错误码说明

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 / 无法执行当前操作 |
| 401 | 未授权 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

