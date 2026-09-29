"""
CivicFix AI — Flask backend.

Run:
    pip install -r requirements.txt
    python app.py
Then open http://127.0.0.1:5000
"""

import sqlite3
from datetime import datetime
from flask import Flask, render_template, request, jsonify, g

import model

DB_PATH = "civicfix.db"
app = Flask(__name__)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL,
            location TEXT,
            category TEXT,
            priority TEXT,
            department TEXT,
            status TEXT DEFAULT 'Submitted',
            summary TEXT,
            duplicate_of INTEGER,
            created_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            complaint_id INTEGER,
            status TEXT,
            note TEXT,
            timestamp TEXT
        )
    """)
    # seed a few demo rows on first run so the dashboard isn't empty
    count = conn.execute("SELECT COUNT(*) FROM complaints").fetchone()[0]
    if count == 0:
        demo = [
            ("Streetlight has been off for a week on Maple Street, very dark at night.", "Maple Street"),
            ("Garbage has not been collected near the market for 3 days, smells bad.", "Central Market"),
            ("Water pipe burst near the bus stand, water flooding the road.", "Bus Stand Road"),
            ("Open manhole near the school gate, children walk past it daily. Very dangerous.", "School Gate Road"),
        ]
        for text, loc in demo:
            category = model.classify_text(text)
            priority = model.predict_priority(text, category)
            dept = model.get_department(category)
            summary = model.build_summary(text, loc, category, priority)
            conn.execute(
                "INSERT INTO complaints (text, location, category, priority, department, status, summary, created_at) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (text, loc, category, priority, dept, "Submitted", summary, datetime.utcnow().isoformat()),
            )
        conn.commit()
    conn.close()


def row_to_dict(row):
    return {k: row[k] for k in row.keys()}


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------
@app.route("/api/complaints", methods=["GET"])
def list_complaints():
    db = get_db()
    category = request.args.get("category")
    status = request.args.get("status")

    query = "SELECT * FROM complaints WHERE 1=1"
    params = []
    if category:
        query += " AND category = ?"
        params.append(category)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC"

    rows = db.execute(query, params).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/complaints", methods=["POST"])
def create_complaint():
    data = request.get_json(force=True)
    text = (data.get("text") or "").strip()
    location = (data.get("location") or "").strip()
    if not text:
        return jsonify({"error": "Complaint text is required"}), 400

    db = get_db()
    existing = [row_to_dict(r) for r in db.execute(
        "SELECT id, text, category, status FROM complaints"
    ).fetchall()]

    category = model.classify_text(text)
    priority = model.predict_priority(text, category)
    department = model.get_department(category)
    summary = model.build_summary(text, location, category, priority)

    dup_result = model.find_duplicate(text, existing, category)
    duplicate_of, similarity = (None, None)
    if dup_result:
        dup_match, similarity = dup_result
        duplicate_of = dup_match["id"]

    now = datetime.utcnow().isoformat()
    cur = db.execute(
        "INSERT INTO complaints (text, location, category, priority, department, status, summary, duplicate_of, created_at) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (text, location, category, priority, department, "Submitted", summary, duplicate_of, now),
    )
    db.execute(
        "INSERT INTO updates (complaint_id, status, note, timestamp) VALUES (?,?,?,?)",
        (cur.lastrowid, "Submitted", "Complaint received", now),
    )
    db.commit()

    response = {
        "id": cur.lastrowid,
        "category": category,
        "category_label": model.CATEGORIES[category]["label"],
        "priority": priority,
        "department": department,
        "summary": summary,
        "status": "Submitted",
    }
    if duplicate_of:
        dup_row = db.execute("SELECT * FROM complaints WHERE id = ?", (duplicate_of,)).fetchone()
        response["duplicate"] = {
            "id": dup_row["id"],
            "text": dup_row["text"],
            "location": dup_row["location"],
            "similarity": round(similarity, 2),
        }
    return jsonify(response), 201


@app.route("/api/complaints/<int:complaint_id>/status", methods=["POST"])
def update_status(complaint_id):
    data = request.get_json(force=True)
    new_status = data.get("status")
    valid = ["Submitted", "Assigned", "In Progress", "Resolved"]
    if new_status not in valid:
        return jsonify({"error": "Invalid status"}), 400

    db = get_db()
    db.execute("UPDATE complaints SET status = ? WHERE id = ?", (new_status, complaint_id))
    db.execute(
        "INSERT INTO updates (complaint_id, status, note, timestamp) VALUES (?,?,?,?)",
        (complaint_id, new_status, "Status updated", datetime.utcnow().isoformat()),
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/stats")
def stats():
    db = get_db()
    rows = db.execute("SELECT category, priority, status FROM complaints").fetchall()
    total = len(rows)
    pending = sum(1 for r in rows if r["status"] != "Resolved")
    high_open = sum(1 for r in rows if r["priority"] == "high" and r["status"] != "Resolved")
    resolved = sum(1 for r in rows if r["status"] == "Resolved")

    by_category = {k: 0 for k in model.CATEGORIES}
    for r in rows:
        by_category[r["category"]] += 1

    by_priority = {"high": 0, "medium": 0, "low": 0}
    for r in rows:
        by_priority[r["priority"]] += 1

    return jsonify({
        "total": total, "pending": pending, "high_open": high_open, "resolved": resolved,
        "by_category": by_category, "by_priority": by_priority,
        "category_labels": {k: v["label"] for k, v in model.CATEGORIES.items()},
    })


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
