const CAT_COLORS = {
  pothole:'#C67A2E', garbage:'#B9862A', streetlight:'#1B6B73',
  water:'#28495E', sanitation:'#8A6D3B', safety:'#B5432B', other:'#4C7A52'
};
const PRIO_COLORS = {high:'#C67A2E', medium:'#1B6B73', low:'#4C7A52'};

let catChart, prioChart;

async function loadStats(){
  const res = await fetch('/api/stats');
  const s = await res.json();

  document.getElementById('stats').innerHTML = [
    ['Total complaints', s.total], ['Pending', s.pending],
    ['High priority open', s.high_open], ['Resolved', s.resolved]
  ].map(([l,n]) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

  const catLabels = Object.keys(s.by_category).map(k => s.category_labels[k]);
  const catValues = Object.values(s.by_category);
  const catBg = Object.keys(s.by_category).map(k => CAT_COLORS[k]);

  if(catChart) catChart.destroy();
  catChart = new Chart(document.getElementById('catChart'), {
    type: 'bar',
    data: { labels: catLabels, datasets: [{ data: catValues, backgroundColor: catBg, borderRadius: 3 }] },
    options: { plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false}}, y:{beginAtZero:true, ticks:{stepSize:1}} } }
  });

  if(prioChart) prioChart.destroy();
  prioChart = new Chart(document.getElementById('prioChart'), {
    type: 'doughnut',
    data: {
      labels: ['High','Medium','Low'],
      datasets: [{ data: [s.by_priority.high, s.by_priority.medium, s.by_priority.low],
        backgroundColor: [PRIO_COLORS.high, PRIO_COLORS.medium, PRIO_COLORS.low] }]
    },
    options: { plugins:{legend:{position:'bottom', labels:{boxWidth:12, font:{family:"'Space Grotesk'"}}}} }
  });
}

function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function loadTable(){
  const cat = document.getElementById('fCat').value;
  const status = document.getElementById('fStatus').value;
  const params = new URLSearchParams();
  if(cat) params.set('category', cat);
  if(status) params.set('status', status);

  const res = await fetch('/api/complaints?' + params.toString());
  const rows = await res.json();

  document.getElementById('tbody').innerHTML = rows.length ? rows.map(c => `
    <tr>
      <td><div class="txt">${escapeHtml(c.text)}</div></td>
      <td>${c.category}</td>
      <td><span class="dot" style="background:${PRIO_COLORS[c.priority]}"></span>${c.priority}</td>
      <td>${escapeHtml(c.location || '')}</td>
      <td>${c.department}</td>
      <td>
        <select class="status-sel" onchange="updateStatus(${c.id}, this.value)">
          ${['Submitted','Assigned','In Progress','Resolved'].map(s => `<option ${s===c.status?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('') : `<tr><td colspan="6" class="empty">No complaints match these filters.</td></tr>`;
}

async function updateStatus(id, status){
  await fetch(`/api/complaints/${id}/status`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({status})
  });
  loadStats();
  loadTable();
}

async function populateCategoryFilter(){
  const res = await fetch('/api/stats');
  const s = await res.json();
  const sel = document.getElementById('fCat');
  Object.entries(s.category_labels).forEach(([k, label]) => {
    const o = document.createElement('option');
    o.value = k; o.textContent = label;
    sel.appendChild(o);
  });
}

document.getElementById('fCat').addEventListener('change', loadTable);
document.getElementById('fStatus').addEventListener('change', loadTable);

populateCategoryFilter();
loadStats();
loadTable();
