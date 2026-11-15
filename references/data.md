# 数据契约

`assets/demo-trip.json`是可运行样例，所有价格、酒店和航班均虚构。不要照搬为实际推荐。全程金额保持同一币种、人数口径。

| 根字段 | 结构 |
| --- | --- |
| `version` | `1` |
| `trip` | `id,title,subtitle,kicker,startDate,endDate,nights,travelers,currency,demo,notice,constraints[]`，ISO日期；endDate可以包含跨夜回家日；`kicker`是标题上方的小标签 |
| `budget` | `target,categories[],presets[]` |
| `journeys` | `{id,title,proposal}`；proposal含 `airline,fareFamily,departure,arrival,route,duration,connection,note,url` |
| `days` | `{day,date,title,locations[],schedule[]}`；schedule含 `time,title,text,placeId,links[]` |
| `map` | `places[],dailyRoutes[],routesFile,basemapFile` |
| `share` | 可选：分享路线图海报，见下方「分享路线图」 |
| `coverage` | `{item,when,note}` |
| `rental` | `{title,summary,details:[{label,value}],notes[],links:[{label,url}]}` |
| `todo` | 用户明确提供的提醒文字数组，可以为空 |
| `checklist` | 出发前待办：`{asOf,groups[],items[]}`，见下方「待办清单」 |
| `sources` | `{label,url,checkedOn,note}` |
| `events` | `{title,status,priceLabel,description,conflict,url}`，节日活动或特别晚餐备选；不暗示已加入预算 |

## 预算选项

category：`{id,label,color,defaultOption,options[]}`。option：`{id,label,amount,status,note,url?}`，每项都是全程合计。金额非负、最多两位小数、不超过1,000,000。

常用类别ID：`flights,hotel,car,food,transport,activities,bags,buffer`，不强制凑满八类。每类自动支持自定义。

- 航班option可带 `fareFamily,bagPerPerson,journeys[]`；有不同班次时提供完整替代journeys。
- 明细：option可带 `items:[{label,amount,note?}]`，预算饼图下的分类行点「+」展开成记账式的一笔笔。金额同币种，加起来必须等于option的amount（校验器会查）；套餐拆分、行李联动这类实际金额会变的选项，明细按比例折算到当前金额。没有items时整项算一笔。category可带 `icon`（一个emoji）显示在分类行前。
- 待办分组：`checklist.groups[]` 可带 `open:false`，手机上这一组默认收起（点标题展开）；不写就是展开。电脑上各组总是全部展开，不折叠。通常把要抢票、有截止日的预订组展开，证件和出发前杂事收起。
- 行李option可带 `bagCount`，在已给出航班行李价时联动；否则使用明示预留，不猜收费。
- preset：`{id,label,selections:{类别ID:选项ID},note}`；估算状态不会因组合而变成报价。
- 套餐：option可带 `bundles:{类别ID:选项ID}`，例如机票选项 `{"hotel":"in-package"}`。选中它时被包含的类别锁定为该选项（下拉框禁用）；被包含的选项标 `bundleOnly:true`、金额通常为0，没有套餐选中时隐藏并回到默认。默认选项不能是bundleOnly。套餐要按单独购买价拆分时加 `split:{类别ID:单买参考价}`（含自己的类别，如 `{"flights":1931,"hotel":5918.92}`）：套餐价按这些价格的比例分给各类别，饼图和卡片显示拆分后的金额，总额不变；参考价要同口径（都含税、同人数同晚数）并在note里写来源。交通等其他类别也可以一起打包（例如套餐含接送时 `{"hotel":"in-package","transport":"no-airport"}`）。
- 前端选择用于预算比较。下方日程和已缓存道路按原排定行程；变更真实酒店后应由Agent更新POI与缓存，不暗示选择费用就完成全部重新规划。

## 地点与路线

place：`{id,name,lat,lng,address,note,url}`，WGS84坐标。入口与中心不同要说明，未知交车点不填假点。

dailyRoute：`{day,label,placeIds[],extraPlaceIds[],transport,note,officialUrl}`。

`driving/transfer`可生成公路缓存；`walking`给步行导航，不用驾车估时。`trolley/boat/shuttle`用官方交通说明和链接。`extraPlaceIds`只标记，不作为私家车途经点。

`routesFile`默认`routes.json`，内容为 `{provider,generatedOn,routes:[{day,placeIds,geometry,distance,duration,legs,snappedWaypoints,source}]}`。距离米、时间秒；legs数量等于途经点数减一。几何来自实际路由结果，不手画。估时不含实时拥堵和停留。

`basemapFile`默认`basemap.json`，由 `fetch_basemap.py` 生成：`{provider,generatedOn,bbox,detail,land[],coast[],green[],roads:{motorway,trunk,primary,secondary},shields[],labels[]}`。坐标为 `[lng,lat]`；`land/green` 是多边形环列表，`coast` 是没能闭合成陆地时保留的海岸线；`shields` 为 `{ref,cls,lat,lng}`，`labels` 为 `{name,lat,lng,rank,kind}`（kind：town/peak/bay/range）。数据来自OpenStreetMap（ODbL），保留页面上的OSM标注。

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

`asOf` 写资料核对日期。证件要求以官方来源为准；会变的规定（费用、有效期规则、放票窗口）写进 note 并附来源。

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
