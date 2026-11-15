export const validMoney = (value,min=0) => typeof value==='number' && Number.isFinite(value) && value>=min && value<=1000000;
const cents=value=>Math.round(value*100);
export function normalize(budget,saved) {
  const selections={};
  for(const category of budget.categories || []) {
    const value=saved?.selections?.[category.id];
    const valid=category.options.some(option=>option.id===value?.optionId) || (value?.optionId==='custom' && validMoney(value.customAmount));
    selections[category.id]={optionId:valid?value.optionId:category.defaultOption,customAmount:validMoney(value?.customAmount)?cents(value.customAmount)/100:0};
  }
  // Bundles: an option may include another category (e.g. a flight+hotel package). The included category is locked
  // to its bundled option; a bundle-only option falls back to the default once nothing includes it.
  const chosen=id=>budget.categories.find(c=>c.id===id)?.options.find(o=>o.id===selections[id]?.optionId);
  const locked={};
  for(const category of budget.categories || [])for(const [id,optionId] of Object.entries(chosen(category.id)?.bundles||{}))
    if(selections[id] && budget.categories.find(c=>c.id===id)?.options.some(o=>o.id===optionId))locked[id]=optionId;
  for(const category of budget.categories || []){
    if(locked[category.id])selections[category.id].optionId=locked[category.id];
    else if(chosen(category.id)?.bundleOnly)selections[category.id].optionId=category.defaultOption;
  }
  return {target:validMoney(saved?.target,1)?cents(saved.target)/100:budget.target,selections,locked:Object.keys(locked)};
}
export function calculate(budget,saved) {
  const selection=normalize(budget,saved);
  const flight=budget.categories?.find(c=>c.id==='flights')?.options.find(o=>o.id===selection.selections.flights?.optionId);
  const rows=(budget.categories || []).map(category=>{
    const chosen=selection.selections[category.id];
    const option=chosen.optionId==='custom'?{id:'custom',label:'自定义总额',amount:chosen.customAmount,status:'自定义金额',note:'手动输入的全程合计，用于试算，不是商家报价。'}:category.options.find(o=>o.id===chosen.optionId);
    const amount=option.bagCount && validMoney(flight?.bagPerPerson)?option.bagCount*flight.bagPerPerson:option.amount;
    return {...category,option,amount:cents(amount)/100};
  });
  const total=rows.reduce((sum,row)=>sum+cents(row.amount),0)/100;
  return {...selection,rows,total,remaining:(cents(selection.target)-cents(total))/100};
}
export function nearestIndex(container,cards) {
  const bounds=container.getBoundingClientRect(),center=bounds.left+bounds.width/2;
  return cards.reduce((best,card,index)=>{
    const r=card.getBoundingClientRect(),b=cards[best].getBoundingClientRect();
    return Math.abs(r.left+r.width/2-center)<Math.abs(b.left+b.width/2-center)?index:best;
  },0);
}

// Whole days from `today` to an ISO date (negative = overdue); null for missing or invalid dates.
export function daysUntil(date,today=new Date()){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
  const [y,m,d]=date.split('-').map(Number),due=Date.UTC(y,m-1,d);
  if(Number.isNaN(due)||new Date(due).getUTCDate()!==d)return null;
  return Math.round((due-Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()))/864e5);
}
