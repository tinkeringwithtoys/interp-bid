# interp-bid

A source-verified daily scout for **currently open live interpreting** opportunities. It never applies or bids. It discovers, verifies, deduplicates, and writes a short team digest.

## Providers

- `agnes-exa` (default): Exa search/fetch plus Agnes reasoning and digest generation.
- `openai-web`: OpenAI Responses API with hosted web search.

The provider changes without changing report format or deduplication.

## Guarantees

- A lead needs a direct notice URL, spoken-interpreting evidence, Arabic language-pair evidence, and an open deadline or verified recurring status.
- Agnes+Exa quotes are checked against fetched page text.
- Past deadlines are excluded before reports are written.
- Normal leads are delivered once; material changes become updates; recurring rosters are suppressed for 30 days.

## Required Actions secrets

```text
AGNES_API_KEY
EXA_API_KEY
OPENAI_API_KEY
```

No SMTP secret is needed yet. Reports are the source of truth; email will be added only after the delivery format is chosen.

## Local checks

```bash
npm ci
npm run check
npm test
```

A live smoke test is available after the relevant provider keys are configured:

```bash
RESEARCH_PROVIDER=agnes-exa AGNES_API_KEY=... EXA_API_KEY=... npm run validate:live
```
