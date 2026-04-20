# TOS 对象存储服务

这个模块提供了基于火山引擎 TOS (对象存储) 的图片上传和管理功能。

## 功能特性

- 📤 **图片上传**: 支持 Buffer 和 Base64 格式的图片上传
- 📥 **图片获取**: 根据 URI 或 URL 获取图片数据
- 🔗 **URL 生成**: 生成公共访问 URL 和预签名 URL
- 🗑️ **图片删除**: 删除存储的图片
- 🔍 **健康检查**: 检查 TOS 连接状态

## 环境配置

在 `.env` 文件中配置以下环境变量：

```env
# TOS 配置
TOS_REGION=cn-beijing
TOS_ENDPOINT=tos-s3-cn-beijing.volces.com
TOS_BUCKET_NAME=your-bucket-name
TOS_ACCESS_KEY_ID=your-access-key-id
TOS_ACCESS_KEY_SECRET=your-access-key-secret
```

## API 接口

### 1. 上传文件

```http
POST /tos/upload
Content-Type: multipart/form-data

file: [文件]
fileName: [可选] 自定义文件名
```

### 2. 上传 Base64 图片

```http
POST /tos/upload-base64
Content-Type: application/json

{
  "base64": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "fileName": "screenshot.png",
  "contentType": "image/png"
}
```

### 3. 获取图片

```http
GET /tos/image/{key}
```

返回图片的二进制数据，可直接在浏览器中显示。

### 4. 获取图片的 Base64 编码

```http
GET /tos/image-base64/{key}
```

返回：
```json
{
  "success": true,
  "base64": "iVBORw0KGgoAAAANS..."
}
```

### 5. 根据 URL 获取图片的 Base64 编码

```http
GET /tos/image-base64-by-url?url=https://example.com/image.png
```

### 6. 删除图片

```http
DELETE /tos/image/{key}
```

### 7. 获取公共 URL

```http
GET /tos/public-url/{key}
```

### 8. 获取预签名 URL

```http
GET /tos/signed-url/{key}?expires=3600
```

### 9. 健康检查

```http
GET /tos/health
```

## 在代码中使用

### 注入 TosService

```typescript
import { TosService } from 'src/tos/tos.service';

@Injectable()
export class YourService {
  constructor(private readonly tosService: TosService) {}

  async uploadScreenshot(base64Data: string) {
    const result = await this.tosService.uploadBase64Image(
      base64Data,
      `screenshot-${Date.now()}.png`,
      'image/png'
    );
    
    if (result.success) {
      console.log('上传成功:', result.url);
      return result.url;
    } else {
      console.error('上传失败:', result.error);
      throw new Error(result.error);
    }
  }

  async getImageData(uri: string) {
    const result = await this.tosService.getImageAsBase64(uri);
    
    if (result.success) {
      return result.base64;
    } else {
      throw new Error(result.error);
    }
  }
}
```

### 在 MobileOperator 中使用

```typescript
// 在构造函数中注入 TosService
constructor(
  private deviceId: string,
  private readonly socketGateway: SocketGateway,
  private readonly tosService: TosService,
) {}

// 截图时自动上传到 TOS
public async screenshot(): Promise<{ base64: string; scaleFactor: number }> {
  // ... 截图逻辑
  
  // 如果有 TOS 服务，使用 TOS 获取图片
  if (this.tosService) {
    const imageResult = await this.tosService.getImageAsBase64(screenshot_url);
    if (imageResult.success) {
      return {
        base64: imageResult.base64,
        scaleFactor: this.deviceInfo?.density || 1,
      };
    }
  }
  
  // 降级处理...
}
```

## 错误处理

所有方法都返回统一的结果格式：

```typescript
interface Result {
  success: boolean;
  data?: any;
  error?: string;
}
```

成功时 `success` 为 `true`，失败时为 `false` 并包含错误信息。

## 注意事项

1. **权限配置**: 确保 TOS 访问密钥有足够的权限
2. **存储桶配置**: 确保存储桶存在且配置正确
3. **网络连接**: 确保服务器能够访问 TOS 服务
4. **文件大小**: 注意上传文件的大小限制
5. **费用控制**: 合理设置文件的生命周期和访问权限

## 故障排除

### 1. 连接失败
- 检查网络连接
- 验证 TOS 配置信息
- 确认存储桶存在

### 2. 权限错误
- 检查访问密钥权限
- 验证存储桶访问策略

### 3. 上传失败
- 检查文件大小和格式
- 验证 Content-Type 设置
- 确认存储空间足够 