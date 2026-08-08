# interp-bid

A source-verified daily scout for **currently open live interpreting** opportunities. It never applies or bids. It discovers, verifies, deduplicates, and writes a short team digest.

## Providers

- `agnes-exa` (default): Exa search/fetch plus Agnes reasoning and digest generation.
- `openai-web`: OpenAI Responses API with hosted web search.

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
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
REPORT_RECIPIENTS
```

For SMTP over port 465, also set `SMTP_SECURE=true`. Port 587 uses STARTTLS by default; set `SMTP_REQUIRE_TLS=false` only if you knowingly accept an unencrypted connection.

`REPORT_RECIPIENTS` accepts a comma-separated recipient list. Gmail requires an **App Password**, not your normal Google password.

## Email delivery

When one scheduled batch finds new or materially updated verified leads, it sends **one consolidated email** with all three language reports. No email is sent when there are zero new leads; duplicates, expired notices, and suppressed recurring rosters never trigger mail.

If new leads are found but SMTP configuration is missing or delivery fails, the workflow fails before committing the new registry. That prevents silent loss and allows the same new leads to be retried on the next run.

## Validation

```bash
npm ci
npm run check
npm test
RESEARCH_PROVIDER=agnes-exa AGNES_API_KEY=... EXA_API_KEY=... npm run validate:live
CONFIRM_SMTP_SMOKE_TEST=true npm run validate:smtp
```

The final command intentionally sends one test email to `REPORT_RECIPIENTS`.
