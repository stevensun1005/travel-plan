# 分享和持续更新

运行`serve.py`，使用实际打印并检查过的URL。`127.0.0.1`仅在本机可见。预算与清单保存在浏览器，不同设备各自保存、不自动同步；不因为「发给同伴」就加账户、数据库或跟踪。

`package_site.py`只打包页面、依赖和指定JSON，不上传整个工作目录。源PDF、订单、截图和托管凭据默认不在清单中；用户明确要求展示的票据需单独加入本次授权发布清单。不要把旧`.openai/hosting.json`、Git历史或发布身份继承到另一份旅行。

用户已经同意有链接即可访问，就不重复问；未授权公开前，先完成可审阅版本，再确认可见范围。使用可用托管工具；有Sites就按其skill注册、源同步、打包、保存与部署，沿用同一项目ID和保存版本。用户要公开链接时在授权范围内设置public，新站默认私有不代表同伴可见。

也可用用户选择的GitHub Pages等静态托管。公开网页授权不包含买域名、付费资源或代发消息。完成后返回链接由用户转发，除非另有发送授权。

pending/building/publishing继续跟进同一部署，成功且返回生产URL才说上线。普通HTTP工具被防爬拦截不等于部署失败，结合平台、权限和正常浏览器判断，不绕过验证码或访问控制。

更新站点时重新生成同一静态输出，验证并部署新版本。区分本地校验、浏览器、Git推送、远端CI和生产部署的状态，不混用结论。

链接预览卡片：发到 GitHub Pages、自己域名等有固定公开地址的地方后，运行 `make_card.py 旅行目录 --url 公开地址`。它用本机的 Chrome/Edge/Chromium 无头截图页面自己画的 1200×630 卡片（`index.html?card`，左边标题、日期、人数、默认预算，右边路线地图），存成 `og.png`，并在 `index.html` 里写入 Open Graph / Twitter 标签（重复运行会替换，不会叠加）。之后再 `package_site.py`，`og.png` 会一起打包。`og:image` 必须是绝对网址，所以没有 `--url` 时多数应用不显示图片。iMessage、WhatsApp、Telegram、Slack、Discord、X、Facebook、LinkedIn 会读这些标签；微信聊天里的普通网页链接一般不显示自定义图片。Artifact 也要做：claude.ai 不读页面里的预览标签，而是在服务器上用无头 Chrome 把页面放进 `frame-thumb-host.invalid` 里的 `about:srcdoc` 框架（800×420 窗口，约 3 秒后截图，只给有公开链接的 Artifact 截）。页面认出这种截图时整屏只显示 `og.png`；万一认错，真人点一下、滚一下或按任意键卡片就消失，所以发布到 Artifact 前先运行 `make_card.py 旅行目录`（不用 `--url`），再把 `og.png` 和其他文件一起放进 `files` 发布；正常打开的人看到的仍是攻略页。加 `?preview-card` 可以在本地预览这个效果。改了标题、日期或路线后重新运行并重新发布。

跨设备同步：页面上点的预算方案、清单打勾、小提醒和「夯 / 待定 / 额」都存在 localStorage。发布成 Artifact 时 `capabilities` 写 `{"downloads":{},"db":{}}`，页面把整份选择存进 Artifact 共享数据的 `trips/<行程id>`，以最后保存的为准；登录 claude.ai 的主人在手机和电脑上自动同步，只能查看的人看到主人的选择，自己的改动只存本机。没有共享数据时（GitHub Pages、本地预览、没登录的访客），顶栏「同步」给一段同步码，独立网页上还给一条带 `#sync=` 的链接，在别的设备打开或粘贴就能导入。

托管环境的CSP可能拦截OpenStreetMap在线图块（例如 Artifact）。发布前先跑 `fetch_basemap.py`，`package_site.py` 会把 `basemap.json` 和 `share-map.mjs` 一起打包，地图在图块被拦截时仍显示陆地、公路和地名。分享海报只在浏览器里绘制。发布到 Artifact 时声明 `capabilities: {downloads: true}`，否则沙箱会拦住下载、长按和右键保存，「保存图片」按钮只能提示截图；其他托管不需要额外设置。`calendar.mjs` 要和 `share-map.mjs` 一样放进 Artifact 的 `files`。Artifact 的 `downloads` 不放行 .ics，所以「订阅到日历」和底部的下载链接在 Artifact 里都打开 `trip.calendarUrl` 指向的托管日历文件；要在 Artifact 里能用，就先把 `export_calendar.mjs` 生成的 `calendar.ics` 发到 GitHub Pages 之类的 https 托管上（见 data.md）。
