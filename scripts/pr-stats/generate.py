#!/usr/bin/env python3
"""
Generate a contributor activity dashboard for the repo.

Tracks PRs, commits, and lines of code (additions/deletions) per contributor per week.

Usage:
    python scripts/pr-stats/generate.py            # last 500 PRs (default)
    python scripts/pr-stats/generate.py --limit 200
    python scripts/pr-stats/generate.py --open      # open in browser after generating

Requires: gh CLI authenticated with repo access, git.
Outputs: scripts/pr-stats/report.html
"""

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

COLORS = [
    "#58a6ff",
    "#f78166",
    "#7ee787",
    "#d2a8ff",
    "#f0e68c",
    "#ff9bce",
    "#76e4f7",
    "#ffa657",
    "#a5d6ff",
    "#cea5fb",
    "#f69d50",
    "#56d364",
    "#e2c5ff",
    "#ffc680",
    "#8bd5ca",
]

HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Contributor Activity — Transformer Lab</title>
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
  .bar-cell {{ width: 30%; }}
  .bar-bg {{ background: #21262d; border-radius: 4px; height: 20px; position: relative; }}
  .bar-fill {{ height: 100%; border-radius: 4px; }}
  td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
  th.num {{ text-align: right; }}

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

  /* Tabs */
  .tab-bar {{
    display: flex; gap: 4px; margin-bottom: 24px;
    border-bottom: 1px solid #30363d; padding-bottom: 0;
  }}
  .tab-btn {{
    background: none; border: none; color: #8b949e;
    font-size: 14px; font-weight: 500; padding: 10px 18px;
    cursor: pointer; border-bottom: 2px solid transparent;
    transition: all 0.15s; position: relative; bottom: -1px;
  }}
  .tab-btn:hover {{ color: #c9d1d9; }}
  .tab-btn.active {{ color: #58a6ff; border-bottom-color: #58a6ff; }}
  .tab-content {{ display: none; }}
  .tab-content.active {{ display: block; }}

  .loc-summary {{
    display: flex; gap: 16px; align-items: center; margin-bottom: 16px;
    font-size: 14px;
  }}
  .loc-summary .added {{ color: #7ee787; }}
  .loc-summary .deleted {{ color: #f78166; }}

  @media (max-width: 900px) {{ .grid {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>

<h1>Contributor Activity</h1>
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

<div class="tab-bar">
  <button class="tab-btn active" data-tab="prs">Pull Requests</button>
  <button class="tab-btn" data-tab="commits">Commits</button>
  <button class="tab-btn" data-tab="loc">Lines of Code</button>
</div>

<!-- PR Tab -->
<div class="tab-content active" id="tab-prs">
  <div class="chart-container">
    <h2>PRs per Week (Stacked by Contributor)</h2>
    <canvas id="stackedChart" height="100"></canvas>
  </div>
  <div class="grid">
    <div class="chart-container">
      <h2>Individual PR Trends</h2>
      <canvas id="lineChart" height="160"></canvas>
    </div>
    <div class="chart-container">
      <h2>Share of Total PRs</h2>
      <canvas id="doughnutChart" height="160"></canvas>
    </div>
  </div>
  <div class="chart-container" style="margin-top: 24px;">
    <h2>Contributor Breakdown — PRs</h2>
    <table id="leaderboard"></table>
  </div>
</div>

<!-- Commits Tab -->
<div class="tab-content" id="tab-commits">
  <div class="chart-container">
    <h2>Commits per Week (Stacked by Contributor)</h2>
    <canvas id="commitStackedChart" height="100"></canvas>
  </div>
  <div class="grid">
    <div class="chart-container">
      <h2>Individual Commit Trends</h2>
      <canvas id="commitLineChart" height="160"></canvas>
    </div>
    <div class="chart-container">
      <h2>Share of Total Commits</h2>
      <canvas id="commitDoughnutChart" height="160"></canvas>
    </div>
  </div>
  <div class="chart-container" style="margin-top: 24px;">
    <h2>Contributor Breakdown — Commits</h2>
    <table id="commitLeaderboard"></table>
  </div>
</div>

<!-- Lines of Code Tab -->
<div class="tab-content" id="tab-loc">
  <div class="chart-container">
    <h2>Lines Changed per Week (Additions + Deletions)</h2>
    <canvas id="locStackedChart" height="100"></canvas>
  </div>
  <div class="grid">
    <div class="chart-container">
      <h2>Additions vs Deletions per Week</h2>
      <canvas id="locAddDelChart" height="160"></canvas>
    </div>
    <div class="chart-container">
      <h2>Share of Lines Changed</h2>
      <canvas id="locDoughnutChart" height="160"></canvas>
    </div>
  </div>
  <div class="chart-container" style="margin-top: 24px;">
    <h2>Contributor Breakdown — Lines of Code</h2>
    <table id="locLeaderboard"></table>
  </div>
</div>

<script>
const weeks = {weeks_json};
const weekLabels = {week_labels_json};
const contributors = {contributors_json};
const commitContributors = {commit_contributors_json};
const locContributors = {loc_contributors_json};
const locTotalAdded = {loc_total_added_json};
const locTotalDeleted = {loc_total_deleted_json};
const allNames = Object.keys(contributors);
const allCommitNames = Object.keys(commitContributors);
const allLocNames = Object.keys(locContributors);
const everyName = [...new Set([...allNames, ...allCommitNames, ...allLocNames])];

const visible = {{}};
everyName.forEach(n => visible[n] = true);

// --- Tabs ---
document.querySelectorAll('.tab-btn').forEach(btn => {{
  btn.addEventListener('click', () => {{
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  }});
}});

// --- Filter chips ---
const filterList = document.getElementById('filter-list');
const sortedByTotal = everyName.slice().sort((a, b) => {{
  const aTotal = (contributors[a]?.data.reduce((s,v) => s+v, 0) || 0)
               + (commitContributors[a]?.data.reduce((s,v) => s+v, 0) || 0);
  const bTotal = (contributors[b]?.data.reduce((s,v) => s+v, 0) || 0)
               + (commitContributors[b]?.data.reduce((s,v) => s+v, 0) || 0);
  return bTotal - aTotal;
}});
sortedByTotal.forEach(name => {{
  const prTotal = contributors[name]?.data.reduce((s,v) => s+v, 0) || 0;
  const cmTotal = commitContributors[name]?.data.reduce((s,v) => s+v, 0) || 0;
  const color = contributors[name]?.color || commitContributors[name]?.color || locContributors[name]?.color || '#8b949e';
  const chip = document.createElement('label');
  chip.className = 'filter-chip active';
  chip.style.setProperty('--chip-color', color);
  chip.innerHTML =
    '<input type="checkbox" checked data-name="' + name + '">' +
    '<span class="dot"></span>' +
    '<span class="chip-label">' + name + '</span>' +
    '<span class="chip-count">' + prTotal + ' PRs · ' + cmTotal + ' commits</span>';
  chip.querySelector('input').addEventListener('change', function() {{
    visible[name] = this.checked;
    chip.classList.toggle('active', this.checked);
    rebuildAll();
  }});
  filterList.appendChild(chip);
}});

function setAll(state) {{
  everyName.forEach(n => visible[n] = state);
  filterList.querySelectorAll('input').forEach(cb => {{
    cb.checked = state;
    cb.parentElement.classList.toggle('active', state);
  }});
  rebuildAll();
}}

// --- Chart instances ---
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#30363d';
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, sans-serif';

// PR charts
const stackedChart = new Chart(document.getElementById('stackedChart'), {{
  type: 'bar',
  data: {{ labels: weekLabels, datasets: [] }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ display: false }}, tooltip: {{ mode: 'index', filter: item => item.raw > 0 }} }},
    scales: {{ x: {{ stacked: true, grid: {{ display: false }} }}, y: {{ stacked: true, title: {{ display: true, text: 'PRs' }}, beginAtZero: true }} }}
  }}
}});

const lineChart = new Chart(document.getElementById('lineChart'), {{
  type: 'line',
  data: {{ labels: weekLabels, datasets: [] }},
  options: {{
    responsive: true, interaction: {{ mode: 'index', intersect: false }},
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ x: {{ grid: {{ display: false }} }}, y: {{ title: {{ display: true, text: 'PRs' }}, beginAtZero: true }} }}
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

// Commit charts
const commitStackedChart = new Chart(document.getElementById('commitStackedChart'), {{
  type: 'bar',
  data: {{ labels: weekLabels, datasets: [] }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ display: false }}, tooltip: {{ mode: 'index', filter: item => item.raw > 0 }} }},
    scales: {{ x: {{ stacked: true, grid: {{ display: false }} }}, y: {{ stacked: true, title: {{ display: true, text: 'Commits' }}, beginAtZero: true }} }}
  }}
}});

const commitLineChart = new Chart(document.getElementById('commitLineChart'), {{
  type: 'line',
  data: {{ labels: weekLabels, datasets: [] }},
  options: {{
    responsive: true, interaction: {{ mode: 'index', intersect: false }},
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ x: {{ grid: {{ display: false }} }}, y: {{ title: {{ display: true, text: 'Commits' }}, beginAtZero: true }} }}
  }}
}});

const commitDoughnutChart = new Chart(document.getElementById('commitDoughnutChart'), {{
  type: 'doughnut',
  data: {{ labels: [], datasets: [{{ data: [], backgroundColor: [], borderColor: '#161b22', borderWidth: 2 }}] }},
  options: {{
    responsive: true, cutout: '55%',
    plugins: {{ legend: {{ position: 'bottom', labels: {{ padding: 12, usePointStyle: true, pointStyle: 'circle', font: {{ size: 11 }} }} }} }}
  }}
}});

// LOC charts
const locStackedChart = new Chart(document.getElementById('locStackedChart'), {{
  type: 'bar',
  data: {{ labels: weekLabels, datasets: [] }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ display: false }}, tooltip: {{ mode: 'index', filter: item => item.raw > 0 }} }},
    scales: {{ x: {{ stacked: true, grid: {{ display: false }} }}, y: {{ stacked: true, title: {{ display: true, text: 'Lines changed' }}, beginAtZero: true }} }}
  }}
}});

const locAddDelChart = new Chart(document.getElementById('locAddDelChart'), {{
  type: 'bar',
  data: {{ labels: weekLabels, datasets: [] }},
  options: {{
    responsive: true,
    plugins: {{ legend: {{ position: 'top', labels: {{ usePointStyle: true, pointStyle: 'circle', font: {{ size: 11 }} }} }} }},
    scales: {{ x: {{ grid: {{ display: false }} }}, y: {{ title: {{ display: true, text: 'Lines' }}, beginAtZero: true }} }}
  }}
}});

const locDoughnutChart = new Chart(document.getElementById('locDoughnutChart'), {{
  type: 'doughnut',
  data: {{ labels: [], datasets: [{{ data: [], backgroundColor: [], borderColor: '#161b22', borderWidth: 2 }}] }},
  options: {{
    responsive: true, cutout: '55%',
    plugins: {{ legend: {{ position: 'bottom', labels: {{ padding: 12, usePointStyle: true, pointStyle: 'circle', font: {{ size: 11 }} }} }} }}
  }}
}});

function getColor(name) {{
  return contributors[name]?.color || commitContributors[name]?.color || locContributors[name]?.color || '#8b949e';
}}

function fmt(n) {{
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}}

function rebuildAll() {{
  const visPR = allNames.filter(n => visible[n]);
  const visCM = allCommitNames.filter(n => visible[n]);
  const visLC = allLocNames.filter(n => visible[n]);

  // --- Stat cards ---
  const totalPRs = visPR.reduce((s, n) => s + contributors[n].data.reduce((a,b) => a+b, 0), 0);
  const totalCommits = visCM.reduce((s, n) => s + commitContributors[n].data.reduce((a,b) => a+b, 0), 0);
  const totalAdded = visLC.reduce((s, n) => s + locContributors[n].added.reduce((a,b) => a+b, 0), 0);
  const totalDeleted = visLC.reduce((s, n) => s + locContributors[n].deleted.reduce((a,b) => a+b, 0), 0);

  const statsRow = document.getElementById('stats-row');
  statsRow.innerHTML = '';
  [
    {{ label: 'Total PRs', value: totalPRs, detail: weeks.length + ' weeks tracked' }},
    {{ label: 'Total Commits', value: fmt(totalCommits), detail: visCM.length + ' contributors' }},
    {{ label: 'Lines Added', value: fmt(totalAdded), detail: '<span style="color:#7ee787">+' + fmt(totalAdded) + '</span>' }},
    {{ label: 'Lines Deleted', value: fmt(totalDeleted), detail: '<span style="color:#f78166">−' + fmt(totalDeleted) + '</span>' }},
  ].forEach(s => {{
    statsRow.innerHTML += '<div class="stat-card"><div class="label">'+s.label+'</div><div class="value">'+s.value+'</div><div class="detail">'+s.detail+'</div></div>';
  }});

  // --- PR Charts ---
  stackedChart.data.datasets = visPR.map(n => ({{
    label: n, data: contributors[n].data,
    backgroundColor: contributors[n].color, borderRadius: 2,
  }}));
  stackedChart.update();

  lineChart.data.datasets = visPR.map(n => ({{
    label: n, data: contributors[n].data,
    borderColor: contributors[n].color,
    backgroundColor: contributors[n].color + '22',
    borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.3, fill: false,
  }}));
  lineChart.update();

  const prSorted = visPR.map(n => ({{ name: n, total: contributors[n].data.reduce((a,b)=>a+b,0), color: contributors[n].color }}))
    .sort((a,b) => b.total - a.total);
  doughnutChart.data.labels = prSorted.map(t => t.name);
  doughnutChart.data.datasets[0].data = prSorted.map(t => t.total);
  doughnutChart.data.datasets[0].backgroundColor = prSorted.map(t => t.color);
  doughnutChart.update();

  // PR leaderboard
  const maxPR = prSorted.length ? prSorted[0].total : 1;
  let html = '<thead><tr><th>#</th><th>Contributor</th><th class="num">Total PRs</th><th class="num">Avg/Week</th><th>Peak Week</th><th class="bar-cell">Activity</th></tr></thead><tbody>';
  prSorted.forEach((t, i) => {{
    const cData = contributors[t.name].data;
    const peak = Math.max(...cData);
    const peakI = cData.indexOf(peak);
    const pct = (t.total / maxPR * 100).toFixed(0);
    html += '<tr><td>'+(i+1)+'</td><td><span style="color:'+t.color+';font-weight:600">'+t.name+'</span></td><td class="num">'+t.total+'</td><td class="num">'+(t.total/weeks.length).toFixed(1)+'</td><td>'+peak+' ('+weekLabels[peakI]+')</td><td class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:'+pct+'%;background:'+t.color+'"></div></div></td></tr>';
  }});
  html += '</tbody>';
  document.getElementById('leaderboard').innerHTML = html;

  // --- Commit Charts ---
  commitStackedChart.data.datasets = visCM.map(n => ({{
    label: n, data: commitContributors[n].data,
    backgroundColor: commitContributors[n].color, borderRadius: 2,
  }}));
  commitStackedChart.update();

  commitLineChart.data.datasets = visCM.map(n => ({{
    label: n, data: commitContributors[n].data,
    borderColor: commitContributors[n].color,
    backgroundColor: commitContributors[n].color + '22',
    borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, tension: 0.3, fill: false,
  }}));
  commitLineChart.update();

  const cmSorted = visCM.map(n => ({{ name: n, total: commitContributors[n].data.reduce((a,b)=>a+b,0), color: commitContributors[n].color }}))
    .sort((a,b) => b.total - a.total);
  commitDoughnutChart.data.labels = cmSorted.map(t => t.name);
  commitDoughnutChart.data.datasets[0].data = cmSorted.map(t => t.total);
  commitDoughnutChart.data.datasets[0].backgroundColor = cmSorted.map(t => t.color);
  commitDoughnutChart.update();

  // Commit leaderboard
  const maxCM = cmSorted.length ? cmSorted[0].total : 1;
  let cmHtml = '<thead><tr><th>#</th><th>Contributor</th><th class="num">Total Commits</th><th class="num">Avg/Week</th><th>Peak Week</th><th class="bar-cell">Activity</th></tr></thead><tbody>';
  cmSorted.forEach((t, i) => {{
    const cData = commitContributors[t.name].data;
    const peak = Math.max(...cData);
    const peakI = cData.indexOf(peak);
    const pct = (t.total / maxCM * 100).toFixed(0);
    cmHtml += '<tr><td>'+(i+1)+'</td><td><span style="color:'+t.color+';font-weight:600">'+t.name+'</span></td><td class="num">'+t.total+'</td><td class="num">'+(t.total/weeks.length).toFixed(1)+'</td><td>'+peak+' ('+weekLabels[peakI]+')</td><td class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:'+pct+'%;background:'+t.color+'"></div></div></td></tr>';
  }});
  cmHtml += '</tbody>';
  document.getElementById('commitLeaderboard').innerHTML = cmHtml;

  // --- LOC Charts ---
  locStackedChart.data.datasets = visLC.map(n => ({{
    label: n, data: locContributors[n].added.map((a, i) => a + locContributors[n].deleted[i]),
    backgroundColor: locContributors[n].color, borderRadius: 2,
  }}));
  locStackedChart.update();

  // Aggregate additions/deletions per week across visible contributors
  const weeklyAdded = weeks.map((_, i) => visLC.reduce((s, n) => s + locContributors[n].added[i], 0));
  const weeklyDeleted = weeks.map((_, i) => visLC.reduce((s, n) => s + locContributors[n].deleted[i], 0));
  locAddDelChart.data.datasets = [
    {{ label: 'Additions', data: weeklyAdded, backgroundColor: '#7ee78766', borderColor: '#7ee787', borderWidth: 1, borderRadius: 2 }},
    {{ label: 'Deletions', data: weeklyDeleted, backgroundColor: '#f7816666', borderColor: '#f78166', borderWidth: 1, borderRadius: 2 }},
  ];
  locAddDelChart.update();

  const locSorted = visLC.map(n => ({{
    name: n,
    added: locContributors[n].added.reduce((a,b)=>a+b,0),
    deleted: locContributors[n].deleted.reduce((a,b)=>a+b,0),
    total: locContributors[n].added.reduce((a,b)=>a+b,0) + locContributors[n].deleted.reduce((a,b)=>a+b,0),
    color: locContributors[n].color,
  }})).sort((a,b) => b.total - a.total);
  locDoughnutChart.data.labels = locSorted.map(t => t.name);
  locDoughnutChart.data.datasets[0].data = locSorted.map(t => t.total);
  locDoughnutChart.data.datasets[0].backgroundColor = locSorted.map(t => t.color);
  locDoughnutChart.update();

  // LOC leaderboard
  const maxLOC = locSorted.length ? locSorted[0].total : 1;
  let locHtml = '<thead><tr><th>#</th><th>Contributor</th><th class="num">Lines Added</th><th class="num">Lines Deleted</th><th class="num">Total Changed</th><th class="num">Avg/Week</th><th class="bar-cell">Activity</th></tr></thead><tbody>';
  locSorted.forEach((t, i) => {{
    const pct = (t.total / maxLOC * 100).toFixed(0);
    locHtml += '<tr><td>'+(i+1)+'</td><td><span style="color:'+t.color+';font-weight:600">'+t.name+'</span></td><td class="num" style="color:#7ee787">+'+fmt(t.added)+'</td><td class="num" style="color:#f78166">−'+fmt(t.deleted)+'</td><td class="num">'+fmt(t.total)+'</td><td class="num">'+fmt(Math.round(t.total/weeks.length))+'</td><td class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:'+pct+'%;background:'+t.color+'"></div></div></td></tr>';
  }});
  locHtml += '</tbody>';
  document.getElementById('locLeaderboard').innerHTML = locHtml;
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
        ["gh", "pr", "list", "--state", "all", "--limit", str(limit), "--json", "author,createdAt"],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def fetch_commits(since_date: str | None = None) -> list[dict]:
    """Fetch commit data from git log with stats (additions/deletions)."""
    # Format: hash|author|date|additions|deletions
    cmd = ["git", "log", "--format=%H|%aN|%aI", "--numstat", "--no-merges"]
    if since_date:
        cmd.append(f"--since={since_date}")

    result = subprocess.run(cmd, capture_output=True, text=True, check=True)

    commits: list[dict] = []
    current: dict | None = None

    for line in result.stdout.splitlines():
        if "|" in line and line.count("|") == 2:
            parts = line.split("|", 2)
            if len(parts[0]) == 40:  # SHA length check
                if current:
                    commits.append(current)
                current = {
                    "hash": parts[0],
                    "author": parts[1],
                    "date": parts[2],
                    "added": 0,
                    "deleted": 0,
                }
                continue

        if current and line.strip():
            parts = line.split("\t")
            if len(parts) >= 3:
                added = parts[0]
                deleted = parts[1]
                # Skip binary files (shown as '-')
                if added != "-" and deleted != "-":
                    try:
                        current["added"] += int(added)
                        current["deleted"] += int(deleted)
                    except ValueError:
                        pass

    if current:
        commits.append(current)

    return commits


def monday_of_iso_week(year: int, week: int) -> datetime:
    """Return the Monday of the given ISO year/week."""
    return datetime.strptime(f"{year} {week} 1", "%G %V %u")


def build_report(prs: list[dict], commits: list[dict]) -> str:
    """Turn raw PR + commit data into an HTML report string."""
    # --- Aggregate PRs by (iso_week, author) ---
    pr_weekly: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    pr_authors: set[str] = set()

    for pr in prs:
        author = pr["author"]["login"]
        dt = datetime.fromisoformat(pr["createdAt"].replace("Z", "+00:00"))
        year, week, _ = dt.isocalendar()
        key = f"{year}-W{week:02d}"
        pr_weekly[key][author] += 1
        pr_authors.add(author)

    # --- Aggregate commits by (iso_week, author) ---
    commit_weekly: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    loc_weekly_added: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    loc_weekly_deleted: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    commit_authors: set[str] = set()

    for commit in commits:
        author = commit["author"]
        dt = datetime.fromisoformat(commit["date"])
        year, week, _ = dt.isocalendar()
        key = f"{year}-W{week:02d}"
        commit_weekly[key][author] += 1
        loc_weekly_added[key][author] += commit["added"]
        loc_weekly_deleted[key][author] += commit["deleted"]
        commit_authors.add(author)

    # Union of all weeks
    all_week_keys = sorted(set(pr_weekly.keys()) | set(commit_weekly.keys()))
    if not all_week_keys:
        print("No data found.", file=sys.stderr)
        sys.exit(1)

    # All contributors (union of PR authors and commit authors)
    all_authors = pr_authors | commit_authors

    # Sort authors by total activity (PRs + commits) descending
    author_totals = {
        a: sum(pr_weekly[w][a] for w in all_week_keys) + sum(commit_weekly[w][a] for w in all_week_keys)
        for a in all_authors
    }
    authors_sorted = sorted(all_authors, key=lambda a: author_totals[a], reverse=True)

    # Assign colors
    author_colors = {a: COLORS[i % len(COLORS)] for i, a in enumerate(authors_sorted)}

    # Build week labels
    week_labels = []
    for w in all_week_keys:
        y, wn = int(w[:4]), int(w.split("W")[1])
        mon = monday_of_iso_week(y, wn)
        week_labels.append(mon.strftime("%b %d"))

    # --- Build PR contributor data ---
    pr_contributors = {}
    for author in authors_sorted:
        if author in pr_authors:
            pr_contributors[author] = {
                "data": [pr_weekly[w][author] for w in all_week_keys],
                "color": author_colors[author],
            }

    # --- Build commit contributor data ---
    commit_contributors = {}
    for author in authors_sorted:
        if author in commit_authors:
            commit_contributors[author] = {
                "data": [commit_weekly[w][author] for w in all_week_keys],
                "color": author_colors[author],
            }

    # --- Build LOC contributor data ---
    loc_contributors = {}
    for author in authors_sorted:
        if author in commit_authors:
            loc_contributors[author] = {
                "added": [loc_weekly_added[w][author] for w in all_week_keys],
                "deleted": [loc_weekly_deleted[w][author] for w in all_week_keys],
                "color": author_colors[author],
            }

    # Total additions/deletions per week (for add/del chart)
    total_added = [sum(loc_weekly_added[w].values()) for w in all_week_keys]
    total_deleted = [sum(loc_weekly_deleted[w].values()) for w in all_week_keys]

    # Subtitle
    first_week = week_labels[0]
    last_week = week_labels[-1]
    repo_name = (
        subprocess.run(
            ["gh", "repo", "view", "--json", "name", "--jq", ".name"],
            capture_output=True,
            text=True,
        ).stdout.strip()
        or "unknown-repo"
    )
    subtitle = f"{repo_name} — {first_week} to {last_week} ({len(prs)} PRs, {len(commits)} commits)"

    return HTML_TEMPLATE.format(
        subtitle=subtitle,
        weeks_json=json.dumps(all_week_keys),
        week_labels_json=json.dumps(week_labels),
        contributors_json=json.dumps(pr_contributors),
        commit_contributors_json=json.dumps(commit_contributors),
        loc_contributors_json=json.dumps(loc_contributors),
        loc_total_added_json=json.dumps(total_added),
        loc_total_deleted_json=json.dumps(total_deleted),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate contributor activity dashboard")
    parser.add_argument("--limit", type=int, default=500, help="Number of PRs to fetch (default: 500)")
    parser.add_argument("--open", action="store_true", help="Open the report in the default browser")
    args = parser.parse_args()

    print(f"Fetching last {args.limit} PRs via gh CLI...")
    prs = fetch_prs(args.limit)
    print(f"  Found {len(prs)} PRs from {len({pr['author']['login'] for pr in prs})} contributors")

    # Determine date range from PRs to scope git log
    since_date = None
    if prs:
        dates = [pr["createdAt"] for pr in prs]
        since_date = min(dates)[:10]  # YYYY-MM-DD

    print(f"Fetching commits from git log{' (since ' + since_date + ')' if since_date else ''}...")
    commits = fetch_commits(since_date)
    print(f"  Found {len(commits)} commits from {len({c['author'] for c in commits})} contributors")

    html = build_report(prs, commits)

    out_path = Path(__file__).parent / "report.html"
    out_path.write_text(html)
    print(f"Report written to {out_path}")

    if args.open:
        import webbrowser

        webbrowser.open(f"file://{out_path.resolve()}")


if __name__ == "__main__":
    main()
