# CHF Collar Lab — V5.4.0 Ubuntu deployment

当前应用源码为 `chf-collar-workbench-b/`。本分支 `deploy/ubuntu-fxcollar` 将 `main` 的 V5.4.0 功能与 Ubuntu 部署适配合并，使用 Next.js 和 SQLite。

## 目录

- `chf-collar-workbench-b/`：当前应用、测试与 Ubuntu 更新脚本。
- `oldversion-chf-collar-workbench/`：原 A 版完整源码，原名 `chf-collar-workbench/`，作为历史档案保留。
- 根目录压缩包与恢复脚本：历史交付包。

仓库外层名称和当前 B 应用目录沿用原名。旧 A 版目录改名不会改变更新命令。

## 更新

新功能若先提交到 `main`，先合入 `deploy/ubuntu-fxcollar`，保留 URL 前缀、SQLite、登录保护和 Ubuntu 构建设置。通过回归、类型检查、生产构建及 Ubuntu 集成测试后，再发布部署分支。

在服务器的仓库根目录执行：

```sh
cd chf-collar-workbench-b && bash ubuntu/deploy.sh
```

更新脚本只拉取 `deploy/ubuntu-fxcollar`，并沿用服务器已有账号配置和展示数据库。首次配置与旧方案导入用于首次安装，普通更新无需重复执行。

## V5.4.0

详见 [版本说明](chf-collar-workbench-b/releases/V5.4.0.md)。本版包含实际 CHF 名义金额编辑、双向联动和含持平概率展示。

旧显示配置读取时，下载及概率模块默认隐藏，原财务方案保留。管理员可在展示管理中重新开启并发布。显示配置迁移仅在读取时处理，保存发布方案需要管理员明确操作。

既有 Sites 发布记录用于历史回溯，不能作为 Ubuntu 服务器当前版本的证明。
