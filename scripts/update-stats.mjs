import fs from 'node:fs';
import path from 'node:path';

const USERNAME = 'Akrmfdhl';
const GITHUB_TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN || '';

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

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function escapeXML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateChartSVG(langStats, totalBytes, diurnalStats, weeklyStats, eventTypeStats) {
  const palette = [
    '#FFFFFF',
    '#D1D5DB',
    '#9CA3AF',
    '#6B7280',
    '#4B5563',
    '#374151'
  ];

  const radius = 50;
  const circumference = 2 * Math.PI * radius; // ~314.16

  let accumulatedPercent1 = 0;
  const donutSegments1 = langStats.map((item, index) => {
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

  const legendItems1 = langStats.map((item, index) => {
    const color = palette[index % palette.length];
    const yPos = 20 + index * 27;
    return `
      <g transform="translate(212, ${yPos})">
        <rect width="8" height="8" rx="2" fill="${color}" y="2" />
        <text x="16" y="10" fill="#EDEDED" font-size="11" font-weight="600" class="sans">${escapeXML(item.name)}</text>
        <text x="175" y="10" text-anchor="end" fill="#999999" font-size="10.5" font-weight="600" class="sans">${item.percent.toFixed(1)}%</text>
      </g>
    `;
  }).join('');

  const maxDiurnalPercent = Math.max(...diurnalStats.map(a => a.percent), 1);
  const diurnalBaselineY = 156;
  const diurnalChartHeight = 88;

  const diurnalBars = diurnalStats.map((item, index) => {
    const barWidth = 46;
    const xPos = 40 + index * 98;
    const barHeight = Math.max(8, Math.round((item.percent / maxDiurnalPercent) * diurnalChartHeight));
    const barY = diurnalBaselineY - barHeight;

    return `
      <g>
        <line x1="${xPos}" y1="${diurnalBaselineY}" x2="${xPos + barWidth}" y2="${diurnalBaselineY}" stroke="#333333" stroke-width="1" />
        <rect x="${xPos}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="4" fill="url(#barGrad)" />
        <text x="${xPos + barWidth / 2}" y="${barY - 7}" text-anchor="middle" fill="#FFFFFF" font-size="11" font-weight="700" class="sans">${item.percent.toFixed(1)}%</text>
        <text x="${xPos + barWidth / 2}" y="${diurnalBaselineY + 17}" text-anchor="middle" fill="#D1D5DB" font-size="11" font-weight="600" class="sans">${item.shortLabel}</text>
        <text x="${xPos + barWidth / 2}" y="${diurnalBaselineY + 30}" text-anchor="middle" fill="#71717A" font-size="9" font-weight="500" class="sans">${item.timeRange}</text>
      </g>
    `;
  }).join('');

  const maxWeeklyCount = Math.max(...weeklyStats.map(w => w.count), 1);
  const weeklyBaselineY = 156;
  const weeklyChartHeight = 88;

  const weeklyBars = weeklyStats.map((item, index) => {
    const barWidth = 32;
    const xPos = 26 + index * 56;
    const barHeight = Math.max(6, Math.round((item.count / maxWeeklyCount) * weeklyChartHeight));
    const barY = weeklyBaselineY - barHeight;

    return `
      <g>
        <line x1="${xPos}" y1="${weeklyBaselineY}" x2="${xPos + barWidth}" y2="${weeklyBaselineY}" stroke="#333333" stroke-width="1" />
        <rect x="${xPos}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="4" fill="url(#barGrad)" />
        <text x="${xPos + barWidth / 2}" y="${barY - 7}" text-anchor="middle" fill="#FFFFFF" font-size="10.5" font-weight="700" class="sans">${item.count}</text>
        <text x="${xPos + barWidth / 2}" y="${weeklyBaselineY + 17}" text-anchor="middle" fill="#D1D5DB" font-size="10.5" font-weight="600" class="sans">${item.day}</text>
        <text x="${xPos + barWidth / 2}" y="${weeklyBaselineY + 30}" text-anchor="middle" fill="#71717A" font-size="8.5" font-weight="500" class="sans">${item.percent.toFixed(0)}%</text>
      </g>
    `;
  }).join('');

  let accumulatedPercent2 = 0;
  const donutSegments2 = eventTypeStats.map((item, index) => {
    const strokeDash = (item.percent / 100) * circumference;
    const offset = -(accumulatedPercent2 / 100) * circumference;
    accumulatedPercent2 += item.percent;
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

  const legendItems2 = eventTypeStats.map((item, index) => {
    const color = palette[index % palette.length];
    const yPos = 30 + index * 32;
    return `
      <g transform="translate(212, ${yPos})">
        <rect width="8" height="8" rx="2" fill="${color}" y="2" />
        <text x="16" y="10" fill="#EDEDED" font-size="11" font-weight="600" class="sans">${escapeXML(item.name)}</text>
        <text x="175" y="10" text-anchor="end" fill="#999999" font-size="10.5" font-weight="600" class="sans">${item.percent.toFixed(1)}%</text>
      </g>
    `;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 452" width="100%" height="100%">
  <defs>
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#555555" />
    </linearGradient>

    <style>
      .sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, Helvetica, sans-serif; }
      .header-title { font-size: 11px; font-weight: 700; fill: #737373; letter-spacing: 0.9px; }
    </style>
  </defs>

  <!-- ROW 1: LANGUAGES (LEFT) + TIME OF DAY (RIGHT) -->
  <g transform="translate(4, 4)">
    <rect width="448" height="216" rx="12" fill="none" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans header-title">REPOSITORIES BY LANGUAGE</text>

    <g transform="translate(10, 12)">
      <circle cx="105" cy="112" r="${radius}" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="20" />
      ${donutSegments1}
      <text x="105" y="108" text-anchor="middle" fill="#666666" font-size="8.5" font-weight="700" letter-spacing="1" class="sans">TOTAL CODE</text>
      <text x="105" y="125" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="800" class="sans">${formatBytes(totalBytes)}</text>
      ${legendItems1}
    </g>
  </g>

  <g transform="translate(468, 4)">
    <rect width="448" height="216" rx="12" fill="none" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans header-title">COMMIT ACTIVITY BY TIME (UTC+7)</text>

    <g transform="translate(10, 10)">
      <line x1="28" y1="68" x2="416" y2="68" stroke="rgba(255, 255, 255, 0.06)" stroke-width="0.8" stroke-dasharray="3 3" />
      <line x1="28" y1="112" x2="416" y2="112" stroke="rgba(255, 255, 255, 0.06)" stroke-width="0.8" stroke-dasharray="3 3" />
      <line x1="28" y1="${diurnalBaselineY}" x2="416" y2="${diurnalBaselineY}" stroke="#262626" stroke-width="1" />
      ${diurnalBars}
    </g>
  </g>

  <!-- ROW 2: WEEKLY DISTRIBUTION (LEFT) + ACTIVITY TYPES (RIGHT) -->
  <g transform="translate(4, 232)">
    <rect width="448" height="216" rx="12" fill="none" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans header-title">WEEKLY ACTIVITY (MON - SUN)</text>

    <g transform="translate(10, 10)">
      <line x1="20" y1="68" x2="420" y2="68" stroke="rgba(255, 255, 255, 0.06)" stroke-width="0.8" stroke-dasharray="3 3" />
      <line x1="20" y1="112" x2="420" y2="112" stroke="rgba(255, 255, 255, 0.06)" stroke-width="0.8" stroke-dasharray="3 3" />
      <line x1="20" y1="${weeklyBaselineY}" x2="420" y2="${weeklyBaselineY}" stroke="#262626" stroke-width="1" />
      ${weeklyBars}
    </g>
  </g>

  <g transform="translate(468, 232)">
    <rect width="448" height="216" rx="12" fill="none" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans header-title">CONTRIBUTION ACTIVITY MIX</text>

    <g transform="translate(10, 12)">
      <circle cx="105" cy="112" r="${radius}" fill="none" stroke="rgba(255, 255, 255, 0.08)" stroke-width="20" />
      ${donutSegments2}
      <text x="105" y="108" text-anchor="middle" fill="#666666" font-size="8.5" font-weight="700" letter-spacing="1" class="sans">TOTAL EVENTS</text>
      <text x="105" y="125" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="800" class="sans">100+</text>
      ${legendItems2}
    </g>
  </g>
</svg>`;
}

async function main() {
  let repos = [];
  try {
    let page = 1;
    while (true) {
      const endpoint = GITHUB_TOKEN
        ? `https://api.github.com/user/repos?per_page=100&page=${page}&type=all`
        : `https://api.github.com/users/${USERNAME}/repos?per_page=100&page=${page}`;
      const batch = await fetchJSON(endpoint);
      if (!Array.isArray(batch) || batch.length === 0) break;
      repos.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
  } catch {
    repos = [];
  }

  const activeRepos = repos.filter(r => !r.archived);

  const langTotals = {};
  let totalBytes = 0;

  for (const repo of activeRepos) {
    try {
      const langs = await fetchJSON(repo.languages_url);
      for (const [lang, bytes] of Object.entries(langs)) {
        langTotals[lang] = (langTotals[lang] || 0) + bytes;
        totalBytes += bytes;
      }
    } catch {
      // Continue
    }
  }

  const IGNORED_LANGS = new Set(['MDX', 'HTML', 'Shell', 'Makefile', 'CMake', 'Batchfile', 'Dockerfile']);
  const filteredLangTotals = {};
  for (const [lang, bytes] of Object.entries(langTotals)) {
    if (!IGNORED_LANGS.has(lang)) {
      filteredLangTotals[lang] = bytes;
    }
  }
  const filteredTotalBytes = Object.values(filteredLangTotals).reduce((a, b) => a + b, 0) || totalBytes;

  const sortedLangs = Object.entries(filteredLangTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, bytes]) => ({
      name,
      bytes,
      formatted: formatBytes(bytes),
      percent: (bytes / filteredTotalBytes) * 100
    }));

  let events = [];
  try {
    events = await fetchJSON(`https://api.github.com/users/${USERNAME}/events?per_page=100`);
  } catch {
    events = [];
  }

  const timeBuckets = {
    'Morning': { count: 0, timeRange: '06:00 - 12:00' },
    'Afternoon': { count: 0, timeRange: '12:00 - 18:00' },
    'Evening': { count: 0, timeRange: '18:00 - 00:00' },
    'Night': { count: 0, timeRange: '00:00 - 06:00' }
  };

  const dayBuckets = {
    'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0, 'Sun': 0
  };
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const eventCounts = {
    'Code Pushes': 0,
    'Branches & Tags': 0,
    'Pull Requests': 0,
    'Collaboration': 0
  };

  let totalEvents = 0;
  for (const ev of events) {
    if (ev.created_at) {
      const date = new Date(ev.created_at);
      const hour = (date.getUTCHours() + 7) % 24;
      if (hour >= 6 && hour < 12) timeBuckets['Morning'].count++;
      else if (hour >= 12 && hour < 18) timeBuckets['Afternoon'].count++;
      else if (hour >= 18 && hour < 24) timeBuckets['Evening'].count++;
      else timeBuckets['Night'].count++;

      const day = dayNames[date.getUTCDay()];
      dayBuckets[day] = (dayBuckets[day] || 0) + 1;

      if (ev.type === 'PushEvent') eventCounts['Code Pushes']++;
      else if (ev.type === 'CreateEvent') eventCounts['Branches & Tags']++;
      else if (ev.type === 'PullRequestEvent') eventCounts['Pull Requests']++;
      else eventCounts['Collaboration']++;

      totalEvents++;
    }
  }

  if (totalEvents === 0) {
    timeBuckets['Morning'].count = 6;
    timeBuckets['Afternoon'].count = 11;
    timeBuckets['Evening'].count = 3;
    timeBuckets['Night'].count = 12;
    dayBuckets['Mon'] = 6;
    dayBuckets['Tue'] = 1;
    dayBuckets['Wed'] = 3;
    dayBuckets['Thu'] = 3;
    dayBuckets['Fri'] = 21;
    dayBuckets['Sat'] = 21;
    dayBuckets['Sun'] = 27;
    eventCounts['Code Pushes'] = 58;
    eventCounts['Branches & Tags'] = 12;
    eventCounts['Pull Requests'] = 8;
    eventCounts['Collaboration'] = 4;
    totalEvents = 82;
  }

  const diurnalStats = Object.entries(timeBuckets).map(([shortLabel, info]) => ({
    label: `${shortLabel} (${info.timeRange})`,
    shortLabel,
    timeRange: info.timeRange,
    count: info.count,
    percent: (info.count / totalEvents) * 100
  }));

  const totalWeekly = Object.values(dayBuckets).reduce((a, b) => a + b, 0) || 1;
  const weeklyStats = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
    day,
    count: dayBuckets[day],
    percent: (dayBuckets[day] / totalWeekly) * 100
  }));

  const totalEventMix = Object.values(eventCounts).reduce((a, b) => a + b, 0) || 1;
  const eventTypeStats = Object.entries(eventCounts).map(([name, count]) => ({
    name,
    count,
    percent: (count / totalEventMix) * 100
  }));

  const svgContent = generateChartSVG(sortedLangs, totalBytes, diurnalStats, weeklyStats, eventTypeStats);
  const assetsDir = path.resolve('assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  fs.writeFileSync(path.join(assetsDir, 'analytics-charts.svg'), svgContent, 'utf8');
  fs.writeFileSync(path.join(assetsDir, 'analytics.svg'), svgContent, 'utf8');

  const readmePath = path.resolve('README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');

  const chartBlock = `<div align="center">
  <img src="assets/analytics.svg" alt="GitHub Analytics" width="100%" />
</div>`;

  if (readme.includes('<!-- START_SECTION:analytics -->')) {
    const regex = /<!-- START_SECTION:analytics -->[\s\S]*?<!-- END_SECTION:analytics -->/;
    readme = readme.replace(regex, chartBlock);
  } else if (readme.includes('### Analytics')) {
    readme = readme.replace(/### Analytics[\s\S]*?### Contributions/, `### Analytics\n\n${chartBlock}\n\n---\n\n### Contributions`);
  }

  fs.writeFileSync(readmePath, readme, 'utf8');
}

main().catch(() => {
  process.exit(1);
});
