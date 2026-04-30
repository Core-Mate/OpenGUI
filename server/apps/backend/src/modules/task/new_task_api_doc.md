# Task Management API Integration Guide

## Overview

This document describes the Mobile Agent V2 task management API:

1. UserTask card CRUD
2. TaskExecution management
3. Human-in-the-loop handling
4. Manual pause and resume

**Base URL**: `/api`

**Authentication**: Bearer Token. Add `Authorization: Bearer <token>` to the request headers.

---

## 1. Task Card Management API

### 1.1 Create Task

**Endpoint**: `POST /api/tasks`

**Description**: Create a new user task card.

**Request Body**:

```json
{
  "taskName": "Post an update on Xiaohongshu",
  "taskDescription": "Post an update on Xiaohongshu about today's nice weather",
  "relatedPlatforms": ["XIAOHONGSHU"],
  "category": "CONTENT_PUBLISH"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| taskName | string | Yes | Task name, maximum 255 characters |
| taskDescription | string | No | Task description |
| relatedPlatforms | string[] | No | Related platforms; see platform enum |
| category | string | No | Task category, default `CUSTOM`; see task category enum |

**Response**: `201 Created`

### 1.2 Get Task List

**Endpoint**: `GET /api/tasks`

**Description**: Get the current user's task list with pagination and filters.

| Query | Type | Required | Default | Description |
|---|---|---|---|---|
| page | number | No | 1 | Page number |
| pageSize | number | No | 20 | Items per page |
| category | string | No | - | Task category filter |
| platform | string | No | - | Platform filter |
| keyword | string | No | - | Search keyword |

### 1.3 Get Task Details

**Endpoint**: `GET /api/tasks/:id`

**Description**: Get details for a specific task.

| Path Parameter | Type | Description |
|---|---|---|
| id | number | Task ID |

### 1.4 Update Task

**Endpoint**: `PUT /api/tasks/:id`

**Description**: Update a specific task. All fields are optional; send only the fields that should change.

```json
{
  "taskName": "Updated task name",
  "taskDescription": "Updated task description",
  "relatedPlatforms": ["XIAOHONGSHU", "DOUYIN"],
  "category": "SOCIAL_INTERACT"
}
```

### 1.5 Delete Task

**Endpoint**: `DELETE /api/tasks/:id`

**Description**: Delete a specific task.

**Response**:

```json
{
  "success": true,
  "message": "Task deleted"
}
```

### 1.6 Get Template Tasks

**Endpoint**: `GET /api/tasks/templates`

**Description**: Get built-in system template tasks. These are system-level examples visible to all users.

Notes:

- Template tasks use `userId = 0`.
- Template tasks have `isTemplate = true`.
- The response is an array, not a paginated object.

---

## 2. Task Execution API

### 2.1 Execute Task

**Endpoint**: `POST /api/tasks/:id/execute`

**Description**: Start execution for a task and create a `TaskExecution` record.

```json
{
  "deviceId": "device_123",
  "taskDescriptionOverride": "Temporary task description override",
  "executionMode": "IMMEDIATE",
  "agentModelId": "uitars"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| deviceId | string | No | - | Device ID |
| taskDescriptionOverride | string | No | - | Temporary task description override used for this execution |
| executionMode | string | No | IMMEDIATE | Execution mode; see execution mode enum |
| agentModelId | string | No | uitars | Agent model ID |

### 2.2 Get Task Execution History

**Endpoint**: `GET /api/tasks/:id/executions`

**Description**: Get execution history for a specific task.

| Query | Type | Required | Default | Description |
|---|---|---|---|---|
| page | number | No | 1 | Page number |
| pageSize | number | No | 20 | Items per page |
| status | string | No | - | Execution status filter |
| result | string | No | - | Execution result filter |

### 2.3 Get Execution Details

**Endpoint**: `GET /api/executions/:id`

**Description**: Get details for a specific execution record.

| Path Parameter | Type | Description |
|---|---|---|
| id | number | Execution record ID |

---

## 3. Execution Control API

### 3.1 Pause Execution

**Endpoint**: `PUT /api/executions/:id/pause`

**Description**: Manually pause a running task. The execution status becomes `USER_PAUSED`.

Only executions in `RUNNING` status can be paused.

### 3.2 Resume Execution

**Endpoint**: `PUT /api/executions/:id/resume`

**Description**: Resume a paused execution.

Supported cases:

1. User resumes after a manual pause, where status is `USER_PAUSED`.
2. User resumes after an Agent `call_user` interruption, where status is `SUSPENDED`.

Only executions in `USER_PAUSED` or `SUSPENDED` status can be resumed.

### 3.3 Cancel Execution

**Endpoint**: `PUT /api/executions/:id/cancel`

**Description**: Cancel a running or paused execution.

Only executions in `RUNNING`, `SUSPENDED`, or `USER_PAUSED` status can be cancelled.

### 3.4 Cancel All Executions

**Endpoint**: `PUT /api/executions/cancel-all`

**Description**: Cancel all active executions for the current user. Active statuses are `RUNNING`, `SUSPENDED`, and `USER_PAUSED`.

---

## 4. Human-in-the-Loop

### 4.1 Overview

When the Agent needs user intervention during execution, such as login, captcha, or confirmation, it emits a `call_user` action.

At that point:

1. Execution status becomes `SUSPENDED`.
2. The Agent pauses execution and waits for user action.
3. After the user completes the required action, call the resume endpoint to continue.

### 4.2 Common Triggers

| Scenario | Agent Behavior | User Action |
|---|---|---|
| Login required | Emit `call_user(content='Login is required. Please log in manually.')` | Resume after login |
| Captcha required | Emit `call_user(content='Captcha is required. Please enter it manually.')` | Resume after captcha input |
| Confirmation required | Emit `call_user(content='This action needs confirmation. Please confirm manually.')` | Resume after confirmation |
| Insufficient information | Emit `call_user(content='Which version should be downloaded?')` | Resume after user reply |

### 4.3 Status Flow

```text
INITIAL -> RUNNING -> FINISHED(SUCCEED)
                 \-> FINISHED(FAILED)
                 \-> USER_PAUSED -> RUNNING
                 \-> SUSPENDED -> RUNNING
```

### 4.4 Client Integration Flow

1. Listen for execution status changes. A `wait_user` or `call_user` action means the Agent needs user intervention.
2. Read the Agent prompt from `actionInputs.content` in execution details.
3. Show the prompt in the UI and guide the user to complete the required action.
4. After the user finishes, call `PUT /api/executions/:id/resume`.

---

## 5. Enums

### Platform Type

| Value | Description |
|---|---|
| XIAOHONGSHU | Xiaohongshu |
| DOUYIN | Douyin |
| KUAISHOU | Kuaishou |
| WECHAT | WeChat |
| GENERAL_APP | General app |
| OTHER | Other |

### Task Category

| Value | Description |
|---|---|
| CONTENT_PUBLISH | Content publishing |
| SOCIAL_INTERACT | Social interaction |
| AUTO_REPLY | Auto reply |
| DATA_COLLECT | Data collection |
| CUSTOM | Custom |

### Execution Mode

| Value | Description |
|---|---|
| IMMEDIATE | Execute immediately |
| SCHEDULED | Scheduled execution |
| RECURRING | Recurring execution |

### Execution Status

| Value | Description |
|---|---|
| INITIAL | Initial status |
| RUNNING | Running |
| SUSPENDED | Suspended after Agent call_user |
| USER_PAUSED | Manually paused by user |
| FINISHED | Finished |

### Execution Result

| Value | Description |
|---|---|
| SUCCEED | Succeeded |
| FAILED | Failed |
| CANCELLED | Cancelled |
| TIMEOUT | Timed out |

---

## 6. Error Codes

| HTTP Status | Description |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Invalid request parameters or invalid current operation |
| 401 | Unauthorized |
| 404 | Resource not found |
| 500 | Internal server error |
