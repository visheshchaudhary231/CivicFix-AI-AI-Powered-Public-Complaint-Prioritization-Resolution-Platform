const CATEGORIES = {
  pothole:{label:'Road / Pothole', dept:'Road Department', base:'high', color:'#C67A2E'},
  garbage:{label:'Garbage', dept:'Sanitation Dept.', base:'medium', color:'#B9862A'},
  streetlight:{label:'Streetlight', dept:'Electrical Dept.', base:'medium', color:'#1B6B73'},
  water:{label:'Water Leakage', dept:'Water Board', base:'high', color:'#28495E'},
  sanitation:{label:'Sanitation', dept:'Sanitation Dept.', base:'medium', color:'#8A6D3B'},
  safety:{label:'Public Safety', dept:'Municipal Safety', base:'high', color:'#B5432B'},
  other:{label:'Other', dept:'General Office', base:'low', color:'#4C7A52'}
};
const KEYWORDS = {
  pothole:['pothole','road','crack','pavement','asphalt','manhole'],
  garbage:['garbage','trash','waste','dump','litter','rubbish'],
  streetlight:['streetlight','street light','lamp','bulb','dark','no light'],
  water:['water leak','leakage','pipe','pipeline','sewage','drain','overflow','flooding'],
  sanitation:['sewer','toilet','sanitation','drainage','stagnant','mosquito'],
  safety:['danger','dangerous','accident','wire','electric shock','fire','unsafe','crime','theft']
};
const ESCALATE = ['dangerous','danger','night','accident','injur','fire','electric shock','children','school','emergency','collapse'];
const STOP = new Set(['the','is','a','an','it','at','of','to','and','near','in','on','there','this','that','with','for']);
const PRIO_COLORS = {high:'#C67A2E', medium:'#1B6B73', low:'#4C7A52'};

let complaints = JSON.parse(localStorage.getItem('civicfix_complaints') || 'null') || [
  mk("Streetlight off for a week on Maple Street, very dark at night.","Maple Street","streetlight","Assigned"),
  mk("Garbage not collected near the market for 3 days, smells bad.","Central Market","garbage","In Progress"),
  mk("Water pipe burst near the bus stand, flooding the road.","Bus Stand Road","water","Submitted"),
  mk("Open manhole near the school gate, children walk past daily. Dangerous.","School Gate Road","pothole","Submitted")
];
let catChart, prioChart;

function mk(text, loc, cat, status){
  const c = CATEGORIES[cat];
  return {id:Date.now()+Math.random(), text, location:loc, category:cat, priority:c.base,
    dept:c.dept, status, summary:buildSummary(text, loc, cat, c.base)};
}
function tokenize(s){ return s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w && !STOP.has(w)); }

function classify(text){
  const lower = text.toLowerCase();
  let best='other', bestScore=0;
  for(const [cat, words] of Object.entries(KEYWORDS)){
    let score=0; words.forEach(w=>{ if(lower.includes(w)) score++; });
    if(score>bestScore){ bestScore=score; best=cat; }
  }
  let priority = CATEGORIES[best].base;
  if(ESCALATE.some(w=>lower.includes(w))) priority='high';
  return {category:best, priority};
}
function buildSummary(text, loc, cat, priority){
  return `${CATEGORIES[cat].label} issue reported${loc?` near ${loc}`:''} — flagged as ${priority} priority.`;
}
function findDuplicate(text, category, location){
  const tokens = new Set(tokenize(text+' '+location));
  let bestSim=0, bestMatch=null;
  complaints.forEach(c=>{
    if(c.category!==category || c.status==='Resolved') return;
    const other = new Set(tokenize(c.text+' '+c.location));
    const inter = [...tokens].filter(t=>other.has(t)).length;
    const union = new Set([...tokens,...other]).size || 1;
    const sim = inter/union;
    if(sim>bestSim){ bestSim=sim; bestMatch=c; }
  });
  return bestSim>0.28 ? {match:bestMatch, sim:bestSim} : null;
}

function previewImage(e){
  const file = e.target.files[0];
  const wrap = document.getElementById('imgPreviewWrap');
  wrap.innerHTML = '';
  if(file){
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    wrap.appendChild(img);
  }
}

function submitComplaint(){
  const text = document.getElementById('text').value.trim();
  const loc = document.getElementById('loc').value.trim();
  const err = document.getElementById('formError');
  err.textContent = '';
  if(!text){ err.textContent='Please describe the problem.'; document.getElementById('text').focus(); return; }

  document.getElementById('pipeline').innerHTML =
    '<span>1. Text received</span><span>2. Classifying…</span><span>3. Priority check</span><span>4. Duplicate scan</span>';

  const {category, priority} = classify(text);
  const dup = findDuplicate(text, category, loc);
  const summary = buildSummary(text, loc, category, priority);
  const complaint = {id:Date.now()+Math.random(), text, location:loc||'Unspecified', category,
    priority, dept:CATEGORIES[category].dept, status:'Submitted', summary};
  complaints.unshift(complaint);
  persist();

  document.getElementById('badges').innerHTML =
    `<span class="badge">${CATEGORIES[category].label}</span>`+
    `<span class="badge ${priority}">${priority.toUpperCase()} priority</span>`+
    `<span class="badge">${CATEGORIES[category].dept}</span>`;
  document.getElementById('summary').textContent = summary;
  document.getElementById('dept').textContent = `Routed to: ${CATEGORIES[category].dept} · Status: Submitted`;
  const warn = document.getElementById('dupWarn');
  if(dup){
    warn.classList.add('show');
    warn.textContent = `Possible duplicate (similarity ${Math.round(dup.sim*100)}%): similar to report at "${dup.match.location}" — "${dup.match.text.slice(0,70)}…"`;
  } else warn.classList.remove('show');
  document.getElementById('result').classList.add('show');
  document.getElementById('text').value=''; document.getElementById('loc').value='';
  document.getElementById('imgPreviewWrap').innerHTML='';
  renderDashboard();
}

function persist(){ try{ localStorage.setItem('civicfix_complaints', JSON.stringify(complaints)); }catch(e){} }
function setStatus(id, status){ const c=complaints.find(c=>c.id===id); if(c){ c.status=status; persist(); renderDashboard(); } }
function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function renderDashboard(){
  const total=complaints.length, pending=complaints.filter(c=>c.status!=='Resolved').length;
  const high=complaints.filter(c=>c.priority==='high'&&c.status!=='Resolved').length;
  const resolved=complaints.filter(c=>c.status==='Resolved').length;
  document.getElementById('stats').innerHTML = [['Total',total],['Pending',pending],['High Priority Open',high],['Resolved',resolved]]
    .map(([l,n])=>`<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

  const catSel = document.getElementById('fCat');
  if(catSel.options.length<=1) Object.entries(CATEGORIES).forEach(([k,v])=>{
    const o=document.createElement('option'); o.value=k; o.textContent=v.label; catSel.appendChild(o);
  });
  renderTable(); renderCharts();
}
function renderTable(){
  const fc=document.getElementById('fCat').value, fs=document.getElementById('fStatus').value;
  const rows = complaints.filter(c=>(!fc||c.category===fc)&&(!fs||c.status===fs));
  document.getElementById('tbody').innerHTML = rows.length ? rows.map(c=>`
    <tr><td><div class="txt">${escapeHtml(c.text)}</div></td><td>${CATEGORIES[c.category].label}</td>
    <td><span class="dot" style="background:${PRIO_COLORS[c.priority]}"></span>${c.priority}</td>
    <td>${escapeHtml(c.location)}</td><td>${c.dept}</td>
    <td><select onchange="setStatus(${c.id}, this.value)">
      ${['Submitted','Assigned','In Progress','Resolved'].map(s=>`<option ${s===c.status?'selected':''}>${s}</option>`).join('')}
    </select></td></tr>`).join('') : `<tr><td colspan="6" class="empty">No complaints match filters.</td></tr>`;
}
function renderCharts(){
  const catCounts={}; Object.keys(CATEGORIES).forEach(k=>catCounts[k]=0);
  complaints.forEach(c=>catCounts[c.category]++);
  if(catChart) catChart.destroy();
  catChart = new Chart(document.getElementById('catChart'), {
    type:'bar',
    data:{labels:Object.values(CATEGORIES).map(c=>c.label), datasets:[{data:Object.values(catCounts), backgroundColor:Object.values(CATEGORIES).map(c=>c.color), borderRadius:3}]},
    options:{plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, ticks:{stepSize:1}}}}
  });
  const prio={high:0,medium:0,low:0}; complaints.forEach(c=>prio[c.priority]++);
  if(prioChart) prioChart.destroy();
  prioChart = new Chart(document.getElementById('prioChart'), {
    type:'doughnut',
    data:{labels:['High','Medium','Low'], datasets:[{data:[prio.high,prio.medium,prio.low], backgroundColor:[PRIO_COLORS.high,PRIO_COLORS.medium,PRIO_COLORS.low]}]},
    options:{plugins:{legend:{position:'bottom'}}}
  });
}

document.querySelectorAll('.navbtn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.navbtn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-'+btn.dataset.view).classList.add('active');
    if(btn.dataset.view==='dashboard') renderDashboard();
  });
});
document.getElementById('fCat').addEventListener('change', renderTable);
document.getElementById('fStatus').addEventListener('change', renderTable);
renderDashboard();