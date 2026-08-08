const jsonHeaders = (key) => ({ 'content-type': 'application/json', authorization: `Bearer ${key}` });

async function request(url, key, body, fetchImpl = fetch) {
  const response = await fetchImpl(url, { method: 'POST', headers: jsonHeaders(key), body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url} ${response.status}: ${data.error?.message || data.message || JSON.stringify(data)}`);
  return data;
}

export async function exaSearch(query, apiKey, { startPublishedDate, excludeDomains = [] } = {}, fetchImpl = fetch) {
  const data = await request('https://api.exa.ai/search', apiKey, {
    query,
    type: 'deep',
    systemPrompt: 'Prefer direct official notices and specific vendor application pages. Exclude aggregators, directories, training, jobs, translation-only work, and expired notices.',
    numResults: 8,
    ...(startPublishedDate ? { startPublishedDate } : {}),
    ...(excludeDomains.length ? { excludeDomains } : {}),
    contents: { text: { maxCharacters: 6000 }, highlights: true }
  }, fetchImpl);
  return (data.results || []).map((item) => ({
    url: item.url,
    title: item.title || item.url,
    text: typeof item.text === 'string' ? item.text : '',
    highlights: Array.isArray(item.highlights) ? item.highlights : [],
    publishedDate: item.publishedDate || null
  })).filter((item) => item.url);
}

export async function agnesDigest({ model, apiKey, system, prompt, fetchImpl = fetch }) {
  const data = await request('https://apihub.agnes-ai.com/v1/chat/completions', apiKey, {
    model,
    temperature: 0.1,
    max_tokens: 32000,
    reasoning_effort: 'low',
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }]
  }, fetchImpl);
  const choice = data.choices?.[0];
  const text = choice?.message?.content;
  if (!text) {
    const diagnostic = {
      finishReason: choice?.finish_reason ?? null,
      usage: data.usage ?? null,
      error: data.error ?? null,
      hasChoices: Array.isArray(data.choices),
      rawTopLevelKeys: Object.keys(data || {})
    };
    throw new Error(`Agnes returned no assistant content. Diagnostic: ${JSON.stringify(diagnostic)}`);
  }
  return { text, sourceUrls: [] };
}

function openAiTextAndSources(data) {
  const sourceUrls = new Set();
  const parts = [];
  for (const item of data.output || []) {
    if (item.type === 'web_search_call') for (const source of item.action?.sources || []) if (source.url) sourceUrls.add(source.url);
    if (item.type === 'message') for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) parts.push(content.text);
      for (const annotation of content.annotations || []) if (annotation.type === 'url_citation' && annotation.url) sourceUrls.add(annotation.url);
    }
  }
  return { text: parts.join('\n'), sourceUrls: [...sourceUrls] };
}

export async function openAiWebDigest({ model, apiKey, prompt, fetchImpl = fetch }) {
  const data = await request('https://api.openai.com/v1/responses', apiKey, {
    model,
    tools: [{ type: 'web_search', search_context_size: 'medium' }],
    include: ['web_search_call.action.sources'],
    max_output_tokens: 32000,
    reasoning: { effort: 'low' },
    input: prompt
  }, fetchImpl);
  const result = openAiTextAndSources(data);
  if (!result.text) {
    const diagnostic = {
      status: data.status ?? null,
      incompleteReason: data.incomplete_details?.reason ?? null,
      usage: data.usage ?? null,
      error: data.error ?? null,
      outputTypes: Array.isArray(data.output) ? data.output.map((item) => item.type) : null,
      rawTopLevelKeys: Object.keys(data || {})
    };
    throw new Error(`OpenAI returned no output text. Diagnostic: ${JSON.stringify(diagnostic)}`);
  }
  return result;
}
