---
name: erp-date-time-semantics
description: Preserve correct ShopCore business-date, timestamp, plant-local time, shift, production-date, recurrence, and timezone semantics across Postgres, TypeScript, UI, reports, imports, and integrations.
---

# ERP Date and Time Semantics

Use this skill whenever work touches order, promise, due, required, ship, receive, or completion dates; planned job or operation times; production or labor timestamps; shifts and production calendars; audit events; recurring schedules; business-day calculations; or timezone conversion.

## Goal

Prevent silent ERP errors caused by treating calendar dates, absolute timestamps, plant-local times, and operational dates as interchangeable.

## Classify Every Temporal Value

Determine the value's business meaning before choosing its database type, API representation, TypeScript behavior, or UI formatting.

### Business Date

A calendar day with no time-of-day meaning, such as a customer due date, order date, requested ship date, or accounting/posting date.

- Prefer PostgreSQL `date`.
- Represent it through APIs as `YYYY-MM-DD`.
- Do not treat it as midnight UTC.
- Do not convert it through JavaScript `Date` merely to format it.

### Absolute Instant

A specific moment that occurred, such as `created_at`, a scan, labor clock event, machine event, receipt posting, or audit timestamp.

- Prefer PostgreSQL `timestamptz`.
- Persist the absolute instant.
- Convert it to the appropriate display timezone only at the UI/reporting boundary or for an explicit location-based calculation.
- Prefer trusted server or database timestamps for provenance fields instead of client-supplied timestamps.

### Wall-Clock Time

A local time whose meaning depends on a location, such as a 06:00 shift start, a 15:30 receiving cutoff, or a 22:00 maintenance window.

- Store the local time with its authoritative location or timezone context.
- Never assume the browser, database server, or Vercel runtime timezone is the plant timezone.
- Use IANA timezone identifiers such as `America/Detroit`, not fixed offsets such as `UTC-5`.

### Operational or Production Date

The business production day to which activity belongs. It may differ from the timestamp's calendar date; for example, a transaction at 02:00 Tuesday can belong to Monday's production day when third shift crosses midnight.

- Derive it from the applicable plant calendar and shift definition.
- Do not derive it with `timestamp.date()` or browser-local date logic.
- Persist the resolved operational date when it is an important reporting or accounting dimension and later configuration changes could alter historical meaning.

## Make the Owning Timezone Explicit

For each timezone-dependent rule, identify whether the plant/location, company, user display preference, or external system owns the time.

- Plant/location timezone normally owns manufacturing shifts and production-calendar logic.
- User timezone is for presentation unless the business rule explicitly says otherwise.
- Do not silently substitute browser, server, database, or UTC timezone for the timezone that owns the rule.

## Semantic Naming

Names must reveal temporal meaning. Prefer:

- `due_date`, `required_date`, and `production_date` for calendar or operational dates.
- `created_at` and `completed_at` for absolute instants.
- `shift_start_time` for local wall-clock time.
- `plant_timezone` for an IANA timezone identifier.

Avoid ambiguous names such as `date`, `time`, `timestamp`, `start`, or `end`.

Use these conventions where they match the business meaning:

- `*_date`: calendar or business date.
- `*_at`: absolute timestamp or instant.
- `*_time`: local wall-clock time.
- `*_timezone`: IANA timezone identifier.

Naming alone is insufficient: the database type and application behavior must agree with it.

## Database Representation

| Meaning | PostgreSQL representation |
|---|---|
| Business/calendar date | `date` |
| Absolute instant | `timestamptz` |
| Local wall-clock time | `time` plus location/timezone context |
| Production/operational date | `date` |
| Timezone identity | IANA timezone text or reference |

- Avoid `timestamp without time zone` unless the field intentionally represents an unresolved local date/time and stores the authoritative timezone separately.
- Do not store a business date as `timestamptz` merely because the application already uses JavaScript `Date`.

## JavaScript and TypeScript

### Date-Only Values

Do not use `new Date("2026-08-28")` as the normal representation of a business date. It creates an instant and can display as the previous or next day depending on timezone.

Keep date-only values as calendar values until a specific timezone and time are intentionally applied.

### Absolute Timestamps

- Parse timestamp values as instants.
- Preserve the instant through data operations.
- Convert only for display or explicit location-specific business calculations.

### Centralize Temporal Behavior

Do not hand-roll parsing, formatting, timezone conversion, or production-date logic in individual React components. Use shared ShopCore utilities for:

- Date-only formatting.
- Timestamp formatting.
- Plant-local conversion.
- Operational-date resolution.
- Shift boundaries.
- Business-day calculations.
- Recurrence calculations.

Use libraries already present in ShopCore. Do not introduce a date/time dependency solely to satisfy this skill.

## Shifts and Scheduling

Shift logic must explicitly define:

- Plant/location timezone.
- Local shift start and end.
- Which production date owns a cross-midnight shift.
- Daylight-saving-time behavior.
- Relevant exceptions and holidays.

Do not model shifts only as durations from UTC timestamps. A shift must remain anchored to its intended local wall-clock schedule when daylight-saving offsets change.

## Daylight-Saving Time

Treat DST as a business-rule edge case.

- Test spring-forward, when some local times do not exist.
- Test fall-back, when some local times occur twice.
- Resolve ambiguous or nonexistent local times according to an explicit ShopCore rule, not incidental JavaScript runtime behavior.
- Do not interchange durations between absolute instants with scheduled local shift hours; they are different concepts.

## Month-End and Recurrence

Do not use naive month arithmetic for business schedules. For cases such as January 31 plus one month, explicitly choose and test the business rule—for example, clamp to the last valid day, move to the next business day, or follow a fixed recurrence definition.

Test the relevant cases:

- January 29, 30, and 31.
- February 29.
- Thirty-day months.
- Month and year boundaries.
- Weekends and holidays when applicable.

## Historical Correctness

Do not recalculate historical business meaning using today's configuration when that could alter history. Changes to a plant timezone, shift definition, or production-day cutoff must not silently rewrite the meaning of earlier activity.

When a temporal classification is historically significant, persist the resolved values necessary to reproduce the original transaction or report.

## Imports, Exports, and Integrations

Temporal meaning must survive system boundaries.

For imports and APIs:

- Keep date-only fields date-only.
- Require timestamps to include an offset or unambiguous UTC representation.
- Include timezone or location context when a wall-clock value requires it.
- Reject ambiguous values instead of guessing.

For exports:

- Make the format and timezone explicit.
- Do not export plant-local timestamps as though they were UTC.
- Preserve date-only values without artificial time components.

## Testing

Select relevant cases from this list:

- User west of UTC and user east of UTC.
- Plant timezone different from user timezone.
- Midnight boundary.
- Cross-midnight third shift.
- Spring and fall DST transitions.
- Month-end, leap-day, and year-boundary recurrence.
- Date-only database-to-API-to-UI-to-database round trip.
- Changed shift or calendar configuration without altering historical records.

## Related Project Contracts

Follow all applicable project skills in addition to this one:

- Use `machine-shop-erp-guardrails` for the domain meaning and product scope of order, work-order, production, and completion dates.
- Use `erp-schema-evolution` when temporal fields, timezone configuration, database functions, views, or migrations change.
- Use `erp-data-integrity` when temporal rules affect posting, state transitions, or multi-record writes.
- Use `erp-data-scale` for temporal values crossing bulk import, export, report, or synchronization boundaries.
- Use `erp-extension-contracts` when API fields, report columns, or external temporal formats are stable contracts.

## Review Checklist

- Is the value a business date, absolute instant, wall-clock time, or operational date?
- Does the PostgreSQL type match that meaning?
- Which timezone owns the business rule?
- Could browser or server timezone alter the result?
- Could parsing or formatting shift a date by one day?
- Does a cross-midnight shift resolve to the correct production date?
- Are DST transitions handled deliberately?
- Is month-end recurrence behavior explicit?
- Will historical records retain their original meaning after calendar or shift changes?
- Are parsing, formatting, and timezone rules centralized?

## Product Boundary

This skill governs temporal semantics only. It does not authorize scheduling, capacity planning, maintenance, accounting, receiving, or other features excluded by `machine-shop-erp-guardrails`.

## Core Principle

A date is not automatically a timestamp, a timestamp is not automatically a business date, and a calendar date is not automatically a production date. Preserve the business meaning first, then choose the database type, API representation, conversion logic, and UI formatting that match it.
