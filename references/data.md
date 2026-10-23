# 数据契约

`assets/demo-trip.json`是可运行样例，所有价格、酒店和航班均虚构。不要照搬为实际推荐。全程金额保持同一币种、人数口径。

| 根字段 | 结构 |
| --- | --- |
| `version` | `1` |
| `trip` | `id,title,subtitle,startDate,endDate,nights,travelers,currency,demo,notice,constraints[]`，ISO日期；endDate可以包含跨夜回家日 |
| `budget` | `target,categories[],presets[]` |
| `journeys` | `{id,title,proposal}`；proposal含 `airline,fareFamily,departure,arrival,route,duration,connection,note,url` |
| `days` | `{day,date,title,locations[],schedule[]}`；schedule含 `time,title,text,placeId,links[]` |
| `map` | `places[],dailyRoutes[],routesFile` |
| `coverage` | `{item,when,note}` |
| `rental` | `{title,summary,details:[{label,value}],notes[],links:[{label,url}]}` |
| `todo` | 用户明确提供的提醒文字数组，可以为空 |
| `sources` | `{label,url,checkedOn,note}` |
| `events` | `{title,status,priceLabel,description,conflict,url}`，节日活动或特别晚餐备选；不暗示已加入预算 |

## 预算选项

category：`{id,label,color,defaultOption,options[]}`。option：`{id,label,amount,status,note,url?}`，每项都是全程合计。金额非负、最多两位小数、不超过1,000,000。

常用类别ID：`flights,hotel,car,food,transport,activities,bags,buffer`，不强制凑满八类。每类自动支持自定义。

- 航班option可带 `fareFamily,bagPerPerson,journeys[]`；有不同班次时提供完整替代journeys。
- 行李option可带 `bagCount`，在已给出航班行李价时联动；否则使用明示预留，不猜收费。
- preset：`{id,label,selections:{类别ID:选项ID},note}`；估算状态不会因组合而变成报价。
- 前端选择用于预算比较。下方日程和已缓存道路按原排定行程；变更真实酒店后应由Agent更新POI与缓存，不暗示选择费用就完成全部重新规划。

## 地点与路线

place：`{id,name,lat,lng,address,note,url}`，WGS84坐标。入口与中心不同要说明，未知交车点不填假点。

dailyRoute：`{day,label,placeIds[],extraPlaceIds[],transport,note,officialUrl}`。

`driving/transfer`可生成公路缓存；`walking`给步行导航，不用驾车估时。`trolley/boat/shuttle`用官方交通说明和链接。`extraPlaceIds`只标记，不作为私家车途经点。

`routesFile`默认`routes.json`，内容为 `{provider,generatedOn,routes:[{day,placeIds,geometry,distance,duration,legs,snappedWaypoints,source}]}`。距离米、时间秒；legs数量等于途经点数减一。几何来自实际路由结果，不手画。估时不含实时拥堵和停留。

未知信息可保留待确认，校验警告不要求补造事实；已填引用和数字必须有效。
