# Codex Quota Overview Design

Date: 2026-04-16
Scope: `QuotaPage` -> `Codex` quota section
Status: Draft approved in terminal discussion, pending implementation

## Background

The quota management page currently renders provider sections through a shared `QuotaSection` component. `Codex` cards already expose multiple quota windows per credential, including weekly quota and weekly code review quota, but there is no section-level overview, no quota-based ordering, and the shared "show all" mode still blocks rendering when file count exceeds a threshold.

This design adds a `Codex`-specific overview while keeping the shared quota framework intact for other providers.

## Goals

1. Add two overview charts to the `Codex` section:
   - Weekly quota usage
   - Weekly code review quota usage
2. Place the overview before the existing `按页显示` / `显示全部` controls, using the approved "方案 B" layout.
3. Add a sort toggle for `Codex` cards:
   - `额度高到低`
   - `额度低到高`
   - Default: high to low
4. Sort only by the weekly quota window, not by code review quota.
5. Remove the shared "show all" item-count guard so `显示全部` always works.
6. Use lazy loading for `Codex` overview/sort data instead of eager page-load fetching.

## Non-Goals

1. No global cross-provider quota summary.
2. No overview charts for Claude, Gemini CLI, Kimi, or Antigravity in this change.
3. No new backend API contract; implementation must reuse existing `Codex` quota responses.
4. No provider-wide refactor of the quota store shape unless required for this feature.

## Approved UX

The `Codex` section header uses a two-row layout:

1. Row 1: action toolbar
   - `按页显示` / `显示全部`
   - sort toggle
   - `刷新全部`
2. Row 2: two compact stat cards
   - weekly quota donut
   - weekly code review donut

The visual direction matches "方案 B":

1. Preserve the current tool-first header rhythm.
2. Render the overview as stat cards below the toolbar, not inline pills and not oversized hero charts.
3. Keep mobile wrapping predictable by allowing toolbar actions and overview cards to stack.

## Data Model And Aggregation Rules

### Source Windows

Reuse `CodexQuotaWindow.id` from the current parser/builders:

1. Weekly quota overview uses `weekly`
2. Weekly code review overview uses `code-review-weekly`

### Aggregation Method

The current API exposes per-credential percentage windows, not a shared absolute weekly capacity. Because of that, the overview is defined as an equal-weight average across successfully loaded credentials.

For each chart:

1. Collect `Codex` credentials whose quota state is `success`
2. Find the target window id
3. Convert `usedPercent` to remaining percent: `remaining = 100 - usedPercent`
4. Clamp to `0..100`
5. Compute average remaining percent across all eligible credentials
6. Display:
   - `未使用 = average remaining`
   - `已使用 = 100 - average remaining`

### Inclusion Rules

A credential is included in a chart only when:

1. Quota state is `success`
2. The required window exists
3. The required window has a usable `usedPercent`

These states are excluded:

1. `idle`
2. `loading`
3. `error`
4. success states that do not contain the target weekly window

### Empty / Partial States

Each overview card should expose coverage like `已汇总 X / Y 个凭证`.

If no credential qualifies for a given chart:

1. Show the stat card shell
2. Show an empty-state label instead of a donut percentage
3. Avoid implying `0%` usage or `100%` remaining

## Loading Strategy

### Lazy Loading

The `Codex` section must not auto-fetch all credentials on initial page entry.

Instead, trigger a one-time section-wide fetch when the user interacts with the `Codex` section in ways that require overview/sort data and there is not yet enough loaded data:

1. Toggle `按页显示` / `显示全部`
2. Toggle sort direction

If qualifying `Codex` quota data already exists, do not issue the bootstrap fetch again.

### Refresh Behavior

1. `刷新全部` continues to refresh the full `Codex` section
2. On section refresh completion:
   - cards update
   - both overview charts recompute
   - card order recomputes under the active sort direction
3. On single-card refresh success:
   - recompute both overview charts
   - recompute `Codex` ordering under the active sort direction

## Sorting Rules

### Sort Key

Sort only by the weekly quota window (`weekly`) remaining percentage.

Definition:

1. Locate the `weekly` window
2. Convert `usedPercent` to `remainingPercent = 100 - usedPercent`
3. Compare remaining percent numerically

### Sort Modes

1. Default: high to low
2. Alternate: low to high

### Missing Data

Credentials without a usable weekly quota value always sort after credentials with usable weekly data, regardless of direction.

This keeps `idle`, `loading`, `error`, and incomplete payloads from interrupting the ranked list.

## Show-All Behavior

Remove the shared threshold gate that currently prevents `显示全部` for larger file counts.

Implementation intent:

1. Remove `MAX_SHOW_ALL_THRESHOLD` behavior in shared `QuotaSection`
2. Remove warning state and related guard logic
3. Keep pagination mode available, but allow switching to all-items mode unconditionally

This applies across the quota module because the limit currently lives in the shared section component.

## Component Responsibilities

### `src/components/quota/QuotaSection.tsx`

Primary implementation location.

Add:

1. `Codex`-specific overview derivation from quota store data
2. `Codex` sort state and sort toggle UI
3. `Codex` lazy bootstrap logic for overview/sort data
4. Removal of shared show-all threshold logic
5. Conditional rendering so non-`Codex` providers keep current behavior

### `src/components/quota/quotaConfigs.ts`

Reuse current window ids and state shape. Add helper logic only if it meaningfully reduces duplication for:

1. finding windows by id
2. converting `usedPercent` to remaining percent

No config-level redesign is required.

### `src/pages/QuotaPage.module.scss`

Add styles for:

1. overview stat card row
2. donut chart shell
3. coverage/empty-state labels
4. sort toggle button state
5. responsive wrapping for the approved two-row header

### i18n

Update:

1. `src/i18n/locales/zh-CN.json`
2. `src/i18n/locales/en.json`

Add labels for:

1. weekly quota overview
2. weekly code review overview
3. used / remaining
4. aggregated count text
5. empty-state text
6. sort directions

`ru.json` should also be updated during implementation if the project policy remains "all supported locales stay in sync."

## State And Flow

### Normal Flow

1. User enters quota page
2. Page fetches auth files as it does today
3. `Codex` section renders without forcing quota fetch
4. User toggles pagination or sort inside `Codex`
5. Section detects missing bootstrap data
6. Section fetches all `Codex` quotas once
7. Store updates
8. Overview charts render from store
9. Card list renders in active sort order

### Subsequent Flow

1. User changes sort direction
2. No fetch occurs if the store already has enough data
3. UI rerenders using existing store values

### Refresh Flow

1. User clicks `刷新全部`
2. Existing refresh path reloads files then section quota
3. Updated quota states feed both the chart summary and sorted list automatically

## Error Handling

1. Existing card-level errors remain card-scoped
2. Overview cards must tolerate partial failure
3. If only some credentials fail, summary still renders from successful credentials
4. If all relevant credentials fail or remain unloaded, summary shows empty state plus coverage text
5. Sorting must remain stable even when most cards have missing weekly data

## Testing Strategy

### Manual Verification

1. `Codex` section initially loads without automatic bulk quota fetch
2. Toggling sort triggers one bootstrap fetch when data is absent
3. Toggling `按页显示` / `显示全部` also triggers one bootstrap fetch when data is absent
4. Weekly chart reflects only `weekly` windows
5. Weekly code review chart reflects only `code-review-weekly` windows
6. Default sort is weekly remaining high to low
7. Toggle reverses sort order
8. Missing/failed cards stay at the end
9. `显示全部` works even with more than the previous threshold
10. `刷新全部` and single-card refresh both update charts and ordering
11. Mobile layout stacks cleanly without overlapping controls

### Suggested Code-Level Coverage

If the repo has or gains targeted test coverage for quota utilities, add focused tests for:

1. weekly remaining extraction
2. overview aggregation math
3. missing-data exclusion
4. sort ordering with mixed valid and invalid states

## Risks

1. Shared `QuotaSection` changes could accidentally affect non-`Codex` sections
2. Equal-weight averaging may be misread as absolute total quota if copy is unclear
3. Lazy bootstrap must not cause repeated fetches on every sort/pagination interaction

## Mitigations

1. Guard `Codex`-specific UI and behavior behind `config.type === 'codex'`
2. Keep overview labels explicit and show coverage counts
3. Track whether bootstrap data has already been attempted with current credentials
4. Preserve existing refresh primitives instead of creating a parallel fetch path

## Implementation Recommendation

Use the shared `QuotaSection` as the integration point, with small `Codex`-specific helpers colocated near the section or extracted into quota utilities only if reuse becomes obvious during implementation.

This keeps the feature bounded, avoids unnecessary store redesign, and matches the current architecture of a generic section component plus provider-specific config/state.
