import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const USERNAME = process.env.THM_USERNAME || 'mbakrey452';
const README = 'README.md';
const START = '<!-- THM:START -->';
const END = '<!-- THM:END -->';

const browser = await chromium.launch({
  args: ['--disable-blink-features=AutomationControlled'],
});

let payload = null;
try {
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  await page.goto(`https://tryhackme.com/p/${USERNAME}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(6000);
  payload = await page.evaluate(async (username) => {
    const res = await fetch(`/api/v2/public-profile?username=${username}`, {
      headers: { accept: 'application/json' },
    });
    return res.ok ? res.json() : { error: res.status };
  }, USERNAME);
} finally {
  await browser.close();
}

if (!payload || payload.status !== 'success') {
  console.error('TryHackMe returned no data, leaving README untouched:', JSON.stringify(payload));
  process.exit(0);
}

const d = payload.data;
const synced = new Date().toISOString().replace('T', ' ').slice(0, 16);
const block = [
  START,
  `## TryHackMe — [${d.username}](https://tryhackme.com/p/${d.username})`,
  '',
  '| Points | Rooms completed | Global rank | Current streak | Longest streak | Badges |',
  '| ---: | ---: | ---: | ---: | ---: | ---: |',
  `| ${d.totalPoints} | ${d.completedRoomsNumber} | ${d.rank} | ${d.streak} | ${d.largestStreak} | ${d.badgesNumber} |`,
  '',
  `_Last synced: ${synced} UTC_`,
  END,
].join('\n');

let readme = readFileSync(README, 'utf8');
if (readme.includes(START) && readme.includes(END)) {
  readme = readme.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
} else {
  readme = `${readme.trimEnd()}\n\n${block}\n`;
}
writeFileSync(README, readme);
console.log(`Synced ${d.username}: ${d.totalPoints} points, ${d.completedRoomsNumber} rooms`);
