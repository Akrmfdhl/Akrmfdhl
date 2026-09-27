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

  const radius = 54;
  const circumference = 2 * Math.PI * radius; // ~339.292
  let accumulatedPercent = 0;

  const donutSegments = langStats.map((item, index) => {
    const strokeDash = (item.percent / 100) * circumference;
    const offset = -(accumulatedPercent / 100) * circumference;
    accumulatedPercent += item.percent;
    const color = palette[index % palette.length];
    return `
      <circle
        cx="110" cy="110" r="${radius}"
        fill="none"
        stroke="${color}"
        stroke-width="20"
        stroke-dasharray="${strokeDash.toFixed(2)} ${circumference.toFixed(2)}"
        stroke-dashoffset="${offset.toFixed(2)}"
        transform="rotate(-90 110 110)"
      />
    `;
  }).join('');

  const legendItems = langStats.map((item, index) => {
    const color = palette[index % palette.length];
    const yPos = 20 + index * 25;
    return `
      <g transform="translate(230, ${yPos})">
        <rect width="9" height="9" rx="2.5" fill="${color}" />
        <text x="16" y="8.5" fill="#EDEDED" font-size="11" font-weight="600" class="sans">${item.name}</text>
        <text x="155" y="8.5" text-anchor="end" fill="#888888" font-size="10.5" font-weight="500" class="sans">${item.percent.toFixed(1)}%</text>
      </g>
    `;
  }).join('');

  const activityBars = activityStats.map((item, index) => {
    const yPos = 30 + index * 32;
    const barWidth = Math.max(4, Math.round((item.percent / 100) * 220));
    return `
      <g transform="translate(0, ${yPos})">
        <text x="0" y="11" fill="#CCCCCC" font-size="11.5" font-weight="500" class="sans">${item.label}</text>
        <rect x="140" y="2" width="220" height="12" rx="6" fill="#141414" stroke="#222222" stroke-width="0.8" />
        <rect x="140" y="2" width="${barWidth}" height="12" rx="6" fill="#EDEDED" />
        <text x="375" y="11" fill="#888888" font-size="11" font-weight="600" class="sans">${item.percent.toFixed(1)}%</text>
      </g>
    `;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 250" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#060606" />
      <stop offset="50%" stop-color="#101010" />
      <stop offset="100%" stop-color="#080808" />
    </linearGradient>

    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#121212" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#0A0A0A" stop-opacity="0.9" />
    </linearGradient>

    <linearGradient id="topSheen" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#262626" stop-opacity="0.2" />
      <stop offset="50%" stop-color="#FFFFFF" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#262626" stop-opacity="0.2" />
    </linearGradient>

    <style>
      .sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, Helvetica, sans-serif; }
      .title { font-size: 11px; font-weight: 700; fill: #666666; letter-spacing: 0.8px; }
    </style>
  </defs>

  <rect width="920" height="250" rx="16" fill="url(#bgGrad)" stroke="#222222" stroke-width="1.2" />
  <rect x="0" y="0" width="920" height="1.8" fill="url(#topSheen)" />

  <g transform="translate(36, 26)">
    <rect width="400" height="196" rx="12" fill="url(#cardGrad)" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans title">REPOSITORIES BY LANGUAGE</text>

    <g transform="translate(16, 32)">
      <circle cx="110" cy="110" r="${radius}" fill="none" stroke="#161616" stroke-width="22" />
      ${donutSegments}
      <text x="110" y="106" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="700" class="sans">${formatBytes(totalBytes)}</text>
      <text x="110" y="122" text-anchor="middle" fill="#666666" font-size="9.5" font-weight="600" class="sans">CODE TOTAL</text>
      ${legendItems}
    </g>
  </g>

  <g transform="translate(484, 26)">
    <rect width="400" height="196" rx="12" fill="url(#cardGrad)" stroke="#222222" stroke-width="0.8" />
    <text x="24" y="24" class="sans title">COMMIT ACTIVITY TIME (UTC+7)</text>

    <g transform="translate(24, 40)">
      ${activityBars}
    </g>
  </g>
</svg>`;
}

async function main() {
  let user = { public_repos: 8 };
  let repos = [];
  try {
    user = await fetchJSON(`https://api.github.com/users/${USERNAME}`);
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
      percent: (bytes / filteredTotalBytes) * 100
    }));

  let events = [];
  try {
    events = await fetchJSON(`https://api.github.com/users/${USERNAME}/events?per_page=100`);
  } catch {
    events = [];
  }

  const timeBuckets = {
    'Morning (06 - 12)': 0,
    'Afternoon (12 - 18)': 0,
    'Evening (18 - 00)': 0,
    'Night (00 - 06)': 0,
  };

  let totalEvents = 0;
  for (const ev of events) {
    if (ev.created_at) {
      const date = new Date(ev.created_at);
      const hour = (date.getUTCHours() + 7) % 24;
      if (hour >= 6 && hour < 12) timeBuckets['Morning (06 - 12)']++;
      else if (hour >= 12 && hour < 18) timeBuckets['Afternoon (12 - 18)']++;
      else if (hour >= 18 && hour < 24) timeBuckets['Evening (18 - 00)']++;
      else timeBuckets['Night (00 - 06)']++;
      totalEvents++;
    }
  }

  if (totalEvents === 0) {
    timeBuckets['Morning (06 - 12)'] = 4;
    timeBuckets['Afternoon (12 - 18)'] = 3;
    timeBuckets['Evening (18 - 00)'] = 2;
    timeBuckets['Night (00 - 06)'] = 0;
    totalEvents = 9;
  }

  const activityStats = Object.entries(timeBuckets).map(([label, count]) => ({
    label,
    count,
    percent: (count / totalEvents) * 100
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

main().catch(err => {
  process.exit(1);
});
