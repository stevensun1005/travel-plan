export const validMoney = (value,min=0) => typeof value==='number' && Number.isFinite(value) && value>=min && value<=1000000;
const cents=value=>Math.round(value*100);
export function normalize(budget,saved) {
  const selections={};
  for(const category of budget.categories || []) {
    const value=saved?.selections?.[category.id];
    const valid=category.options.some(option=>option.id===value?.optionId) || (value?.optionId==='custom' && validMoney(value.customAmount));
    selections[category.id]={optionId:valid?value.optionId:category.defaultOption,customAmount:validMoney(value?.customAmount)?cents(value.customAmount)/100:0};
  }
  return {target:validMoney(saved?.target,1)?cents(saved.target)/100:budget.target,selections};
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
