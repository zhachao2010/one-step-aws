# OneStepAWS - 一键式 S3 数据交付工具设计文档

## 背景

LCY 向日本客户交付基因测序数据（数百GB）时，通过 AWS S3 分享。当前流程要求客户根据操作系统选择不同的下载方式（Windows 用 S3 Browser，Mac 用 AWS CLI），操作步骤多、容易出错，MD5 校验对非技术用户极不友好。

## 目标

开发跨平台桌面应用 OneStepAWS，让客户**点击邮件链接即可自动完成数据下载和 MD5 校验**，实现真正的"一键式"体验。

## 用户流程

### 发送方（LCY）

1. 上传项目数据到 S3
2. 在邮件中包含 `onestep://` 链接（内含凭证和项目信息）
3. 邮件附带 OneStepAWS 应用下载链接（供首次使用的客户）

### 接收方（客户）

1. **首次使用**：下载安装 OneStepAWS（~5MB，一次性）
2. 点击邮件中的 `onestep://` 链接
3. 应用自动打开，显示项目信息（文件数、总大小、过期日期）
4. 选择保存目录，点击「ダウンロード開始」
5. 应用并行下载所有文件，显示实时进度
6. 下载完成后自动 MD5 校验
7. 显示校验结果报告（失败文件可一键重试）

## URL Scheme 设计

```
onestep://download?ak={access_key}&sk={secret_key}&bucket={bucket_name}&region={region}&project={project_name}&expires={YYYY-MM-DD}
```

| 参数 | 说明 | 必须 |
|------|------|------|
| `ak` | AWS Access Key ID | 是 |
| `sk` | AWS Secret Access Key | 是 |
| `bucket` | S3 Bucket 名称 | 是 |
| `region` | AWS Region | 是 |
| `project` | 项目目录名（S3 中的前缀） | 是 |
| `expires` | 下载过期日期 (YYYY-MM-DD) | 否 |

## 应用架构

```
┌─────────────────────────────────────────────────────┐
│                  OneStepAWS 应用                     │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │           Frontend (React + TypeScript)        │  │
│  │                                               │  │
│  │  项目信息页 → 下载进度页 → 校验结果页           │  │
│  │  i18n: 日本語 / English / 中文                 │  │
│  └──────────────┬────────────────────────────────┘  │
│                 │ Tauri IPC (invoke/events)          │
│  ┌──────────────┴────────────────────────────────┐  │
│  │              Backend (Rust)                    │  │
│  │                                               │  │
│  │  URL Parser → S3 Client → Download Engine     │  │
│  │                          → MD5 Engine          │  │
│  │                          → State Manager       │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Rust 后端模块

| 模块 | 职责 |
|------|------|
| URL Parser | 解析 `onestep://` 链接，提取凭证和项目信息 |
| S3 Client | 基于 `aws-sdk-s3`，列出文件、下载文件 |
| Download Engine | 并行下载调度（默认 3 并发），断点续传（HTTP Range），速率控制 |
| MD5 Engine | 下载时流式计算 MD5，扫描并解析 `.md5` / `MD5.txt` / `md5sum.txt` |
| State Manager | 下载进度持久化到本地 JSON，应用关闭后可恢复 |

## 下载核心流程

1. 解析 URL 参数
2. 初始化 S3 Client
3. `ListObjectsV2` 获取文件列表 + 识别 MD5 文件
4. 下载并解析 MD5 文件 → `HashMap<文件名, 期望MD5>`
5. 过滤数据文件，检查本地状态（跳过已完成的）
6. 并行下载（每个 chunk 写入文件同时更新 MD5 hasher）
7. 单文件完成 → 对比 MD5
8. 全部完成 → 汇总校验报告

## 断点续传设计

状态存储在 `~/.onestep-aws/tasks/{project_name}.json`：

```json
{
  "project": "F26A420000060_LETmbnoR",
  "bucket": "letmbnor-598731762349",
  "region": "ap-northeast-1",
  "save_path": "/Users/tanaka/Downloads/F26A420000060_LETmbnoR",
  "files": {
    "sample_01.fastq.gz": {
      "size": 13204889600,
      "downloaded": 13204889600,
      "md5_expected": "a1b2c3d4...",
      "md5_calculated": "a1b2c3d4...",
      "status": "verified"
    },
    "sample_03.fastq.gz": {
      "size": 12991029248,
      "downloaded": 8707506176,
      "md5_partial_state": "base64_of_md5_hasher_state...",
      "status": "downloading"
    }
  }
}
```

MD5 hasher 的中间状态也持久化，续传时无需从头重新计算。

## 界面设计

### 页面 1 — 项目信息

显示项目名、文件数、总大小、过期日期（含倒计时）、保存目录选择器、「ダウンロード開始」按钮。

### 页面 2 — 下载进度

整体进度条 + 文件列表（各文件进度、状态图标）、下载速度、预计剩余时间、一时停止/取消按钮。

### 页面 3 — 校验结果

汇总统计（成功/失败数）、各文件 MD5 校验结果（一致/不一致/无MD5信息）、失败文件一键重新下载、打开文件夹按钮。

### 设计要点

- 极简风格，客户无需理解 AWS 概念
- 颜色区分状态：绿色=成功，红色=失败，黄色=无MD5信息
- 窗口关闭时若正在下载，弹出确认对话框

## 技术栈

| 层面 | 技术 | 理由 |
|------|------|------|
| 框架 | Tauri v2 | 跨平台、安装包小（~5MB）、Rust 后端性能好 |
| 前端 | React + TypeScript + Tailwind CSS | 开发效率高 |
| S3 交互 | `aws-sdk-s3` (Rust crate) | AWS 官方 SDK |
| MD5 计算 | `md5` crate | 流式计算，内存友好 |
| 状态持久化 | `serde_json` + 本地 JSON | 简单够用 |
| i18n | `i18next` | 成熟多语言方案 |
| 构建 | GitHub Actions + `tauri-action` | 自动构建多平台安装包 |

## 项目结构

```
one-step-aws/
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs             # 入口 + URL scheme 处理
│   │   ├── s3_client.rs        # S3 操作封装
│   │   ├── download_engine.rs  # 并行下载 + 断点续传
│   │   ├── md5_engine.rs       # MD5 流式计算 + 校验文件解析
│   │   ├── state.rs            # 下载状态持久化
│   │   └── commands.rs         # Tauri IPC 命令
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                        # React 前端
│   ├── App.tsx
│   ├── pages/
│   │   ├── ProjectInfo.tsx     # 项目信息页
│   │   ├── DownloadProgress.tsx # 下载进度页
│   │   └── VerifyResult.tsx    # 校验结果页
│   ├── components/
│   │   ├── ProgressBar.tsx
│   │   └── FileList.tsx
│   ├── i18n/
│   │   ├── ja.json             # 日本語
│   │   ├── en.json             # English
│   │   └── zh.json             # 中文
│   └── lib/
│       └── tauri-api.ts        # IPC 调用封装
├── package.json
└── README.md
```

## 分发

- GitHub Releases 托管安装包
- Windows: `.msi`（安装时自动注册 `onestep://` 协议）
- macOS: `.dmg` (Apple Silicon + Intel)，`Info.plist` 声明 URL scheme
- macOS 需要代码签名以避免 Gatekeeper 拦截
