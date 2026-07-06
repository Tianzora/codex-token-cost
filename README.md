# Codex Token Cost

给 Codex++ 用的本地 token / 费用统计脚本。

主脚本会在 Codex 输入框上方显示本轮、会话和今日用量，也会在本地解锁官方 Profile 页面。helper 是可选的，不开也能用；开了以后可以补充 CC Switch、Codex SQLite 线程数、skill / plugin 统计。

## 文件

- `scripts/codex-live-token-cost.js`：主脚本。
- `scripts/codex-local-usage-helper.cjs`：可选 helper。
- `scripts/start-helper.ps1`：helper 启动脚本。

## 安装主脚本

```powershell
Copy-Item .\scripts\codex-live-token-cost.js "$env:APPDATA\Codex++\user_scripts\market-codex-live-token-cost.js" -Force
```

然后重启 Codex，或重新加载 Codex++ 用户脚本。

## 启动 helper

手动启动：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-helper.ps1
```

检查是否启动成功：

```powershell
Invoke-RestMethod http://127.0.0.1:17888/stats
```

helper 没启动时，主 HUD 和本地 Profile 仍然可用。受影响的是 CC Switch 同步、Codex SQLite 线程数、skill / plugin 统计。

## 设置 helper 开机自启

在仓库目录运行：

```powershell
$script = (Resolve-Path .\scripts\start-helper.ps1).Path
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "CodexTokenCostHelper" -Action $action -Trigger $trigger -Settings $settings -Description "Start Codex Token Cost local helper" -Force
Start-ScheduledTask -TaskName "CodexTokenCostHelper"
```

取消自启：

```powershell
Unregister-ScheduledTask -TaskName "CodexTokenCostHelper" -Confirm:$false
```

## 要求

- Windows
- Codex 桌面端
- Codex++
- Node.js（只在使用 helper 时需要）

## 隐私

数据只保存在本机。主脚本写入浏览器 `localStorage`；helper 只读取本机 Codex session、Codex SQLite 和 CC Switch 数据。
