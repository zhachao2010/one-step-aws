# OneStepAWS - S3 数据一键下载工具

基于 Web 的 AWS S3 数据下载工具，通过生成下载链接实现一键下载，无需安装任何软件。

## 功能特性

- **一键下载**：生成下载链接，打开即可下载，无需安装任何软件
- **MD5 校验**：下载过程中实时计算 MD5，自动与校验文件比对，确保数据完整性
- **断点续传**：支持中断后继续下载，已完成的文件自动跳过
- **文件选择**：可勾选需要下载的文件，无需全部下载
- **多语言支持**：日语、英语、中文三语界面
- **两种下载模式**：
  - **流式下载**（推荐）：直接写入本地磁盘，支持大文件和断点续传（需要 Chrome/Edge）
  - **预签名链接下载**（兼容模式）：生成逐个文件的下载链接，兼容所有浏览器

## 链接生成方式

### 方式一：Admin 管理页面（推荐）

访问部署好的 Admin 页面（GitHub Pages 上的 `admin.html`），填写表单即可生成下载链接。

需要填写：
- AWS Access Key / Secret Key
- S3 Bucket 名称和 Region
- 项目路径（S3 key 前缀）
- 过期日期（可选）

页面会自动列出 S3 中的文件，生成包含文件清单的压缩链接，并上传自包含 HTML 到 S3 以生成预签名下载链接。

### 方式二：CLI 脚本

```bash
node scripts/generate-link.mjs \
  --ak YOUR_ACCESS_KEY \
  --sk YOUR_SECRET_KEY \
  --bucket YOUR_BUCKET \
  --region ap-northeast-1 \
  --project path/to/data \
  --expires 2026-04-30
```

脚本会：
1. 列出 S3 中指定前缀下的所有文件
2. 构建自包含的下载页面 HTML
3. 上传 HTML 到 S3 并生成 7 天有效的预签名链接
4. 同时输出 GitHub Pages 备用链接

> 运行前需要先执行 `npm run build:single` 生成单文件 HTML 模板。

## 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 生产构建（多文件，用于 GitHub Pages）
npm run build

# 单文件构建（用于 S3 托管）
npm run build:single
```

技术栈：React 19 + TypeScript + Tailwind CSS + Vite + AWS SDK for JS

## 部署

通过 GitHub Actions 自动部署到 GitHub Pages：

- 推送到 `main` 分支时自动触发（仅相关文件变更时）
- 构建多文件版本（GitHub Pages 托管）和单文件版本（S3 链接用模板）
- 将 `admin.html` 和单文件模板一并部署

配置要求：
- GitHub 仓库启用 Pages（Settings → Pages → Source: GitHub Actions）
- 仓库权限：`contents: read`、`pages: write`、`id-token: write`

## S3 CORS 配置

流式下载模式需要 S3 桶配置 CORS 规则，允许浏览器直接访问：

```bash
# 使用提供的脚本配置（需要 AWS CLI）
./scripts/setup-cors.sh YOUR_BUCKET
```

如果未配置 CORS，下载页面会自动降级为预签名链接模式。

## 浏览器兼容性

| 功能 | Chrome/Edge | Safari/Firefox |
|------|-------------|----------------|
| 流式下载（写入本地磁盘） | ✓ | ✗ |
| 断点续传 | ✓ | ✗ |
| MD5 实时校验 | ✓ | ✗ |
| 预签名链接下载 | ✓ | ✓ |

流式下载依赖 [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)，目前仅 Chromium 内核浏览器支持。

## 项目结构

```
├── admin.html                    # 管理页面（链接生成器）
├── downloader.html               # 下载页面入口 HTML
├── src/
│   ├── downloader/               # 下载器 React 应用
│   │   ├── App.tsx               # 主组件（状态机）
│   │   ├── lib/                  # 核心逻辑
│   │   │   ├── download-engine.ts  # 并行下载引擎 + MD5
│   │   │   ├── s3-browser.ts       # S3 客户端 + Range 请求
│   │   │   ├── url-parser.ts       # URL 参数解析
│   │   │   └── md5-utils.ts        # MD5 校验文件解析
│   │   └── pages/                # 页面组件
│   │       ├── StreamingDownload.tsx   # 文件选择 + 流式下载
│   │       ├── PresignedDownload.tsx   # 预签名链接下载
│   │       ├── DownloadProgress.tsx    # 下载进度
│   │       └── VerifyResult.tsx        # 校验结果
│   ├── i18n/                     # 国际化（ja/en/zh）
│   └── lib/format.ts             # 工具函数
├── scripts/
│   ├── generate-link.mjs         # CLI 链接生成脚本
│   └── setup-cors.sh             # S3 CORS 配置脚本
├── vite.config.downloader.ts     # Vite 构建配置
└── .github/workflows/
    └── deploy-downloader.yml     # GitHub Pages 部署
```
