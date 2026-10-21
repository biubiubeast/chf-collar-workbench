# CHF 领口对冲工作台 V4.4

[客户展示](https://chf-collar-lab.gpt4both.chatgpt.site/client) · [策略工作台](https://chf-collar-lab.gpt4both.chatgpt.site/) · [公式管理](https://chf-collar-lab.gpt4both.chatgpt.site/formulas#external-premium)

完整源码和与已发布版本一致的 Worker / 浏览器构建备份。GitHub 仓库保持私有；现有 Sites 访问方式保持不变，应用的账户登录与服务端权限保护仍生效。运行时密码哈希、会话密钥与 D1 数据不包含在此备份中。

## 恢复与继续开发

```sh
git clone https://github.com/biubiubeast/chf-collar-workbench.git
cd chf-collar-workbench
sh restore-source.sh
cd chf-collar-workbench
pnpm install --frozen-lockfile
pnpm dev
```

使用 Node.js >=22.13（建议 Node 24）和 pnpm 11.25.0。先读恢复后项目中的 AGENTS.md 与 README.md。恢复脚本验证 SHA-256 并建立独立 chf-collar-workbench/ 目录，已有目录时停止。恢复后的源文件可提交成普通项目目录继续开发；GitHub 本身不自动发布 Sites。受保护完整页面的本地运行需要按 README 配置独立的测试密钥和 D1，不能复制生产凭据或关闭服务端认证。

## V4.4 更新

- 两个 PNL 图保留盈亏平衡、追平本金存款、汇率不变点；默认隐藏点位描述，悬停、聚焦或手机点按显示。查看提示不会修改情景，近邻点不会抢占彼此中心。
- 客户展示支持每条启用期权独立 IV，默认 Call 8%、Put 8.5% 为用户提供的示例，已有逐腿设置优先。独立重算开仓权利金、未到期价值、Greeks 和边界，统一／参考 IV 模式保留。
- 新增“全额存款 · 期权费用外付”，保留原有费用内扣方式。全额存款为 E+L*S0；外付净投入 C=净权利金+全部期初费用+保证金+储备。费用与可返还资金占用分开，净收益 PNL=实际到期净资产−E−C。
- 到期案例、概率、全域边界、预期净资产、现金流、公式对话框和 Excel 使用同一资金模型。4.75% 对照及本金收益率仍以原 E 计；外付模式另列全投入收益率。C<0 表示期初净收款分配。
- 包含此前 CME 期限/Greeks、独立客户展示、服务端账户权限及管理设置等已发布功能。

## 交付与验证

| 文件 | 内容 |
| --- | --- |
| chf-collar-workbench-source.zip | 完整版本控制源码、锁定依赖、测试及开发说明 |
| chf-collar-workbench-website.tar.gz | 与发布一致的 Worker 服务端和浏览器构建；不是双击 HTML 的静态网站 |
| restore-source.sh | 校验并恢复独立源码目录 |
| SHA256SUMS | 两个备份包的 SHA-256 |

源码：1885e08da2083d11102b16ace8329d4aa49f38fa。
Sites 版本：21；部署 appgdep_6ad81efcfad481919ae624584667facf，2026-10-21 香港时间发布成功。

218 项验证通过，类型检查及生产构建通过。本地隔离组件预览验证了逐腿 IV 成本联动、原模式切换、500 万本金全额存款与额外现金核对、两个图的三类提示、键盘/Escape、390px 页面与提示边界。线上网站可正常打开至应用登录页，未使用生产凭据验证登录后的页面。

示例 IV 不是实时银行报价，也不是已校准的波动率微笑；未来 CME 滚仓 IV 是独立假设。保留原有 P/Q、跨期、基差、流动性和保证金限制。不要提交 .env、.dev.vars、令牌、密码或浏览器个人状态。
