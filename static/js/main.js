async function submitComplaint(){
  const text = document.getElementById('text').value.trim();
  const loc = document.getElementById('loc').value.trim();
  const err = document.getElementById('formError');
  err.textContent = '';

  if(!text){
    err.textContent = 'Please describe the problem before submitting.';
    document.getElementById('text').focus();
    return;
  }

  try{
    const res = await fetch('/api/complaints', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text, location: loc})
    });
    const data = await res.json();
    if(!res.ok){ err.textContent = data.error || 'Something went wrong.'; return; }

    document.getElementById('badges').innerHTML =
      `<span class="badge">${data.category_label}</span>` +
      `<span class="badge ${data.priority}">${data.priority.toUpperCase()} priority</span>` +
      `<span class="badge">${data.department}</span>`;
    document.getElementById('summary').textContent = data.summary;
    document.getElementById('dept').textContent = `Routed to: ${data.department} · Status: ${data.status}`;

    const warn = document.getElementById('dupWarn');
    if(data.duplicate){
      warn.classList.add('show');
      warn.textContent = `Possible duplicate (similarity ${Math.round(data.duplicate.similarity*100)}%): looks similar to a report at "${data.duplicate.location}" — "${data.duplicate.text.slice(0,80)}${data.duplicate.text.length>80?'…':''}"`;
    } else {
      warn.classList.remove('show');
    }

    document.getElementById('result').classList.add('show');
    document.getElementById('text').value = '';
    document.getElementById('loc').value = '';
  }catch(e){
    err.textContent = 'Could not reach the server. Is app.py running?';
  }
}
