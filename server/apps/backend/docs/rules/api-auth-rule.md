# Backend API 鉴权规范

本文档描述 Backend 项目中 API 接口的鉴权规范，基于 `@thallesp/nestjs-better-auth` 库与 Better-Auth 框架。

---

## 1. 认证架构概述

### 1.1 技术栈

| 组件 | 说明 |
|------|------|
| `better-auth` | 核心认证框架 |
| `@thallesp/nestjs-better-auth` | NestJS 集成库 |
| `better-auth/plugins/bearer` | Bearer Token 插件 |
| `better-auth/plugins/phoneNumber` | 手机号验证码登录插件 |

### 1.2 认证流程

```
+-------------+    POST /api/user-auth/send-otp     +-------------+
|   客户端    | ----------------------------------> |   Backend   |
|             |                                      |             |
|             |    { code: 123456 } (开发环境)       |             |
|             | <---------------------------------- |             |
|             |                                      |             |
|             |    POST /api/user-auth/verify-otp   |             |
|             | ----------------------------------> |             |
|             |                                      |             |
|             |    { token: "xxx", user: {...} }    |             |
|             | <---------------------------------- |             |
|             |                                      |             |
|             |    GET /api/xxx (Bearer Token)      |             |
|             | ----------------------------------> |             |
+-------------+                                      +-------------+
```

### 1.3 路由前缀说明

| 路由前缀 | 用途 | 说明 |
|----------|------|------|
| `/api/auth/*` | Better-Auth 内置路由 | 由 Better-Auth 框架自动处理 |
| `/api/user-auth/*` | 自定义认证接口 | 手机号登录、Session 管理等 |
| `/api/*` | 业务接口 | 需要鉴权的业务 API |

---

## 2. 全局认证守卫

### 2.1 默认行为

`@thallesp/nestjs-better-auth` 注册了**全局 AuthGuard**，默认所有路由都需要认证：

```typescript
// app.module.ts
import { AuthModule } from "@thallesp/nestjs-better-auth";

@Module({
  imports: [
    AuthModule.forRoot({ auth }),  // 自动注册全局 AuthGuard
  ],
})
export class AppModule {}
```

### 2.2 认证方式

客户端通过 `Authorization` Header 携带 Bearer Token：

```http
GET /api/xxx HTTP/1.1
Authorization: Bearer <token>
```

---

## 3. 装饰器使用规范

### 3.1 `@AllowAnonymous()` - 允许匿名访问

用于**完全公开**的接口，无需任何认证：

```typescript
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";

@Controller("user-auth")
export class AuthController {
  @AllowAnonymous()
  @Post("send-otp")
  async sendOtp(@Body() dto: SendOtpDto) {
    // 无需认证即可访问
  }
}
```

**适用场景**：
- 登录/注册相关接口
- 公开数据查询接口
- 健康检查接口

### 3.2 `@OptionalAuth()` - 可选认证

用于**认证可选**的接口，已登录用户可获取更多信息：

```typescript
import { OptionalAuth, Session, UserSession } from "@thallesp/nestjs-better-auth";

@Controller("articles")
export class ArticleController {
  @OptionalAuth()
  @Get(":id")
  async getArticle(
    @Param("id") id: string,
    @Session() session: UserSession | null,
  ) {
    // session 可能为 null（未登录）或包含用户信息（已登录）
    if (session) {
      // 已登录用户可看到更多内容
    }
  }
}
```

### 3.3 `@Roles()` - 角色权限控制

用于**特定角色**才能访问的接口：

```typescript
import { Roles } from "@thallesp/nestjs-better-auth";

@Controller("admin")
export class AdminController {
  @Roles(["admin"])
  @Get("dashboard")
  async getDashboard() {
    // 仅 admin 角色可访问
  }
}
```

### 3.4 `@Session()` - 获取用户会话

用于获取当前登录用户的会话信息：

```typescript
import { Session, UserSession } from "@thallesp/nestjs-better-auth";

@Controller("users")
export class UserController {
  @Get("profile")
  async getProfile(@Session() session: UserSession) {
    return {
      userId: session.user.id,
      email: session.user.email,
    };
  }
}
```

### 3.5 类级别装饰器

装饰器可应用于整个 Controller：

```typescript
@AllowAnonymous()  // 整个控制器的接口都允许匿名访问
@Controller("public")
export class PublicController {
  // 所有方法都无需认证
}

@Roles(["admin"])  // 整个控制器需要 admin 角色
@Controller("admin")
export class AdminController {
  // 所有方法都需要 admin 角色
}
```

---

## 4. WebSocket 鉴权规范

### 4.1 连接认证

WebSocket 连接在握手阶段进行认证，通过 `auth.token` 传递 Bearer Token：

**客户端示例**：
```javascript
const socket = io("ws://localhost:7777", {
  auth: {
    token: "Bearer <your-jwt-token>"
  }
});
```

### 4.2 服务端验证

`SocketAuthMiddleware` 使用 Better-Auth API 验证 Token：

```typescript
// socket-auth.middleware.ts
const headers = new Headers({
  Authorization: `Bearer ${token}`,
});
const session = await auth.api.getSession({ headers });

if (!session) {
  return next(new Error("Invalid authentication token"));
}

// 将用户信息附加到 socket
(socket as AuthenticatedSocket).user = session.user;
(socket as AuthenticatedSocket).userId = session.user.id;
```

### 4.3 获取用户信息

在 Gateway 中通过 `client.user` 获取用户信息：

```typescript
@WebSocketGateway()
export class ChatGateway {
  @SubscribeMessage("message")
  handleMessage(@ConnectedSocket() client: AuthenticatedSocket) {
    const userId = client.userId;
    const user = client.user;
    // ...
  }
}
```

---

## 5. SSE 鉴权规范

### 5.1 连接认证

SSE 连接通过 URL 查询参数传递 Token：

```
GET /api/sse/connect?token=<your-jwt-token>
```

### 5.2 服务端验证

```typescript
// sse.controller.ts
@AllowAnonymous()  // SSE 端点需要自行处理认证
@Get("connect")
async connect(@Query("token") token: string, @Res() response: Response) {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
  });
  const session = await auth.api.getSession({ headers });

  if (!session) {
    throw new UnauthorizedException("Invalid or expired token");
  }

  const userId = Number(session.user.id);
  // 创建 SSE 连接...
}
```

---

## 6. 最佳实践

### 6.1 接口鉴权决策树

```
新建接口 --> 需要认证吗？
              |
              +-- 否 --> 使用 @AllowAnonymous()
              |
              +-- 是 --> 认证是否可选？
                          |
                          +-- 是 --> 使用 @OptionalAuth()
                          |
                          +-- 否 --> 需要特定角色吗？
                                      |
                                      +-- 是 --> 使用 @Roles(["xxx"])
                                      |
                                      +-- 否 --> 无需装饰器（默认需要认证）
```

### 6.2 接口分类规范

| 接口类型 | 装饰器 | 示例 |
|----------|--------|------|
| 登录/注册 | `@AllowAnonymous()` | `/api/user-auth/send-otp` |
| 公开数据 | `@AllowAnonymous()` | `/api/public/config` |
| 普通业务 | 无（默认） | `/api/chat/sessions` |
| 可选认证 | `@OptionalAuth()` | `/api/articles/:id` |
| 管理后台 | `@Roles(["admin"])` | `/api/admin/users` |

### 6.3 错误处理

认证失败时返回标准 HTTP 状态码：

| 状态码 | 说明 | 场景 |
|--------|------|------|
| 401 Unauthorized | 未认证 | Token 缺失或无效 |
| 403 Forbidden | 无权限 | 角色不满足、租户无效 |

### 6.4 租户验证

对于多租户系统，在业务逻辑中验证用户租户状态：

```typescript
// 在 AuthService 中调用
await this.authService.validateUserTenant(user.tenant_id);
```

验证内容：
- 租户是否存在
- 租户是否被删除
- 租户是否被禁用
- 租户是否过期

---

## 7. 代码示例

### 7.1 完整的 Controller 示例

```typescript
import { Controller, Get, Post, Body, Param } from "@nestjs/common";
import {
  AllowAnonymous,
  OptionalAuth,
  Roles,
  Session,
  UserSession,
} from "@thallesp/nestjs-better-auth";

@Controller("example")
export class ExampleController {
  // 公开接口 - 无需认证
  @AllowAnonymous()
  @Get("public")
  async publicEndpoint() {
    return { message: "This is public" };
  }

  // 需要认证的接口 - 默认行为
  @Get("protected")
  async protectedEndpoint(@Session() session: UserSession) {
    return { userId: session.user.id };
  }

  // 可选认证接口
  @OptionalAuth()
  @Get("optional")
  async optionalEndpoint(@Session() session: UserSession | null) {
    return {
      authenticated: !!session,
      userId: session?.user.id,
    };
  }

  // 需要 admin 角色
  @Roles(["admin"])
  @Get("admin-only")
  async adminEndpoint() {
    return { message: "Admin only" };
  }
}
```

### 7.2 获取用户信息的多种方式

```typescript
import { Controller, Get, Request } from "@nestjs/common";
import { Session, UserSession } from "@thallesp/nestjs-better-auth";
import type { Request as ExpressRequest } from "express";

@Controller("users")
export class UserController {
  // 方式 1: 使用 @Session() 装饰器
  @Get("me")
  async getMe(@Session() session: UserSession) {
    return session.user;
  }

  // 方式 2: 通过 Request 对象
  @Get("profile")
  async getProfile(@Request() req: ExpressRequest) {
    return {
      session: req.session,
      user: req.user,
    };
  }
}
```

---

## 8. 常见问题

### Q1: 为什么自定义认证接口使用 `/api/user-auth` 而不是 `/api/auth`？

Better-Auth 会拦截所有 `/api/auth/*` 的请求，与自定义 Controller 冲突。因此使用 `/api/user-auth` 前缀避免冲突。

### Q2: Token 过期时间是多久？

Session 过期时间为 7 天，配置在 `lib/auth.ts`：

```typescript
session: {
  expiresIn: 60 * 60 * 24 * 7,  // 7 天
  updateAge: 60 * 60 * 24,       // 每天更新
}
```

---

## 9. 相关文档

- [NestJS Better-Auth 集成文档](../../../../docs/better-auth/nestjs-integration.md)
- [Bearer Token 认证](../../../../docs/better-auth/bearer-token-auth.md)
