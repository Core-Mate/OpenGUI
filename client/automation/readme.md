## 自动化任务模块

### 一、接口方法说明

#### 1、初始化模块
```kotlin
    /**
     * 初始化
     * @param context 必须是ApplicationContext
     */
    fun init(context: Context)  
```

#### 2、获取无障碍权限
```kotlin
    /**
     * 获取无障碍服务
     */
    fun accessibilityService(): AccessibilityService?
```

#### 3、执行任务
```kotlin
     /**
     * 执行任务
     */
    fun processTask(context: Activity, param: AMDataContainer)
```

#### 4、任务回调

通过 addObserver 添加回调监听，回调方法如下：

```kotlin
    //任务开始
    fun onProcessTaskStart() {}

    /**
     * 任务暂停
     * @param isActive 是否主动暂停
     */
    fun onProcessTaskPause(isActive: Boolean = true) {}

    //任务恢复
    fun onProcessTaskResume() {}

    /**
     * 任务完成
     * @param isSuccess 是否成功
     * @param elapsedTime 耗时
     * @param exception 异常 (isSuccess = false 时候使用)
     * @param sucData 数据
     */
    fun onProcessTaskFinish(
        isSuccess: Boolean,
        elapsedTime: Long,
        exception: AMTaskException? = null,
        sucData: AMDataContainer? = null,
    ) {
    }

```

### 二、执行任务

调用方法如下：
```kotlin
    /**
     * 执行任务
     */
    fun processTask(context: Activity, param: AMDataContainer)
```

#### 1、抖音发布视频

AMDataContainer对应的参数：
* AMTaskBizType.TK_PUBLISH_VIDEO
* AMTkPublishParam:

```c
    data class AMTkPublishParam(
    //推广关键词
    var promotion: String? = null,
    //产品卖点
    var sellPoints: String? = null,
    //素材选择（默认前3个视频）
    var videoCount: Int? = 3
    )
```

#### 2.微信朋友圈点赞评论: 

AMDataContainer对应的参数：

* AMTaskBizType.WX_LIKE_COMMENT
* AMWxLikeCommentParam: 
```c
   data class AMWxLikeCommentParam(
    //事件类型
    var eventType: AMWxLikeCommentEventType = AMWxLikeCommentEventType.LIKE,
    //评论文字选择 (eventType = COMMENT 或者 LIKE_AND_COMMENT，使用)
    var wordNum: AMWxCommentWordNum = AMWxCommentWordNum.SHORT,
    //触达次数
    var count: Int = 1
    )
```

#### 2.自动回复微信、抖音、小红书:

AMDataContainer对应的参数：

* AMTaskBizType.COMMON_AUTO_REPLY
* AMWxLikeCommentParam:
```c
data class AMCommonAutoReplyParam(
    //结束时间
    var endTime: String? = null,
    //间隔多久切换平台监测(默认10分钟)
    var interval: Int = 10
)
```