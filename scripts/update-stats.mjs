import fs from 'node:fs';
import path from 'node:path';

const USERNAME = 'Akrmfdhl';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const headers = {
  'User-Agent': 'Profile-Stats-Bot',
  'Accept': 'application/vnd.github.v3+json',
  ...(GITHUB_TOKEN ? { Authorization: `token ${GITHUB_TOKEN}` } : {})
};

function renderProgressBar(percentage, totalBars = 24) {
  const filled = Math.round((percentage / 100) * totalBars);
  const empty = Math.max(0, totalBars - filled);
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

async function fetchJSON(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function main() {
  const user = await fetchJSON(`https://api.github.com/users/${USERNAME}`);
  const repos = await fetchJSON(`https://api.github.com/users/${USERNAME}/repos?per_page=100`);

  const ownedRepos = repos.filter(r => !r.fork && !r.archived);

  const langTotals = {};
  let totalBytes = 0;

  for (const repo of ownedRepos) {
    try {
      const langs = await fetchJSON(repo.languages_url);
      for (const [lang, bytes] of Object.entries(langs)) {
        langTotals[lang] = (langTotals[lang] || 0) + bytes;
        totalBytes += bytes;
      }
    } catch {
      // Continue on rate limit or empty repo
    }
  }

  const sortedLangs = Object.entries(langTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  let langText = '';
  for (const [lang, bytes] of sortedLangs) {
    const pct = totalBytes > 0 ? (bytes / totalBytes) * 100 : 0;
    const bar = renderProgressBar(pct, 20);
    const langPad = lang.padEnd(14, ' ');
    const pctPad = pct.toFixed(1).padStart(5, ' ');
    const sizePad = formatBytes(bytes).padStart(9, ' ');
    langText += `${langPad} ${bar} ${pctPad}% (${sizePad})\n`;
  }

  let events = [];
  try {
    events = await fetchJSON(`https://api.github.com/users/${USERNAME}/events?per_page=100`);
  } catch {
    events = [];
  }

  const timeBuckets = {
    'Morning   (06:00 - 12:00)': 0,
    'Afternoon (12:00 - 18:00)': 0,
    'Evening   (18:00 - 00:00)': 0,
    'Night     (00:00 - 06:00)': 0,
  };

  let totalEvents = 0;
  for (const ev of events) {
    if (ev.created_at) {
      const date = new Date(ev.created_at);
      const hour = (date.getUTCHours() + 7) % 24;
      if (hour >= 6 && hour < 12) timeBuckets['Morning   (06:00 - 12:00)']++;
      else if (hour >= 12 && hour < 18) timeBuckets['Afternoon (12:00 - 18:00)']++;
      else if (hour >= 18 && hour < 24) timeBuckets['Evening   (18:00 - 00:00)']++;
      else timeBuckets['Night     (00:00 - 06:00)']++;
      totalEvents++;
    }
  }

  let activityText = '';
  for (const [bucket, count] of Object.entries(timeBuckets)) {
    const pct = totalEvents > 0 ? (count / totalEvents) * 100 : 0;
    const bar = renderProgressBar(pct, 20);
    const pctPad = pct.toFixed(1).padStart(5, ' ');
    activityText += `${bucket}  ${bar} ${pctPad}%\n`;
  }

  const totalStars = ownedRepos.reduce((acc, r) => acc + (r.stargazers_count || 0), 0);
  const totalForks = ownedRepos.reduce((acc, r) => acc + (r.forks_count || 0), 0);

  const analyticsMarkdown = `<!-- START_SECTION:analytics -->
\`\`\`text
[ REAL-TIME REPOSITORY CODE BREAKDOWN ]
${langText.trimEnd()}

[ PRODUCTIVE TIME DISTRIBUTION (UTC+7) ]
${activityText.trimEnd()}

[ REPOSITORY OVERVIEW ]
Public Repositories : ${user.public_repos ?? ownedRepos.length}
Stargazers Earned   : ${totalStars}
Forks Received      : ${totalForks}
Followers           : ${user.followers ?? 0}
Account Age         : Since ${new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
\`\`\`
<!-- END_SECTION:analytics -->`;

  const readmePath = path.resolve('README.md');
  const readmeContent = fs.readFileSync(readmePath, 'utf8');

  const startMarker = '<!-- START_SECTION:analytics -->';
  const endMarker = '<!-- END_SECTION:analytics -->';

  let updatedContent;
  if (readmeContent.includes(startMarker) && readmeContent.includes(endMarker)) {
    const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);
    updatedContent = readmeContent.replace(regex, analyticsMarkdown);
  } else {
    const analyticsHeader = '### Analytics';
    if (readmeContent.includes(analyticsHeader)) {
      const parts = readmeContent.split(analyticsHeader);
      const afterPart = parts[1].replace(/<div align="center">[\s\S]*?<\/div>(\s*<br\/>\s*<div align="center">[\s\S]*?<\/div>)?/, `\n\n${analyticsMarkdown}\n`);
      updatedContent = parts[0] + analyticsHeader + afterPart;
    } else {
      updatedContent = readmeContent + `\n\n### Analytics\n\n${analyticsMarkdown}\n`;
    }
  }

  fs.writeFileSync(readmePath, updatedContent, 'utf8');
}

main().catch(err => {
  process.exit(1);
});
