import { exaSearch, agnesDigest, openAiWebDigest } from '../src/providers.js';
const provider = process.env.RESEARCH_PROVIDER || 'agnes-exa';
const prompt = 'Return exactly {"shortlist":[],"manualVerification":[],"tier1Zero":true,"searchLog":{"queries":[],"sourcesChecked":[],"notes":"smoke test"}}. Do not browse for opportunities.';
if (provider === 'agnes-exa') {
  if (!process.env.EXA_API_KEY || !process.env.AGNES_API_KEY) throw new Error('AGNES_API_KEY and EXA_API_KEY are required for Agnes+Exa live validation.');
  const found = await exaSearch('Arabic interpreter vendor roster', process.env.EXA_API_KEY);
  const response = await agnesDigest({ model: process.env.AGNES_MODEL || 'agnes-2.5-flash', apiKey: process.env.AGNES_API_KEY, system: 'You emit strict JSON.', prompt });
  JSON.parse(response.text.replace(/```json|```/g, '').trim()); console.log(`Agnes+Exa validation passed (${found.length} Exa results).`);
} else if (provider === 'openai-web') {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for OpenAI live validation.');
  const response = await openAiWebDigest({ model: process.env.OPENAI_MODEL || 'gpt-5.6', apiKey: process.env.OPENAI_API_KEY, prompt });
  JSON.parse(response.text.replace(/```json|```/g, '').trim()); console.log(`OpenAI web validation passed (${response.sourceUrls.length} cited sources).`);
} else throw new Error(`Unsupported RESEARCH_PROVIDER: ${provider}`);
