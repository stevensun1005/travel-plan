// travel-plan — https://github.com/stevensun1005/travel-plan
// Copyright 2026 Steven Sun (stevensun1005). SPDX-License-Identifier: Apache-2.0
// Reusing or adapting this file (by hand or with an AI assistant)? Keep this header
// and credit "travel-plan by Steven Sun" with the link above. See LICENSE and NOTICE.

import {calculate,normalize,validMoney,nearestIndex,daysUntil,itemize} from './budget.mjs';
import {i18n,wantedLang,switchLang,startI18n} from './i18n.mjs';

// 链接预览：claude.ai 在服务器上用无头浏览器给 Artifact 页面顶部截一张 1200×630 的图当预览。认出这种截图时
// （外层是 frame-thumb-host，或在 Artifact 里的自动化/无头浏览器；也可加 ?preview-card 自己看），整屏只显示 make_card.py 生成的 og.png，
// 预览就是那张卡片。万一认错了真人，点一下、滚一下或按任意键卡片就消失；没有 og.png 时什么也不做。
const PREVIEW=(()=>{try{
  if(new URLSearchParams(location.search).has('preview-card'))return true;
  if([...(location.ancestorOrigins||[])].some(o=>o.includes('frame-thumb-host')))return true;
  const inArtifact=location.href==='about:srcdoc'||/\.claudeusercontent\.com$/.test(location.hostname);
  return inArtifact&&(navigator.webdriver===true||/HeadlessChrome/.test(navigator.userAgent));
}catch{return false;}})();
if(PREVIEW){
  const cover=document.createElement('div');cover.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#fbf7ec;cursor:pointer';
  const img=new Image();img.alt='';img.style.cssText='display:block;width:100%;height:auto';img.onerror=()=>cover.remove();img.src='og.png';
  cover.append(img);document.body.append(cover);
  const off=()=>{cover.remove();for(const t of ['pointerdown','keydown','wheel','touchstart'])removeEventListener(t,off,true);};
  for(const t of ['pointerdown','keydown','wheel','touchstart'])addEventListener(t,off,{capture:true,passive:true});
}

const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
const link=(label,value)=>url(value)?`<a href="${escape(url(value))}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`:'';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
let data,selection,key,basemap,cachedRoads=[];
const ledgerOpen=new Set();
const SKILL_REPO='https://github.com/stevensun1005/travel-plan';
const PHONE=matchMedia('(max-width:760px)');
const money=value=>{const n=Number(value);return `${data.trip.currency||'CAD'} ${n.toLocaleString('en-CA',Number.isInteger(n)?{maximumFractionDigits:0}:{minimumFractionDigits:2,maximumFractionDigits:2})}`;};
const color=(value,index)=>/^#[0-9a-f]{6}$/i.test(value||'')?value:['#2a70cf','#e07a12','#1f9652','#d2402f','#2b9c9a','#9b6dd0','#c99a1c','#8a958c'][index%8];
function save(){try{localStorage.setItem(key,JSON.stringify(selection));$('#save-status').textContent='已自动保存到当前浏览器';}catch{$('#save-status').textContent='本次选择有效，浏览器未能保存';}}

function renderBudget(){
  const budget=data.budget;
  if(!budget?.categories?.length){$('#budget').hidden=true;return;}
  key=`travel-plan:budget:v1:${data.trip.id}`;selection=normalize(budget,read(key,{}));
  $('#budget-planner').innerHTML=`<div class="budget-shell"><div class="budget-heading"><div><small>${data.trip.travelers}人 · 全程合计</small><strong class="budget-total" id="budget-total"></strong></div><label class="target">预算上限 · ${escape(data.trip.currency)}<input id="budget-target" aria-label="预算上限" type="number" min="1" max="1000000" step="0.01" value="${selection.target}"></label></div><div class="balance" id="budget-balance" role="status" aria-live="polite"></div><div class="presets"><button data-reset>恢复初始方案</button>${(budget.presets||[]).map(p=>`<button data-preset="${escape(p.id)}">${escape(p.label)}</button>`).join('')}<span class="saved" id="save-status">选择保存在当前浏览器</span></div><div class="budget-layout"><div class="choices">${budget.categories.map(c=>`<article class="choice" data-category="${escape(c.id)}"><header><label for="choice-${escape(c.id)}">${escape(c.label)}</label><strong data-amount></strong></header><select id="choice-${escape(c.id)}" data-select="${escape(c.id)}" aria-describedby="note-${escape(c.id)}">${c.options.map(o=>`<option value="${escape(o.id)}">${escape(o.label)}${o.source?` · ${escape(o.source)}`:''} · ${money(o.amount)}</option>`).join('')}<option value="custom">自定义总额…</option></select><label class="custom" hidden>自定义全程合计 · ${escape(data.trip.currency)}<input data-custom="${escape(c.id)}" aria-label="${escape(c.label)}自定义金额" type="number" min="0" max="1000000" step="0.01" value="0"></label><span class="price-status"></span><p id="note-${escape(c.id)}" data-note></p><div data-quotes></div><div data-source></div></article>`).join('')}</div><aside class="chart-panel"><h3>预算都花在哪？</h3><p>占当前总支出的百分比 · 点 + 看每一笔</p><svg id="budget-chart" viewBox="0 0 220 220" role="img" aria-label="分类支出占比，详见图例"></svg><ul class="ledger" id="budget-legend"></ul></aside></div><p class="fine">所有金额为同一旅行口径。查价记录与估算不是锁价，实时重算不代表商家实时调价。预算选择各自保存在浏览器，不自动同步；日程与地图仍按原排定方案参考。</p><p class="quote-warning" id="budget-warning"></p></div>`;
  $('#budget-planner').addEventListener('change',e=>{const id=e.target.dataset.select;if(!id)return;selection.selections[id].optionId=e.target.value;updateBudget(true);if(id==='flights')syncFlights();});
  $('#budget-planner').addEventListener('input',e=>{
    if(!e.target.matches('#budget-target,[data-custom]') || !e.target.validity.valid || !e.target.value.trim())return;
    const value=Number(e.target.value),target=e.target.id==='budget-target';if(!validMoney(value,target?1:0))return;
    if(target)selection.target=value;else selection.selections[e.target.dataset.custom].customAmount=value;
    updateBudget();if(e.target.dataset.custom==='flights')syncFlights();
  });
  $('#budget-planner').addEventListener('click',e=>{
    const ledger=e.target.closest('[data-ledger]');
    if(ledger){
      const id=ledger.dataset.ledger,open=!ledgerOpen.has(id),row=ledger.closest('.ledger-row');
      if(open)ledgerOpen.add(id);else ledgerOpen.delete(id);
      row.classList.toggle('open',open);ledger.setAttribute('aria-expanded',open);row.querySelector('.ledger-items').hidden=!open;row.querySelector('.ledger-toggle').textContent=open?'−':'+';
      return;
    }
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
  if(!sync)for(const row of result.rows)if(row.option.id!=='custom'){const s=document.querySelector(`[data-category="${row.id}"] select`);if(s&&s.value!==row.option.id)s.value=row.option.id;}
  $('#budget-total').textContent=money(result.total);$('#budget-balance').dataset.over=result.remaining<0;
  $('#budget-balance').innerHTML=`<span>${money(result.total)}</span><span>${result.remaining>=0?'预算内，还剩':'超出预算'} ${money(Math.abs(result.remaining))}</span>`;
  if(sync)$('#budget-target').value=result.target;
  for(const row of result.rows){
    const card=document.querySelector(`[data-category="${row.id}"]`);
    if(sync){card.querySelector('select').value=row.option.id;card.querySelector('input').value=result.selections[row.id].customAmount;}
    card.querySelector('[data-amount]').textContent=money(row.amount);card.querySelector('.custom').hidden=row.option.id!=='custom';
    const isLocked=result.locked.includes(row.id),select=card.querySelector('select');select.disabled=isLocked;
    for(const o of row.options.filter(o=>o.bundleOnly))select.querySelector(`option[value="${o.id}"]`).hidden=!isLocked;
    if(isLocked)select.value=row.option.id;
    card.querySelector('.price-status').textContent=(row.option.status||'待确认')+(row.splitFrom?` · 套餐按单买价拆分 ${Math.round(row.splitShare*100)}%`:'');card.querySelector('[data-note]').textContent=row.option.note||'';card.querySelector('[data-quotes]').innerHTML=quotesHtml(row.option);card.querySelector('[data-source]').innerHTML=link('查价入口',row.option.url);
    if(row.id==='bags')for(const o of row.options.filter(o=>o.bagCount)){
      const flight=result.rows.find(r=>r.id==='flights');const rate=flight?.option.bagPerPerson;
      card.querySelector(`option[value="${o.id}"]`).textContent=`${o.label} · ${money(validMoney(rate)?rate*o.bagCount:o.amount)}`;
    }
  }
  let offset=0;const circumference=2*Math.PI*80;
  $('#budget-chart').innerHTML=`<title>分类支出占比，总额${money(result.total)}</title><circle cx="110" cy="110" r="80" fill="none" stroke="#e5eadf" stroke-width="32"/>${chartRows(result).map((row,i)=>{
    if(!row.amount||!result.total)return '';
    const length=row.amount/result.total*circumference;const mark=`<circle class="slice" cx="110" cy="110" r="80" fill="none" stroke="${color(row.color,i)}" stroke-width="32" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)" tabindex="0"><title>${escape(row.label)} · ${money(row.amount)} · ${(row.amount/result.total*100).toFixed(1)}%</title></circle>`;offset+=length;return mark;
  }).join('')}<text class="chart-label" x="110" y="103" text-anchor="middle">全程合计 · ${escape(data.trip.currency)}</text><text class="chart-value" x="110" y="130" text-anchor="middle">${result.total.toLocaleString('en-CA',{maximumFractionDigits:2})}</text>`;
  // 记账式明细：每个分类一行，点 + 展开这一类里的每一笔。
  $('#budget-legend').innerHTML=chartRows(result).map((row,i)=>{
    const items=ledgerItems(row),pct=result.total?row.amount/result.total*100:0,name=row.label.split(/[｜|]/)[0].trim(),open=ledgerOpen.has(row.id),id=escape(row.id);
    const fine=items.some(it=>it.scaled)?`<li class="ledger-fine">${row.splitFrom?(items.length>1?'套餐价按单买价比例折到这一类，明细同比例折算':'套餐总价按单买价比例折到这一类'):'明细按当前选择同比例折算'}</li>`:'';
    return `<li class="ledger-row${open?' open':''}" style="--c:${color(row.color,i)}"><button type="button" class="ledger-head" data-ledger="${id}" aria-expanded="${open}" aria-controls="ledger-${id}"><span class="ledger-icon" aria-hidden="true">${escape(row.icon||name.slice(0,1))}</span><span class="ledger-name">${escape(name)}</span><span class="ledger-amount">${money(row.amount)}</span><span class="ledger-meta">${pct.toFixed(1)}%</span><span class="ledger-count">${items.length} 笔</span><span class="ledger-toggle" aria-hidden="true">${open?'−':'+'}</span><span class="ledger-bar" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i></span></button><ul class="ledger-items" id="ledger-${id}"${open?'':' hidden'}>${items.map(it=>`<li><span>${escape(it.label)}${it.note?`<small>${escape(it.note)}</small>`:''}</span><b>${money(it.amount)}<small>${(it.share*100).toFixed(1)}%</small></b></li>`).join('')}${fine}</ul></li>`;
  }).join('');
  const pending=result.rows.filter(row=>/尚无|未取得|no (actual )?quote|not (yet )?quoted/i.test(row.option.status||''));
  $('#budget-warning').textContent=result.total===0?'所有支出为0，填写金额后显示占比。':pending.length?`${pending.map(r=>r.option.label).join('、')}尚无实际报价；试算低于上限不等于能按此价格预订。`:'机票按完整往返计算，酒店按全住期计算；套餐中已包含的晚餐、接送和门票只计一次。';
  if(persist)save();
}

// 饼图分组：budget.chartGroups 里定义的组（例如两家酒店），左边分开选，右边饼图和明细合成一块，点开看每一项。
function chartRows(result){
  const groups=data.budget.chartGroups||{},out=[],byGroup=new Map();
  for(const row of result.rows){
    const g=row.chartGroup&&groups[row.chartGroup];
    if(!g){out.push(row);continue;}
    let agg=byGroup.get(row.chartGroup);
    if(!agg){agg={id:`group-${row.chartGroup}`,label:g.label||row.label,icon:g.icon||row.icon,color:g.color||row.color,amount:0,parts:[],option:{}};byGroup.set(row.chartGroup,agg);out.push(agg);}
    agg.amount=Math.round((agg.amount+row.amount)*100)/100;agg.parts.push(row);
  }
  return out;
}
function ledgerItems(row){
  if(!row.parts)return itemize(row);
  const total=row.amount;
  return row.parts.flatMap(part=>{
    const items=itemize(part),single=!(part.option?.items||[]).length;
    return items.map(it=>({...it,label:single?`${part.label.split(/[｜|]/)[0].trim()} · ${it.label}`:it.label,share:total?it.amount/total:0}));
  });
}
function renderCash(){
  // 换钱建议：data.cash = {summary,currencies[{code,label,symbol,amount,usd?,cad?,how}],items[{label,currency,amount,note}],tips[]}
  const c=data.cash,sec=$('#cash');if(!sec)return;if(!c?.currencies?.length){sec.hidden=true;return;}
  sec.hidden=false;
  const fmt=(sym,n)=>`${sym}${Number(n).toLocaleString('en-CA',{maximumFractionDigits:2})}`;
  const sym=Object.fromEntries(c.currencies.map(x=>[x.code,x.symbol||x.code+' ']));
  const cards=c.currencies.map(x=>{
    const mine=(c.items||[]).filter(i=>i.currency===x.code),used=mine.reduce((s,i)=>s+Number(i.amount||0),0);
    const eq=[x.usd&&`≈ US$${Number(x.usd).toLocaleString('en-CA',{maximumFractionDigits:0})}`,x.cad&&`≈ CA$${Number(x.cad).toLocaleString('en-CA',{maximumFractionDigits:0})}`].filter(Boolean).join(' · ');
    const rows=mine.map(i=>`<li><span>${escape(i.label)}${i.note?`<small>${escape(i.note)}</small>`:''}</span><b>${fmt(sym[i.currency],i.amount)}</b></li>`).join('');
    const sum=used&&used!==Number(x.amount)?`<li class="cash-sum"><span>用途合计（带的钱按面额凑整）</span><b>${fmt(x.symbol||'',used)}</b></li>`:'';
    return `<article class="cash-card"><p class="cash-label">${escape(x.label)}</p><p class="cash-amount">${fmt(x.symbol||'',x.amount)}</p>${eq?`<p class="cash-eq">${escape(eq)}</p>`:''}<p class="cash-how">${escape(x.how||'')}</p>${rows?`<ul class="cash-items">${rows}${sum}</ul>`:''}</article>`;
  }).join('');
  $('#cash-body').innerHTML=`${c.summary?`<p class="cash-summary">${escape(c.summary)}</p>`:''}<div class="cash-grid">${cards}</div>${c.tips?.length?`<ul class="cash-tips">${c.tips.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>`:''}${c.asOf?`<p class="cash-asof">资料核对于 ${escape(c.asOf)}</p>`:''}`;
}
function quotesHtml(option){
  // 各平台比价：同一个产品在不同平台的含税总价，已按 fx 换算成旅行币种，最便宜的在最上面。
  const quotes=option?.id!=='custom'&&Array.isArray(option?.quotes)?option.quotes:[];if(!quotes.length)return '';
  const cur=data.trip.currency,fx=data.fx;
  const rows=quotes.map(q=>{
    const name=q.url?`<a href="${escape(q.url)}" target="_blank" rel="noopener">${escape(q.platform)}</a>`:escape(q.platform);
    if(q.available===false)return `<li class="na"><span>${name}<small>${escape(q.note||'没有可订的')}</small></span><b>—</b></li>`;
    const original=q.currency&&q.currency!==cur?`<small>${escape(q.currency)} ${Number(q.amount).toLocaleString('en-CA')}</small>`:'';
    const best=option.source===q.platform&&validMoney(q.converted)&&q.converted===option.amount;
    return `<li class="${best?'best':''}"><span>${name}${best?'<i>最低</i>':''}${q.note?`<small>${escape(q.note)}</small>`:''}</span><b>${validMoney(q.converted)?money(q.converted):'—'}${original}</b></li>`;
  }).join('');
  const foreign=quotes.some(q=>q.available!==false&&q.currency&&q.currency!==cur);
  const rate=foreign&&fx?.rates&&Object.keys(fx.rates).length?`<p class="fx">汇率：${Object.entries(fx.rates).map(([k,v])=>`1 ${escape(k)} = ${v} ${escape(cur)}`).join('，')}${fx.source?`（${escape(fx.source)}${fx.date?` ${escape(fx.date)}`:''}）`:''}</p>`:'';
  return `<details class="quotes"${PHONE.matches?'':' open'}><summary>各平台比价 · ${quotes.length}个平台</summary><ul>${rows}</ul>${rate}</details>`;
}
function flightMarkup(journey,index){
  const row=selection?calculate(data.budget,selection).rows.find(row=>row.id==='flights'):null;
  let p={...journey.proposal,...row?.option.journeys?.[index]};
  if(row?.option.id==='custom')p={...p,airline:'自定义机票预算',departure:{...p.departure,time:'待确认'},arrival:{...p.arrival,time:'待确认'},route:'具体航班待确认',duration:'时长待确认',connection:'中转待确认',note:'仅填了费用，不能据此判断实际航班时刻。'};
  const amount=row?.amount??p.roundTripTotal;
  return `<div class="flight-top"><span>${index===0?'OUTBOUND · 去程':'RETURN · 回程'}</span><span>${data.trip.demo?'虚构演示':'候选方案 · 以出票为准'}</span></div><p>${escape(p.airline||'航空公司待确认')} · 所有时刻为当地时间</p><div class="flight-times"><div><b>${escape(p.departure?.airport||'待确认')}</b><strong>${escape(p.departure?.time||'待确认')}</strong><small>${escape(p.departure?.date||'')}</small></div><span>→</span><div><b>${escape(p.arrival?.airport||'待确认')}</b><strong>${escape(p.arrival?.time||'待确认')}</strong><small>${escape(p.arrival?.date||'')}</small></div></div><h3>${escape(p.route||journey.title)}</h3><p>${escape(p.duration||'时长待确认')} · ${escape(p.connection||'转机待确认')}</p><div class="flight-price">${amount===undefined?'机票费用待确认':row?.splitFrom?`套餐里的机票部分 ${money(amount)}<small> · 套餐共 ${money(row.packageTotal)}</small>`:`全程往返 ${money(amount)}`}</div><p>${escape(row?.option.fareFamily||p.fareFamily||'舱等待确认')} · 同一往返总价，不重复计费</p><p>${escape(p.note||row?.option.note||'')}</p>${link('查看来源',p.url||row?.option.url)}`;
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
  const map=L.map('map',{scrollWheelZoom:false,zoomSnap:.25,zoomDelta:1});L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on('tileerror',e=>{e.tile.style.visibility='hidden';}).addTo(map);L.control.scale({imperial:false}).addTo(map);
  // World outline (Natural Earth 1:110m, bundled): countries and their names stay visible when zoomed out,
  // even where online tiles are blocked. Names thin out by rank as you zoom in and hide once the trip map takes over.
  map.createPane('world').style.zIndex=140;
  const worldLabels=L.layerGroup().addTo(map);
  const syncWorld=()=>{const z=map.getZoom(),max=z<=2?2:z<=3?3:z<=4?4:z<=5?5:z<=6?7:0;worldLabels.eachLayer(m=>m.getElement()?.classList.toggle('hide',m.options.rank>max));};
  fetch('vendor/world/countries-110m.json').then(r=>r.ok?r.json():null).then(w=>{
    if(!w?.countries)return;const ring=pts=>pts.map(([x,y])=>[y,x]);
    L.polygon(w.countries.flatMap(c=>c.p.map(ring)),{pane:'world',interactive:false,color:'#b9b19b',weight:.8,fillColor:'#f3f0e2',fillOpacity:1}).addTo(map);
    w.countries.forEach(c=>L.marker([c.y,c.x],{pane:'world',interactive:false,keyboard:false,rank:c.r,icon:L.divIcon({className:'world-label',html:`<span>${escape(i18n.lang==='en'&&c.e?c.e:c.n)}</span>`,iconSize:null})}).addTo(worldLabels));
    syncWorld();
  }).catch(()=>{});
  map.on('zoomend',syncWorld);
  if(config.home&&Number.isFinite(config.home.lat)&&Number.isFinite(config.home.lng)){
    map.createPane('home').style.zIndex=450;
    L.marker([config.home.lat,config.home.lng],{pane:'home',interactive:false,keyboard:false,icon:L.divIcon({className:'home-label',html:`<span>★ ${escape(config.home.name||'出发地')}</span>`,iconSize:null})}).addTo(map);
  }
  // Offline base map (land, forests, roads by class, shields, place names) drawn under the tiles.
  // It shows wherever online tiles are blocked (some hosts' CSP) — see scripts/fetch_basemap.py.
  map.createPane('base').style.zIndex=150;
  fetch(config.basemapFile||'basemap.json').then(r=>r.ok?r.json():null).then(b=>{
    if(!b)return;basemap=b;const ll=line=>line.map(([x,y])=>[y,x]),flat={pane:'base',interactive:false};
    if(b.land?.length)L.polygon(b.land.map(poly=>poly.map(ll)),{...flat,stroke:false,fillColor:'#f3f0e2',fillOpacity:1}).addTo(map);
    else{$('#map').classList.add('base-land');if(b.coast?.length)L.polyline(b.coast.map(ll),{...flat,color:'#6f9fb3',weight:2}).addTo(map);}
    if(b.green?.length)L.polygon(b.green.map(poly=>poly.map(ll)),{...flat,stroke:false,fillColor:'#cfe2bd',fillOpacity:.85}).addTo(map);
    if(b.water?.length)L.polygon(b.water.map(poly=>poly.map(ll)),{...flat,color:'#8fb6c9',weight:1,fillColor:'#bcd8e6',fillOpacity:1}).addTo(map);
    // Roads from small to big: tertiary, secondary, primary, trunk, motorway — the big ones with a soft casing so they read on the paper.
    for(const [cls,w,c] of [['tertiary',.9,'#ddd6c2'],['secondary',1.3,'#d3cdb8'],['primary',2,'#f2d48c'],['trunk',2.6,'#efb36b'],['motorway',3.2,'#e38f4a']]){
      const lines=b.roads?.[cls];if(!lines?.length)continue;
      if(cls!=='secondary'&&cls!=='tertiary')L.polyline(lines.map(ll),{...flat,color:'#8c7a5e',weight:w+1.6,opacity:.35}).addTo(map);
      L.polyline(lines.map(ll),{...flat,color:c,weight:w}).addTo(map);
    }
    const tag=(lat,lng,cls,html)=>L.marker([lat,lng],{pane:'base',interactive:false,keyboard:false,icon:L.divIcon({className:cls,html:`<span>${html}</span>`,iconSize:null})}).addTo(map);
    (b.shields||[]).forEach(s=>tag(s.lat,s.lng,`base-shield${s.cls==='motorway'?' interstate':''}`,escape(s.ref)));
    (b.labels||[]).forEach(l=>tag(l.lat,l.lng,`base-label rank-${l.rank} kind-${l.kind||'town'}`,(l.kind==='peak'?'▲ ':'')+escape(l.name)));
  }).catch(()=>{});
  const layer=L.featureGroup().addTo(map),markers=new Map();let selected=0,roads=[];
  const get=id=>config.places.find(p=>p.id===id);
  $('#map-days').innerHTML=`<button data-map-day="0" aria-pressed="true">全部路线</button>${config.dailyRoutes.map(r=>`<button data-map-day="${r.day}" aria-pressed="false">${escape(r.label||`Day ${r.day}`)}</button>`).join('')}`;
  const fit=()=>{map.invalidateSize();if(layer.getLayers().length)map.fitBounds(layer.getBounds(),{padding:[14,14],maxZoom:15});};
  function show(day){
    selected=day;layer.clearLayers();markers.clear();const route=config.dailyRoutes.find(r=>r.day===day);
    document.querySelectorAll('[data-map-day]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.mapDay)===day));
    const visible=route?[...new Set([...route.placeIds,...(route.extraPlaceIds||[])])].map(get):config.places;
    const lines=roads.filter(r=>!day||r.day===day);
    for(const line of lines){L.geoJSON(line.geometry,{style:{color:'#2a2a2e',weight:7,opacity:.85}}).addTo(layer);L.geoJSON(line.geometry,{style:{color:color(null,line.day-1),weight:4}}).addTo(layer);}
    visible.forEach((p,index)=>{const marker=L.marker([p.lat,p.lng],{title:p.name,icon:L.divIcon({className:'map-pin',html:String(index+1),iconSize:[30,30],iconAnchor:[15,15]})}).bindPopup(`<b>${escape(p.name)}</b><br>${escape(p.address||'')}<br>${escape(p.note||'')}<br>${link('Google Maps',`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`)}`).addTo(layer);markers.set(p.id,marker);});
    const special=route&&!['driving','transfer','walking'].includes(route.transport);const navigation=route&&!special?directions(route.placeIds.map(get),route.transport==='walking'?'walking':'driving'):'';
    const distance=lines.reduce((sum,r)=>sum+r.distance,0),duration=lines.reduce((sum,r)=>sum+r.duration,0);
    $('#map-details').innerHTML=`<h3>${escape(route?data.days.find(d=>d.day===day)?.title||route.label:data.trip.title)}</h3><p>${escape(route?.note||'按日期查看地点、道路和导航。')}</p><p>${lines.length?`道路约${(distance/1000).toFixed(1)} km · 路网估时${Math.round(duration/60)}分钟`:special?'此日使用专用交通，以官方线路为准，不画汽车最短路线。':'道路缓存待补充；先显示准确地点，不画示意连线。'}</p><div class="map-actions">${link(special?'官方线路':'当天导航',special?route.officialUrl:navigation)}<button data-fit>完整范围</button>${config.home?`<button data-home>和${escape((config.home.name||'出发地').replace(/（.*?）|\(.*?\)/g,''))}一起看</button>`:''}<button data-fullscreen>全屏地图</button></div><p class="swipe-hint">${visible.length}个地点 · 左右滑动，点一下在地图上定位</p><ol class="map-stops">${visible.map((p,i)=>`<li><button data-pin="${escape(p.id)}">${i+1}. ${escape(p.name)}</button><small>${escape(p.address||p.note||'')}</small></li>`).join('')}</ol>${legsHtml(lines)}`;fit();
  }
  function legsHtml(lines){
    // 分段路程：电脑上默认展开，手机上收起，免得把页面拉得很长。
    const legs=lines.flatMap(line=>line.legs.map((leg,i)=>`<p>${escape(get(line.placeIds[i]).name)} → ${escape(get(line.placeIds[i+1]).name)}<br>${(leg.distance/1000).toFixed(1)} km · 约${Math.round(leg.duration/60)}分钟</p>`));
    return legs.length?`<details class="map-legs"${PHONE.matches?'':' open'}><summary>分段路程 · ${legs.length}段</summary>${legs.join('')}</details>`:'';
  }
  $('#route').addEventListener('click',e=>{
    const day=e.target.closest('[data-map-day]'),pin=e.target.closest('[data-pin]');
    if(day)show(Number(day.dataset.mapDay));if(pin){const marker=markers.get(pin.dataset.pin);if(marker){if(PHONE.matches)$('#map').scrollIntoView({block:'nearest',behavior:'smooth'});map.setView(marker.getLatLng(),16);marker.openPopup();}}
    if(e.target.closest('[data-fit]'))fit();
    if(e.target.closest('[data-home]')&&config.home){const b=L.latLngBounds(config.places.map(p=>[p.lat,p.lng]));b.extend([config.home.lat,config.home.lng]);map.invalidateSize();map.fitBounds(b,{padding:[40,40]});}
    if(e.target.closest('[data-fullscreen]')){const panel=document.querySelector('.map-layout');if(document.fullscreenElement)document.exitFullscreen();else panel.requestFullscreen?.().catch(()=>fit());}
  });
  $('#share-map').onclick=async()=>{const btn=$('#share-map');btn.disabled=true;btn.textContent='正在画…';try{const m=await import('./share-map.mjs');await m.openShareMap({data,roads:cachedRoads,basemap,color});}catch(error){console.error(error);}finally{btn.disabled=false;btn.textContent='分享路线图';}};
  new ResizeObserver(fit).observe($('#map'));document.addEventListener('fullscreenchange',()=>requestAnimationFrame(fit));show(0);
  try{const response=await fetch(config.routesFile||'routes.json');if(!response.ok)throw Error('Road cache missing');const cached=await response.json();roads=(cached.routes||[]).filter(r=>r.geometry?.type==='LineString');show(selected);cachedRoads=roads;}catch{ /* Keep points and navigation when cache is unavailable. */ }
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
function renderChecklist(){
  // Pre-departure checklist: documents, bookings with release windows/deadlines, and other to-dos.
  const list=data.checklist;if(!list?.items?.length){$('#checklist').hidden=true;$('a[href="#checklist"]')?.setAttribute('hidden','');return;}
  const storage=`travel-plan:checklist:v1:${data.trip.id}`,saved=read(storage,{});const done=saved&&typeof saved==='object'?saved:{};
  const groups=list.groups?.length?list.groups:[{id:'',label:'待办'}];
  // 只在手机上折叠（电脑上全部展开）；group.open:false 表示手机上默认收起。勾选后重画时保留当前展开状态。
  const defaults=()=>new Map(groups.map(g=>[g.id||'',!PHONE.matches||g.open!==false]));
  let opened=defaults();
  const sortKey=item=>daysUntil(item.due)??1e6;
  const isDone=item=>done[item.id]??(item.status==='done'||item.status==='booked');
  const chip=item=>{
    const n=daysUntil(item.due);if(n===null)return item.dueLabel?`<span class="due">${escape(item.dueLabel)}</span>`:'';
    const when=n<0?`已过 ${-n} 天`:n===0?'今天':`还有 ${n} 天`,state=isDone(item)?'done':n<0?'late':n<=14?'soon':'later';
    return `<span class="due ${state}" title="${escape(item.due)}">${escape(item.dueLabel||item.due.slice(5).replace('-','/'))} · ${when}</span>`;
  };
  const draw=()=>{
    const open=list.items.filter(i=>!isDone(i)),next=[...open].sort((a,b)=>sortKey(a)-sortKey(b))[0];
    $('#checklist-summary').innerHTML=`<strong>还有 ${open.length} / ${list.items.length} 项</strong>${next?` · 最近：${escape(next.title)} ${chip(next)}`:' · 全部完成'}${list.asOf?`<small>资料核对于 ${escape(list.asOf)}</small>`:''}`;
    $('#checklist-groups').innerHTML=groups.map(g=>{
      const items=list.items.filter(i=>(i.group||'')===(g.id||'')||(!g.id&&!groups.some(x=>x.id===i.group))).sort((a,b)=>sortKey(a)-sortKey(b));
      if(!items.length)return '';
      const left=items.filter(i=>!isDone(i)).length;
      return `<details class="check-group" data-group="${escape(g.id||'')}"${opened.get(g.id||'')?' open':''}><summary><h3>${escape(g.label)}<small>${left?`${left} 项待办`:'都办好了'}</small></h3><span class="fold" aria-hidden="true"></span></summary><ul>${items.map(i=>`<li class="${isDone(i)?'is-done':''}"><label><input type="checkbox" data-check="${escape(i.id)}" ${isDone(i)?'checked':''}><span class="check-title">${escape(i.title)}</span></label><div class="check-meta">${i.who?`<span class="who">${escape(i.who)}</span>`:''}${chip(i)}${i.lead?`<span class="lead">${escape(i.lead)}</span>`:''}</div>${i.note?`<p>${escape(i.note)}</p>`:''}${link(i.urlLabel||'官方入口',i.url)}</li>`).join('')}</ul></details>`;
    }).join('');
    const facts=$('#trip-facts');if(facts&&!facts.querySelector('.todo-fact'))facts.insertAdjacentHTML('beforeend','<a class="todo-fact" href="#checklist"></a>');
    const fact=facts?.querySelector('.todo-fact');if(fact)fact.textContent=open.length?`待办 ${open.length} 项`:'待办已完成';
  };
  $('#checklist-groups').addEventListener('toggle',e=>{const g=e.target.closest?.('[data-group]');if(g)opened.set(g.dataset.group,g.open);},true);
  $('#checklist-groups').addEventListener('click',e=>{if(!PHONE.matches&&e.target.closest('summary'))e.preventDefault();});
  PHONE.addEventListener?.('change',()=>{opened=defaults();draw();});
  $('#checklist-groups').onchange=e=>{const id=e.target.dataset.check;if(!id)return;done[id]=e.target.checked;try{localStorage.setItem(storage,JSON.stringify(done));}catch{}draw();};
  draw();
}
function navSpy(){
  // 顶栏高亮当前看到的区块。
  const links=new Map([...document.querySelectorAll('.topbar nav a[href^="#"]')].map(a=>[a.hash.slice(1),a]));
  if(!links.size||!('IntersectionObserver' in window))return;
  const io=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){links.forEach(a=>a.removeAttribute('aria-current'));links.get(e.target.id)?.setAttribute('aria-current','location');}},{rootMargin:'-40% 0px -55% 0px'});
  links.forEach((a,id)=>{const s=document.getElementById(id);if(s)io.observe(s);});
}
function renderOwnPrompt(){
  // "Make your own" card: a ready-to-paste prompt that installs the skill and starts a new plan.
  const box=$('#own-prompt');if(!box)return;
  box.value=i18n.lang==='en'?[
    `Please install the travel-plan skill: ${SKILL_REPO}`,
    `- If you are Claude Code: run git clone ${SKILL_REPO} ~/.claude/skills/travel-plan`,
    '- If you are Codex: git clone the repository into a temporary folder, then run python scripts/install.py inside it',
    '- If it is already installed, git pull in the installed folder to update it',
    `Then read its SKILL.md and use it to make me a trip page like "${data.trip.title}": flights and hotels compared across booking sites, a budget that follows our choices, a real route map, a day-by-day plan, a pre-departure checklist and a shareable route poster, in Chinese and English.`,'',
    'About my trip:',
    '- From → to:',
    '- Departure and return dates:',
    '- Travelers, each one\'s passport, residency and existing visas:',
    '- Budget limit and currency:',
    '- Must-dos / things we do not want:',
    '- Food, fitness and pace:','',
    'Start with what I have given you and only ask about what is really missing.',
  ].join('\n'):[
    `帮我安装 travel-plan 旅行规划 skill：${SKILL_REPO}`,
    `- 如果你是 Claude Code：运行 git clone ${SKILL_REPO} ~/.claude/skills/travel-plan`,
    '- 如果你是 Codex：把仓库 git clone 到一个临时文件夹，进去运行 python scripts/install.py',
    '- 已经装过的话，就进安装好的文件夹 git pull 更新到最新版',
    `装好后读一遍里面的 SKILL.md，再用它帮我做一份像「${data.trip.title}」这样的旅行攻略网页：机票酒店多平台比价、跟着选择变的预算、真实路线地图、每日行程、出发前清单和分享路线图，中英文都能看。`,'',
    '我的情况：',
    '- 出发地 → 目的地：',
    '- 出发和回家的日期：',
    '- 几个人，每个人的护照国籍、居留身份和已有签证：',
    '- 预算上限和币种：',
    '- 一定要去的 / 不想做的：',
    '- 饮食、体力和节奏上的要求：','',
    '先用我给的信息开始，只问真正缺的。',
  ].join('\n');
  const status=$('#copy-status');
  // 底部卡片和顶栏按钮共用：writeText 必须在点击里直接调用。
  const copy=async fromTop=>{
    try{
      await navigator.clipboard.writeText(box.value);
      status.textContent='已复制，粘贴给 Claude Code 或 Codex 就能开始';
      if(fromTop)toast('已复制提示词：粘贴给 Claude Code 或 Codex，就能做一份自己的攻略');
    }catch{
      if(fromTop)$('#make-your-own').scrollIntoView({behavior:'smooth'});
      box.closest('details').open=true;box.focus({preventScroll:fromTop});box.select();
      status.textContent='浏览器不让直接复制：已经帮你选中，按 Ctrl+C（手机长按）复制';
    }
  };
  $('#copy-prompt').onclick=()=>copy(false);
  const topBtn=$('#own-top');if(topBtn)topBtn.onclick=()=>copy(true);
}
function toast(message){
  let el=document.querySelector('.toast');
  if(!el){el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.append(el);}
  el.textContent=message;el.classList.add('show');
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),3200);
}
function renderTodo(){
  const storage=`travel-plan:todo:v1:${data.trip.id}`;let todos=read(storage,null);
  if(!Array.isArray(todos)||todos.some(t=>typeof t.text!=='string'))todos=(data.todo||[]).map(text=>({text,done:false}));
  const draw=()=>$('#todos').innerHTML=todos.map((todo,index)=>`<li><label><input type="checkbox" data-todo="${index}" ${todo.done?'checked':''}><span>${escape(todo.text)}</span></label></li>`).join('');
  const store=()=>{try{localStorage.setItem(storage,JSON.stringify(todos));}catch{}};
  $('#todo-form').onsubmit=e=>{e.preventDefault();const text=$('#todo-text').value.trim();if(!text)return;todos.push({text,done:false});$('#todo-text').value='';store();draw();};
  $('#todos').onchange=e=>{if(e.target.dataset.todo===undefined)return;todos[Number(e.target.dataset.todo)].done=e.target.checked;store();};draw();
}
// ?card：只画 1200×630 的分享卡片（scripts/make_card.py 截图存成 og.png），不渲染攻略页
async function renderCard(){
  const m=await import('./share-map.mjs');let total=0;try{total=calculate(data.budget||{categories:[]},null).total;}catch{}
  const canvas=await m.drawCard({data,color,total});
  canvas.style.cssText='display:block;width:1200px;height:630px';document.body.replaceChildren(canvas);document.body.style.cssText='margin:0;background:#fbf7ec;overflow:hidden';
  document.documentElement.dataset.card='ready';
}
async function init(){
  try{
    // 中英文：有 trip-data.en.json 才显示切换按钮；默认中文。
    const enRes=await fetch('trip-data.en.json',{cache:'no-store'}).catch(()=>null);const hasEn=!!enRes?.ok;
    const lang=hasEn?wantedLang():'zh';startI18n(lang);
    const langBtn=$('#lang-btn');if(langBtn&&hasEn){langBtn.hidden=false;langBtn.textContent=lang==='en'?'ZH':'EN';langBtn.setAttribute('aria-label',lang==='en'?'Switch to Chinese':'切换到英文');langBtn.onclick=()=>switchLang(lang==='en'?'zh':'en');}
    const response=lang==='en'?enRes:await fetch('trip-data.json',{cache:'no-store'});if(!response.ok)throw Error('Trip missing');data=await response.json();
    if(lang==='en')document.querySelector('meta[name="description"]')?.setAttribute('content',data.trip.subtitle||data.trip.title);
    if(new URLSearchParams(location.search).has('card'))return renderCard();
    document.title=`${data.trip.title} · travel-plan`;$('#trip-title').textContent=data.trip.title;if(data.trip.kicker&&$('#trip-kicker'))$('#trip-kicker').textContent=data.trip.kicker;$('#trip-subtitle').textContent=data.trip.subtitle||'';
    $('#trip-facts').innerHTML=[data.trip.startDate&&`${data.trip.startDate} — ${data.trip.endDate}`,data.trip.travelers&&`${data.trip.travelers}人同行`,data.trip.nights&&`${data.trip.nights}晚住宿`,data.trip.currency&&`预算币种 ${data.trip.currency}`].filter(Boolean).map(t=>`<span>${escape(t)}</span>`).join('');
    $('#trip-notice').hidden=!data.trip.notice;$('#trip-notice').textContent=data.trip.notice||'';$('#constraints').innerHTML=(data.trip.constraints||[]).map(t=>`<span>${escape(t)}</span>`).join('');
    renderBudget();renderCash();renderFlights();renderDays();renderRental();renderChecklist();renderTodo();renderOwnPrompt();navSpy();renderMap();
    $('#events').hidden=!data.events?.length;
    $('#event-cards').innerHTML=(data.events||[]).map(e=>`<article class="event"><span class="price-status">${escape(e.status||'待确认')}</span><h3>${escape(e.title)}</h3><strong>${escape(e.priceLabel||'费用待确认')}</strong><p>${escape(e.description||'')}</p><p class="quote-warning">${escape(e.conflict||'按实际行程安排，不重复预订。')}</p>${link('官方详情',e.url)}</article>`).join('');
    $('#research').hidden=!data.sources?.length;$('#sources').innerHTML=(data.sources||[]).map(s=>`<p>${link(s.label,s.url)||escape(s.label)}${s.checkedOn?' · '+escape(s.checkedOn):''}<br>${escape(s.note||'')}</p>`).join('');
    if(location.hash)requestAnimationFrame(()=>{try{document.querySelector(location.hash)?.scrollIntoView();}catch{}});
  }catch(error){console.error(error);$('#load-error').hidden=false;}
}
init();
