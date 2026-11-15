import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculate,normalize,validMoney,nearestIndex,daysUntil} from '../assets/starter/budget.mjs';
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
