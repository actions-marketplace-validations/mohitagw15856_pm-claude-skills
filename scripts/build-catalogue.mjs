#!/usr/bin/env node
// The catalogue, generated so it cannot drift: every bundle and skill with its
// description, category and install commands, from the repo itself.
//
//   node scripts/build-catalogue.mjs           # write docs/catalogue.md + docs/catalogue.json
//                                              # and regenerate the README "What you can do" rows
//   node scripts/build-catalogue.mjs --check   # exit 1 if any of the three is stale
//
// The README table's prose (the job, what you get, what you bring) is curated
// in CURATED below, not invented from data; this script verifies every curated
// bundle still exists and owns the rows between the WHAT-YOU-CAN-DO markers.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const read = (p) => readFileSync(join(root, p), 'utf8');

// Curated rows for the README table; each bundle must exist in the marketplace.
const CURATED = [
  { job: 'Turn research into decisions', bundle: 'pm-discovery', get: 'Interview guides, job stories, synthesis with quotes and prevalence', bring: 'Transcripts or raw notes' },
  { job: 'Write the PRD and the updates', bundle: 'pm-essentials', get: 'PRD, meeting notes, stakeholder updates, competitive analysis', bring: 'A feature brief; your goals' },
  { job: 'Plan the quarter', bundle: 'pm-planning', get: 'OKRs, RICE/MoSCoW/Kano prioritisation, roadmap narrative', bring: 'A backlog and a company goal' },
  { job: 'Ship the sprint and the launch', bundle: 'pm-delivery', get: 'Sprint plans, tech specs, A/B test plans, launch checklists', bring: 'Stories, capacity, dates' },
  { job: 'Read the numbers', bundle: 'pm-data', get: 'Metrics frameworks, cohort and churn analysis, dashboard briefs', bring: 'Your metrics or a CSV' },
  { job: 'Watch the market', bundle: 'pm-strategy', get: 'Competitor teardowns, signal tracking, stakeholder influence maps', bring: 'Competitor names and sources' },
  { job: 'Launch and sell it', bundle: 'pm-gtm', get: 'GTM plans, content calendars, email campaigns', bring: 'A product and an audience' },
  { job: 'Keep the customers', bundle: 'pm-cs', get: 'Health scorecards, QBR decks, churn analysis, renewal playbooks', bring: 'Account data, close notes' },
  { job: 'Make the hard call', bundle: 'pm-decisions', get: 'Typed ship-or-slip, renew-or-churn, hire-or-pass calls with probabilities', bring: "The decision's real state" },
  { job: 'Escape the average answer', bundle: 'pm-thinking', get: 'Red-teaming, five clashing minds, decision panels', bring: 'A plan or question worth attacking' },
  { job: 'Read before you sign', bundle: 'pm-decoders', get: 'Leases, bills, benefits and contracts decoded with the money maths', bring: 'The document itself' },
  { job: 'Land the next job', bundle: 'pm-jobsearch', get: 'JD decoding, outreach, interview prep, follow-up sequences', bring: 'The JD and your CV' },
  { job: '用中文工作', bundle: 'pm-china-work', get: '周报、述职、复盘，中国职场的写法', bring: '你的工作记录' },
];

const descOf = (name) => {
  const fm = (read(`skills/${name}/SKILL.md`).match(/^---\r?\n([\s\S]*?)\r?\n---/) || [, ''])[1];
  if (/^deprecated:/m.test(fm)) return null;
  const m = fm.match(/^description:\s*(["']?)([\s\S]*?)\1\s*(?=\n[a-z_-]+:|$)/m);
  const d = (m ? m[2] : '').replace(/\s+/g, ' ').trim();
  return d.split(/(?<=\.)\s/)[0];   // first sentence
};

const duetReady = (() => { try { return JSON.parse(read('data/duet-ready.json')).skills || {}; } catch { return {}; } })();
const marketplace = JSON.parse(read('.claude-plugin/marketplace.json')).plugins;
const bundles = marketplace.map((p) => {
  const dir = join(root, 'plugins', p.name, 'skills');
  const skills = existsSync(dir)
    ? readdirSync(dir).filter((n) => existsSync(join(dir, n, 'SKILL.md'))).sort()
        .map((n) => ({ name: n, description: existsSync(join(root, 'skills', n, 'SKILL.md')) ? descOf(n) : null, ...(duetReady[n] ? { duet_ready: duetReady[n].tier } : {}) }))
        .filter((s) => s.description !== null)
    : [];
  return {
    bundle: p.name, description: p.description || '', category: p.category || '',
    install: { claude_code: `/plugin install ${p.name}@pm-claude-skills`, any_tool: `npx pm-claude-skills add --bundle ${p.name}` },
    skills,
  };
}).sort((a, b) => a.bundle.localeCompare(b.bundle));

for (const row of CURATED) {
  if (!bundles.some((b) => b.bundle === row.bundle)) {
    console.error(`✗ README table names bundle "${row.bundle}" which is not in the marketplace. Fix CURATED in scripts/build-catalogue.mjs.`);
    process.exit(1);
  }
}

const totalSkills = new Set(bundles.flatMap((b) => b.skills.map((s) => s.name))).size;
const json = JSON.stringify({ generated_by: 'scripts/build-catalogue.mjs', bundles: bundles.length, skills: totalSkills, items: bundles }, null, 2) + '\n';

let md = `# Catalogue

<sub>Generated by \`scripts/build-catalogue.mjs\`; edit the script or the skills, not this file. ${bundles.length} bundles, ${totalSkills} live skills. Machine-readable: [catalogue.json](catalogue.json). Searchable: the [playground](https://mohitagw15856.github.io/pm-claude-skills/).</sub>

⚡ marks [Duet-ready](duet/README.md) skills (tiers in [data/duet-ready.json](../data/duet-ready.json)). Install any bundle in Claude Code with \`/plugin install <bundle>@pm-claude-skills\`, or in any supported tool with \`npx pm-claude-skills add --bundle <bundle>\`.

`;
for (const b of bundles) {
  md += `## ${b.bundle}\n\n${b.description}\n\n\`${b.install.any_tool}\`\n\n`;
  if (b.skills.length) {
    md += `| Skill | What it does |\n|---|---|\n`;
    for (const s of b.skills) md += `| [${s.name}](../skills/${s.name}/SKILL.md)${s.duet_ready ? ' ⚡' : ''} | ${s.description.replace(/\|/g, '\\|')} |\n`;
    md += '\n';
  }
}

const rows = CURATED.map((r) => `| ${r.job} | [${r.bundle}](plugins/${r.bundle}/) | ${r.get} | ${r.bring} |`).join('\n');
const block = `<!-- WHAT-YOU-CAN-DO:START -->\n| Your job this week | Bundle | What you get | What you bring |\n|---|---|---|---|\n${rows}\n<!-- WHAT-YOU-CAN-DO:END -->`;
const readme = read('README.md');
if (!readme.includes('<!-- WHAT-YOU-CAN-DO:START -->')) { console.error('✗ README.md is missing the WHAT-YOU-CAN-DO markers.'); process.exit(1); }
const newReadme = readme.replace(/<!-- WHAT-YOU-CAN-DO:START -->[\s\S]*?<!-- WHAT-YOU-CAN-DO:END -->/, block);

const stale = [];
const same = (p, want) => { try { return read(p) === want; } catch { return false; } };
if (!same('docs/catalogue.md', md)) stale.push('docs/catalogue.md');
if (!same('docs/catalogue.json', json)) stale.push('docs/catalogue.json');
if (newReadme !== readme) stale.push('README.md (WHAT-YOU-CAN-DO rows)');

if (CHECK) {
  if (stale.length) { console.error(`✗ Catalogue out of date: ${stale.join(', ')}. Run: node scripts/build-catalogue.mjs`); process.exit(1); }
  console.log(`Catalogue current: ${bundles.length} bundles, ${totalSkills} skills. ✓`);
} else {
  writeFileSync(join(root, 'docs', 'catalogue.md'), md);
  writeFileSync(join(root, 'docs', 'catalogue.json'), json);
  if (newReadme !== readme) writeFileSync(join(root, 'README.md'), newReadme);
  console.log(`Wrote docs/catalogue.md + docs/catalogue.json (${bundles.length} bundles, ${totalSkills} skills)${newReadme !== readme ? ' and refreshed the README rows' : ''}.`);
}
