---
name: travel-plan
description: 把旅行需求、旧攻略和PDF整理成可分享的互动旅行网页，包含机酒租车多平台查价、可选预算与占比图、真实路线地图、每日行程和出发前待办。用于制作、补充或调整攻略；单一景点问答或单纯订票不必启动完整流程。
---

# travel-plan（自动更新版）

这份文件只负责把最新的 travel-plan 拿到工作区。完整做法、模板、脚本和参考资料都在 GitHub 仓库里，每次启动都先更新到最新版，再照仓库里的 `SKILL.md` 做。

## 第一步：取得或更新到最新版（每次都做）

```bash
TP_DIR="${TP_DIR:-$PWD/.skills/travel-plan}"
TP_REPO="https://github.com/stevensun1005/travel-plan"
if [ -d "$TP_DIR/.git" ]; then
  git -C "$TP_DIR" pull -q --ff-only && echo "travel-plan 已更新到最新版" \
    || echo "travel-plan 没能更新（离线，或这个文件夹里有本地改动），先用现有版本"
elif [ -f "$TP_DIR/SKILL.md" ]; then
  curl -fsSL "$TP_REPO/archive/refs/heads/main.tar.gz" | tar -xz --strip-components=1 -C "$TP_DIR" \
    && echo "travel-plan 已用压缩包更新" || echo "travel-plan 没能更新，先用现有版本"
elif command -v git >/dev/null 2>&1; then
  git clone -q --depth 1 "$TP_REPO" "$TP_DIR" && echo "travel-plan 已下载"
else
  mkdir -p "$TP_DIR" && curl -fsSL "$TP_REPO/archive/refs/heads/main.tar.gz" | tar -xz --strip-components=1 -C "$TP_DIR" \
    && echo "travel-plan 已下载（没有 git，用压缩包）"
fi
git -C "$TP_DIR" log -1 --format='当前版本：%h %cd' --date=short 2>/dev/null || true
```

- Windows 上用 Git Bash 运行；PowerShell 下把同样的逻辑换成 `git -C $TP_DIR pull --ff-only` 或 `git clone --depth 1`。
- 更新失败不要中断任务：有旧版本就用旧版本，并在回复里说一句没能更新到最新版。
- 不要覆盖或丢弃那个文件夹里的本地改动（不要 `reset --hard`、不要删文件夹重下）。

## 第二步：读仓库里的完整说明

读 `$TP_DIR/SKILL.md`，从头到尾照它做。里面提到的 `references/`、`assets/`、`scripts/` 都在 `$TP_DIR` 下，命令写成 `python "$TP_DIR/scripts/…"`。只在用到时再读对应的 reference。

## 拿不到仓库时（离线、被拦）

告诉用户模板和脚本没能获取，然后照下面这些最要紧的规则先把攻略内容做出来：

- 先问清楚：出发地、目的地、日期和人数；预算和币种；每个人的护照国籍、居留身份和已有签证；**要不要直飞、最多接受几次转机、有没有指定或排除的航空公司、舱等**；必去、不想做的、饮食和体力限制；租车的话问驾驶人年龄和驾照。只问真正缺的。
- 机票和酒店在多个平台查同一个产品（航空公司官网、Trip.com/携程、Booking.com、Expedia，酒店加 Vio），都看含税总价；外币按央行汇率换成用户的币种；每项选最便宜的，并写明是哪个平台的价。去哪儿、飞猪不查。
- 机票一律按每人可带1件随身行李箱的票价比较；不含随身行李箱的基础票不算。
- 选项名要说清楚金额包含什么，不要只写选项之间不同的那一部分。
- 价格写明查价日期，区分查价记录、估算和已预订；不编造报价、余位或地址。
