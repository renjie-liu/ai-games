// What the west player of e2e-voice.mjs works out for itself about the choice of supports, from
// its own room and from what the partner says. Nothing here reads the answer from the server.
// (live_text_playthrough.py has the same two in Python: chart_of and tag_heard.)

// From the west view's notes: the gate's weight, the tags the load chart has a column for, and
// each mark's rating under each tag.
export function chartOf(view){
  const notes=Object.fromEntries(view.notes.map(n=>[n.object,n]));
  const weight=Number(notes.plaque.text.match(/自重 (\d+) 公斤/)[1]),table=notes.chart.table;
  const tags=table.columns.slice(1).map(column=>column.replace(/牌$/,''));
  return {weight,tags,ratings:Object.fromEntries(table.rows.map(row=>[row[0],Object.fromEntries(tags.map((tag,i)=>[tag,row[i+1]]))]))};
}
// The one tag colour the partner named, or null when it named none or more than one. The colour has
// to come as a colour ("黄色", "黄牌", "黄的"): the brass key is "黄铜" and is not a tag.
export function tagHeard(said,tags){
  const named=tags.filter(tag=>['色','牌','的'].some(end=>said.includes(tag+end)));
  return named.length===1?named[0]:null;
}
// The marks whose rating under `tag` is at least the gate's weight.
export const strongEnough=(chart,tag)=>Object.keys(chart.ratings).filter(mark=>chart.ratings[mark][tag]>=chart.weight);
