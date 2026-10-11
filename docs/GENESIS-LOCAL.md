# Genesis local questions and analytics

## Public access approved by operator

Public URL: https://aegis-resolute.tailcf9ef8.ts.net/tmrwhelix/
Tailscale Funnel proxies this path to `http://127.0.0.1:3001/tmrwhelix`.
Existing SPOQ routes are preserved; localhost access remains available.
Select **Genesis Production** in the workspace picker on a new browser.
On 2026-10-11 the operator explicitly approved public access to the imported
HR directory, patent/trademark registers, Academy and Policyweb content,
including unauthenticated editing access. Foundry has no sign-in.
To remove only this public route, run:
`tailscale funnel --https=443 --set-path=/tmrwhelix off`.

Status: first local implementation running with production snapshots, captured
2026-10-11 through the operator's authenticated browser. Remaining sections describe
the broader integration plan; app-owned automated export endpoints are not implemented.

## Current local workspace

Open http://localhost:3001 and select **Genesis Production**. Your existing GPU
llama.cpp router runs `bonsai-27b-stock` (Bonsai 2 stock); DuckDB calculates results. No Genesis credentials
are copied into Foundry. Production apps were read only.

Both local workspaces select **Local → llama.cpp**, endpoint
`http://100.78.231.13:8090/v1`. The router key is saved encrypted in Foundry's
provider store. No cloud fallback. The bundled Ollama container is stopped;
its volume is preserved. Start this installation with `docker compose up -d`
(no `local` profile). `.env` sets `MODEL_ENDPOINT`, `LOCAL_RUNTIME=llamacpp`
and `LOCAL_MODEL=bonsai-27b-stock`; keep its existing encryption keys unchanged.

The explicitly approved UFW rule permits only `br-640b51504be3`, source
`172.19.0.0/16`, to destination `100.78.231.13:8090/tcp`. Router authentication
remains required. If Compose recreates this network, re-check its bridge and
subnet before updating that rule. Rollback: delete that exact UFW rule; no
router/GPU configuration was changed.

| Source | Imported coverage |
| --- | --- |
| OS | 13 visible app registry entries and a six-app coverage table |
| HR | 26 directory entries; professional fields only, no payroll/private profiles |
| Patents | 791 patents and 438 trademarks; default visible register columns |
| Academy | 10 course cards, 10 outlines and 154 lesson bodies; course status is the operator's own |
| Policyweb | 39 published documents, split into 197 passages; no drafts or acknowledgements |
| Finance | Dev only; operator confirmed final production data does not exist yet. The capture also observed production HTTPS failing `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`. No Finance business data imported. |

Academy has 663 passages from 164 documents. Counts refer to this capture, not a
continuous production connection. Captures were sequential, with no common
transaction. Document answers use SQL title/text matching, not semantic retrieval.
Ontology discovery does not infer Genesis relationships from overlapping IDs or
names. Company/person mappings remain absent. Other app datasets and attachments
are outside this initial capture.

## Install or refresh an authorized bundle

Create a private JSON input outside the repository with `environment`, ISO
`capturedAt`, and `datasets`. Each dataset has `name` prefixed by its app, `app`,
`sourceUrl`, `description`, `coverage`, `schema` and `rows` (objects). Schema
columns have `name` and `type`: `text`, `integer`, `double`, `boolean` or `date`.
Use Genesis HTTPS URLs without embedded credentials. See
`scripts/genesis-bundle.ts` and `apps/api/src/genesis.ts` for the exact contract.

```sh
node --import tsx scripts/genesis-bundle.ts /path/to/private-input.json /tmp/genesis-prod
docker compose exec -T app mkdir -p /data/genesis
docker cp /tmp/genesis-prod/. helix-foundry-app-1:/data/genesis/genesis-prod
docker compose exec -T -u root app chown -R node:node /data/genesis/genesis-prod
```

In **Add data → Genesis apps**, enter bundle `genesis-prod`, discover tables and
select the permitted datasets. Existing connections refresh through their Sync
action. Refresh is manual by default. The worker validates schema, safe integer
values, count, checksum and path confinement before activating a snapshot;
schema changes use the existing version acceptance flow. Empty tables retain
their declared schema. Dataset files and packaging input are capped at 256 MB.
Bundle packaging installs its manifest atomically; finish copying files before
requesting sync. Do not put data or credentials in Git.

Parquet history, cached answers and local export files retain prior data. This
first version does not implement retention/erasure, encrypted local datasets,
or automatic production browser refresh. Keep Foundry bound to loopback on this
single-operator machine.

## Outcome

One local Foundry workspace answers questions across OS, Patents, HR, Finance,
Academy and Policyweb. Calculations execute against versioned snapshots; document
answers cite retrieved passages. Answers show source app, environment, snapshot
time and original record or document links. Missing mappings, permissions or
sources produce explicit gaps rather than invented results.

Keep the existing Docker installation and loopback binding. Foundry currently has
no sign-in; this design is for one operator on this machine. Use the installed
local model first. Its answer quality still needs evaluation against the actual
question set.

## Source inventory

| App | Data to project | Existing seam and necessary work |
| --- | --- | --- |
| OS | Active app registry; approved notes if needed | `api.app-entries.ts` already exports active entries. OS is a hub, not a company master. |
| Patents | Patents, trademarks, cases, deadlines, assignees, invoices and valuations | Domain schema and storage helpers exist; add authorized analytics projections. Attachments require a separate extraction decision. |
| HR | Companies, purpose-limited workforce data, published reporting snapshots | Existing reporting exports enforce roles, suppression and audit. Reuse those rules. Sensitive employee fields and payroll amounts use encrypted envelopes; decryption stays in HR. |
| Finance | Companies, funding requests, lines, approval status and frozen FX basis | Reuse `requireAccess`, request and summary services. Current exports produce XLSX. This app supplies funding data, not a general ledger. |
| Academy | Course catalog, enrollments, progress and certificates | Combine authorized report projections with the existing Markdown/MDX catalog reader. D1 alone omits the course material. |
| Policyweb | Effective published policy text and authorized acknowledgements | Reuse effective content readers: generated baseline + committed overrides + D1 overrides. Admin export only exports override rows. Exclude editor drafts. |

All six inspected apps use the Genesis D1/SQLite runtime. Their deployed runtime
uses an HTTP D1 proxy; their local `.dev.db` files are development data. App proxy
credentials permit broader SQL operations and are not appropriate Foundry import
credentials. Edge authentication alone does not grant app roles or row scope.

## Data flow

1. Each app builds an explicit, authorized projection using its existing domain
   services, content readers, permission checks and audit rules.
2. Export a versioned manifest and JSONL datasets. For the first local proof these
   can be operator-generated files; the repeatable integration uses read-only
   app export endpoints and a narrowly scoped export principal.
3. A Genesis source in Foundry discovers permitted datasets and imports each as
   a stable source/dataset through the existing worker and ingestion pipeline.
4. Existing Parquet versions, profiling, schema drift review and DuckDB execute
   analytics. Existing ontology stores explicit relationships.
5. A document retrieval step supplies relevant published policy/course passages
   for text questions and mixed text/data questions.

No additional database, sync service or cloud AI service is needed for this flow.
Shared export transport belongs in the upstream Genesis platform once; app-owned
projections stay in their respective apps. Do not duplicate inherited runtime
changes across six forks.

## Snapshot contract

Manifest fields: contract version, app, environment, export principal/scope,
export start/completion times, dataset name, schema, primary key, row count,
content checksum and source URL rules. Include capture/revision identifiers when
the source can guarantee them. Do not claim transaction consistency unless the
export actually provides it; there is no common transaction across six apps.

Use separate datasets for separate grains: employees, companies, requests,
request lines, patents, acknowledgements, course progress and document passages.
Dataset names include the app so repeated names such as `companies` are clear.
Use namespaced record keys such as `hr:prod:employees:<id>`.

Download a complete snapshot before activation; validate contract, schema,
checksums, row count and scope. Preserve the previous valid snapshot on failure.
Initially refresh on demand using existing jobs. Add per-source schedules after
measuring size and export cost; Foundry's generic five-minute default is not an
appropriate assumption for every app.

Empty datasets need explicit handling with declared schema. Current
`ingestRows` rejects an empty array. Every refresh must replace the dataset,
including when the last row is deleted. Do not send successive 10,000-row calls
to the ingest endpoint: each call creates a replacement snapshot, not an append.
Use file ingestion for complete streamed datasets. Existing connector imports
also have a two-million-row ceiling; large domains need an explicit partition
strategy if measured exports exceed it.

Existing version history retains old snapshots. Define retention and erasure
for Parquet versions, ontology objects, cached answers and document passages;
removing a row from the active snapshot alone does not erase its history.

## Cross-app semantics

- Company mapping explicitly relates HR company IDs, Finance slugs and Patents
  assignees. Preserve unknown/unmapped entities and surface them in answers.
- Person mapping relates app-local IDs and permitted identity references.
  Normalized email can suggest matches, but duplicate/historical addresses need
  review. CF Access subjects and Entra object IDs are not assumed equivalent.
  HR's login-only identity reference table is not a default analytics export.
- Course slugs, program versions, policy section/slug keys and acknowledgement
  dates remain explicit. HR training and Academy courses are not automatically
  interchangeable.
- Money retains integer minor units, currency and applicable exponent. Patents
  supports differing currency exponents; do not universally divide by 100.
  Finance analyses preserve approval-time frozen FX and period. Aggregate each
  dataset at its own grain before joins to avoid inflated totals.
- Suppressed HR metrics stay null/suppressed, never reconstructed through a
  detailed employee projection. Export scopes must be evaluated together to
  prevent a broader dataset bypassing reporting suppression.

## Questions and document retrieval

Foundry's analyst generates one read-only SQL query, executes it and cites
dataset versions. The Genesis prompt requests bounded title/text matches for
document questions. Its narrative summarizer preserves up to 1,800 characters
for passage text, titles and source links; ordinary string results keep the
existing 60-character preview. Answer rows retain complete returned passages,
and the UI links to source documents and dataset capture metadata.

Evaluate paraphrased questions; if lexical
retrieval misses them, add local embeddings through the existing Helix layer
after checking its installed capabilities. No new vector service upfront.

Route calculations to SQL, policy/course interpretation to retrieved passages,
and mixed questions to both. Treat source text as untrusted evidence, never
instructions. Refuse unsupported conclusions; distinguish policy requirements
from proof that employees fulfilled them.

Representative acceptance questions:

- What approved funding and workforce totals apply to each mapped legal entity
  for a selected period? Show coverage gaps and the FX basis.
- Which mapped employees have incomplete Academy training or missing required
  policy acknowledgements? State applicable course/policy versions and scope.
- Which IP deadlines and payable items occur in the selected horizon, grouped
  by mapped entity and currency?
- What published policy governs a named topic, and which Academy material
  teaches it? Cite the actual passages, with no invented requirement mappings.
- Which apps appear in the active OS registry, and how fresh are the available
  analytics datasets from each?

## Foundry change locations

| Area | Existing files to extend |
| --- | --- |
| Source contract and discovery/import | `packages/shared/src/data.ts`, `apps/api/src/connectors.ts` |
| Source onboarding and refresh | `apps/api/src/onboarding.ts`, `apps/api/src/source-sync.ts`, `apps/api/src/data-jobs.ts` |
| Empty snapshot, source metadata and retention | `apps/api/src/datasets.ts`, `apps/api/src/routes/data.ts` |
| Connection setup | `apps/web/src/connect-data.tsx`, `apps/web/src/connection-form.tsx` and existing connection views |
| Explicit relationships | Existing `packages/shared/src/ontology.ts` schemas and ontology publication path |
| SQL/text answering and provenance | `apps/api/src/assistant.ts`, existing analyst answer/citation views |

REST already handles JSON arrays and pagination, but supports only one token
header. Genesis deployment may need both Cloudflare Access client headers plus
an app-scoped export credential. Add a validated Genesis configuration using
existing sealed-secret storage; do not expose arbitrary user-provided SQL or
copy app proxy write secrets into Foundry.

## Delivery order and completion checks

1. Implement a local manifest/bundle import using existing ingestion/job paths.
   First production capture covers five accessible apps and records the Finance
   gap explicitly. Exercise count questions and passage citations locally.
2. Define and validate company/person mapping datasets with the operator. Add
   explicit reporting semantics and useful SQL views through existing models.
3. Add app-owned exports preserving each domain's access/audit rules, then wire
   the Genesis connector to the authorized deployed environment. A unified
   export contract does not currently exist.
4. Exercise refresh, denied exports, incomplete downloads, schema drift, zero-row
   datasets, deleted/anonymized records and retention cleanup. Verify money and
   join calculations against independently computed expected values.
5. Evaluate local model answers on the representative question set. Browser QA
   verifies setup, freshness, source gaps, citations and error recovery.

Before importing live data, confirm target environments, deployment/schema
versions, export scope and identity/entity mappings. Current inspection used
local checkouts: OS is on a feature branch; Academy is five commits behind its
tracked branch and has pre-existing route edits. These were preserved. No claim
of deployed schema parity or existing production export availability is made.

## Local data boundary

Foundry connector secrets are sealed, but imported Parquet data is local
plaintext. Start with published documents, aggregate reports and minimal
authorized record projections. Medical, bank, private employee and detailed
payroll data need a specific purpose and scope before inclusion. Keep all model
calls local for this workspace. Preserve localhost binding and avoid tunnels.

Source writeback, real-time CDC, multi-user access and general PDF/Word attachment
ingestion are outside the first local questions-and-analysis implementation.
