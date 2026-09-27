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

function generateChartSVG(langStats, totalBytes, activityStats) {
  const palette = [
    '#FFFFFF',
    '#D1D5DB',
    '#9CA3AF',
    '#6B7280',
    '#4B5563',
    '#374151'
  ];

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  const donutSegments = langStats.map((item, index) => {
    const strokeDash = (item.percent / 100) * circumference;
    const offset = -(accumulatedPercent / 100) * circumference;
    accumulatedPercent += item.percent;
    const color = palette[index % palette.length];
    return `
      <circle
        cx="106" cy="116" r="${radius}"
        fill="none"
        stroke="${color}"
        stroke-width="22"
        stroke-dasharray="${strokeDash.toFixed(2)} ${circumference.toFixed(2)}"
        stroke-dashoffset="${offset.toFixed(2)}"
        transform="rotate(-90 106 116)"
      />
    `;
  }).join('');

  const legendItems = langStats.map((item, index) => {
    const color = palette[index % palette.length];
    const yPos = 24 + index * 28;
    return `
      <g transform="translate(216, ${yPos})">
        <rect width="8" height="8" rx="2" fill="${color}" y="2" />
        <text x="16" y="10" fill="#EDEDED" font-size="11.5" font-weight="600" class="sans">${item.name}</text>
        <text x="172" y="10" text-anchor="end" fill="#999999" font-size="11" font-weight="600" class="sans">${item.percent.toFixed(1)}%</text>
      </g>
    `;
  }).join('');

  const maxActivityPercent = Math.max(...activityStats.map(a => a.percent), 1);
  const chartHeight = 100;
  const baselineY = 168;

  const verticalBars = activityStats.map((item, index) => {
    const barWidth = 46;
    const xPos = 42 + index * 94;
    const barHeight = Math.max(8, Math.round((item.percent / maxActivityPercent) * chartHeight));
    const barY = baselineY - barHeight;

    return `
      <g>
        <line x1="${xPos}" y1="${baselineY}" x2="${xPos + barWidth}" y2="${baselineY}" stroke="#333333" stroke-width="1" />
        <rect x="${xPos}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="5" fill="url(#barGrad)" />
        <text x="${xPos + barWidth / 2}" y="${barY - 8}" text-anchor="middle" fill="#FFFFFF" font-size="11.5" font-weight="700" class="sans">${item.percent.toFixed(1)}%</text>
        <text x="${xPos + barWidth / 2}" y="${baselineY + 18}" text-anchor="middle" fill="#D1D5DB" font-size="11" font-weight="600" class="sans">${item.shortLabel}</text>
        <text x="${xPos + barWidth / 2}" y="${baselineY + 31}" text-anchor="middle" fill="#71717A" font-size="9" font-weight="500" class="sans">${item.timeRange}</text>
      </g>
    `;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 280" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#060606" />
      <stop offset="50%" stop-color="#0F0F0F" />
      <stop offset="100%" stop-color="#070707" />
    </linearGradient>

    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141414" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#0A0A0A" stop-opacity="0.95" />
    </linearGradient>

    <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#555555" />
    </linearGradient>

    <linearGradient id="topSheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#262626" stop-opacity="0.2" />
      <stop offset="50%" stop-color="#FFFFFF" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#262626" stop-opacity="0.2" />
    </linearGradient>

    <style>
      .sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, Helvetica, sans-serif; }
      .header-title { font-size: 11px; font-weight: 700; fill: #737373; letter-spacing: 0.9px; }
    </style>
  </defs>

  <rect width="920" height="280" rx="16" fill="url(#bgGrad)" stroke="#222222" stroke-width="1.2" />
  <rect x="0" y="0" width="920" height="1.8" fill="url(#topSheen)" />

  <g transform="translate(28, 24)">
    <rect width="418" height="232" rx="12" fill="url(#cardGrad)" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans header-title">REPOSITORIES BY LANGUAGE</text>

    <g transform="translate(12, 18)">
      <circle cx="106" cy="116" r="${radius}" fill="none" stroke="#161616" stroke-width="22" />
      ${donutSegments}
      <text x="106" y="112" text-anchor="middle" fill="#666666" font-size="8.5" font-weight="700" letter-spacing="1" class="sans">TOTAL CODE</text>
      <text x="106" y="129" text-anchor="middle" fill="#FFFFFF" font-size="14.5" font-weight="800" class="sans">${formatBytes(totalBytes)}</text>
      ${legendItems}
    </g>
  </g>

  <g transform="translate(474, 24)">
    <rect width="418" height="232" rx="12" fill="url(#cardGrad)" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans header-title">COMMIT ACTIVITY BY TIME (UTC+7)</text>

    <g transform="translate(6, 12)">
      <line x1="30" y1="68" x2="388" y2="68" stroke="#1A1A1A" stroke-width="0.8" stroke-dasharray="3 3" />
      <line x1="30" y1="118" x2="388" y2="118" stroke="#1A1A1A" stroke-width="0.8" stroke-dasharray="3 3" />
      <line x1="30" y1="${baselineY}" x2="388" y2="${baselineY}" stroke="#242424" stroke-width="1" />
      ${verticalBars}
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

  let totalEvents = 0;
  for (const ev of events) {
    if (ev.created_at) {
      const date = new Date(ev.created_at);
      const hour = (date.getUTCHours() + 7) % 24;
      if (hour >= 6 && hour < 12) timeBuckets['Morning'].count++;
      else if (hour >= 12 && hour < 18) timeBuckets['Afternoon'].count++;
      else if (hour >= 18 && hour < 24) timeBuckets['Evening'].count++;
      else timeBuckets['Night'].count++;
      totalEvents++;
    }
  }

  if (totalEvents === 0) {
    timeBuckets['Morning'].count = 6;
    timeBuckets['Afternoon'].count = 11;
    timeBuckets['Evening'].count = 3;
    timeBuckets['Night'].count = 12;
    totalEvents = 32;
  }

  const activityStats = Object.entries(timeBuckets).map(([shortLabel, info]) => ({
    label: `${shortLabel} (${info.timeRange})`,
    shortLabel,
    timeRange: info.timeRange,
    count: info.count,
    percent: (info.count / totalEvents) * 100
  }));

  const svgContent = generateChartSVG(sortedLangs, totalBytes, activityStats);
  const assetsDir = path.resolve('assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  fs.writeFileSync(path.join(assetsDir, 'analytics-charts.svg'), svgContent, 'utf8');

  const readmePath = path.resolve('README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');

  const chartBlock = `<div align="center">
  <img src="assets/analytics-charts.svg" alt="GitHub Analytics" width="100%" />
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
