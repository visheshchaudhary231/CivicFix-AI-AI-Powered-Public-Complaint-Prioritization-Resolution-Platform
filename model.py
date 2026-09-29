"""
CivicFix AI — classification, priority, routing and duplicate detection.

Beginner-friendly approach as per the plan:
- TF-IDF + Logistic Regression for category classification (trained on a small
  synthetic dataset at startup — good enough for an MVP / hackathon demo).
- A transparent, explainable rule layer decides priority (escalation keywords).
- Duplicate detection uses cosine similarity between TF-IDF vectors of
  complaints in the same category.
"""

import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics.pairwise import cosine_similarity

# ---------------------------------------------------------------------------
# 1. Category metadata: display label, department, default priority, color
# ---------------------------------------------------------------------------
CATEGORIES = {
    "pothole":     {"label": "Road / Pothole", "dept": "Road Department",     "base_priority": "high"},
    "garbage":     {"label": "Garbage",         "dept": "Sanitation Dept.",   "base_priority": "medium"},
    "streetlight": {"label": "Streetlight",     "dept": "Electrical Dept.",  "base_priority": "medium"},
    "water":       {"label": "Water Leakage",   "dept": "Water Board",        "base_priority": "high"},
    "sanitation":  {"label": "Sanitation",      "dept": "Sanitation Dept.",   "base_priority": "medium"},
    "safety":      {"label": "Public Safety",   "dept": "Municipal Safety",   "base_priority": "high"},
    "other":       {"label": "Other",           "dept": "General Office",     "base_priority": "low"},
}

ESCALATION_WORDS = [
    "danger", "dangerous", "night", "accident", "injur", "fire",
    "electric shock", "children", "school", "emergency", "collapse",
    "flooding", "overflow", "open wire",
]

# ---------------------------------------------------------------------------
# 2. Small synthetic labelled dataset (complaint_text -> category)
#    In a real deployment this would be replaced / grown with real complaints.
# ---------------------------------------------------------------------------
TRAIN_DATA = [
    ("There is a large pothole near the college gate, dangerous at night", "pothole"),
    ("Deep pothole on main road causing accidents", "pothole"),
    ("Road has multiple potholes after the rain", "pothole"),
    ("Cracked pavement near the bus stop is unsafe for walking", "pothole"),
    ("Open manhole cover on the road, very dangerous", "pothole"),
    ("Asphalt is broken and full of holes near the market", "pothole"),
    ("Big crater in the road damaged my car tyre", "pothole"),
    ("Garbage has not been collected for a week near my house", "garbage"),
    ("Overflowing trash bin near the park, bad smell", "garbage"),
    ("Waste dumped illegally on the empty plot", "garbage"),
    ("Litter scattered all over the street corner", "garbage"),
    ("Municipal garbage van has not come this week", "garbage"),
    ("Rubbish piling up outside the shops", "garbage"),
    ("Streetlight near my house has been off for a week", "streetlight"),
    ("Street light pole is broken and sparking at night", "streetlight"),
    ("No light on the road, very dark at night", "streetlight"),
    ("Lamp post bulb fused, entire lane is dark", "streetlight"),
    ("Streetlights not working near the park entrance", "streetlight"),
    ("Water pipe burst near the bus stand, flooding the road", "water"),
    ("Major water leakage from underground pipeline", "water"),
    ("Drinking water pipe leaking and wasting water", "water"),
    ("Sewage water mixing with drinking water supply", "water"),
    ("Water tank overflow flooding the street", "water"),
    ("Broken pipeline causing water logging every day", "water"),
    ("Open drain near the school is not covered, smells terrible", "sanitation"),
    ("Stagnant water breeding mosquitoes near the colony", "sanitation"),
    ("Public toilet is not being cleaned regularly", "sanitation"),
    ("Sewer line blocked, dirty water on the street", "sanitation"),
    ("Drainage system clogged causing bad odour", "sanitation"),
    ("Exposed electric wire near the playground, children play there", "safety"),
    ("Broken railing near the bridge is a safety hazard", "safety"),
    ("Fire hazard due to exposed wiring near the market", "safety"),
    ("Unsafe construction site with no barricades near school", "safety"),
    ("Stray dogs attacking people near the park, dangerous", "safety"),
    ("Loose electric pole leaning dangerously over the footpath", "safety"),
    ("Noise pollution from construction site at night", "other"),
    ("Illegal parking blocking the street every day", "other"),
    ("Encroachment on the footpath by vendors", "other"),
    ("Public park equipment is broken and needs repair", "other"),
    ("Stray cattle roaming and blocking traffic", "other"),
    ("Community hall booking process is confusing", "other"),
]

# ---------------------------------------------------------------------------
# 3. Train the model once at import time
# ---------------------------------------------------------------------------
_texts = [t for t, _ in TRAIN_DATA]
_labels = [c for _, c in TRAIN_DATA]

vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2))
X_train = vectorizer.fit_transform(_texts)

classifier = LogisticRegression(max_iter=1000)
classifier.fit(X_train, _labels)


def classify_text(text: str) -> str:
    """Predict complaint category using the trained TF-IDF + LogReg model."""
    vec = vectorizer.transform([text])
    return classifier.predict(vec)[0]


def predict_priority(text: str, category: str) -> str:
    """Rule-based, explainable priority: category baseline + escalation words."""
    lower = text.lower()
    if any(word in lower for word in ESCALATION_WORDS):
        return "high"
    return CATEGORIES[category]["base_priority"]


def get_department(category: str) -> str:
    return CATEGORIES[category]["dept"]


def build_summary(text: str, location: str, category: str, priority: str) -> str:
    label = CATEGORIES[category]["label"]
    loc_part = f" near {location}" if location else ""
    return f"{label} issue reported{loc_part} — flagged as {priority} priority."


def find_duplicate(new_text: str, candidates: list, category: str, threshold: float = 0.35):
    """
    candidates: list of dicts with keys 'id', 'text', 'category', 'status'
    Returns the best-matching open candidate in the same category above the
    similarity threshold, or None.
    """
    same_cat_open = [c for c in candidates if c["category"] == category and c["status"] != "Resolved"]
    if not same_cat_open:
        return None

    corpus = [c["text"] for c in same_cat_open] + [new_text]
    tfidf = vectorizer.transform(corpus)
    sims = cosine_similarity(tfidf[-1], tfidf[:-1]).flatten()

    best_idx = sims.argmax() if len(sims) else None
    if best_idx is not None and sims[best_idx] >= threshold:
        return same_cat_open[best_idx], float(sims[best_idx])
    return None
