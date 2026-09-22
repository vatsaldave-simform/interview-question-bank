# interview-question-bank

## Agent skills

### Plain language

Everything a person reads — comments, names, docs, issue titles, commit messages — is written in
plain words and short sentences. See `docs/agents/plain-language.md`.

### Issue tracker

Issues live in this repo's GitHub Issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five standard triage roles, using their default label strings (no renaming). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Backend structure

`backend/src` is laid out by feature beside a platform zone, with a closed list of filename
suffixes and a one-sentence comment rule. See `docs/agents/backend-structure.md`.

### Delivery

One ticket is one branch and one PR, built as small commits: one concern each, planned on the
ticket and approved before code. Commits and the PR each wait for approval, and neither names a
tool or an assistant. See `docs/agents/delivery.md`.