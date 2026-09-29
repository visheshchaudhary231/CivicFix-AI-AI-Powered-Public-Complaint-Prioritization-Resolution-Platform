# CivicFix AI — Backend Prototype

Flask + SQLite + scikit-learn implementation of the plan: complaint intake,
TF-IDF/Logistic-Regression classification, rule-based priority, department
routing, duplicate detection, and an authority dashboard.

## Setup

```bash
cd civicfix-backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5000** for the citizen form and
**http://127.0.0.1:5000/dashboard** for the authority view.

The SQLite database (`civicfix.db`) and four demo complaints are created
automatically the first time you run `app.py`.

## How it works

- **`model.py`** — trains a TF-IDF + Logistic Regression classifier on a small
  labelled dataset at startup, applies escalation-keyword rules for priority,
  maps category → department, and finds duplicates via cosine similarity
  against open complaints in the same category.
- **`app.py`** — Flask routes and SQLite storage (`complaints`, `updates`
  tables, matching the plan's schema).
- **`templates/` + `static/`** — citizen submission form and the authority
  dashboard (Chart.js bar + doughnut charts, status workflow dropdown).

## Extending for the demo

- Add more rows to `TRAIN_DATA` in `model.py` to improve classification.
- Swap `predict_priority` for a trained model once you have labelled priority
  data — the rule-based version is intentionally transparent for judges.
- The `/api/*` routes are ready to wire up an LLM call (e.g. for richer
  summaries) — call it inside `create_complaint()` in `app.py`.

## Judge demo flow

1. Submit: *"Large pothole near the college gate, dangerous at night."*
2. Show the category, HIGH priority, and department routing appear instantly.
3. Submit a second, similarly-worded pothole complaint → duplicate flag.
4. Switch to `/dashboard`, filter by category/status, change a status, and
   point at the live charts.
