# 发布流程（GitHub Actions → npm，Trusted Publishing）

本仓库通过 `.github/workflows/publish.yml` 发布：

- 推送 `v*` 标签 → 校验后发布到 npm；
- 手动触发（Actions → publish → Run workflow）→ 只做 `npm publish --dry-run`。

发布使用 **npm Trusted Publishing（OIDC）**，不保存任何长期 npm 令牌。
GitHub Actions 用自身的 OIDC 身份换取一次性的发布凭据，并自动生成 provenance。

## 一次性配置

### 1. 先手动发布 1.1.0（bootstrap）

Trusted Publishing 需要在 npm 上**已存在**的包上配置。用你本机已登录的账号发布一次：

```bash
cd dsh-wolfram-nb
npm publish --registry=https://registry.npmjs.org
```

会交互要求 OTP（如果账号开了 2FA），不需要创建长期令牌。

### 2. 配置 Trusted Publisher（关键：权限要含 npm publish）

npmjs.com → 包页面 → **Settings → Trusted publishing**（部分界面叫
“Publishing access” / “Trusted publishers”）→ 添加 GitHub Actions：

| 字段 | 值 |
|---|---|
| Organization or user | `nashihang777` |
| Repository | `dsh-wolfram-nb` |
| Workflow filename | `publish.yml` |
| Environment | 留空（除非你想用环境审批） |
| **Permissions** | 必须勾选 **`npm publish`**（不能只勾 `npm stage publish`） |

> **这一步是 `403 OIDC permission denied` 的唯一常见原因。**
> 引入 staged publishing 后，trust relationship 的权限是**按命令细分**的：短时令牌只能执行
> 被授予的命令（`npm publish` 和/或 `npm stage publish`）。
> 列表里显示 `Permissions: npm stage publish` 而**不含** `npm publish` 时，
> CI 里的 `npm publish` 必然被拒，与 owner/repo/workflow 填得对不对无关。

用 npm 12+ 的 CLI 也可以直接设置（本机 npm 11.9 没有该子命令）：

```bash
npx npm@latest trust github \
  --repo nashihang777/dsh-wolfram-nb \
  --file publish.yml \
  --allow-publish
```

### 3. 确认仓库与权限

- 仓库需为 **public**：`--provenance` 需要公开源码仓库；
- workflow 已声明 `permissions: id-token: write`（OIDC 必需）；
- 发布 job 使用 **Node 24**（自带 npm ≥ 11.5，Trusted Publishing 的最低要求）。

## 日常发布

```bash
# 1. 更新版本号（自动提交并打 tag）
npm version patch -m "release: v%s"   # 或 minor / major

# 2. 推送提交和标签，触发发布
git push origin main --tags
```

workflow 的 `verify` 会检查标签与 `package.json` 版本一致，不一致直接失败。

发布后验证：

```bash
npm view dsh-wolfram-nb version
```

## 手动演练（不发布）

GitHub → **Actions → publish → Run workflow**。只执行 `npm publish --dry-run`，
用来确认 workflow 能拿到 OIDC 权限、包内容正确。

## 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| **`403 ... OIDC permission denied for this action`** | trust relationship **没有授予 `npm publish` 权限**（只给了 `npm stage publish`）。到 Trusted publishing 编辑该条目，勾上 `npm publish`；或用 `npx npm@latest trust github ... --allow-publish`。这是最常见原因，且日志里 provenance 会显示“签名成功”，容易误判成仓库配置错 |
| `EOTP` / `two-factor authentication` | 首次手动发布需要 OTP；CI 发布不需要（OIDC） |
| `403 Forbidden`、`404 Not Found`（无 OIDC 字样） | Trusted Publisher 的 owner/repo/workflow 填写不一致，或 token 账号无 scope 权限 |
| `npm ERR! ... id-token` / OIDC 失败 | workflow 缺少 `id-token: write`，或运行在 self-hosted runner 上 |
| `tag vX.Y.Z does not match package.json version` | 先 `npm version` 再打标签 |
| `Cannot publish over existing version` | 版本号未递增；npm 不允许重复发布同一版本 |
| `--provenance` 报错 | 仓库不是公开仓库；去掉 `--provenance` |
| `npm version` 后 CI 仍用旧版本 | 确认推的是 tag（`git push --tags`），不是只推分支 |

> 区分两种 403：**带 `OIDC permission denied`** = 权限问题（本节第一行）；
> **不带** = 身份/路径不匹配。provenance 签名成功只说明 GitHub 侧 OIDC 正常，不代表 npm 授权通过。

## 备选方案：granular token（仅在 Trusted Publishing 不可用时）

1. npm → Access Tokens → Granular Access Token：给 `dsh-wolfram-nb` 读写权限，
   勾选 **Bypass 2FA**（该选项有安全风险提示，这正是 npm 推荐 Trusted Publishing 的原因）；
2. 令牌写入仓库 Secret `NPM_TOKEN`；
3. 在 workflow 的 publish 步骤加回：
   ```yaml
   env:
     NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
   ```
   并去掉 `id-token: write` 与 `--provenance`。

## 安全约定

- 优先 OIDC：无长期令牌可泄露；
- 若必须用令牌，遵循最小 scope、定期轮换、只放 GitHub Secret；
- workflow 只在标签推送时发布，避免从任意分支误发。
