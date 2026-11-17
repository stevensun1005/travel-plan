# 数据契约

`assets/demo-trip.json`是可运行样例，所有价格、酒店和航班均虚构。不要照搬为实际推荐。全程金额保持同一币种、人数口径。

| 根字段 | 结构 |
| --- | --- |
| `version` | `1` |
| `trip` | `id,title,subtitle,kicker,startDate,endDate,nights,travelers,currency,demo,notice,constraints[]`，ISO日期；endDate可以包含跨夜回家日；`kicker`是标题上方的小标签 |
| `budget` | `target,categories[],presets[],chartGroups?` |
| `journeys` | `{id,title,proposal}`；proposal含 `airline,fareFamily,departure,arrival,route,duration,connection,note,url` |
| `days` | `{day,date,title,locations[],schedule[]}`；schedule含 `id?,time,title,text,placeId,links[],rate?,alternatives[]?` |
| `map` | `places[],dailyRoutes[],routesFile,basemapFile,home?` |
| `share` | 可选：分享路线图海报，见下方「分享路线图」 |
| `coverage` | `{item,when,note}` |
| `rental` | `{title,summary,details:[{label,value}],notes[],links:[{label,url}]}` |
| `todo` | 用户明确提供的提醒文字数组，可以为空 |
| `checklist` | 出发前待办：`{asOf,groups[],items[]}`，见下方「待办清单」 |
| `sources` | `{label,url,checkedOn,note}` |
| `events` | `{title,status,priceLabel,description,conflict,url}`，节日活动或特别晚餐备选；不暗示已加入预算 |
| `cash` | 可选：换钱建议，见下方「带多少现金」 |

**英文版**：同目录可放 `trip-data.en.json`，结构与上表完全相同；`id`、`placeId(s)`、金额、日期、链接、坐标、颜色、币种这些值必须和中文版一致，只翻译文字，且整份文件不能有中日韩字符或全角标点（校验器会查）。有这份文件时页面顶栏出现「EN / ZH」切换，默认中文；世界底图在英文模式下显示英文国名。

## 预算选项

category：`{id,label,color,defaultOption,options[]}`。option：`{id,label,amount,status,note,url?}`，每项都是全程合计。金额非负、最多两位小数、不超过1,000,000。

**选项名要说清楚这个金额包含什么**，别只写选项之间不同的那一部分。例如门票类的金额是全程所有门票，选项只差在牧场选哪个团，就写成「全部8项门票 · 牧场选Jurassic Adventure（牧场CA$438）」，而不是「牧场Jurassic Adventure」——否则看的人会以为去牧场就要花这么多。分类名也写上范围（如「门票与体验｜两人全程8项」），note开头列出包含哪几项，明细用 `items` 拆开。

常用类别ID：`flights,hotel,car,food,transport,activities,bags,buffer`，不强制凑满八类。每类自动支持自定义。

- 航班option可带 `fareFamily,bagPerPerson,journeys[]`；有不同班次时提供完整替代journeys。
- 明细：option可带 `items:[{label,amount,note?}]`，预算饼图下的分类行点「+」展开成记账式的一笔笔。金额同币种，加起来必须等于option的amount（校验器会查）；套餐拆分、行李联动这类实际金额会变的选项，明细按比例折算到当前金额。没有items时整项算一笔。category可带 `icon`（一个emoji）显示在分类行前。
- 多平台比价：option可带 `quotes:[{platform,amount,currency,checkedOn,url?,note?}]`，平台上没有这个产品时写 `{platform,available:false,note}`。外币汇率放在顶层 `fx:{base,date,source,rates:{USD:1.4257,...}}`（1单位外币=rate×旅行币种）。跑 `python scripts/apply_quotes.py <trip> --fetch-fx` 会写入每条报价的 `converted`、按价格排序，并把option的 `amount`、`source`（平台名）和 `url` 设成最便宜那家；校验器会检查金额是不是最便宜那条。页面把 `source` 显示在下拉选项后，卡片里列出「各平台比价」。
- 机票option要写 `carryOn:true`，表示这个价含每人1件随身行李箱；没写校验器会提醒。
- 待办分组：`checklist.groups[]` 可带 `open:false`，手机上这一组默认收起（点标题展开）；不写就是展开。电脑上各组总是全部展开，不折叠。通常把要抢票、有截止日的预订组展开，证件和出发前杂事收起。
- 行李option可带 `bagCount`，在已给出航班行李价时联动；否则使用明示预留，不猜收费。
- preset：`{id,label,selections:{类别ID:选项ID},note}`；估算状态不会因组合而变成报价。
- 饼图分组：几个类别左边分开选、右边饼图合成一块时，类别加 `chartGroup:"组ID"`，并在 `budget.chartGroups` 里写 `{组ID:{label,icon?,color?}}`。例如海边酒店和火山酒店都写 `chartGroup:"hotel"`，饼图只显示一块「酒店」，点开按类别列出每一项（类别有 `items` 时列出它的明细）；租车和油费停车同理。没写 `chartGroups` 时每个类别各占一块。
- 套餐：option可带 `bundles:{类别ID:选项ID}`，例如机票选项 `{"hotel":"in-package"}`。选中它时被包含的类别锁定为该选项（下拉框禁用）；被包含的选项标 `bundleOnly:true`、金额通常为0，没有套餐选中时隐藏并回到默认。默认选项不能是bundleOnly。套餐要按单独购买价拆分时加 `split:{类别ID:单买参考价}`（含自己的类别，如 `{"flights":1931,"hotel":5918.92}`）：套餐价按这些价格的比例分给各类别，饼图和卡片显示拆分后的金额，总额不变；参考价要同口径（都含税、同人数同晚数）并在note里写来源。交通等其他类别也可以一起打包（例如套餐含接送时 `{"hotel":"in-package","transport":"no-airport"}`）。
- 前端选择用于预算比较。下方日程和已缓存道路按原排定行程；变更真实酒店后应由Agent更新POI与缓存，不暗示选择费用就完成全部重新规划。

## 地点与路线

place：`{id,name,lat,lng,maps,photos,address,note,url}`，WGS84坐标。入口与中心不同要说明，未知交车点不填假点。`maps` 是在 Google Maps 里搜的地名（英文或当地文字，如 `"Llanos de Cortés Waterfall, Bagaces"`、`"Hotel Renew, 129 Paoakalani Ave, Honolulu"`），「地点导航」和当天路线导航都按它搜，没写才退回坐标；只有示例位置、私人交车点这类没有名字可搜的点不写。`photos` 是「看照片」链接的搜索词（如 `"Llanos de Cortés waterfall"`，写 `true` 就用 `maps`），给没有门票、没有官网的经典景点用：瀑布、观景台、海滩、看日落的地方，链接打开 Google 图片看风景照和游客实拍。中英文两份文件里这两个值相同。

行程项：`rate:true` 在右边显示「夯 / 待定 / 额」；写 `"hot"` / `"maybe"` / `"meh"` 时就是默认选中的那个（用户点了以后以点的为准）。评价按行程项的 `id` 记，没写 id 用「第几天-第几项」，所以要评价的项最好写稳定的 `id`（中英文相同）。`alternatives:[{title,text,links:[{label,url}]}]` 折叠显示在行程项下方，标题是「不想去的话，可以换成 N 个项目」。

dailyRoute：`{day,label,placeIds[],extraPlaceIds[],transport,note,officialUrl}`。

`driving/transfer`可生成公路缓存；`walking`给步行导航，不用驾车估时。`trolley/boat/shuttle`用官方交通说明和链接。`extraPlaceIds`只标记，不作为私家车途经点。

`routesFile`默认`routes.json`，内容为 `{provider,generatedOn,routes:[{day,placeIds,geometry,distance,duration,legs,snappedWaypoints,source}]}`。距离米、时间秒；legs数量等于途经点数减一。几何来自实际路由结果，不手画。估时不含实时拥堵和停留。

世界底图：页面自带 `vendor/world/countries-110m.json`（Natural Earth 1:110m，公有领域），始终画在最下面，缩小或在线图块被拦截时也能看到各国轮廓和中文国名。`map.home` 可选：`{name,lat,lng}`，例如 `{"name":"多伦多（出发地）","lat":43.6532,"lng":-79.3832}`；写了它，地图上会标出出发地，并多一个「和多伦多一起看」按钮，一键缩放到出发地和旅行地都在画面里。

`fetch_basemap.py` 的范围要盖住地图常看的画面：沿海或狭长的线路，南北方向多留一些，不然画面上下超出底图的部分会显示成海。

`basemapFile`默认`basemap.json`，由 `fetch_basemap.py` 生成：`{provider,generatedOn,bbox,detail,land[],coast[],green[],water[],roads:{motorway,trunk,primary,secondary,tertiary},shields[],labels[]}`。坐标为 `[lng,lat]`；`land/green/water` 是多边形环列表（`water` 是看得见的湖和水库，河流不算；`tertiary` 三级公路只在 full 细节下抓），`coast` 是没能闭合成陆地时保留的海岸线；`shields` 为 `{ref,cls,lat,lng}`，`labels` 为 `{name,lat,lng,rank,kind}`（kind：town/peak/bay/range）。数据来自OpenStreetMap（ODbL），保留页面上的OSM标注。

## 待办清单

`checklist.groups[]` 为 `{id,label}`，常用 documents（证件签证）/ bookings（要预订的）/ before（出发前）。`checklist.items[]`：

| 字段 | 说明 |
| --- | --- |
| `id,group,title` | 必填；id 唯一，group 对应 groups |
| `who` | 谁来办，例如「我」「同伴」「两人」 |
| `due` | ISO 截止日；页面显示倒计时，过期变红，14天内变橙 |
| `dueLabel` | 可选，替代日期文字，例如「12/7 起开放」 |
| `lead` | 提前多久，例如「提前8周放票」「至少72小时前」 |
| `note,url,urlLabel` | 说明和官方入口（http/https） |
| `status` | todo / booked / done；用户勾选保存在浏览器，不改数据 |
| `budget` | 可选，关联的预算分类 id。标题里的 `{option}` 换成当前选中方案名（`label` 的第一段）；没写 `url` 时用方案的 `url`。勾选按「清单项@方案」保存，换方案就要重新勾；关联的项全部勾上，预算卡片显示「已预订」变绿 |
| `budgetOptions` | 可选，方案 id 列表；只有选中这些方案时才出现这一项（例如只有含骑马的门票方案才要「订骑马」） |

预算方案可写 `booking` 调整联动的清单项：`booking:false` 表示选这个方案不用单独订（例如被机酒套餐包含的酒店）；`booking:{title,note,url,urlLabel,due,lead}` 覆盖清单项；一个分类关联多项时按清单项 id 分开写 `booking:{"kualoa":{title:"…"},"sail":false}`。校验器会检查 `budget` 和 `budgetOptions` 指向存在的分类和方案。

`asOf` 写资料核对日期。证件要求以官方来源为准；会变的规定（费用、有效期规则、放票窗口）写进 note 并附来源。

## 带多少现金

`cash` 在预算下面显示一块「换钱」，缺省时整块隐藏：

| 字段 | 说明 |
| --- | --- |
| `summary` | 一段话：哪些能刷卡、现金用在哪 |
| `currencies[]` | `{code,label,symbol,amount,usd?,cad?,how}`：每种要带的钱一张卡片。`amount` 是建议带的数（按面额凑整），`usd/cad` 是折算参考，`how` 写在哪换、要什么面额 |
| `items[]` | `{label,currency,amount,note}`：每笔现金用途，`currency` 对应上面的 `code`；用途合计和 `amount` 不一样时页面会显示合计 |
| `tips[]` | 汇率、刷卡选本币、ATM手续费这类提醒 |
| `asOf` | 核对日期 |

只列真正要用现金的地方（只收现金的门票、小费、小摊、停车看车、应急），刷卡能付的不算。当地货币不好在出发地换时，写明落地后在哪取；用美元的目的地只列美元。金额是建议，不是已发生的花费，不进预算饼图。

## 分享路线图

`share` 全部可选，缺省时从 `days`（标题、日程）和 `places` 自动生成：

| 字段 | 说明 |
| --- | --- |
| `kicker,title,subtitle,footer` | 海报页头和页脚文字 |
| `days[]` | `{day,tag,short,items[],badgeAt}`；`tag`卡片标题，`short`底部日程条用的短名，`items`最多5条亮点，`badgeAt`是日期徽章在当天路线上的位置（0–1） |
| `pois[]` | `{placeId,icon,label,side,dx,dy}`；side为left/right/above/below，或用dx/dy像素偏移并自动画引线 |
| `bbox` | `[西,南,东,北]`，海报地图范围；缺省为全部地点和路线外扩10% |
| `mapTitle` | `{text,lng,lat}`，地图上的大字（如岛名） |
| `seaLabel` | 海面文字（如 PACIFIC OCEAN） |

海报只用页面已有数据在浏览器里绘制，不上传。「保存图片」按环境选择：Claude Artifact 里用 `downloads` 能力（查看者确认后保存），手机用系统分享面板（可存到相册），其他浏览器直接下载；都不行时提示截图。

未知信息可保留待确认，校验警告不要求补造事实；已填引用和数字必须有效。

## 按需扩展：多城市规划器

需要动态排程时在同一JSON内增加规划配置和景点字典，并同步实现生成逻辑、渲染与行为校验；以下是建模要求，不是基础starter已支持的固定字段。不要只添JSON就声称控件会联动。流程见 [多城市选择与景点详情](multi-city.md)。

- 规划配置：必去城市/事件、可选城市、允许顺序、各城晚数及约束、可选日游、每段交通候选与过夜需要、可复用预设。
- 事件：官方日期或待定范围、场馆、票务状态、来源与核验时间；推导日期不能把占位值伪装为确定值。
- 报价记录：完整航段/日期/机场、人数、币种、舱等/行李条件、总价、查价阶段/时间、来源；当前条件精确匹配才应用，历史记录与预算估值各自保留。
- 景点字典：稳定ID、推荐理由、建议停留、票种/价格/币种/计价单位/状态/核验时间、预约与官方链接；照片含实际资源引用、作者、来源、许可证、替代文字。
- 每日条目通过景点ID引用详情。派生行程、住宿、交通、地图和预算来自同一选择；手填预算覆盖与派生估值分开存储。

现有`validate_trip.py`校验基础结构，不能单独证明上述扩展联动正确；为本次规划器补充可运行的行为检查。
