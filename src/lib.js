import { createHash } from 'node:crypto';

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|source$)/i;
const SPOKEN = /(interpret(?:er|ing|ation)|interprét(?:e|ariat|ation)|مترجم\s*فوري|ترجمة\s*شفوية|تفسير\s*فوري|VRI|OPI|telephone interpreting|video remote|simultaneous|consecutive|court interpreter|medical interpreter)/i;
const TRANSLATION_ONLY = /(translation|traduction|ترجمة\s*تحريرية|locali[sz]ation|subtitling|transcription|proofreading|editing)/i;

export function canonicalUrl(value) {
  const url = new URL(value); url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}
export function normalize(value = '') { return String(value).toLowerCase().replace(/\s+/g, ' ').trim(); }
export function fingerprint(lead) {
  return createHash('sha256').update([lead.buyer, lead.title, lead.country, lead.mode, lead.spokenEvidence, lead.languageEvidence].map(normalize).join('|')).digest('hex').slice(0, 24);
}
export function hasSpokenRequirement(lead) {
  const evidence = `${lead.spokenEvidence || ''} ${lead.mode || ''}`;
  return SPOKEN.test(evidence) && !(TRANSLATION_ONLY.test(evidence) && !SPOKEN.test(lead.spokenEvidence || ''));
}
export function deadlineIsOpen(deadline, now = new Date()) {
  if (!deadline) return null;
  const parsed = new Date(`${deadline}T23:59:59Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed >= now;
}
export function isMaterialChange(previous, lead) {
  return ['deadline', 'budget', 'spokenEvidence', 'languageEvidence', 'mode', 'teamAction'].some((key) => normalize(previous[key]) !== normalize(lead[key]));
}
export function dispositionFor(lead, registry, now = new Date()) {
  const canonical = canonicalUrl(lead.sourceUrl); const id = fingerprint(lead);
  const previous = registry.leads.find((item) => item.canonicalUrl === canonical || item.fingerprint === id);
  if (deadlineIsOpen(lead.deadline, now) === false || previous?.status === 'expired') return { action: 'expired', previous, canonicalUrl: canonical, fingerprint: id };
  if (!previous) return { action: 'new', previous: null, canonicalUrl: canonical, fingerprint: id };
  if (lead.recurring && (now - new Date(previous.lastSent || previous.firstSeen)) / 86400000 < 30) return { action: 'suppressed-recurring', previous, canonicalUrl: canonical, fingerprint: id };
  if (isMaterialChange(previous, lead)) return { action: 'update', previous, canonicalUrl: canonical, fingerprint: id };
  return { action: 'duplicate', previous, canonicalUrl: canonical, fingerprint: id };
}
export function registerLead(registry, lead, disposition, now = new Date()) {
  const record = { ...lead, canonicalUrl: disposition.canonicalUrl, fingerprint: disposition.fingerprint, status: disposition.action === 'expired' ? 'expired' : 'open', firstSeen: disposition.previous?.firstSeen || now.toISOString(), lastChecked: now.toISOString(), lastSent: ['new', 'update'].includes(disposition.action) ? now.toISOString() : disposition.previous?.lastSent };
  const index = registry.leads.findIndex((item) => item.canonicalUrl === record.canonicalUrl || item.fingerprint === record.fingerprint);
  if (index >= 0) registry.leads[index] = { ...registry.leads[index], ...record }; else registry.leads.push(record);
  return registry;
}
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fenced?.[1] || text).trim());
}
export function evidenceIsInCandidate(lead, candidates) {
  const candidate = candidates.find((item) => canonicalUrl(item.url) === canonicalUrl(lead.sourceUrl));
  if (!candidate) return false;
  const haystack = normalize([candidate.text, candidate.highlights?.join(' ')].filter(Boolean).join(' '));
  return normalize(lead.spokenEvidence).length > 8 && haystack.includes(normalize(lead.spokenEvidence)) && normalize(lead.languageEvidence).length > 4 && haystack.includes(normalize(lead.languageEvidence));
}
export function renderReport({ date, language, digest, delivered, suppressed }) {
  const lines = [`# Interpreting opportunity scout — ${date} (${language})`, '', `**Verified new or updated leads:** ${delivered.length}`, digest.tier1Zero ? '**Tier 1:** No verified open results in this run.' : '**Tier 1:** Verified results found or not explicitly zero.', `**Suppressed:** ${suppressed.duplicates} duplicates, ${suppressed.expired} expired, ${suppressed.recurring} recurring.`, '', '## A. Shortlist'];
  if (!delivered.length) lines.push('_No new fully verified leads in this run._');
  for (const [index, lead] of delivered.entries()) lines.push('', `### ${index + 1}. ${lead.title}`, `- **Buyer:** ${lead.buyer}`, `- **Country / tier:** ${lead.country} — ${lead.tier}`, `- **Delivery:** ${lead.deliveryLocation || 'Not stated'}; ${lead.mode}`, `- **Notice:** ${lead.sourceUrl}`, `- **Published / deadline:** ${lead.publicationDate || 'Not published'} / ${lead.deadline || 'Verify manually'}`, `- **Spoken-interpreting evidence:** “${lead.spokenEvidence}”`, `- **Language evidence:** “${lead.languageEvidence}”`, `- **Budget:** ${lead.budget || 'not published'}`, `- **Team action:** ${lead.teamAction}`, `- **Why this is a hidden gem:** ${lead.hiddenGem}`, `- **Query/source:** ${lead.query}`);
  lines.push('', '## B. Needs Manual Verification');
  if (!(digest.manualVerification || []).length) lines.push('_None._');
  for (const lead of digest.manualVerification || []) lines.push(`- **${lead.title}** — ${lead.sourceUrl}: ${lead.missingFact}`);
  lines.push('', '## C. Search method log', `- **Queries:** ${(digest.searchLog?.queries || []).join(' | ') || 'Not returned'}`, `- **Sources checked:** ${(digest.searchLog?.sourcesChecked || []).join(', ') || 'Not returned'}`, `- **Notes:** ${digest.searchLog?.notes || 'Each shortlisted lead was checked against provider evidence before delivery.'}`, '');
  return lines.join('\n');
}
