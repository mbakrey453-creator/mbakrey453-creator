import { chromium } from 'playwright';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const USERNAME = process.env.THM_USERNAME || 'mbakrey452';
const README = 'README.md';
const START = '<!-- THM:START -->';
const END = '<!-- THM:END -->';

function note(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
}

async function readPublicProfile() {
  const browser = await chromium.launch({
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'Africa/Cairo',
      viewport: { width: 1366, height: 900 },
      extraHTTPHeaders: { 'accept-language': 'en-US,en;q=0.9' },
    });
    const page = await context.newPage();

    let intercepted = null;
    page.on('response', async (response) => {
      if (intercepted || !response.url().includes('/api/v2/public-profile')) return;
      try {
        intercepted = await response.json();
        note(`captured profile API response: HTTP ${response.status()}`);
      } catch (error) {
        note(`profile API response was not JSON: ${error.message}`);
      }
    });

    const navigation = await page.goto(`https://tryhackme.com/p/${USERNAME}`, {
      waitUntil: 'domcontentloaded',
      timeout: 90000,
    });
    note(
      `profile page: HTTP ${navigation ? navigation.status() : 'no response'}, title "${await page.title()}"`,
    );

    const deadline = Date.now() + 60000;
    while (!intercepted && Date.now() < deadline) {
      await page.waitForTimeout(5000);

      const probe = await page
        .evaluate(async (username) => {
          const response = await fetch(`/api/v2/public-profile?username=${encodeURIComponent(username)}`, {
            credentials: 'include',
            headers: { accept: 'application/json' },
          });
          return { status: response.status, body: await response.text() };
        }, USERNAME)
        .catch((error) => ({ status: 'error', body: error.message }));

      if (probe.status === 200) {
        try {
          intercepted = JSON.parse(probe.body);
          note('direct API request succeeded');
        } catch {
          note('direct API answered 200 but the body was not JSON');
        }
      } else {
        note(`direct API attempt: ${probe.status}`);
      }
    }

    return intercepted;
  } finally {
    await browser.close();
  }
}

const payload = await readPublicProfile();

if (!payload || payload.status !== 'success') {
  note('TryHackMe returned no data, leaving README untouched.');
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
note(`Synced ${d.username}: ${d.totalPoints} points, ${d.completedRoomsNumber} rooms, rank ${d.rank}`);
