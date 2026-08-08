import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalUrl, dispositionFor, evidenceIsInCandidate, extractJson, hasSpokenRequirement, registerLead, renderReport } from './lib.js';
import { agnesDigest, exaSearch, openAiWebDigest } from './providers.js';
import { sendSmtpMail, smtpConfigFromEnv } from './email.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relative) => JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
const day = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(date);
const clock = (date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Tunis', hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace(':', '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function recentMemory(registry, now) { const cutoff = now.getTime() - 3 * 86400000; return registry.leads.filter((lead) => new Date(lead.firstSeen).getTime() >= cutoff).slice(-40).map((lead) => `- ${lead.title} | ${lead.buyer} | ${lead.canonicalUrl} | ${lead.status}`).join('\n') || '- None recorded.'; }
function promptFor({ policy, language, queries, candidates, memory, provider }) { const candidateBlock = candidates.length ? candidates.map((item, index) => `SOURCE ${index + 1}\nURL: ${item.url}\nTITLE: ${item.title}\nPUBLISHED: ${item.publishedDate || 'unknown'}\nCONTENT:\n${item.text.slice(0, 12000)}\nHIGHLIGHTS:\n${item.highlights.join('\n')}`).join('\n\n---\n\n') : 'No pre-fetched candidates.'; return `${policy}\n\nRUN SETTINGS\n- Discovery language: ${language}.\n- Provider: ${provider}.\n- Today: ${day(new Date())}.\n- Query set: ${queries.join(' || ')}.\n- Previously reviewed in the last 3 days (do not repeat unless materially updated):\n${memory}\n\n${provider === 'openai-web' ? 'Search the live web now. Open direct notices and use their exact text.' : 'Use only the fetched direct-source evidence below. Do not create a lead from a snippet or a URL not shown.'}\n\nCANDIDATE EVIDENCE\n${candidateBlock}\n\nReturn required JSON only. Do not include an expired lead. Do not include a lead whose quoted requirements are absent from its direct notice.`; }
function openAiUrlAllowed(lead, citedUrls) { try { return citedUrls.some((url) => canonicalUrl(url) === canonicalUrl(lead.sourceUrl)); } catch { return false; } }
function validateDigest(digest) { if (!digest || !Array.isArray(digest.shortlist)) throw new Error('Model did not return the required shortlist array.'); digest.manualVerification ||= []; digest.searchLog ||= { queries: [], sourcesChecked: [], notes: '' }; return digest; }
async function exaSearchWithRetry(query, apiKey, options, attempt = 1) {
  try {
    return await exaSearch(query, apiKey, options);
  } catch (error) {
    if (attempt < 4 && /\s429\b/.test(error.message || '')) { await sleep(500 * attempt); return exaSearchWithRetry(query, apiKey, options, attempt + 1); }
    throw error;
  }
}
async function runLanguage({ language, settings, policy, registry, now, provider }) {
  const queries = settings.queryTemplates[language], memory = recentMemory(registry, now); let candidates = [], response;
  if (provider === 'agnes-exa') {
    if (!process.env.EXA_API_KEY || !process.env.AGNES_API_KEY) throw new Error('AGNES_API_KEY and EXA_API_KEY are required for agnes-exa.');
    const startPublishedDate = new Date(now.getTime() - settings.resultLimits.recentPublishedDays * 86400000).toISOString();
    const batches = [];
    for (const query of queries) {
      batches.push(await exaSearchWithRetry(query, process.env.EXA_API_KEY, { startPublishedDate, excludeDomains: settings.excludedDomains }));
      await sleep(200);
    }
    const byUrl = new Map();
    for (const item of batches.flat()) try { if (!byUrl.has(canonicalUrl(item.url))) byUrl.set(canonicalUrl(item.url), item); } catch { /* discard invalid URL */ }
    candidates = [...byUrl.values()].slice(0, settings.resultLimits.maxCandidatesPerLanguage);
    response = await agnesDigest({ model: process.env.AGNES_MODEL || settings.models.agnes, apiKey: process.env.AGNES_API_KEY, system: 'You are a strict sourcing verifier. Return only valid JSON; never invent evidence.', prompt: promptFor({ policy, language, queries, candidates, memory, provider }) });
  } else if (provider === 'openai-web') {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for openai-web.'); response = await openAiWebDigest({ model: process.env.OPENAI_MODEL || settings.models.openai, apiKey: process.env.OPENAI_API_KEY, prompt: promptFor({ policy, language, queries, candidates, memory, provider }) });
  } else throw new Error(`Unsupported RESEARCH_PROVIDER: ${provider}`);
  const digest = validateDigest(extractJson(response.text)), delivered = [], suppressed = { duplicates: 0, expired: 0, recurring: 0, invalid: 0 };
  for (const lead of digest.shortlist) { if (!lead?.sourceUrl || !lead?.spokenEvidence || !lead?.languageEvidence || !hasSpokenRequirement(lead)) { suppressed.invalid++; continue; } const evidenceOk = provider === 'agnes-exa' ? evidenceIsInCandidate(lead, candidates) : openAiUrlAllowed(lead, response.sourceUrls); if (!evidenceOk) { suppressed.invalid++; continue; } const disposition = dispositionFor(lead, registry, now); if (['new', 'update'].includes(disposition.action)) delivered.push({ ...lead, _status: disposition.action }); else if (disposition.action === 'expired') suppressed.expired++; else if (disposition.action === 'suppressed-recurring') suppressed.recurring++; else suppressed.duplicates++; registerLead(registry, lead, disposition, now); }
  return { digest, delivered, suppressed, diagnostics: { queries, startPublishedDate: provider === 'agnes-exa' ? new Date(now.getTime() - settings.resultLimits.recentPublishedDays * 86400000).toISOString() : null, candidateCount: candidates.length, modelShortlistCount: digest.shortlist.length, manualVerificationCount: digest.manualVerification.length, sourceUrlCount: response.sourceUrls?.length || 0, candidates: candidates.slice(0, 10).map((item) => ({ title: item.title, url: item.url })) } };
}
async function main() {
  const settings = await readJson('config/settings.json');
  const policy = (await fs.readFile(path.join(root, 'config/scout-prompt.md'), 'utf8')).replaceAll('[Company]', settings.companyName);
  const registry = await readJson('state/lead-registry.json');
  const provider = process.env.RESEARCH_PROVIDER || settings.defaultProvider, now = new Date(), results = [];
  for (const language of settings.languages) results.push({ language, ...await runLanguage({ language, settings, policy, registry, now, provider }) });
  const dryRun = process.env.DRY_RUN === 'true';
  const reports = results.map((result) => ({ language: result.language, content: renderReport({ date: day(now), language: result.language, digest: result.digest, delivered: result.delivered, suppressed: result.suppressed }) }));
  const newLeadCount = results.reduce((sum, item) => sum + item.delivered.length, 0);
  let emailSent = false;
  if (newLeadCount > 0) {
    const smtp = smtpConfigFromEnv();
    if (!smtp) throw new Error('New leads were found but SMTP is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM, and ALERT_EMAIL as Actions secrets.');
    await sendSmtpMail({ config: smtp, subject: `interp-bid: ${newLeadCount} new or updated interpreting lead${newLeadCount === 1 ? '' : 's'}${dryRun ? ' [DRY RUN]' : ''} — ${day(now)}`, text: `${dryRun ? 'THIS IS A DRY RUN. The lead registry was not updated, so these leads may repeat next run.\n\n' : ''}${reports.map((report) => report.content).join('\n\n' + '='.repeat(72) + '\n\n')}` });
    emailSent = true;
  }
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, provider, emailSent, results: results.map((item) => ({ language: item.language, newLeads: item.delivered.length, suppressed: item.suppressed, diagnostics: item.diagnostics, deliveredLeads: item.delivered, manualVerification: item.digest.manualVerification, searchLog: item.digest.searchLog })) }, null, 2));
    return;
  }
  const reportDir = path.join(root, 'reports', day(now));
  await fs.mkdir(reportDir, { recursive: true });
  for (const report of reports) await fs.writeFile(path.join(reportDir, `${report.language}-${clock(now)}.md`), report.content);
  await fs.writeFile(path.join(root, 'state/lead-registry.json'), `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`Completed ${results.length} language runs with ${newLeadCount} new or updated leads.${emailSent ? ' Sent one consolidated email.' : ' No email sent.'}`);
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
