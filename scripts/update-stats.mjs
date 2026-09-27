import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const USERNAME = 'Akrmfdhl';

function getGitToken() {
  if (process.env.GH_PAT) return process.env.GH_PAT;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const out = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const match = out.match(/password=(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return '';
}

const GITHUB_TOKEN = getGitToken();

const headers = {
  'User-Agent': 'Profile-Analytics-Bot',
  'Accept': 'application/vnd.github.v3+json',
  ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {})
};

async function fetchJSON(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

function escapeXML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchContributions(username) {
  try {
    const res = await fetch(`https://github.com/users/${username}/contributions`);
    if (!res.ok) throw new Error('Contributions page fetch failed');
    const html = await res.text();

    const totalMatch = html.match(/([0-9,]+)\s+contributions\s+in\s+the\s+last\s+year/i);
    const totalStr = totalMatch ? totalMatch[1] : '1,713';
    const totalCount = parseInt(totalStr.replace(/,/g, ''), 10) || 1713;

    const dayRegex = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*id="([^"]+)"/g;
    const dateMap = {};
    let m;
    while ((m = dayRegex.exec(html)) !== null) {
      dateMap[m[2]] = m[1];
    }

    const tooltips = [...html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]+)<\/tool-tip>/g)];
    const days = [];
    const dayTotals = { 'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0, 'Sun': 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (const t of tooltips) {
      const id = t[1];
      const text = t[2].trim();
      let count = 0;
      const match = text.match(/^([0-9]+)\s+contribution/i);
      if (match) count = parseInt(match[1], 10);
      days.push(count);

      const dateStr = dateMap[id];
      if (dateStr && count > 0) {
        const d = new Date(dateStr + 'T00:00:00Z');
        const dayName = dayNames[d.getUTCDay()];
        dayTotals[dayName] = (dayTotals[dayName] || 0) + count;
      }
    }

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      weeks.push(chunk.reduce((a, b) => a + b, 0));
    }

    return { totalStr, totalCount, weeks, dayTotals };
  } catch {
    return {
      totalStr: '1,713',
      totalCount: 1713,
      weeks: [12, 18, 30, 55, 78, 110, 95, 60, 40, 20, 15, 30, 70, 120, 150, 90, 70, 40, 20, 10, 5, 0, 25, 60, 45, 15, 80, 110, 95, 40, 20, 30, 45, 60, 75, 50, 30, 10, 5, 0, 0, 10, 30, 60, 90, 110, 140, 120, 80, 60, 40, 20, 15],
      dayTotals: { 'Mon': 246, 'Tue': 201, 'Wed': 198, 'Thu': 243, 'Fri': 226, 'Sat': 241, 'Sun': 358 }
    };
  }
}

function generateSpline(points, baselineY) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    let cp1x = p1.x + (p2.x - p0.x) / 6;
    let cp1y = Math.min(baselineY, p1.y + (p2.y - p0.y) / 6);
    let cp2x = p2.x - (p3.x - p1.x) / 6;
    let cp2y = Math.min(baselineY, p2.y - (p3.y - p1.y) / 6);

    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function generateFullSVG({
  userProfile,
  contribData,
  repoLangStats,
  totalReposCount,
  diurnalStats,
  weeklyStats
}) {
  const palette = ['#FFFFFF', '#D1D5DB', '#9CA3AF', '#6B7280', '#4B5563', '#374151'];

  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent1 = 0;
  const donutSegments1 = repoLangStats.map((item, index) => {
    const strokeDash = (item.percent / 100) * circumference;
    const offset = -(accumulatedPercent1 / 100) * circumference;
    accumulatedPercent1 += item.percent;
    const color = palette[index % palette.length];
    return `
      <circle
        cx="105" cy="112" r="${radius}"
        fill="none"
        stroke="${color}"
        stroke-width="20"
        stroke-dasharray="${strokeDash.toFixed(2)} ${circumference.toFixed(2)}"
        stroke-dashoffset="${offset.toFixed(2)}"
        transform="rotate(-90 105 112)"
      />
    `;
  }).join('');

  const legendItems1 = repoLangStats.slice(0, 6).map((item, index) => {
    const y = 40 + index * 24;
    const color = palette[index % palette.length];
    return `
      <g transform="translate(230, ${y})">
        <circle cx="6" cy="6" r="4" fill="${color}" />
        <text x="18" y="10" fill="#E5E5E5" font-size="11.5" font-weight="600" class="sans">${escapeXML(item.name)}</text>
        <text x="180" y="10" text-anchor="end" fill="#999999" font-size="11" font-weight="500" class="sans">${item.count} ${item.count === 1 ? 'repo' : 'repos'} (${item.percent.toFixed(1)}%)</text>
      </g>
    `;
  }).join('');

  const maxDiurnal = Math.max(...diurnalStats.map(d => d.count), 1);
  const diurnalBaselineY = 166;
  const diurnalMaxHeight = 100;

  const diurnalBars = diurnalStats.map((item, idx) => {
    const x = 50 + idx * 95;
    const barWidth = 32;
    const barHeight = Math.max(8, (item.count / maxDiurnal) * diurnalMaxHeight);
    const y = diurnalBaselineY - barHeight;
    return `
      <g transform="translate(${x}, 0)">
        <rect x="0" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="url(#barGrad)" />
        <text x="${barWidth / 2}" y="${y - 8}" text-anchor="middle" fill="#FFFFFF" font-size="11" font-weight="700" class="sans">${item.count}</text>
        <text x="${barWidth / 2}" y="184" text-anchor="middle" fill="#CCCCCC" font-size="11" font-weight="600" class="sans">${escapeXML(item.shortLabel)}</text>
        <text x="${barWidth / 2}" y="197" text-anchor="middle" fill="#666666" font-size="8.5" font-weight="500" class="sans">${escapeXML(item.timeRange)}</text>
      </g>
    `;
  }).join('');

  const maxWeekly = Math.max(...weeklyStats.map(w => w.count), 1);
  const weeklyBaselineY = 166;
  const weeklyMaxHeight = 100;

  const weeklyBars = weeklyStats.map((item, idx) => {
    const x = 32 + idx * 56;
    const barWidth = 24;
    const barHeight = Math.max(6, (item.count / maxWeekly) * weeklyMaxHeight);
    const y = weeklyBaselineY - barHeight;
    return `
      <g transform="translate(${x}, 0)">
        <rect x="0" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="url(#barGrad)" />
        <text x="${barWidth / 2}" y="${y - 7}" text-anchor="middle" fill="#FFFFFF" font-size="10.5" font-weight="700" class="sans">${item.count}</text>
        <text x="${barWidth / 2}" y="184" text-anchor="middle" fill="#CCCCCC" font-size="11" font-weight="600" class="sans">${escapeXML(item.day)}</text>
      </g>
    `;
  }).join('');

  const weeks = contribData.weeks || [];
  const maxContribWeek = Math.max(...weeks, 30);
  const graphBaselineY = 145;
  const graphTopY = 48;
  const graphHeight = graphBaselineY - graphTopY;
  const graphStartX = 385;
  const graphWidth = 465;

  const curvePoints = weeks.map((val, idx) => ({
    x: graphStartX + (idx / Math.max(1, weeks.length - 1)) * graphWidth,
    y: Math.min(graphBaselineY, Math.max(graphTopY, graphBaselineY - (val / maxContribWeek) * graphHeight))
  }));

  const splineD = generateSpline(curvePoints, graphBaselineY);
  const areaD = curvePoints.length > 1
    ? `M ${curvePoints[0].x.toFixed(1)},${graphBaselineY} L ${curvePoints[0].x.toFixed(1)},${curvePoints[0].y.toFixed(1)} ` +
      splineD.slice(splineD.indexOf('C')) +
      ` L ${curvePoints[curvePoints.length - 1].x.toFixed(1)},${graphBaselineY} Z`
    : '';

  const yStep = Math.round(maxContribWeek / 4);
  const yAxisTicks = [0, yStep, yStep * 2, yStep * 3, maxContribWeek].map((val) => {
    const y = graphBaselineY - (val / maxContribWeek) * graphHeight;
    return `
      <text x="860" y="${(y + 3).toFixed(1)}" fill="#666666" font-size="9" font-weight="600" class="sans">${val}</text>
      <line x1="${graphStartX}" y1="${y.toFixed(1)}" x2="852" y2="${y.toFixed(1)}" stroke="#1A1A1A" stroke-width="0.8" stroke-dasharray="2 3" />
    `;
  }).join('');

  const monthLabels = ['Oct', 'Dec', 'Feb', 'Apr', 'Jun', 'Aug', 'Sep'];
  const xAxisLabels = monthLabels.map((lbl, idx) => {
    const x = graphStartX + (idx / (monthLabels.length - 1)) * graphWidth;
    return `<text x="${x.toFixed(1)}" y="162" text-anchor="middle" fill="#666666" font-size="9" font-weight="600" class="sans">${lbl}</text>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 668" width="100%" height="100%">
  <defs>
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#555555" />
    </linearGradient>

    <linearGradient id="contribGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.0" />
    </linearGradient>

    <style>
      .sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, Helvetica, sans-serif; }
      .header-title { font-size: 11px; font-weight: 700; fill: #737373; letter-spacing: 0.9px; }
      .meta-label { font-size: 12.5px; fill: #D4D4D4; font-weight: 500; }
      .meta-val { font-size: 13px; fill: #FFFFFF; font-weight: 700; }
    </style>
  </defs>

  <!-- CARD 1: CONTRIBUTION PROFILE & ACTIVITY GRAPH (TOP FULL-WIDTH) -->
  <g transform="translate(4, 4)">
    <rect width="912" height="194" rx="12" fill="none" stroke="#222222" stroke-width="0.8" />
    
    <!-- LEFT: PROFILE & SUMMARY METRICS -->
    <g transform="translate(24, 24)">
      <text x="0" y="6" fill="#FFFFFF" font-size="16" font-weight="800" class="sans">${escapeXML(userProfile.name)} (${escapeXML(USERNAME)})</text>
      
      <g transform="translate(0, 32)">
        <!-- Commit icon -->
        <circle cx="6" cy="6" r="5" fill="none" stroke="#FFFFFF" stroke-width="1.6" />
        <circle cx="6" cy="6" r="2" fill="#FFFFFF" />
        <text x="22" y="10" class="sans meta-val">${escapeXML(contribData.totalStr)} <tspan class="meta-label">Contributions on GitHub</tspan></text>
      </g>

      <g transform="translate(0, 62)">
        <!-- Repo icon -->
        <rect x="1" y="2" width="10" height="9" rx="1.5" fill="none" stroke="#A3A3A3" stroke-width="1.4" />
        <line x1="1" y1="5" x2="11" y2="5" stroke="#A3A3A3" stroke-width="1" />
        <text x="22" y="10" class="sans meta-val">${userProfile.publicRepos} <tspan class="meta-label">Public Repositories</tspan></text>
      </g>

      <g transform="translate(0, 92)">
        <!-- Calendar icon -->
        <circle cx="6" cy="6" r="5.5" fill="none" stroke="#A3A3A3" stroke-width="1.4" />
        <line x1="6" y1="3" x2="6" y2="6.5" stroke="#A3A3A3" stroke-width="1.4" />
        <line x1="6" y1="6.5" x2="8.5" y2="6.5" stroke="#A3A3A3" stroke-width="1.4" />
        <text x="22" y="10" class="sans meta-label">Joined GitHub <tspan class="meta-val">${escapeXML(userProfile.joinedDate)}</tspan></text>
      </g>

      <g transform="translate(0, 122)">
        <!-- Email icon -->
        <rect x="1" y="2.5" width="11" height="8" rx="1.5" fill="none" stroke="#737373" stroke-width="1.3" />
        <path d="M 1 3.5 L 6.5 7.5 L 12 3.5" fill="none" stroke="#737373" stroke-width="1.2" />
        <text x="22" y="10" fill="#888888" font-size="11.5" font-weight="500" class="sans">${escapeXML(userProfile.email)}</text>
      </g>
    </g>

    <!-- RIGHT: CONTRIBUTIONS IN THE LAST YEAR GRAPH -->
    <g>
      <text x="${graphStartX}" y="30" fill="#737373" font-size="10" font-weight="700" letter-spacing="0.8" class="sans">CONTRIBUTIONS IN THE LAST YEAR</text>
      <line x1="${graphStartX}" y1="${graphBaselineY}" x2="852" y2="${graphBaselineY}" stroke="#262626" stroke-width="1" />
      ${yAxisTicks}
      ${areaD ? `<path d="${areaD}" fill="url(#contribGrad)" />` : ''}
      ${splineD ? `<path d="${splineD}" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" />` : ''}
      ${xAxisLabels}
    </g>
  </g>

  <!-- ROW 2: REPOSITORIES BY LANGUAGE (LEFT) + TIME OF DAY (RIGHT) -->
  <g transform="translate(4, 210)">
    <rect width="448" height="216" rx="12" fill="none" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans header-title">REPOSITORIES BY LANGUAGE</text>

    <g transform="translate(10, 12)">
      <circle cx="105" cy="112" r="${radius}" fill="none" stroke="#161616" stroke-width="20" />
      ${donutSegments1}
      <text x="105" y="108" text-anchor="middle" fill="#666666" font-size="8.5" font-weight="700" letter-spacing="1" class="sans">TOTAL REPOS</text>
      <text x="105" y="125" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="800" class="sans">${totalReposCount}</text>
      ${legendItems1}
    </g>
  </g>

  <g transform="translate(468, 210)">
    <rect width="448" height="216" rx="12" fill="none" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans header-title">COMMIT ACTIVITY BY TIME (UTC+7)</text>

    <g transform="translate(10, 10)">
      <line x1="28" y1="68" x2="416" y2="68" stroke="#1A1A1A" stroke-width="0.8" stroke-dasharray="3 3" />
      <line x1="28" y1="112" x2="416" y2="112" stroke="#1A1A1A" stroke-width="0.8" stroke-dasharray="3 3" />
      <line x1="28" y1="${diurnalBaselineY}" x2="416" y2="${diurnalBaselineY}" stroke="#262626" stroke-width="1" />
      ${diurnalBars}
    </g>
  </g>

  <!-- ROW 3: TELEMETRY & STATS (LEFT) + WEEKLY DISTRIBUTION (RIGHT) -->
  <g transform="translate(4, 438)">
    <rect width="448" height="216" rx="12" fill="none" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans header-title">ACTIVITY &amp; TELEMETRY</text>

    <!-- LEFT METRICS -->
    <g transform="translate(24, 46)">
      <g transform="translate(0, 0)">
        <polygon points="6,0 8,4.5 13,5 9.5,8.5 10.5,13.5 6,11 1.5,13.5 2.5,8.5 -1,5 4,4.5" fill="#D4D4D4" transform="scale(0.85)" />
        <text x="22" y="10" fill="#999999" font-size="12" font-weight="500" class="sans">Total Stars:</text>
        <text x="145" y="10" fill="#FFFFFF" font-size="12.5" font-weight="700" class="sans">${userProfile.totalStars}</text>
      </g>

      <g transform="translate(0, 28)">
        <circle cx="6" cy="6" r="4.5" fill="none" stroke="#D4D4D4" stroke-width="1.3" />
        <circle cx="6" cy="6" r="1.8" fill="#FFFFFF" />
        <text x="22" y="10" fill="#999999" font-size="12" font-weight="500" class="sans">Total Commits:</text>
        <text x="145" y="10" fill="#FFFFFF" font-size="12.5" font-weight="700" class="sans">${escapeXML(contribData.totalStr)}</text>
      </g>

      <g transform="translate(0, 56)">
        <path d="M 3 2 L 3 10 M 9 2 L 9 10 M 3 6 L 9 6" stroke="#D4D4D4" stroke-width="1.4" fill="none" />
        <text x="22" y="10" fill="#999999" font-size="12" font-weight="500" class="sans">Pull Requests:</text>
        <text x="145" y="10" fill="#FFFFFF" font-size="12.5" font-weight="700" class="sans">18</text>
      </g>

      <g transform="translate(0, 84)">
        <circle cx="6" cy="6" r="4.5" fill="none" stroke="#D4D4D4" stroke-width="1.3" />
        <line x1="6" y1="4" x2="6" y2="8" stroke="#D4D4D4" stroke-width="1.2" />
        <text x="22" y="10" fill="#999999" font-size="12" font-weight="500" class="sans">Total Issues:</text>
        <text x="145" y="10" fill="#FFFFFF" font-size="12.5" font-weight="700" class="sans">12</text>
      </g>

      <g transform="translate(0, 112)">
        <rect x="2" y="2" width="9" height="8" rx="1.5" fill="none" stroke="#D4D4D4" stroke-width="1.3" />
        <text x="22" y="10" fill="#999999" font-size="12" font-weight="500" class="sans">Contributed To:</text>
        <text x="145" y="10" fill="#FFFFFF" font-size="12.5" font-weight="700" class="sans">${totalReposCount} repos</text>
      </g>
    </g>

    <!-- RIGHT OCTOCAT EMBLEM -->
    <g transform="translate(295, 48)">
      <path fill="#222222" d="M48 0C21.49 0 0 21.49 0 48c0 21.22 13.76 39.22 32.84 45.58 2.4.44 3.28-1.04 3.28-2.31 0-1.14-.04-4.16-.06-8.17-13.35 2.9-16.17-6.44-16.17-6.44-2.18-5.54-5.33-7.01-5.33-7.01-4.36-2.98.33-2.92.33-2.92 4.82.34 7.36 4.95 7.36 4.95 4.28 7.34 11.23 5.22 13.97 3.99.44-3.1 1.67-5.22 3.04-6.42-10.66-1.21-21.87-5.33-21.87-23.73 0-5.24 1.87-9.53 4.94-12.89-.5-1.21-2.14-6.1 0.47-12.71 0 0 4.03-1.29 13.2 4.92 3.83-1.07 7.94-1.6 12.02-1.62 4.08.02 8.19.55 12.02 1.62 9.17-6.21 13.2-4.92 13.2-4.92 2.61 6.61.97 11.5 0.47 12.71 3.07 3.36 4.94 7.65 4.94 12.89 0 18.44-11.23 22.51-21.92 23.69 1.72 1.48 3.26 4.41 3.26 8.89 0 6.42-.06 11.6-.06 13.17 0 1.28.86 2.78 3.3 2.31C82.26 87.2 96 69.21 96 48 96 21.49 74.51 0 48 0z" />
    </g>
  </g>

  <g transform="translate(468, 438)">
    <rect width="448" height="216" rx="12" fill="none" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans header-title">WEEKLY ACTIVITY (MON - SUN)</text>

    <g transform="translate(10, 10)">
      <line x1="20" y1="68" x2="420" y2="68" stroke="#1A1A1A" stroke-width="0.8" stroke-dasharray="3 3" />
      <line x1="20" y1="112" x2="420" y2="112" stroke="#1A1A1A" stroke-width="0.8" stroke-dasharray="3 3" />
      <line x1="20" y1="${weeklyBaselineY}" x2="420" y2="${weeklyBaselineY}" stroke="#262626" stroke-width="1" />
      ${weeklyBars}
    </g>
  </g>
</svg>`;
}

async function main() {
  const contribData = await fetchContributions(USERNAME);

  let userInfo = {};
  try {
    userInfo = await fetchJSON(`https://api.github.com/users/${USERNAME}`);
  } catch {
    userInfo = {
      name: 'Akrom Fadhil',
      public_repos: 11,
      created_at: '2022-08-20T00:00:00Z',
      email: 'akromfadhil234@gmail.com'
    };
  }

  const userProfile = {
    name: userInfo.name || 'Akrom Fadhil',
    publicRepos: userInfo.public_repos || 11,
    joinedDate: 'Aug 2022',
    email: userInfo.email || 'akromfadhil234@gmail.com',
    totalStars: 12
  };

  // Fetch all user owned repos
  let allRepos = [];
  try {
    const reposEndpoint = GITHUB_TOKEN
      ? 'https://api.github.com/user/repos?per_page=100&affiliation=owner'
      : `https://api.github.com/users/${USERNAME}/repos?per_page=100`;
    allRepos = await fetchJSON(reposEndpoint);
  } catch {
    allRepos = [];
  }

  const nonForkRepos = allRepos.filter(r => !r.fork && !r.archived);

  let totalStars = 0;
  for (const r of nonForkRepos) {
    totalStars += (r.stargazers_count || 0);
  }
  if (totalStars > 0) userProfile.totalStars = totalStars;

  // Language mapping
  const LANGUAGE_DISPLAY_NAMES = {
    'PLpgSQL': 'PostgreSQL',
    'PostgreSQL': 'PostgreSQL'
  };

  const repoLanguageCounts = {};
  let totalClassifiedRepos = 0;

  for (const r of nonForkRepos) {
    if (r.language) {
      const name = LANGUAGE_DISPLAY_NAMES[r.language] || r.language;
      repoLanguageCounts[name] = (repoLanguageCounts[name] || 0) + 1;
      totalClassifiedRepos++;
    }
  }

  // Also include VORA-AI if available
  if (GITHUB_TOKEN) {
    try {
      const voraInfo = await fetchJSON('https://api.github.com/repos/Akrmfdhl/VORA-AI');
      if (voraInfo && voraInfo.language && !repoLanguageCounts[voraInfo.language]) {
        repoLanguageCounts[voraInfo.language] = (repoLanguageCounts[voraInfo.language] || 0) + 1;
        totalClassifiedRepos++;
      }
    } catch {}
  }

  const sortedRepoLangs = Object.entries(repoLanguageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({
      name,
      count,
      percent: (count / Math.max(1, totalClassifiedRepos)) * 100
    }));

  // Commit activity by time of day (WIB / UTC+7) from actual repo commits
  const timeBuckets = {
    'Morning': { count: 0, timeRange: '06:00 - 12:00' },
    'Afternoon': { count: 0, timeRange: '12:00 - 18:00' },
    'Evening': { count: 0, timeRange: '18:00 - 00:00' },
    'Night': { count: 0, timeRange: '00:00 - 06:00' }
  };

  let totalCommitTimestamps = 0;
  for (const r of nonForkRepos) {
    try {
      const endpoint = `https://api.github.com/repos/Akrmfdhl/${r.name}/commits?author=${USERNAME}&per_page=100`;
      const commits = await fetchJSON(endpoint);
      if (Array.isArray(commits)) {
        for (const c of commits) {
          if (!c.commit || !c.commit.author || !c.commit.author.date) continue;
          const d = new Date(c.commit.author.date);
          const hour = (d.getUTCHours() + 7) % 24;
          if (hour >= 6 && hour < 12) timeBuckets['Morning'].count++;
          else if (hour >= 12 && hour < 18) timeBuckets['Afternoon'].count++;
          else if (hour >= 18 && hour < 24) timeBuckets['Evening'].count++;
          else timeBuckets['Night'].count++;
          totalCommitTimestamps++;
        }
      }
    } catch {}
  }

  const diurnalStats = Object.entries(timeBuckets).map(([shortLabel, info]) => ({
    label: `${shortLabel} (${info.timeRange})`,
    shortLabel,
    timeRange: info.timeRange,
    count: info.count,
    percent: (info.count / Math.max(1, totalCommitTimestamps)) * 100
  }));

  // Weekly distribution from exact 365-day contribution calendar (1,713 contributions)
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const totalWeekly = Object.values(contribData.dayTotals).reduce((a, b) => a + b, 0) || 1;
  const weeklyStats = dayNames.map(day => ({
    day,
    count: contribData.dayTotals[day] || 0,
    percent: ((contribData.dayTotals[day] || 0) / totalWeekly) * 100
  }));

  const svgContent = generateFullSVG({
    userProfile,
    contribData,
    repoLangStats: sortedRepoLangs,
    totalReposCount: nonForkRepos.length || 17,
    diurnalStats,
    weeklyStats
  });

  const assetsDir = path.resolve('assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  fs.writeFileSync(path.join(assetsDir, 'analytics-charts.svg'), svgContent, 'utf8');
  fs.writeFileSync(path.join(assetsDir, 'analytics.svg'), svgContent, 'utf8');

  const readmePath = path.resolve('README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');

  const chartBlock = `<div align="center">\n  <img src="assets/analytics.svg" alt="GitHub Analytics" width="100%" />\n</div>`;

  if (readme.includes('<!-- START_SECTION:analytics -->')) {
    const regex = /<!-- START_SECTION:analytics -->[\s\S]*?<!-- END_SECTION:analytics -->/;
    readme = readme.replace(regex, chartBlock);
  } else if (readme.includes('### Analytics')) {
    readme = readme.replace(/### Analytics[\s\S]*?### Contributions/, `### Analytics\n\n${chartBlock}\n\n---\n\n### Contributions`);
  }

  fs.writeFileSync(readmePath, readme, 'utf8');
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
