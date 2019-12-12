# 利用 FC + OSS 快速搭建 Serverless 实时按需图像处理服务

## 简介
随着具有不同屏幕尺寸和分辨率设备的爆炸式增长，开发人员经常需要提供各种尺寸的图像，从而确保良好的用户体验。目前比较常见的做法是预先为一份图像存放多份具有不同尺寸的副本，在前端根据用户设备的 media 信息来请求特定的图像副本。

预先为一份图像存放多份具有不同尺寸副本的行为，经常是通过 [阿里云函数计算 FC](https://statistics.functioncompute.com/?title=%E5%88%A9%E7%94%A8%20FC%20%2B%20OSS%20%E5%BF%AB%E9%80%9F%E6%90%AD%E5%BB%BA%20Serverless%20%E5%AE%9E%E6%97%B6%E6%8C%89%E9%9C%80%E5%9B%BE%E5%83%8F%E5%A4%84%E7%90%86%E6%9C%8D%E5%8A%A1&author=zechen&url=https://fc.console.aliyun.com/) 以及阿里云对象存储 OSS 两大产品实现的。用户事先为 [FC](https://statistics.functioncompute.com/?title=%E5%88%A9%E7%94%A8%20FC%20%2B%20OSS%20%E5%BF%AB%E9%80%9F%E6%90%AD%E5%BB%BA%20Serverless%20%E5%AE%9E%E6%97%B6%E6%8C%89%E9%9C%80%E5%9B%BE%E5%83%8F%E5%A4%84%E7%90%86%E6%9C%8D%E5%8A%A1&author=zechen&url=https://fc.console.aliyun.com/) 中的函数设置对象存储触发器，当在存储桶中创建了新对象（即 putObject 行为，此处指在 OSS bucket 中存放了图像），通过 OSS 触发器来触发函数对刚刚存放的图像进行处理，处理成不同尺寸的副本后，将这些副本存放进 OSS bucket。

上述方法的特点是预先处理，如果要处理的图像尺寸较多，那么当图像数量非常大的时候，会占用很多存储空间。假设要处理的图像尺寸数目为 x、图像数量为 y、平均每份图像的大小为 z，那么要占用的存储空间为 x * y * z。

__动态调整图像大小__
为了避免无用的图像占用存储空间，可以使用动态调整图像大小的方法。在 OSS bucket 中预先只为每份图像存放一个副本，当前端根据用户设备的 media 信息来请求特定尺寸图像副本时，再生成相关图像。

![](https://img.alicdn.com/tfs/TB1lqocqXY7gK0jSZKzXXaikpXa-498-393.png)

步骤：
1. 用户通过浏览器请求 OSS bucket 中特定的图像资源，假设为 800 * 600 的 image.jpg。
2. OSS bucket 中没有相关的资源，将该请求重定向至生成特定尺寸图像副本的 api 地址。
3. 浏览器根据重定向规则去请求调整图像大小的 api 地址。
4. 触发函数计算的函数来执行相关请求。
5. 函数从 OSS bucket 中下载到原始图像 image.jpg，根据请求内容生成调整后的图像，上传至 OSS bucket 中。
6. 将请求重定向至图像在 OSS bucket 中的位置。
7. 浏览器根据重定向规则去 OSS bucket 中请求调整大小后的图像。

上述方法的特点是：
1. 即时处理。
2. 降低存储成本。
3. 无需运维。

## 实践
### 1. 创建并配置 OSS
- 在 OSS 控制台 中，创建一个新的 Bucket，读写权限选择公共读 (用于本教程示例，可之后更改)。

  ![](https://img.alicdn.com/tfs/TB170gdqkL0gK0jSZFtXXXQCXXa-1238-1476.png)
   
- 在 Bucket 的基础设置中，设置镜像回源。
   - 回源类型：重定向
   - 回源条件：HTTP 状态码 404 
   - 回源地址：选择添加前后缀，并在回源域名中填写一个已接入阿里云备案的自定义域名。
   - 重定向 Code：302

  ![](https://img.alicdn.com/tfs/TB1xW7eqkP2gK0jSZPxXXacQpXa-1554-1464.png)
  
### 2. 创建 [FC 函数](https://statistics.functioncompute.com/?title=%E5%88%A9%E7%94%A8%20FC%20%2B%20OSS%20%E5%BF%AB%E9%80%9F%E6%90%AD%E5%BB%BA%20Serverless%20%E5%AE%9E%E6%97%B6%E6%8C%89%E9%9C%80%E5%9B%BE%E5%83%8F%E5%A4%84%E7%90%86%E6%9C%8D%E5%8A%A1&author=zechen&url=https://fc.console.aliyun.com/)
- 下载 [serverless-image-on-the-fly](https://github.com/ChanDaoH/serverless-image-on-the-fly) 项目到本地

  `git clone git@github.com:ChanDaoH/serverless-image-on-the-fly.git`

- 进入项目目录，执行 `npm install`

- 填写 `template.yml` 文件中的相关内容：OSS_REGION、OSS_BUCKET_NAME、自定义域名

```yaml
ROSTemplateFormatVersion: '2015-09-01'
Transform: 'Aliyun::Serverless-2018-04-03'
Resources:
  serverless-image:
    Type: 'Aliyun::Serverless::Service'
    Properties:
      Description: This is serverless-image service
      Policies:
        - AliyunOSSFullAccess
    image-resize:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        Handler: src/index.handler
        Runtime: nodejs10
        Timeout: 60
        MemorySize: 512
        CodeUri: ./
        EnvironmentVariables:
          OSS_REGION: oss-cn-shanghai # oss region, such as oss-cn-shanghai、oss-cn-hangzhou
          OSS_BUCKET_NAME: images-xxx # oss bucket name
      Events:
        httpTrigger:
          Type: HTTP
          Properties:
            AuthType: ANONYMOUS
            Methods:
              - GET
              - POST
  william.functioncompute.com: # domain name
    Type: 'Aliyun::Serverless::CustomDomain'
    Properties:
      Protocol: HTTP
      RouteConfig:
        routes:
          '/*':
            ServiceName: serverless-image
            FunctionName: image-resize
```

- 部署函数至云端
  - 可以通过 [Serverless VSCode 插件](https://github.com/alibaba/serverless-vscode/) 部署
  - 可以通过 [fun](https://github.com/alibaba/funcraft) 部署

### 3. 测试动态调整图像
- 在 OSS bucket 中上传一张图像，假设为 `image.jpg` 。
 
  ![](https://img.alicdn.com/tfs/TB1PLUdqoH1gK0jSZSyXXXtlpXa-1633-272.png)

- 此时请求 `https://{OSS_BUCKET_NAME}.{OSS_REGION}.aliyuncs.com/{width}*{height}/image.jpg`。会有如下效果：
  1. 下载到指定 `width * height` 大小的 image.jpg。
  2. OSS bucket 中有 `width * height` 命名的目录，该目录下有 image.jpg。

  ![](https://img.alicdn.com/tfs/TB11nQhqoY1gK0jSZFCXXcwqXXa-1856-998.gif)

## 总结
我们通过 [FC + OSS](https://statistics.functioncompute.com/?title=%E5%88%A9%E7%94%A8%20FC%20%2B%20OSS%20%E5%BF%AB%E9%80%9F%E6%90%AD%E5%BB%BA%20Serverless%20%E5%AE%9E%E6%97%B6%E6%8C%89%E9%9C%80%E5%9B%BE%E5%83%8F%E5%A4%84%E7%90%86%E6%9C%8D%E5%8A%A1&author=zechen&url=https://fc.console.aliyun.com/) 搭建了一个实时按需图像处理服务，该服务拥有以下特点：
1. 即时处理 
2. 降低存储成本 
3. 无需运维

## 资料
1. [函数计算 Function Compute](https://statistics.functioncompute.com/?title=%E5%88%A9%E7%94%A8%20FC%20%2B%20OSS%20%E5%BF%AB%E9%80%9F%E6%90%AD%E5%BB%BA%20Serverless%20%E5%AE%9E%E6%97%B6%E6%8C%89%E9%9C%80%E5%9B%BE%E5%83%8F%E5%A4%84%E7%90%86%E6%9C%8D%E5%8A%A1&author=zechen&url=https://fc.console.aliyun.com/)
2. [Aliyun Serverless VSCode 插件](https://github.com/alibaba/serverless-vscode/)
3. [Fun](https://github.com/alibaba/funcraft)
