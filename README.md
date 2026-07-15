# Triagepad Action

TestFlight feedback → AI triage → **code-linked fix PRs**, run entirely in your own CI.

```yaml
# .github/workflows/triagepad.yml
name: Triagepad
on:
  repository_dispatch:
    types: [triagepad-feedback]
  workflow_dispatch:
concurrency: triagepad
permissions: {}
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - name: Get repo token from the brain
        id: app
        run: |
          TOKEN=$(curl -sf -X POST "${{ secrets.BRAIN_URL }}/v1/repo/token" \
            -H "Authorization: Bearer ${{ secrets.TRIAGEPAD_API_KEY }}" | jq -r .token)
          echo "::add-mask::$TOKEN"; echo "token=$TOKEN" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v4
        with: { token: "${{ steps.app.outputs.token }}", fetch-depth: 0 }
      - uses: triagepad/action@v1
        with:
          github_token: ${{ steps.app.outputs.token }}
          brain_url: ${{ secrets.BRAIN_URL }}
          triagepad_api_key: ${{ secrets.TRIAGEPAD_API_KEY }}
          inference: byo
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

Onboard from the [Triagepad dashboard](https://triagepad-web.vercel.app) — it opens this workflow as
a PR and provisions the secrets for you.

## The invariant

**Your source is read only inside your CI runner.** This action runs the whole triage + localisation
pipeline against your checked-out repo at HEAD. The Triagepad brain receives tester feedback and
ticket-result metadata (plus the small excerpts that naturally appear inside a generated ticket) over
a closed `/v1` contract that cannot express a repository tree. The brain never clones or stores your
code.

## What's in this repo

- `action.yml` — the composite GitHub Action.
- `src/action/` — the thin runner (fetch pending feedback + methodology from the brain, triage,
  localise against the checkout, open PRs/issues, post results back).
- `src/core/` — the transplantable pipeline: triage, localisation, the validation gate, mode
  envelopes, the shared ticket state machine, and the `fixes.json` output contract. Prompt **content**
  is served by the brain at runtime and is not in this repo.

`dist/` is a committed build so the private brain can consume `src/core` as a pinned git dependency
without a build-on-install step. CI fails if `dist/` ever drifts from `src/`.
