import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIcs,parseTime,zoned} from '../assets/starter/calendar.mjs';

const events=ics=>ics.replace(/\r\n /g,'').split('BEGIN:VEVENT').slice(1).map(block=>Object.fromEntries(block.split('\r\n').filter(l=>/^[A-Z-]+[:;]/.test(l)).map(l=>{const i=l.search(/[:;]/);return [l.slice(0,i),l.slice(l.indexOf(':')+1)];})));

test('time text is read from the first clock time and an optional range',()=>{
  assert.deepEqual(parseTime('09:20'),{start:560,end:null});
  assert.deepEqual(parseTime('17:30–19:30'),{start:1050,end:1170});
  assert.deepEqual(parseTime('约23:30'),{start:1410,end:null});
  assert.deepEqual(parseTime('18:30（坐船就改19:15）'),{start:1110,end:null});
  for(const bad of ['上午','晚上','25:00',null])assert.equal(parseTime(bad),null);
});

test('each timed plan lasts until the next one, across time zones',()=>{
  const trip={id:'demo',title:'Demo, trip',timezone:'America/Costa_Rica'};
  const days=[
    {day:1,date:'2027-01-06',schedule:[
      {time:'10:40',title:'Fly',tz:'America/Toronto'},
      {time:'15:24',title:'Land',placeId:'lir'},
      {time:'晚上',title:'Untimed'},
      {time:'17:30–19:30',title:'Night walk'},
      {time:'20:00',title:'Stars',text:'Bring a jacket; it is cold'},
    ]},
    {day:2,date:'2027-01-11',schedule:[{time:'16:35',title:'Home',end:'22:45',endTz:'America/Toronto',id:'home',alternatives:[{title:'Later flight'}]}]},
  ];
  const places=[{id:'lir',name:'LIR',maps:'Liberia Airport',lat:10.59,lng:-85.54}];
  const pick=(day,item)=>item.id==='home'?{...item,...item.alternatives[0]}:item;
  const {ics,count,skipped}=buildIcs({trip,days,places,pick,now:Date.UTC(2026,10,19)});
  assert.equal(count,5);assert.equal(skipped,1);
  const e=events(ics);
  assert.deepEqual(e.map(x=>[x.DTSTART,x.DTEND]),[
    ['20270106T154000Z','20270106T212400Z'],   // 10:40 Toronto → 15:24 Costa Rica
    ['20270106T212400Z','20270106T233000Z'],   // runs until the next timed plan
    ['20270106T233000Z','20270107T013000Z'],   // explicit range
    ['20270107T020000Z','20270107T030000Z'],   // last of the day: one hour
    ['20270111T223500Z','20270112T034500Z'],   // end + endTz
  ]);
  assert.equal(e[4].SUMMARY,'Later flight');
  assert.equal(e[1].LOCATION,'Liberia Airport');assert.equal(e[1].GEO,'10.59;-85.54');
  assert.match(e[3].DESCRIPTION,/jacket\\; it is cold/);
  assert.match(ics,/X-WR-CALNAME:Demo\\, trip/);
  for(const line of ics.split('\r\n'))assert.ok(new TextEncoder().encode(line).length<=75,line);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('without a time zone the calendar uses floating local times; long gaps cap at 12 hours',()=>{
  const {ics}=buildIcs({trip:{id:'x'},days:[{day:1,date:'2030-06-29',schedule:[{time:'09:00',title:'A'},{time:'23:30',title:'B'}]}]});
  const e=events(ics);
  assert.deepEqual(e.map(x=>[x.DTSTART,x.DTEND]),[['20300629T090000','20300629T210000'],['20300629T233000','20300630T003000']]);
  assert.equal(zoned('2027-07-01',600,'America/Toronto'),Date.UTC(2027,6,1,14,0));
});
