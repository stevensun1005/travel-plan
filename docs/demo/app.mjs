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
// Google Maps 按地名搜（place.maps），没写才退回坐标；place.photos 是看照片的搜索词（没门票的景点、观景台、海滩）
const mapsQuery=p=>typeof p.maps==='string'&&p.maps.trim()?p.maps.trim():`${p.lat},${p.lng}`;
const mapsLink=p=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery(p))}`;
// 导航：点地址直接打开 Google Maps 路线（手机上会跳到地图 App），目的地用地点名称，不用经纬度
const navLink=p=>`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQuery(p))}`;
const placeLinks=p=>(p.address?`<a class="addr" href="${escape(navLink(p))}" target="_blank" rel="noopener noreferrer" title="导航到这里">📍 ${escape(p.address)}</a>`:link('地点导航',navLink(p)))+photosLink(p);
const photosLink=p=>p.photos?link('看照片',`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(typeof p.photos==='string'?p.photos:mapsQuery(p))}`):'';
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
let data,selection,key,basemap,cachedRoads=[];
const ledgerOpen=new Set();
const SKILL_REPO='https://github.com/stevensun1005/travel-plan';
const PHONE=matchMedia('(max-width:760px)');
const money=value=>{const n=Number(value);return `${data.trip.currency||'CAD'} ${n.toLocaleString('en-CA',Number.isInteger(n)?{maximumFractionDigits:0}:{minimumFractionDigits:2,maximumFractionDigits:2})}`;};
const color=(value,index)=>/^#[0-9a-f]{6}$/i.test(value||'')?value:['#2a70cf','#e07a12','#1f9652','#d2402f','#2b9c9a','#9b6dd0','#c99a1c','#8a958c'][index%8];
function save(){$('#save-status').textContent=persist('budget',selection)?(cloud&&!cloud.readonly?'已保存，并同步到云端':'已自动保存到当前浏览器'):'本次选择有效，浏览器未能保存';}

// 预算和出发前清单联动：清单项写 budget: 预算分类 id（可再写 budgetOptions: [方案 id]，只在选了这些方案时出现）。
// 标题里的 {option} 换成当前选中的方案名；方案上的 booking:{title,note,url,urlLabel,due,lead} 会覆盖清单项，booking:false 表示这个方案不用单独订；
// 一个分类关联了好几项时，booking 可以按清单项 id 分开写：{"清单项id":{title…}|false}。
// 勾选按「清单项@方案」记，换了方案就是一项新的待订；某一类关联的待订全部勾上，预算卡片显示「已预订」并变绿。
let checks=null,redrawChecklist=()=>{};
const checkState=()=>checks??=(o=>o&&typeof o==='object'&&!Array.isArray(o)?o:{})(read(`travel-plan:checklist:v1:${data.trip.id}`,{}));
// ---------- 保存与同步 ----------
// 页面上点的东西（预算方案、清单打勾、待办、行程的「夯/待定/额」）都先存进本机 localStorage，再三条路带到别处：
// 1) 发布成 claude.ai Artifact 并声明 capabilities:{db:{}} 时，整份状态存进 Artifact 的共享数据（trips/<行程id>），
//    同一个账号在手机、电脑上打开会自动同步；没有写权限的人看到主人的选择，自己的改动只留在本机。
// 2) 同步码：把整份状态编码成一段文字，复制到另一台设备粘贴导入（哪里都能用）。
// 3) 同步链接：独立网页（GitHub Pages 等）上再给一条带 #sync= 的链接，打开就导入。
// 同一份数据以最后保存的为准（savedAt）。
const KINDS=['budget','checklist','todo','votes','swaps'];
const stateKey=kind=>`travel-plan:${kind}:v1:${data.trip.id}`;
const savedAt=()=>Number(read(stateKey('saved'),0))||0;
let applying=false,cloud=null;
function persist(kind,value){
  const k=stateKey(kind),text=JSON.stringify(value);
  try{if(localStorage.getItem(k)===text)return true;localStorage.setItem(k,text);localStorage.setItem(stateKey('saved'),String(Date.now()));}catch{return false;}
  cloudPush();return true;
}
function snapshot(){
  const s={trip:data.trip.id,savedAt:savedAt()};
  for(const kind of KINDS){const v=read(stateKey(kind),null);if(v!=null)s[kind]=v;}
  return s;
}
function applyState(body,stamp){
  applying=true;
  try{
    for(const kind of KINDS)if(body[kind]!=null)localStorage.setItem(stateKey(kind),JSON.stringify(body[kind]));
    localStorage.setItem(stateKey('saved'),String(stamp??body.savedAt??Date.now()));
  }catch{}
  try{refreshSaved();}finally{applying=false;}
}
// 别处的数据写进来以后，只重画受影响的部分，不重复绑定事件
function refreshSaved(){
  if(data.budget?.categories?.length){selection=normalize(data.budget,read(key,{}));updateBudget(false,false);$('#budget-target').value=selection.target;syncFlights();}
  checks=null;redrawChecklist();renderTodo();drawVotes();drawSwaps();
}
const encodeState=s=>{const bytes=new TextEncoder().encode(JSON.stringify(s));let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const decodeState=code=>{const b=atob(code.trim().replace(/^.*#sync=/,'').replace(/-/g,'+').replace(/_/g,'/'));return JSON.parse(new TextDecoder().decode(Uint8Array.from(b,c=>c.charCodeAt(0))));};
function importCode(code){
  let body;try{body=decodeState(code);}catch{return '同步码不完整，复制时要整段复制';}
  if(!body||typeof body!=='object'||body.trip!==data.trip.id)return '这段同步码不是这份攻略的';
  applyState(body,Date.now());cloudPush();return '';
}
const standalone=(()=>{try{return window.top===window&&/^https?:$/.test(location.protocol);}catch{return false;}})();
function syncStatus(){
  if(!cloud)return {short:'同步',long:'选择存在这台设备的浏览器里。换设备时，用下面的同步码（或同步链接）带过去。'};
  if(cloud.state==='connecting')return {short:'同步',long:'正在连接云端…'};
  if(cloud.state==='offline')return {short:'同步',long:'云端暂时连不上，选择先存在本机，连上后会自动同步。'};
  if(cloud.readonly)return {short:'☁ 只读',long:'显示的是攻略主人的选择；你在这里的改动只存在本机，可以把同步码发给 TA 导入。'};
  return {short:'☁ 已同步',long:'已同步：在这里点的选择会存进这个 Artifact，登录 claude.ai 的手机、电脑打开都能看到。'};
}
function drawSync(){
  const btn=$('#sync-btn');if(!btn)return;const st=syncStatus();
  btn.textContent=st.short;btn.title=st.long;
  const panel=$('#sync-panel');if(!panel||panel.hidden)return;
  $('#sync-state').textContent=st.long;$('#sync-code').value=encodeState(snapshot());
}
function renderSync(){
  const btn=$('#sync-btn');if(!btn)return;
  const panel=document.createElement('div');panel.className='sync-panel';panel.id='sync-panel';panel.hidden=true;
  panel.innerHTML=`<p id="sync-state"></p><label for="sync-code">同步码：复制下来，在另一台设备打开这份攻略，粘贴到下面导入</label><textarea id="sync-code" rows="3" readonly></textarea><div class="sync-row"><button type="button" id="sync-copy">复制同步码</button>${standalone?'<button type="button" id="sync-link">复制同步链接</button>':''}</div><label for="sync-paste">导入别处的同步码</label><textarea id="sync-paste" rows="2" placeholder="粘贴同步码"></textarea><div class="sync-row"><button type="button" id="sync-import">导入</button><span id="sync-msg" role="status"></span></div>`;
  document.body.append(panel);
  const msg=t=>$('#sync-msg').textContent=t;
  const copy=async(text,done)=>{try{await navigator.clipboard.writeText(text);msg(done);}catch{const box=$('#sync-code');box.focus();box.select();msg('浏览器不让直接复制：已经选中，按 Ctrl+C（手机长按）复制');}};
  btn.onclick=()=>{panel.hidden=!panel.hidden;btn.setAttribute('aria-expanded',String(!panel.hidden));msg('');drawSync();};
  $('#sync-copy').onclick=()=>copy($('#sync-code').value,'已复制同步码');
  const linkBtn=$('#sync-link');if(linkBtn)linkBtn.onclick=()=>copy(`${location.origin}${location.pathname}${location.search}#sync=${$('#sync-code').value}`,'已复制同步链接：在别的设备打开它就能看到这些选择');
  $('#sync-import').onclick=()=>{const err=importCode($('#sync-paste').value);msg(err||'已导入');if(!err){$('#sync-paste').value='';drawSync();toast('已导入别处的选择');}};
  document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!btn.contains(e.target)){panel.hidden=true;btn.setAttribute('aria-expanded','false');}});
  if(location.hash.startsWith('#sync=')){const err=importCode(location.hash);history.replaceState(null,'',location.pathname+location.search);toast(err||'已导入同步链接里的选择');}
  drawSync();startCloud();
}
async function startCloud(){
  // Artifact 里 window.claude 由外层注入，稍等一下；其他地方没有它就只用本机保存
  const inArtifact=location.href==='about:srcdoc'||/\.claudeusercontent\.com$/.test(location.hostname);
  for(let i=0;inArtifact&&i<30&&typeof globalThis.claude?.use!=='function';i++)await new Promise(r=>setTimeout(r,100));
  if(typeof globalThis.claude?.use!=='function')return;
  let db=null;try{db=await globalThis.claude.use('db');}catch{}
  if(!db)return;
  let ref;try{ref=db.doc(`trips/${String(data.trip.id).replace(/[^A-Za-z0-9_\-.~:@+]/g,'-')||'trip'}`);}catch{return;}
  cloud={ref,state:'connecting',readonly:false,chain:Promise.resolve(),timer:0};drawSync();
  const late=setTimeout(()=>{if(cloud.state==='connecting'){cloud.state='offline';drawSync();}},10000);
  ref.onSnapshot(snap=>{
    if(!snap.metadata.fromCache){clearTimeout(late);cloud.state='live';}
    if(snap.metadata.hasPendingWrites)return drawSync();
    const body=snap.exists?snap.data():null,remote=Number(body?.savedAt)||0,local=savedAt();
    if(body&&body.trip===data.trip.id&&remote>local)applyState(body);
    else if(local>remote&&!snap.metadata.fromCache)cloudPush();
    drawSync();
  },()=>{clearTimeout(late);cloud.state='offline';drawSync();});
}
function cloudPush(){
  if(!cloud||applying||cloud.readonly)return;
  clearTimeout(cloud.timer);
  cloud.timer=setTimeout(()=>{
    cloud.chain=cloud.chain.then(()=>cloud.ref.set(snapshot())).catch(e=>{if(e?.code==='invalid_argument'||e?.code==='not_granted')cloud.readonly=true;drawSync();});
  },800);
}

// ---------- 打勾「改为去这儿」 ----------
// 行程项的 alternatives 每一项前面有个勾；勾上就改为去那儿，再勾掉回到原安排。
// 行程项写 budget（预算分类 id）和 option（原安排对应的方案），替代项写 option 时，勾选直接切换那个预算分类，
// 预算和底下的出发前清单（清单项写同一个 budget）跟着换；没接预算的替代项只记在 swaps 里，一起同步。
const swapItems={};
const swaps=()=>(o=>o&&typeof o==='object'&&!Array.isArray(o)?o:{})(read(stateKey('swaps'),{}));
const linked=it=>it.budget&&data.budget?.categories?.some(c=>c.id===it.budget)&&it.alts.some(a=>a.option);
function chosenAlt(key){
  const it=swapItems[key];if(!it)return -1;
  if(linked(it)){const cur=selection?.selections?.[it.budget]?.optionId;return it.alts.findIndex(a=>a.option&&a.option===cur);}
  const v=swaps()[key];return Number.isInteger(v)&&v>=0&&v<it.alts.length?v:-1;
}
function drawSwaps(){
  for(const key of Object.keys(swapItems)){
    const i=chosenAlt(key),row=document.querySelector(`[data-swap-row="${CSS.escape(key)}"]`);if(!row)continue;
    row.classList.toggle('swapped',i>=0);
    const note=row.querySelector('.swap-note');if(note){note.hidden=i<0;note.textContent=i>=0?`已换成：${swapItems[key].alts[i].title}`:'';}
    for(const box of row.querySelectorAll('[data-swap]')){const on=Number(box.dataset.alt)===i;box.checked=on;box.closest('li')?.classList.toggle('chosen',on);}
  }
}
function pickSwap(key,index,on){
  const it=swapItems[key];if(!it)return;
  if(linked(it)){
    const alt=it.alts[index];if(on&&!alt?.option)return drawSwaps();
    selection.selections[it.budget].optionId=on?alt.option:(it.option||data.budget.categories.find(c=>c.id===it.budget).defaultOption);
    updateBudget(false);syncFlights();
  }else{const all=swaps();if(on)all[key]=index;else delete all[key];persist('swaps',all);}
  drawSwaps();
}

// ---------- 一键导入日历 ----------
// 把带具体时刻的行程导出成 .ics（calendar.mjs）。
// 托管好的静态日历文件（scripts/export_calendar.mjs 生成，trip.calendarUrl 指向它）用在两种地方，按钮直接做成链接：
// - Artifact 里不能下载 .ics（downloads 只放行图片、PDF、表格等），脚本打开新页面也会被拦，只有真的点链接才放行；
// - iPhone/iPad 不能把页面里生成的日历直接交给「日历」，打开托管的 https .ics，Safari 会弹出「全部添加」。
// 有托管文件时，所有人默认订阅：主按钮是 webcal:// 链接，苹果日历会新建一个单独的日历（名字是行程标题，颜色 trip.calendarColor，
// 默认 #D07D9C），在「日历」列表里一点就能整组显示或隐藏，行程改了还会自动更新。一次性下载不提倡，只放在页面最底下。
// iPhone 上「日历」没在后台时，第一次点可能只把日历打开、不弹订阅框（系统行为），提示回来再点一次。
// 静态文件按原计划导出；电脑浏览器打开独立网页时，底下的下载链接下载当场生成的文件，换过的项目也算进去。
const isIOS=()=>/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const inArtifact=()=>location.href==='about:srcdoc'||/\.claudeusercontent\.com$/.test(location.hostname)||typeof globalThis.claude?.use==='function';
const anySwap=()=>Object.keys(swapItems).some(k=>chosenAlt(k)>=0);
const swapNote=()=>anySwap()?'（日历按原计划，换过的项目要在日历里自己改）':'';
function renderCalendar(){
  const head=$('#itinerary .section-head');if(!head||$('#cal-btn'))return;
  if(!(data.days||[]).some(d=>(d.schedule||[]).some(i=>/\d{1,2}[:：]\d{2}/.test(i.time||''))))return;
  const hosted=url(data.trip.calendarUrl),title='把带具体时间的行程导出成日历文件，苹果日历、Google 日历、Outlook 都能一次导入';
  const blank=inArtifact()?' target="_blank" rel="noopener noreferrer"':'';
  if(!hosted){
    head.insertAdjacentHTML('beforeend',`<div class="cal-box"><button class="share-btn cal-btn" id="cal-btn" type="button" title="${escape(title)}">导入日历</button><small id="cal-status" role="status" aria-live="polite"></small></div>`);
    $('#cal-btn').onclick=()=>exportCalendar();return;
  }
  // Artifact 只放行 http(s) 链接，webcal:// 点了没反应：改为打开托管的订阅中转页（export_calendar.mjs 生成），由它跳到 webcal://
  const relay=hosted.replace(/calendar(\.en)?\.ics$/,'subscribe$1.html');
  const target=inArtifact()&&relay!==hosted?relay:hosted.replace(/^https?:/,'webcal:');
  head.insertAdjacentHTML('beforeend',`<div class="cal-box"><a class="share-btn cal-btn" id="cal-btn" href="${escape(target)}"${blank} title="订阅这份行程：单独成一个日历，行程改了会自动更新">订阅到日历</a><small class="cal-alt">单独成一个日历，可以一键隐藏，行程改了会自动更新</small><small id="cal-status" role="status" aria-live="polite"></small></div>`);
  $('#cal-btn').onclick=()=>{$('#cal-status').textContent=`在日历里点「订阅」。如果只打开了日历、没弹出订阅，回到这里再点一次${swapNote()}`;};
  // 一次性下载放在页面最底下，不提倡
  $('footer p')?.insertAdjacentHTML('beforeend',`<br><span class="cal-foot">不想订阅的话，也可以<a id="cal-file" href="${escape(hosted)}"${blank}>下载日历文件</a>一次性导入（以后行程改了不会跟着更新）。</span><span id="cal-foot-status" role="status" aria-live="polite"></span>`);
  const sayFoot=t=>{const el=$('#cal-foot-status');if(el)el.textContent=t?` ${t}`:'';};
  $('#cal-file')&&($('#cal-file').onclick=event=>{
    if(inArtifact()||isIOS())return sayFoot(`已打开日历文件，在日历里点「全部添加」${swapNote()}`);
    event.preventDefault();exportCalendar(sayFoot,$('#cal-file'));
  });
}
function exportCalendar(sayTo,btnEl){
  const btn=btnEl||$('#cal-btn'),say=sayTo||(t=>{$('#cal-status').textContent=t;});
  say('');
  if(inArtifact())return say('这里不能下载日历文件，用网页版打开再点');
  btn.disabled=true;
  import('./calendar.mjs').then(({buildIcs})=>{
    const pick=(day,item,index)=>{const k=voteKey(day,item,index),i=chosenAlt(k);return i>=0?{...item,...swapItems[k].alts[i]}:item;};
    const {ics,count}=buildIcs({trip:data.trip,days:data.days||[],places:data.map?.places||[],pick,routes:cachedRoads,lang:i18n.lang});
    if(!count)return say('没有带具体时间的行程');
    const name=`${String(data.trip.title||'trip').replace(/[\\/:*?"<>|\s·,，]+/g,'-').replace(/^-+|-+$/g,'')||'trip'}.ics`;
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}));a.download=name;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),10000);
    say(`已下载 ${count} 个日程，打开文件导入日历`);
  }).catch(error=>{console.error(error);say('导出失败，刷新后再试');}).finally(()=>{btn.disabled=false;});
}

// ---------- 行程里的「夯 / 待定 / 额」 ----------
// 行程项写 rate:true 就在右边出现三个按钮；记在 votes 里（键是行程项的 id，没写 id 用「第几天-第几项」），和其他选择一起同步。
const VOTES=[['hot','夯'],['maybe','待定'],['meh','额']];
const voteKey=(day,item,index)=>String(item.id||`${day.day}-${index}`);
// rate 也可以直接写默认值 "hot" / "maybe" / "meh"（例如温泉先标「待定」）；自己点过就以点的为准，再点一次取消
const voteDefaults={};
const voteOf=(all,key)=>Object.prototype.hasOwnProperty.call(all,key)?all[key]:voteDefaults[key];
// 行程项写 alternatives:[{title,text,links}]，下面折叠显示「不想去的话可以换成」
const alternatives=(item,key)=>Array.isArray(item.alternatives)&&item.alternatives.length?`<p class="swap-note" hidden></p><details class="alts"><summary>不想去的话，可以换成 ${item.alternatives.length} 个项目</summary><ul>${item.alternatives.map((a,i)=>`<li><label class="alt-pick"><input type="checkbox" data-swap="${escape(key)}" data-alt="${i}">改为去这儿</label><strong>${escape(a.title)}</strong>${a.text?`<p>${escape(a.text)}</p>`:''}${(a.links||[]).map(l=>link(l.label,l.url)).join('')}</li>`).join('')}</ul></details>`:'';
const votes=()=>(o=>o&&typeof o==='object'&&!Array.isArray(o)?o:{})(read(stateKey('votes'),{}));
const voteButtons=key=>`<div class="rate" role="group" aria-label="想不想去">${VOTES.map(([v,label])=>`<button type="button" data-vote="${escape(key)}" data-val="${v}" aria-pressed="false">${label}</button>`).join('')}</div>`;
function drawVotes(){
  const all=votes();
  for(const b of document.querySelectorAll('[data-vote]'))b.setAttribute('aria-pressed',String(voteOf(all,b.dataset.vote)===b.dataset.val));
  for(const d of document.querySelectorAll('#days .day')){
    const picked=[...d.querySelectorAll('[data-vote][aria-pressed="true"]')].map(b=>b.dataset.val);
    const tag=d.querySelector('.vote-tally');if(tag)tag.textContent=VOTES.map(([v,label])=>{const n=picked.filter(x=>x===v).length;return n?`${label} ${n}`:'';}).filter(Boolean).join(' · ');
  }
}

function checkItems(){
  return (data.checklist?.items||[]).flatMap(item=>{
    if(!item.budget)return [item];
    const cat=data.budget?.categories?.find(c=>c.id===item.budget),id=selection?.selections?.[item.budget]?.optionId,opt=cat?.options.find(o=>o.id===id);
    if(item.budgetOptions&&!item.budgetOptions.includes(id))return [];
    const raw=opt?.booking,own=raw&&typeof raw==='object'&&Object.prototype.hasOwnProperty.call(raw,item.id)?raw[item.id]:raw;
    if(own===false)return [];
    const b=own&&typeof own==='object'&&['title','note','url','urlLabel','due','lead'].some(k=>k in own)?own:{},name=opt?String(opt.label).split(' · ')[0]:'自定义方案';
    return [{...item,...b,title:String(b.title||item.title).replace('{option}',name),url:b.url||item.url||opt?.url,urlLabel:b.urlLabel||item.urlLabel,key:`${item.id}@${id||''}`}];
  });
}
const isChecked=item=>checkState()[item.key||item.id]??(item.status==='done'||item.status==='booked');
function bookingState(catId){const items=checkItems().filter(i=>i.budget===catId);return {n:items.length,done:items.filter(isChecked).length};}
function renderBudget(){
  const budget=data.budget;
  if(!budget?.categories?.length){$('#budget').hidden=true;return;}
  key=`travel-plan:budget:v1:${data.trip.id}`;selection=normalize(budget,read(key,{}));
  $('#budget-planner').innerHTML=`<div class="budget-shell"><div class="budget-heading"><div><small>${data.trip.travelers}人 · 全程合计</small><strong class="budget-total" id="budget-total"></strong></div><label class="target">预算上限 · ${escape(data.trip.currency)}<input id="budget-target" aria-label="预算上限" type="number" min="1" max="1000000" step="0.01" value="${selection.target}"></label></div><div class="balance" id="budget-balance" role="status" aria-live="polite"></div><div class="presets"><button data-reset>恢复初始方案</button>${(budget.presets||[]).map(p=>`<button data-preset="${escape(p.id)}">${escape(p.label)}</button>`).join('')}<span class="saved" id="save-status">选择保存在当前浏览器</span></div><div class="budget-layout"><div class="choices">${budget.categories.map(c=>`<article class="choice" data-category="${escape(c.id)}"><header><label for="choice-${escape(c.id)}">${escape(c.label)}</label><strong data-amount></strong></header><select id="choice-${escape(c.id)}" data-select="${escape(c.id)}" aria-describedby="note-${escape(c.id)}">${c.options.map(o=>`<option value="${escape(o.id)}">${escape(o.label)}${o.source?` · ${escape(o.source)}`:''} · ${money(o.amount)}</option>`).join('')}<option value="custom">自定义总额…</option></select><label class="custom" hidden>自定义全程合计 · ${escape(data.trip.currency)}<input data-custom="${escape(c.id)}" aria-label="${escape(c.label)}自定义金额" type="number" min="0" max="1000000" step="0.01" value="0"></label><span class="price-status"></span><p id="note-${escape(c.id)}" data-note></p><div data-quotes></div><div data-source></div></article>`).join('')}</div><aside class="chart-panel"><h3>预算都花在哪？</h3><p>占当前总支出的百分比 · 点 + 看每一笔</p><svg id="budget-chart" viewBox="0 0 220 220" role="img" aria-label="分类支出占比，详见图例"></svg><ul class="ledger" id="budget-legend"></ul></aside></div><p class="fine">所有金额为同一旅行口径。查价记录与估算不是锁价，实时重算不代表商家实时调价。选择保存在浏览器，点顶栏「同步」可以带到别的设备；日程与地图仍按原排定方案参考。</p><p class="quote-warning" id="budget-warning"></p></div>`;
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
    const owner=isLocked?data.budget.categories.find(c=>c.options.find(o=>o.id===result.selections[c.id]?.optionId)?.bundles?.[row.id]):null;// 被套餐包含的类别跟着套餐的预订状态走
    const booked=bookingState(owner?owner.id:row.id),pill=card.querySelector('.price-status'),all=booked.n&&booked.done===booked.n;
    pill.textContent=all?'已预订 ✓':booked.done?`已订 ${booked.done}/${booked.n}`:(row.option.status||'待确认')+(row.splitFrom?` · 套餐按单买价拆分 ${Math.round(row.splitShare*100)}%`:'');
    pill.classList.toggle('booked',!!all);pill.classList.toggle('part',!all&&booked.done>0);card.classList.toggle('is-booked',!!all);card.querySelector('[data-note]').textContent=row.option.note||'';card.querySelector('[data-quotes]').innerHTML=quotesHtml(row.option);card.querySelector('[data-source]').innerHTML=link('查价入口',row.option.url);
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
  redrawChecklist();drawSwaps();
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
  return `<div class="flight-top"><span>${index===0?'OUTBOUND · 去程':'RETURN · 回程'}</span><span>${data.trip.demo?'虚构演示':p.booked?'已订 · 以确认单为准':'候选方案 · 以出票为准'}</span></div><p>${escape(p.airline||'航空公司待确认')} · 所有时刻为当地时间</p><div class="flight-times"><div><b>${escape(p.departure?.airport||'待确认')}</b><strong>${escape(p.departure?.time||'待确认')}</strong><small>${escape(p.departure?.date||'')}</small></div><span>→</span><div><b>${escape(p.arrival?.airport||'待确认')}</b><strong>${escape(p.arrival?.time||'待确认')}</strong><small>${escape(p.arrival?.date||'')}</small></div></div><h3>${escape(p.route||journey.title)}${p.flightNo?`<span class="flight-no">${escape(p.flightNo)}</span>`:''}</h3><p>${escape(p.duration||'时长待确认')} · ${escape(p.connection||'转机待确认')}</p><div class="flight-price">${amount===undefined?'机票费用待确认':row?.splitFrom?`套餐里的机票部分 ${money(amount)}<small> · 套餐共 ${money(row.packageTotal)}</small>`:`全程往返 ${money(amount)}`}</div><p>${escape(row?.option.fareFamily||p.fareFamily||'舱等待确认')} · 同一往返总价，不重复计费</p><p>${escape(p.note||row?.option.note||'')}</p>${link('查看来源',p.url||row?.option.url)}`;
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
  const coord=mapsQuery;const params=new URLSearchParams({api:'1',origin:coord(places[0]),destination:coord(places.at(-1)),travelmode:mode});
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
    visible.forEach((p,index)=>{const marker=L.marker([p.lat,p.lng],{title:p.name,icon:L.divIcon({className:'map-pin',html:String(index+1),iconSize:[30,30],iconAnchor:[15,15]})}).bindPopup(`<b>${escape(p.name)}</b><br>${escape(p.address||'')}<br>${escape(p.note||'')}<br>${link('导航',navLink(p))+link('Google Maps',mapsLink(p))+photosLink(p)}`).addTo(layer);markers.set(p.id,marker);});
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
  $('#days').innerHTML=data.days.map(day=>`<details class="day"><summary><span>DAY ${String(day.day).padStart(2,'0')}<br>${escape(day.date)}</span><div><strong>${escape(day.title)}</strong><small>${escape((day.locations||[]).join(' → '))}</small>${(day.schedule||[]).some(i=>i.rate)?'<small class="vote-tally"></small>':''}</div></summary><ol class="schedule">${(day.schedule||[]).map((item,index)=>{const key=voteKey(day,item,index);if(typeof item.rate==='string')voteDefaults[key]=item.rate;if(item.alternatives?.length)swapItems[key]={budget:item.budget,option:item.option,alts:item.alternatives};const place=data.map?.places?.find(p=>p.id===item.placeId);return `<li${item.rate?' class="has-rate"':''}${item.alternatives?.length?` data-swap-row="${escape(key)}"`:''}><time>${escape(item.time||'待确认')}</time><div><strong>${escape(item.title||'')}</strong><p>${escape(item.text)}</p>${place?placeLinks(place):''}${(item.links||[]).map(l=>link(l.label,l.url)).join('')}${alternatives(item,key)}</div>${item.rate?voteButtons(key):''}</li>`;}).join('')}</ol></details>`).join('');
  $('#days').onclick=e=>{const b=e.target.closest('[data-vote]');if(!b)return;const all=votes();all[b.dataset.vote]=voteOf(all,b.dataset.vote)===b.dataset.val?'':b.dataset.val;persist('votes',all);drawVotes();};
  $('#days').onchange=e=>{const box=e.target.closest('[data-swap]');if(box)pickSwap(box.dataset.swap,Number(box.dataset.alt),box.checked);};
  drawVotes();drawSwaps();
}
function renderRental(){
  const r=data.rental;if(!r?.title){$('#drive').hidden=true;return;}
  $('#rental').innerHTML=`<article class="rental"><h3>${escape(r.title)}</h3><p>${escape(r.summary)}</p><dl>${(r.details||[]).map(d=>`<div><dt>${escape(d.label)}</dt><dd>${escape(d.value)}</dd></div>`).join('')}</dl><ul>${(r.notes||[]).map(n=>`<li>${escape(n)}</li>`).join('')}</ul>${(r.links||[]).map(l=>link(l.label,l.url)).join(' ')}</article>`;
}
function renderChecklist(){
  // Pre-departure checklist: documents, bookings with release windows/deadlines, and other to-dos.
  const list=data.checklist;if(!list?.items?.length){$('#checklist').hidden=true;$('a[href="#checklist"]')?.setAttribute('hidden','');return;}
  const done=checkState();
  const groups=list.groups?.length?list.groups:[{id:'',label:'待办'}];
  // 只在手机上折叠（电脑上全部展开）；group.open:false 表示手机上默认收起。勾选后重画时保留当前展开状态。
  const defaults=()=>new Map(groups.map(g=>[g.id||'',!PHONE.matches||g.open!==false]));
  let opened=defaults();
  const sortKey=item=>daysUntil(item.due)??1e6;
  const isDone=isChecked;
  const chip=item=>{
    const n=daysUntil(item.due);if(n===null)return item.dueLabel?`<span class="due">${escape(item.dueLabel)}</span>`:'';
    const when=n<0?`已过 ${-n} 天`:n===0?'今天':`还有 ${n} 天`,state=isDone(item)?'done':n<0?'late':n<=14?'soon':'later';
    return `<span class="due ${state}" title="${escape(item.due)}">${escape(item.dueLabel||item.due.slice(5).replace('-','/'))} · ${when}</span>`;
  };
  const draw=()=>{
    const all=checkItems(),open=all.filter(i=>!isDone(i)),next=[...open].sort((a,b)=>sortKey(a)-sortKey(b))[0];
    $('#checklist-summary').innerHTML=`<strong>还有 ${open.length} / ${all.length} 项</strong>${next?` · 最近：${escape(next.title)} ${chip(next)}`:' · 全部完成'}${list.asOf?`<small>资料核对于 ${escape(list.asOf)}</small>`:''}`;
    $('#checklist-groups').innerHTML=groups.map(g=>{
      const items=all.filter(i=>(i.group||'')===(g.id||'')||(!g.id&&!groups.some(x=>x.id===i.group))).sort((a,b)=>sortKey(a)-sortKey(b));
      if(!items.length)return '';
      const left=items.filter(i=>!isDone(i)).length;
      return `<details class="check-group" data-group="${escape(g.id||'')}"${opened.get(g.id||'')?' open':''}><summary><h3>${escape(g.label)}<small>${left?`${left} 项待办`:'都办好了'}</small></h3><span class="fold" aria-hidden="true"></span></summary><ul>${items.map(i=>`<li class="${isDone(i)?'is-done':''}"><label><input type="checkbox" data-check="${escape(i.key||i.id)}" ${isDone(i)?'checked':''}><span class="check-title">${escape(i.title)}</span></label><div class="check-meta">${i.who?`<span class="who">${escape(i.who)}</span>`:''}${chip(i)}${i.lead?`<span class="lead">${escape(i.lead)}</span>`:''}</div>${i.note?`<p>${escape(i.note)}</p>`:''}${link(i.urlLabel||'官方入口',i.url)}</li>`).join('')}</ul></details>`;
    }).join('');
    const facts=$('#trip-facts');if(facts&&!facts.querySelector('.todo-fact'))facts.insertAdjacentHTML('beforeend','<a class="todo-fact" href="#checklist"></a>');
    const fact=facts?.querySelector('.todo-fact');if(fact)fact.textContent=open.length?`待办 ${open.length} 项`:'待办已完成';
  };
  $('#checklist-groups').addEventListener('toggle',e=>{const g=e.target.closest?.('[data-group]');if(g)opened.set(g.dataset.group,g.open);},true);
  $('#checklist-groups').addEventListener('click',e=>{if(!PHONE.matches&&e.target.closest('summary'))e.preventDefault();});
  PHONE.addEventListener?.('change',()=>{opened=defaults();draw();});
  $('#checklist-groups').onchange=e=>{const id=e.target.dataset.check;if(!id)return;const state=checkState();state[id]=e.target.checked;persist('checklist',state);draw();if(data.budget?.categories?.length)updateBudget(false,false);};
  redrawChecklist=draw;draw();
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
    `Then read its SKILL.md and use it to make me a trip page with flights and hotels compared across booking sites, a budget that follows our choices, a real route map, a day-by-day plan, a pre-departure checklist and a shareable route poster, in Chinese and English.`,'',
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
    `装好后读一遍里面的 SKILL.md，再用它帮我做一份旅行攻略网页：机票酒店多平台比价、跟着选择变的预算、真实路线地图、每日行程、出发前清单和分享路线图，中英文都能看。`,'',
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
  const store=()=>persist('todo',todos);
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
    renderBudget();renderCash();renderFlights();renderDays();renderRental();renderChecklist();renderTodo();renderSync();renderCalendar();renderOwnPrompt();navSpy();renderMap();
    $('#events').hidden=!data.events?.length;
    $('#event-cards').innerHTML=(data.events||[]).map(e=>`<article class="event"><span class="price-status">${escape(e.status||'待确认')}</span><h3>${escape(e.title)}</h3><strong>${escape(e.priceLabel||'费用待确认')}</strong><p>${escape(e.description||'')}</p><p class="quote-warning">${escape(e.conflict||'按实际行程安排，不重复预订。')}</p>${link('官方详情',e.url)}</article>`).join('');
    $('#research').hidden=!data.sources?.length;$('#sources').innerHTML=(data.sources||[]).map(s=>`<p>${link(s.label,s.url)||escape(s.label)}${s.checkedOn?' · '+escape(s.checkedOn):''}<br>${escape(s.note||'')}</p>`).join('');
    if(location.hash)requestAnimationFrame(()=>{try{document.querySelector(location.hash)?.scrollIntoView();}catch{}});
  }catch(error){console.error(error);$('#load-error').hidden=false;}
}
init();
