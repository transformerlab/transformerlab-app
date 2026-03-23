#!/usr/bin/env python3
"""
Generate a PR activity dashboard for the repo.

Usage:
    python scripts/pr-stats/generate.py            # last 500 PRs (default)
    python scripts/pr-stats/generate.py --limit 200
    python scripts/pr-stats/generate.py --open      # open in browser after generating

Requires: gh CLI authenticated with repo access.
Outputs: scripts/pr-stats/report.html
"""

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

COLORS = [
    "#58a6ff", "#f78166", "#7ee787", "#d2a8ff", "#f0e68c",
    "#ff9bce", "#76e4f7", "#ffa657", "#a5d6ff", "#cea5fb",
    "#f69d50", "#56d364", "#e2c5ff", "#ffc680", "#8bd5ca",
]

HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PR Activity — Transformer Lab</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f1117; color: #e1e4e8; padding: 32px;
  }}
  h1 {{ font-size: 24px; font-weight: 600; margin-bottom: 4px; }}
  .subtitle {{ color: #8b949e; font-size: 14px; margin-bottom: 32px; }}
  .chart-container {{
    background: #161b22; border: 1px solid #30363d;
    border-radius: 12px; padding: 24px; margin-bottom: 24px;
  }}
  .chart-container h2 {{ font-size: 16px; font-weight: 500; margin-bottom: 16px; color: #c9d1d9; }}
  .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }}
  .stats-row {{ display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }}
  .stat-card {{
    background: #161b22; border: 1px solid #30363d;
    border-radius: 10px; padding: 16px 20px; min-width: 150px; flex: 1;
  }}
  .stat-card .label {{ font-size: 12px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }}
  .stat-card .value {{ font-size: 28px; font-weight: 700; margin-top: 4px; }}
  .stat-card .detail {{ font-size: 12px; color: #8b949e; margin-top: 2px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
  th {{ text-align: left; color: #8b949e; font-weight: 500; padding: 8px 12px; border-bottom: 1px solid #30363d; }}
  td {{ padding: 8px 12px; border-bottom: 1px solid #21262d; }}
  tr:hover td {{ background: #1c2129; }}
  .bar-cell {{ width: 40%; }}
  .bar-bg {{ background: #21262d; border-radius: 4px; height: 20px; position: relative; }}
  .bar-fill {{ height: 100%; border-radius: 4px; }}

  /* Filter panel */
  .filter-panel {{
    background: #161b22; border: 1px solid #30363d;
    border-radius: 12px; padding: 20px 24px; margin-bottom: 24px;
  }}
  .filter-panel h2 {{ font-size: 16px; font-weight: 500; margin-bottom: 12px; color: #c9d1d9; }}
  .filter-controls {{ display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }}
  .filter-controls button {{
    background: #21262d; border: 1px solid #30363d; color: #c9d1d9;
    border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer;
    transition: background 0.15s;
  }}
  .filter-controls button:hover {{ background: #30363d; }}
  .filter-list {{
    display: flex; flex-wrap: wrap; gap: 6px;
  }}
  .filter-chip {{
    display: flex; align-items: center; gap: 6px;
    background: #21262d; border: 1px solid #30363d;
    border-radius: 8px; padding: 6px 12px; cursor: pointer;
    transition: all 0.15s; user-select: none;
  }}
  .filter-chip:hover {{ border-color: #484f58; }}
  .filter-chip.active {{ border-color: var(--chip-color); background: color-mix(in srgb, var(--chip-color) 15%, #21262d); }}
  .filter-chip input {{ display: none; }}
  .filter-chip .dot {{
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--chip-color); opacity: 0.4; transition: opacity 0.15s;
  }}
  .filter-chip.active .dot {{ opacity: 1; }}
  .filter-chip .chip-label {{ font-size: 13px; color: #8b949e; transition: color 0.15s; }}
  .filter-chip.active .chip-label {{ color: #e1e4e8; font-weight: 500; }}
  .filter-chip .chip-count {{
    font-size: 11px; color: #484f58; background: #161b22;
    border-radius: 10px; padding: 1px 6px; margin-left: 2px;
  }}
  .filter-chip.active .chip-count {{ color: #8b949e; }}

  @media (max-width: 900px) {{ .grid {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>

<h1>Pull Request Activity</h1>
<p class="subtitle">{subtitle}</p>

<div class="filter-panel">
  <h2>Filter Contributors</h2>
  <div class="filter-controls">
    <button onclick="setAll(true)">Select All</button>
    <button onclick="setAll(false)">Deselect All</button>
  </div>
  <div class="filter-list" id="filter-list"></div>
</div>

<div class="stats-row" id="stats-row"></div>

<div class="chart-container">
  <h2>PRs per Week (Stacked by Contributor)</h2>
  <canvas id="stackedChart" height="100"></canvas>
</div>

<div class="grid">
  <div class="chart-container">
    <h2>Individual Trends</h2>
    <canvas id="lineChart" height="160"></canvas>
  </div>
  <div class="chart-container">
    <h2>Share of Total PRs</h2>
    <canvas id="doughnutChart" height="160"></canvas>
  </div>
</div>

<div class="chart-container" style="margin-top: 24px;">
  <h2>Contributor Breakdown</h2>
  <table id="leaderboard"></table>
</div>

<script>
const weeks = {weeks_json};
const weekLabels = {week_labels_json};
const contributors = {contributors_json};
const allNames = Object.keys(contributors);

// Track which contributors are visible (all on by default)
const visible = {{}};
allNames.forEach(n => visible[n] = true);

// --- Build filter chips ---
const filterList = document.getElementById('filter-list');
const sortedByTotal = allNames.slice().sort((a, b) =>
  contributors[b].data.reduce((s,v) => s+v, 0) - contributors[a].data.reduce((s,v) => s+v, 0)
);
sortedByTotal.forEach(name => {{
  const total = contributors[name].data.reduce((s,v) => s+v, 0);
  const color = contributors[name].color;
  const chip = document.createElement('label');
  chip.className = 'filter-chip active';
  chip.style.setProperty('--chip-color', color);
  chip.innerHTML =
    '<input type="checkbox" checked data-name="' + name + '">' +
    '<span class="dot"></span>' +
    '<span class="chip-label">' + name + '</span>' +
    '<span class="chip-count">' + total + '</span>';
  chip.querySelector('input').addEventListener('change', function() {{
    visible[name] = this.checked;
    chip.classList.toggle('active', this.checked);
    rebuildAll();
  }});
  filterList.appendChild(chip);
}});

function setAll(state) {{
  allNames.forEach(n => visible[n] = state);
  filterList.querySelectorAll('input').forEach(cb => {{
    cb.checked = state;
    cb.parentElement.classList.toggle('active', state);
  }});
  rebuildAll();
}}

// --- Chart instances (created once, updated on filter) ---
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#30363d';
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, sans-serif';

const stackedChart = new Chart(document.getElementById('stackedChart'), {{
  type: 'bar',
  data: {{ labels: weekLabels, datasets: [] }},
  options: {{
    responsive: true,
    plugins: {{
      legend: {{ display: false }},
      tooltip: {{ mode: 'index', filter: item => item.raw > 0 }}
    }},
    scales: {{
      x: {{ stacked: true, grid: {{ display: false }} }},
      y: {{ stacked: true, title: {{ display: true, text: 'PRs' }}, beginAtZero: true }}
    }}
  }}
}});

const lineChart = new Chart(document.getElementById('lineChart'), {{
  type: 'line',
  data: {{ labels: weekLabels, datasets: [] }},
  options: {{
    responsive: true,
    interaction: {{ mode: 'index', intersect: false }},
    plugins: {{ legend: {{ display: false }} }},
    scales: {{
      x: {{ grid: {{ display: false }} }},
      y: {{ title: {{ display: true, text: 'PRs' }}, beginAtZero: true }}
    }}
  }}
}});

const doughnutChart = new Chart(document.getElementById('doughnutChart'), {{
  type: 'doughnut',
  data: {{ labels: [], datasets: [{{ data: [], backgroundColor: [], borderColor: '#161b22', borderWidth: 2 }}] }},
  options: {{
    responsive: true, cutout: '55%',
    plugins: {{ legend: {{ position: 'bottom', labels: {{ padding: 12, usePointStyle: true, pointStyle: 'circle', font: {{ size: 11 }} }} }} }}
  }}
}});

function getVisible() {{
  return allNames.filter(n => visible[n]);
}}

function rebuildAll() {{
  const vis = getVisible();

  // --- Stat cards ---
  const totalPRs = vis.reduce((s, n) => s + contributors[n].data.reduce((a,b) => a+b, 0), 0);
  const wkTotals = weeks.map((_, i) => vis.reduce((s, n) => s + contributors[n].data[i], 0));
  const peakVal = Math.max(...wkTotals, 0);
  const peakIdx = wkTotals.indexOf(peakVal);
  const topEntry = vis.reduce((best, n) => {{
    const t = contributors[n].data.reduce((a,b) => a+b, 0);
    return t > best[1] ? [n, t] : best;
  }}, ['—', 0]);

  const statsRow = document.getElementById('stats-row');
  statsRow.innerHTML = '';
  [
    {{ label: 'Total PRs', value: totalPRs, detail: weeks.length + ' weeks tracked' }},
    {{ label: 'Avg PRs / Week', value: vis.length ? (totalPRs / weeks.length).toFixed(1) : '0', detail: vis.length + ' of ' + allNames.length + ' contributors' }},
    {{ label: 'Peak Week', value: peakVal, detail: peakIdx >= 0 ? weekLabels[peakIdx] + ' (' + weeks[peakIdx] + ')' : '—' }},
    {{ label: 'Top Contributor', value: topEntry[0], detail: topEntry[1] + ' PRs' + (totalPRs ? ' (' + (topEntry[1]/totalPRs*100).toFixed(0) + '%)' : '') }},
  ].forEach(s => {{
    statsRow.innerHTML += '<div class="stat-card"><div class="label">'+s.label+'</div><div class="value">'+s.value+'</div><div class="detail">'+s.detail+'</div></div>';
  }});

  // --- Stacked bar ---
  stackedChart.data.datasets = vis.map(n => ({{
    label: n, data: contributors[n].data,
    backgroundColor: contributors[n].color, borderRadius: 2,
  }}));
  stackedChart.update();

  // --- Line chart ---
  lineChart.data.datasets = vis.map(n => ({{
    label: n, data: contributors[n].data,
    borderColor: contributors[n].color,
    backgroundColor: contributors[n].color + '22',
    borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
    tension: 0.3, fill: false,
  }}));
  lineChart.update();

  // --- Doughnut ---
  const sorted = vis.map(n => ({{ name: n, total: contributors[n].data.reduce((a,b)=>a+b,0), color: contributors[n].color }}))
    .sort((a,b) => b.total - a.total);
  doughnutChart.data.labels = sorted.map(t => t.name);
  doughnutChart.data.datasets[0].data = sorted.map(t => t.total);
  doughnutChart.data.datasets[0].backgroundColor = sorted.map(t => t.color);
  doughnutChart.update();

  // --- Leaderboard ---
  const maxT = sorted.length ? sorted[0].total : 1;
  const tableEl = document.getElementById('leaderboard');
  let html = '<thead><tr><th>#</th><th>Contributor</th><th>Total PRs</th><th>Avg/Week</th><th>Peak Week</th><th class="bar-cell">Activity</th></tr></thead><tbody>';
  sorted.forEach((t, i) => {{
    const cData = contributors[t.name].data;
    const peak = Math.max(...cData);
    const peakI = cData.indexOf(peak);
    const pct = (t.total / maxT * 100).toFixed(0);
    html += '<tr><td>'+(i+1)+'</td><td><span style="color:'+t.color+';font-weight:600">'+t.name+'</span></td><td>'+t.total+'</td><td>'+(t.total/weeks.length).toFixed(1)+'</td><td>'+peak+' ('+weekLabels[peakI]+')</td><td class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:'+pct+'%;background:'+t.color+'"></div></div></td></tr>';
  }});
  html += '</tbody>';
  tableEl.innerHTML = html;
}}

// Initial render
rebuildAll();
</script>
</body>
</html>
"""


def fetch_prs(limit: int) -> list[dict]:
    """Fetch PRs using the gh CLI."""
    result = subprocess.run(
        ["gh", "pr", "list", "--state", "all", "--limit", str(limit),
         "--json", "author,createdAt"],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)


def monday_of_iso_week(year: int, week: int) -> datetime:
    """Return the Monday of the given ISO year/week."""
    return datetime.strptime(f"{year} {week} 1", "%G %V %u")


def build_report(prs: list[dict]) -> str:
    """Turn raw PR data into an HTML report string."""
    # Aggregate by (iso_week, author)
    weekly: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    authors: set[str] = set()

    for pr in prs:
        author = pr["author"]["login"]
        dt = datetime.fromisoformat(pr["createdAt"].replace("Z", "+00:00"))
        year, week, _ = dt.isocalendar()
        key = f"{year}-W{week:02d}"
        weekly[key][author] += 1
        authors.add(author)

    weeks_sorted = sorted(weekly.keys())
    if not weeks_sorted:
        print("No PR data found.", file=sys.stderr)
        sys.exit(1)

    # Sort authors by total PRs descending
    author_totals = {a: sum(weekly[w][a] for w in weeks_sorted) for a in authors}
    authors_sorted = sorted(authors, key=lambda a: author_totals[a], reverse=True)

    # Build week labels (Monday date)
    week_labels = []
    for w in weeks_sorted:
        y, wn = int(w[:4]), int(w.split("W")[1])
        mon = monday_of_iso_week(y, wn)
        week_labels.append(mon.strftime("%b %d"))

    # Build contributor data
    contributors = {}
    for i, author in enumerate(authors_sorted):
        contributors[author] = {
            "data": [weekly[w][author] for w in weeks_sorted],
            "color": COLORS[i % len(COLORS)],
        }

    # Subtitle
    first_week = week_labels[0]
    last_week = week_labels[-1]
    subtitle = f"transformerlab-app2 — {first_week} to {last_week} ({len(prs)} PRs)"

    return HTML_TEMPLATE.format(
        subtitle=subtitle,
        weeks_json=json.dumps(weeks_sorted),
        week_labels_json=json.dumps(week_labels),
        contributors_json=json.dumps(contributors),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate PR activity dashboard")
    parser.add_argument("--limit", type=int, default=500, help="Number of PRs to fetch (default: 500)")
    parser.add_argument("--open", action="store_true", help="Open the report in the default browser")
    args = parser.parse_args()

    print(f"Fetching last {args.limit} PRs via gh CLI...")
    prs = fetch_prs(args.limit)
    print(f"  Found {len(prs)} PRs from {len({pr['author']['login'] for pr in prs})} contributors")

    html = build_report(prs)

    out_path = Path(__file__).parent / "report.html"
    out_path.write_text(html)
    print(f"Report written to {out_path}")

    if args.open:
        import webbrowser
        webbrowser.open(f"file://{out_path.resolve()}")


if __name__ == "__main__":
    main()
