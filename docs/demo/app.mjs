import {calculate,normalize,validMoney,nearestIndex} from './budget.mjs';

const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const link=(label,value)=>url(value)?`<a href="${escape(url(value))}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`:'';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
let data,selection,key;
const money=value=>`${data.trip.currency||'CAD'} ${Number(value).toLocaleString('en-CA',{maximumFractionDigits:2})}`;
const color=(value,index)=>/^#[0-9a-f]{6}$/i.test(value||'')?value:['#326b74','#d49c56','#6d8c64','#c97965','#8096ad','#9b82a6','#b6aa7b','#a7b9b4'][index%8];
function save(){try{localStorage.setItem(key,JSON.stringify(selection));$('#save-status').textContent='已自动保存到当前浏览器';}catch{$('#save-status').textContent='本次选择有效，浏览器未能保存';}}

function renderBudget(){
  const budget=data.budget;
  if(!budget?.categories?.length){$('#budget').hidden=true;return;}
  key=`travel-plan:budget:v1:${data.trip.id}`;selection=normalize(budget,read(key,{}));
  $('#budget-planner').innerHTML=`<div class="budget-shell"><div class="budget-heading"><div><small>${data.trip.travelers}人 · 全程合计</small><strong class="budget-total" id="budget-total"></strong></div><label class="target">预算上限 · ${escape(data.trip.currency)}<input id="budget-target" aria-label="预算上限" type="number" min="1" max="1000000" step="0.01" value="${selection.target}"></label></div><div class="balance" id="budget-balance" role="status" aria-live="polite"></div><div class="presets"><button data-reset>恢复初始方案</button>${(budget.presets||[]).map(p=>`<button data-preset="${escape(p.id)}">${escape(p.label)}</button>`).join('')}<span class="saved" id="save-status">选择保存在当前浏览器</span></div><div class="budget-layout"><div class="choices">${budget.categories.map(c=>`<article class="choice" data-category="${escape(c.id)}"><header><label for="choice-${escape(c.id)}">${escape(c.label)}</label><strong data-amount></strong></header><select id="choice-${escape(c.id)}" data-select="${escape(c.id)}" aria-describedby="note-${escape(c.id)}">${c.options.map(o=>`<option value="${escape(o.id)}">${escape(o.label)} · ${money(o.amount)}</option>`).join('')}<option value="custom">自定义总额…</option></select><label class="custom" hidden>自定义全程合计 · ${escape(data.trip.currency)}<input data-custom="${escape(c.id)}" aria-label="${escape(c.label)}自定义金额" type="number" min="0" max="1000000" step="0.01" value="0"></label><span class="price-status"></span><p id="note-${escape(c.id)}" data-note></p><div data-source></div></article>`).join('')}</div><aside class="chart-panel"><h3>预算都花在哪？</h3><p>占当前总支出的百分比</p><svg id="budget-chart" viewBox="0 0 220 220" role="img" aria-label="分类支出占比，详见图例"></svg><ul class="legend" id="budget-legend"></ul></aside></div><p class="fine">所有金额为同一旅行口径。查价记录与估算不是锁价，实时重算不代表商家实时调价。预算选择各自保存在浏览器，不自动同步；日程与地图仍按原排定方案参考。</p><p class="quote-warning" id="budget-warning"></p></div>`;
  $('#budget-planner').addEventListener('change',e=>{const id=e.target.dataset.select;if(!id)return;selection.selections[id].optionId=e.target.value;updateBudget();if(id==='flights')syncFlights();});
  $('#budget-planner').addEventListener('input',e=>{
    if(!e.target.matches('#budget-target,[data-custom]') || !e.target.validity.valid || !e.target.value.trim())return;
    const value=Number(e.target.value),target=e.target.id==='budget-target';if(!validMoney(value,target?1:0))return;
    if(target)selection.target=value;else selection.selections[e.target.dataset.custom].customAmount=value;
    updateBudget();if(e.target.dataset.custom==='flights')syncFlights();
  });
  $('#budget-planner').addEventListener('click',e=>{
    const reset=e.target.closest('[data-reset]'),button=e.target.closest('[data-preset]');if(!reset&&!button)return;
    selection=normalize(budget,{target:selection.target});
    const preset=button?budget.presets.find(p=>p.id===button.dataset.preset):null;
    for(const [id,optionId] of Object.entries(preset?.selections||{}))selection.selections[id].optionId=optionId;
    updateBudget(true);syncFlights();
  });
  updateBudget(true,false);
}
function updateBudget(sync=false,persist=true){
  const result=calculate(data.budget,selection);selection={target:result.target,selections:result.selections};
  $('#budget-total').textContent=money(result.total);$('#budget-balance').dataset.over=result.remaining<0;
  $('#budget-balance').innerHTML=`<span>${money(result.total)}</span><span>${result.remaining>=0?'预算内，还剩':'超出预算'} ${money(Math.abs(result.remaining))}</span>`;
  if(sync)$('#budget-target').value=result.target;
  for(const row of result.rows){
    const card=document.querySelector(`[data-category="${row.id}"]`);
    if(sync){card.querySelector('select').value=row.option.id;card.querySelector('input').value=result.selections[row.id].customAmount;}
    card.querySelector('[data-amount]').textContent=money(row.amount);card.querySelector('.custom').hidden=row.option.id!=='custom';
    card.querySelector('.price-status').textContent=row.option.status||'待确认';card.querySelector('[data-note]').textContent=row.option.note||'';card.querySelector('[data-source]').innerHTML=link('查价入口',row.option.url);
    if(row.id==='bags')for(const o of row.options.filter(o=>o.bagCount)){
      const flight=result.rows.find(r=>r.id==='flights');const rate=flight?.option.bagPerPerson;
      card.querySelector(`option[value="${o.id}"]`).textContent=`${o.label} · ${money(validMoney(rate)?rate*o.bagCount:o.amount)}`;
    }
  }
  let offset=0;const circumference=2*Math.PI*80;
  $('#budget-chart').innerHTML=`<title>分类支出占比，总额${money(result.total)}</title><circle cx="110" cy="110" r="80" fill="none" stroke="#e5eadf" stroke-width="32"/>${result.rows.map((row,i)=>{
    if(!row.amount||!result.total)return '';
    const length=row.amount/result.total*circumference;const mark=`<circle class="slice" cx="110" cy="110" r="80" fill="none" stroke="${color(row.color,i)}" stroke-width="32" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)" tabindex="0"><title>${escape(row.label)} · ${money(row.amount)} · ${(row.amount/result.total*100).toFixed(1)}%</title></circle>`;offset+=length;return mark;
  }).join('')}<text class="chart-label" x="110" y="103" text-anchor="middle">全程合计 · ${escape(data.trip.currency)}</text><text class="chart-value" x="110" y="130" text-anchor="middle">${result.total.toLocaleString('en-CA',{maximumFractionDigits:2})}</text>`;
  $('#budget-legend').innerHTML=result.rows.map((row,i)=>`<li><span><i style="background:${color(row.color,i)}"></i>${escape(row.label.split('｜')[0])}</span><b>${money(row.amount)}<small>${result.total?(row.amount/result.total*100).toFixed(1):'0.0'}%</small></b></li>`).join('');
  const pending=result.rows.filter(row=>/尚无|未取得/.test(row.option.status||''));
  $('#budget-warning').textContent=result.total===0?'所有支出为0，填写金额后显示占比。':pending.length?`${pending.map(r=>r.option.label).join('、')}尚无实际报价；试算低于上限不等于能按此价格预订。`:'机票按完整往返计算，酒店按全住期计算；套餐中已包含的晚餐、接送和门票只计一次。';
  if(persist)save();
}

function flightMarkup(journey,index){
  const row=selection?calculate(data.budget,selection).rows.find(row=>row.id==='flights'):null;
  let p={...journey.proposal,...row?.option.journeys?.[index]};
  if(row?.option.id==='custom')p={...p,airline:'自定义机票预算',departure:{...p.departure,time:'待确认'},arrival:{...p.arrival,time:'待确认'},route:'具体航班待确认',duration:'时长待确认',connection:'中转待确认',note:'仅填了费用，不能据此判断实际航班时刻。'};
  const amount=row?.amount??p.roundTripTotal;
  return `<div class="flight-top"><span>${index===0?'OUTBOUND · 去程':'RETURN · 回程'}</span><span>${data.trip.demo?'虚构演示':'候选方案 · 以出票为准'}</span></div><p>${escape(p.airline||'航空公司待确认')} · 所有时刻为当地时间</p><div class="flight-times"><div><b>${escape(p.departure?.airport||'待确认')}</b><strong>${escape(p.departure?.time||'待确认')}</strong><small>${escape(p.departure?.date||'')}</small></div><span>→</span><div><b>${escape(p.arrival?.airport||'待确认')}</b><strong>${escape(p.arrival?.time||'待确认')}</strong><small>${escape(p.arrival?.date||'')}</small></div></div><h3>${escape(p.route||journey.title)}</h3><p>${escape(p.duration||'时长待确认')} · ${escape(p.connection||'转机待确认')}</p><div class="flight-price">${amount===undefined?'机票费用待确认':`全程往返 ${money(amount)}`}</div><p>${escape(row?.option.fareFamily||p.fareFamily||'舱等待确认')} · 同一往返总价，不重复计费</p><p>${escape(p.note||row?.option.note||'')}</p>${link('查看来源',p.url||row?.option.url)}`;
}
function syncFlights(){document.querySelectorAll('.flight').forEach((card,i)=>card.innerHTML=flightMarkup(data.journeys[i],i));}
function renderFlights(){
  if(!data.journeys?.length){$('#flights').hidden=true;return;}
  const carousel=$('#flight-carousel');carousel.innerHTML=data.journeys.map((journey,index)=>`<article class="flight" aria-label="${escape(journey.title)}">${flightMarkup(journey,index)}</article>`).join('');
  const cards=[...carousel.children];let active=0,drag;
  const sync=()=>{active=nearestIndex(carousel,cards);$('#flight-index').textContent=`${active+1} / ${cards.length}`;$('#flight-prev').disabled=active===0;$('#flight-next').disabled=active===cards.length-1;};
  const go=index=>{const next=Math.max(0,Math.min(cards.length-1,index));const distance=cards[next].getBoundingClientRect().left-carousel.getBoundingClientRect().left;carousel.scrollTo({left:carousel.scrollLeft+distance,behavior:'instant'});};
  $('#flight-prev').onclick=()=>go(active-1);$('#flight-next').onclick=()=>go(active+1);
  carousel.onkeydown=e=>{if(e.target!==carousel)return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();go(active+(e.key==='ArrowRight'?1:-1));}};
  carousel.addEventListener('scroll',()=>requestAnimationFrame(sync),{passive:true});new ResizeObserver(sync).observe(carousel);
  carousel.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||e.target.closest('a,button,input'))return;drag={x:e.clientX,left:carousel.scrollLeft,moved:false};});
  carousel.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>7){drag.moved=true;carousel.classList.add('dragging');carousel.setPointerCapture(e.pointerId);}if(drag.moved){e.preventDefault();carousel.scrollLeft=drag.left-dx;}});
  const finish=()=>{if(!drag)return;const moved=drag.moved;drag=null;carousel.classList.remove('dragging');if(moved)go(nearestIndex(carousel,cards));};
  carousel.addEventListener('pointerup',finish);carousel.addEventListener('pointercancel',finish);sync();
}

function directions(places,mode='driving'){
  if(places.length<2)return '';
  const coord=p=>`${p.lat},${p.lng}`;const params=new URLSearchParams({api:'1',origin:coord(places[0]),destination:coord(places.at(-1)),travelmode:mode});
  if(places.length>2)params.set('waypoints',places.slice(1,-1).map(coord).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}
async function renderMap(){
  const config=data.map;if(!config?.places?.length){$('#route').hidden=true;return;}
  if(!window.L){$('#map-details').innerHTML='<p>地图组件未能加载，请刷新。</p>';return;}
  const map=L.map('map',{scrollWheelZoom:false});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);L.control.scale({imperial:false}).addTo(map);
  const layer=L.featureGroup().addTo(map),markers=new Map();let selected=0,roads=[];
  const get=id=>config.places.find(p=>p.id===id);
  $('#map-days').innerHTML=`<button data-map-day="0" aria-pressed="true">全部路线</button>${config.dailyRoutes.map(r=>`<button data-map-day="${r.day}" aria-pressed="false">${escape(r.label||`Day ${r.day}`)}</button>`).join('')}`;
  const fit=()=>{map.invalidateSize();if(layer.getLayers().length)map.fitBounds(layer.getBounds(),{padding:[28,28],maxZoom:15});};
  function show(day){
    selected=day;layer.clearLayers();markers.clear();const route=config.dailyRoutes.find(r=>r.day===day);
    document.querySelectorAll('[data-map-day]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.mapDay)===day));
    const visible=route?[...new Set([...route.placeIds,...(route.extraPlaceIds||[])])].map(get):config.places;
    const lines=roads.filter(r=>!day||r.day===day);
    for(const line of lines){L.geoJSON(line.geometry,{style:{color:'#fff',weight:8}}).addTo(layer);L.geoJSON(line.geometry,{style:{color:color(null,line.day-1),weight:4}}).addTo(layer);}
    visible.forEach((p,index)=>{const marker=L.marker([p.lat,p.lng],{title:p.name,icon:L.divIcon({className:'map-pin',html:String(index+1),iconSize:[30,30],iconAnchor:[15,15]})}).bindPopup(`<b>${escape(p.name)}</b><br>${escape(p.address||'')}<br>${escape(p.note||'')}<br>${link('Google Maps',`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`)}`).addTo(layer);markers.set(p.id,marker);});
    const special=route&&!['driving','transfer','walking'].includes(route.transport);const navigation=route&&!special?directions(route.placeIds.map(get),route.transport==='walking'?'walking':'driving'):'';
    const distance=lines.reduce((sum,r)=>sum+r.distance,0),duration=lines.reduce((sum,r)=>sum+r.duration,0);
    $('#map-details').innerHTML=`<h3>${escape(route?data.days.find(d=>d.day===day)?.title||route.label:data.trip.title)}</h3><p>${escape(route?.note||'按日期查看地点、道路和导航。')}</p><p>${lines.length?`道路约${(distance/1000).toFixed(1)} km · 路网估时${Math.round(duration/60)}分钟`:special?'此日使用专用交通，以官方线路为准，不画汽车最短路线。':'道路缓存待补充；先显示准确地点，不画示意连线。'}</p><div class="map-actions">${link(special?'官方线路':'当天导航',special?route.officialUrl:navigation)}<button data-fit>完整范围</button><button data-fullscreen>全屏地图</button></div><ol class="map-stops">${visible.map((p,i)=>`<li><button data-pin="${escape(p.id)}">${i+1}. ${escape(p.name)}</button><small>${escape(p.address||p.note||'')}</small></li>`).join('')}</ol>${lines.flatMap(line=>line.legs.map((leg,i)=>`<p>${escape(get(line.placeIds[i]).name)} → ${escape(get(line.placeIds[i+1]).name)}<br>${(leg.distance/1000).toFixed(1)} km · 约${Math.round(leg.duration/60)}分钟</p>`)).join('')}`;fit();
  }
  $('#route').addEventListener('click',e=>{
    const day=e.target.closest('[data-map-day]'),pin=e.target.closest('[data-pin]');
    if(day)show(Number(day.dataset.mapDay));if(pin){const marker=markers.get(pin.dataset.pin);if(marker){map.setView(marker.getLatLng(),16);marker.openPopup();}}
    if(e.target.closest('[data-fit]'))fit();
    if(e.target.closest('[data-fullscreen]')){const panel=document.querySelector('.map-layout');if(document.fullscreenElement)document.exitFullscreen();else panel.requestFullscreen?.().catch(()=>fit());}
  });
  new ResizeObserver(fit).observe($('#map'));document.addEventListener('fullscreenchange',()=>requestAnimationFrame(fit));show(0);
  try{const response=await fetch(config.routesFile||'routes.json');if(!response.ok)throw Error('Road cache missing');const cached=await response.json();roads=(cached.routes||[]).filter(r=>r.geometry?.type==='LineString');show(selected);}catch{ /* Keep points and navigation when cache is unavailable. */ }
}

function renderDays(){
  if(!data.days?.length){$('#itinerary').hidden=true;return;}
  $('#coverage').innerHTML=data.coverage?.length?`<details class="coverage"><summary>原攻略项目核对 · 安排与取舍</summary><div class="table-scroll"><table><thead><tr><th>原项目</th><th>安排</th><th>说明</th></tr></thead><tbody>${data.coverage.map(r=>`<tr><td>${escape(r.item)}</td><td>${escape(r.when)}</td><td>${escape(r.note)}</td></tr>`).join('')}</tbody></table></div></details>`:'';
  $('#days').innerHTML=data.days.map(day=>`<details class="day"><summary><span>DAY ${String(day.day).padStart(2,'0')}<br>${escape(day.date)}</span><div><strong>${escape(day.title)}</strong><small>${escape((day.locations||[]).join(' → '))}</small></div></summary><ol class="schedule">${(day.schedule||[]).map(item=>{const place=data.map?.places?.find(p=>p.id===item.placeId);return `<li><time>${escape(item.time||'待确认')}</time><div><strong>${escape(item.title||'')}</strong><p>${escape(item.text)}</p>${place?link('地点导航',`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`):''}${(item.links||[]).map(l=>link(l.label,l.url)).join('')}</div></li>`;}).join('')}</ol></details>`).join('');
}
function renderRental(){
  const r=data.rental;if(!r?.title){$('#drive').hidden=true;return;}
  $('#rental').innerHTML=`<article class="rental"><h3>${escape(r.title)}</h3><p>${escape(r.summary)}</p><dl>${(r.details||[]).map(d=>`<div><dt>${escape(d.label)}</dt><dd>${escape(d.value)}</dd></div>`).join('')}</dl><ul>${(r.notes||[]).map(n=>`<li>${escape(n)}</li>`).join('')}</ul>${(r.links||[]).map(l=>link(l.label,l.url)).join(' ')}</article>`;
}
function renderTodo(){
  const storage=`travel-plan:todo:v1:${data.trip.id}`;let todos=read(storage,null);
  if(!Array.isArray(todos)||todos.some(t=>typeof t.text!=='string'))todos=(data.todo||[]).map(text=>({text,done:false}));
  const draw=()=>$('#todos').innerHTML=todos.map((todo,index)=>`<li><label><input type="checkbox" data-todo="${index}" ${todo.done?'checked':''}><span>${escape(todo.text)}</span></label></li>`).join('');
  const store=()=>{try{localStorage.setItem(storage,JSON.stringify(todos));}catch{}};
  $('#todo-form').onsubmit=e=>{e.preventDefault();const text=$('#todo-text').value.trim();if(!text)return;todos.push({text,done:false});$('#todo-text').value='';store();draw();};
  $('#todos').onchange=e=>{if(e.target.dataset.todo===undefined)return;todos[Number(e.target.dataset.todo)].done=e.target.checked;store();};draw();
}
async function init(){
  try{
    const response=await fetch('trip-data.json',{cache:'no-store'});if(!response.ok)throw Error('Trip missing');data=await response.json();
    document.title=`${data.trip.title} · travel-plan`;$('#trip-title').textContent=data.trip.title;$('#trip-subtitle').textContent=data.trip.subtitle||'';
    $('#trip-facts').innerHTML=[data.trip.startDate&&`${data.trip.startDate} — ${data.trip.endDate}`,data.trip.travelers&&`${data.trip.travelers}人同行`,data.trip.nights&&`${data.trip.nights}晚住宿`,data.trip.currency&&`预算币种 ${data.trip.currency}`].filter(Boolean).map(t=>`<span>${escape(t)}</span>`).join('');
    $('#trip-notice').hidden=!data.trip.notice;$('#trip-notice').textContent=data.trip.notice||'';$('#constraints').innerHTML=(data.trip.constraints||[]).map(t=>`<span>${escape(t)}</span>`).join('');
    renderBudget();renderFlights();renderDays();renderRental();renderTodo();renderMap();
    $('#events').hidden=!data.events?.length;
    $('#event-cards').innerHTML=(data.events||[]).map(e=>`<article class="event"><span class="price-status">${escape(e.status||'待确认')}</span><h3>${escape(e.title)}</h3><strong>${escape(e.priceLabel||'费用待确认')}</strong><p>${escape(e.description||'')}</p><p class="quote-warning">${escape(e.conflict||'按实际行程安排，不重复预订。')}</p>${link('官方详情',e.url)}</article>`).join('');
    $('#research').hidden=!data.sources?.length;$('#sources').innerHTML=(data.sources||[]).map(s=>`<p>${link(s.label,s.url)||escape(s.label)}${s.checkedOn?' · '+escape(s.checkedOn):''}<br>${escape(s.note||'')}</p>`).join('');
    if(location.hash)requestAnimationFrame(()=>{try{document.querySelector(location.hash)?.scrollIntoView();}catch{}});
  }catch(error){console.error(error);$('#load-error').hidden=false;}
}
init();
