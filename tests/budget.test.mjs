import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculate,normalize,validMoney,nearestIndex,daysUntil,itemize} from '../assets/starter/budget.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../assets/demo-trip.json',import.meta.url)));
test('presets sum independently and preserve selected conditions',()=>{
  assert.equal(calculate(data.budget).total,4160);
  for(const [id,total] of [['save',3720],['treat',4710]]){
    const selected=normalize(data.budget);
    for(const [category,optionId] of Object.entries(data.budget.presets.find(p=>p.id===id).selections))selected.selections[category].optionId=optionId;
    assert.equal(calculate(data.budget,selected).total,total);
  }
});
test('baggage changes with selected flight; bad persisted values cannot become money',()=>{
  const selected=normalize(data.budget);selected.selections.flights.optionId='comfort';
  assert.equal(calculate(data.budget,selected).rows.find(r=>r.id==='bags').amount,160);
  const damaged={target:-1,selections:{hotel:{optionId:'missing'},car:{optionId:'custom',customAmount:Infinity}}};
  assert.equal(calculate(data.budget,damaged).total,4160);
  for(const value of [-1,NaN,Infinity,'100',null])assert.equal(validMoney(value),false);
});
test('zero and cents never produce floating-point budget drift',()=>{
  const selected=normalize(data.budget);
  for(const choice of Object.values(selected.selections)){choice.optionId='custom';choice.customAmount=0;}
  assert.equal(calculate(data.budget,selected).total,0);
  for(const choice of Object.values(selected.selections))choice.customAmount=0.1;
  assert.equal(calculate(data.budget,selected).total,0.8);
});
test('a package locks the bundled category and releases it when unselected',()=>{
  const selected=normalize(data.budget);selected.selections.flights.optionId='package';
  const pkg=calculate(data.budget,selected);
  assert.equal(pkg.selections.hotel.optionId,'in-package');
  assert.deepEqual(pkg.locked,['hotel']);
  assert.equal(pkg.total,3960);
  // the package price is shared out by standalone prices (1600 : 900), total unchanged
  assert.equal(pkg.rows.find(r=>r.id==='flights').amount,1472);
  assert.equal(pkg.rows.find(r=>r.id==='hotel').amount,828);
  assert.equal(pkg.rows.find(r=>r.id==='hotel').splitFrom,'flights');
  const back={...pkg,selections:{...pkg.selections,flights:{optionId:'economy',customAmount:0}}};
  const released=calculate(data.budget,back);
  assert.equal(released.selections.hotel.optionId,'harbour');
  assert.deepEqual(released.locked,[]);
  // a saved bundle-only choice without its package falls back to the default
  assert.equal(normalize(data.budget,{selections:{hotel:{optionId:'in-package'}}}).selections.hotel.optionId,'harbour');
});
test('carousel positions are relative to the actual viewport',()=>{
  const rect=(left,width)=>({getBoundingClientRect:()=>({left,width})});
  assert.equal(nearestIndex(rect(125,600),[rect(-489,600),rect(125,600)]),1);
  assert.equal(nearestIndex(rect(18,340),[rect(-336,340),rect(18,340)]),1);
});
test('checklist countdown counts whole days and rejects bad dates',()=>{
  const today=new Date(2026,10,15,23,30);
  assert.equal(daysUntil('2026-11-15',today),0);
  assert.equal(daysUntil('2026-12-07',today),22);
  assert.equal(daysUntil('2026-11-09',today),-6);
  for(const bad of ['', '2026-02-30', '12/07/2026', undefined])assert.equal(daysUntil(bad,today),null);
});

test('ledger items add up to the row, scaling for package splits and bag counts',()=>{
  const sum=items=>Math.round(items.reduce((t,i)=>t+i.amount*100,0));
  const exact=itemize({amount:100.5,option:{id:'a',items:[{label:'x',amount:60.25},{label:'y',amount:40.25}]}});
  assert.deepEqual(exact.map(i=>i.amount),[60.25,40.25]);assert.equal(exact[0].scaled,false);
  const scaled=itemize({amount:1000,option:{id:'pkg',items:[{label:'a',amount:1931},{label:'b',amount:5918.92}]}});
  assert.equal(sum(scaled),100000);assert.ok(scaled.every(i=>i.scaled));
  assert.deepEqual(itemize({amount:42,option:{id:'plain',label:'Plain'}}).map(i=>[i.label,i.amount,i.share]),[['Plain',42,1]]);
  assert.equal(itemize({amount:7,option:{id:'custom',items:[{label:'ignored',amount:1}]}})[0].label,'自定义总额');
  assert.deepEqual(itemize({amount:0,option:{id:'none',items:[{label:'z',amount:0}]}}).map(i=>i.share),[0]);
  assert.equal(sum(itemize({amount:5,option:{id:'bad',items:[{label:'q',amount:-3},{label:'r',amount:2}]}})),500);
});
