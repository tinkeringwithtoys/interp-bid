# interp-bid

A source-verified daily scout for currently open live-interpreting opportunities. It discovers and verifies leads but never applies or bids.

## Delivery

A production run sends one consolidated email only when it finds new or materially updated verified leads. Duplicates, expired notices, and suppressed recurring rosters never trigger email.

Required Actions secrets:

```text
AGNES_API_KEY
EXA_API_KEY
OPENAI_API_KEY
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
ALERT_EMAIL
```

`ALERT_EMAIL` may be a comma-separated recipient list. For port 465 set `SMTP_SECURE=true`; port 587 requires STARTTLS by default. Gmail requires an App Password, never a normal account password.

## Safe validation

Use `dry_run=true` first. It performs live provider calls but writes no reports, changes no registry, and sends no email. Dry-run logs include query, candidate, shortlist, manual-verification, and source counts for each language.

## Local checks

```bash
npm ci
npm run check
npm test
RESEARCH_PROVIDER=agnes-exa AGNES_API_KEY=... EXA_API_KEY=... npm run validate:live
CONFIRM_SMTP_SMOKE_TEST=true npm run validate:smtp
```
