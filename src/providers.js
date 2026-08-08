const headers = (key) => ({ 'content-type': 'application/json', authorization: `Bearer ${key}` });
async function request(url, key, body, fetchImpl = fetch) {
  const response = await fetchImpl(url, { method: 'POST', headers: headers(key), body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url} ${response.status}: ${data.error?.message || data.message || JSON.stringify(data)}`);
  return data;
}
export async function exaSearch(query, apiKey, fetchImpl = fetch) {
  const data = await request('https://api.exa.ai/search', apiKey, { query, numResults: 8, contents: { text: { maxCharacters: 12000 }, highlights: true } }, fetchImpl);
  return (data.results || []).map((item) => ({ url: item.url, title: item.title || item.url, text: typeof item.text === 'string' ? item.text : '', highlights: Array.isArray(item.highlights) ? item.highlights : [], publishedDate: item.publishedDate || null })).filter((item) => item.url);
}
export async function agnesDigest({ model, apiKey, system, prompt, fetchImpl = fetch }) {
  const data = await request('https://apihub.agnes-ai.com/v1/chat/completions', apiKey, { model, temperature: 0.1, max_tokens: 8000, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }, fetchImpl);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Agnes returned no assistant content.');
  return { text, sourceUrls: [] };
}
export async function openAiWebDigest({ model, apiKey, prompt, fetchImpl = fetch }) {
  const data = await request('https://api.openai.com/v1/responses', apiKey, { model, tools: [{ type: 'web_search', search_context_size: 'medium' }], include: ['web_search_call.action.sources'], input: prompt }, fetchImpl);
  const sourceUrls = new Set(), parts = [];
  for (const item of data.output || []) {
    if (item.type === 'web_search_call') for (const source of item.action?.sources || []) if (source.url) sourceUrls.add(source.url);
    if (item.type === 'message') for (const content of item.content || []) { if (content.type === 'output_text' && content.text) parts.push(content.text); for (const annotation of content.annotations || []) if (annotation.type === 'url_citation' && annotation.url) sourceUrls.add(annotation.url); }
  }
  const text = parts.join('\n'); if (!text) throw new Error('OpenAI returned no output text.');
  return { text, sourceUrls: [...sourceUrls] };
}
