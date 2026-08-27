---
name: mobile-production-ux
description: Design and review this project's smartphone production-execution interface for fast, safe QR-driven transfer and scrap transactions. Use when changing routing-step QR entry, production quantity controls, mobile transaction feedback, touch behavior, or shop-floor screen layout. Do not apply these specialized rules to desktop administration or the customer portal.
---

# Mobile Production UX

Use this skill when building or modifying the smartphone production-execution interface for this project.

This skill is intentionally narrow. Follow the project's global React, security, Supabase, and verification skills for general implementation quality.

## Core Principle

The mobile production interface exists to capture shop-floor movement with as little friction as possible.

The target interaction is:

Scan QR → perform one action → done

For one-piece flow, the preferred interaction is:

Scan QR → tap +1 → done

Normal production transactions should require minimal thought, minimal typing, and minimal screen navigation.

## User Context

Assume:

- Operators are standing on a shop floor.
- Operators are using their own smartphones.
- Operators may be wearing gloves.
- Lighting may vary.
- The operator may be holding material or tools.
- The user should be able to complete common transactions one-handed.
- Fat-finger errors are a significant UX risk.
- Production transactions should generally take less than 10 seconds.

Do not design the mobile interface like a desktop ERP form.

## QR Entry

Each routing step on the physical traveler has its own QR code.

Scanning the QR code should open the production interface directly for:

- The correct Work Order
- The correct routing step

Do not require the operator to:

- Search for the Work Order
- Select the routing step
- Navigate through the main application
- Select a work center
- Select themselves as operator

The QR code should provide enough context for the application to resolve the correct production record securely.

## Primary Screen

The mobile routing screen should emphasize only the information needed to make the production transaction.

Prominently display:

- Work Order number
- Part number
- Current routing step
- Quantity currently available at this step
- Quantity already transferred forward
- Quantity scrapped at this step
- Default next routing step

Avoid displaying unnecessary Sales Order, customer, pricing, accounting, or administrative information.

## Primary Actions

Provide large touch-friendly actions for:

### +1 →

Moves one available piece to the next routing step.

This is the primary control for one-piece flow.

Requirements:

- One tap should perform the transaction when safe.
- Do not open another dialog for normal +1 transfers.
- Default the destination to the next routing step.
- Immediately update the displayed quantities.
- Provide concise success feedback.

Example:

Transferred 1 to Deburr

### Transfer Qty

Use for batch movement.

Requirements:

- Open a simple numeric-entry dialog or bottom sheet.
- Automatically focus the quantity field.
- Trigger the smartphone numeric keypad.
- Avoid free-text entry.
- Clearly show quantity currently available.
- Default destination to the next routing step.
- Require as few taps as practical.

Example flow:

Transfer Qty → 25 → Confirm

### Scrap Qty

Use for recording scrap at the current routing step.

Requirements:

- Open a numeric-entry dialog or bottom sheet.
- Trigger the numeric keypad.
- Clearly distinguish scrap from a normal transfer.
- Require an explicit confirmation before recording scrap.
- Show the resulting remaining quantity before confirmation when practical.

Example:

Scrap 2 pieces?

Confirm Scrap

Do not make scrap easy to trigger accidentally.

### Transfer All Available

May be provided when useful for batch production.

Requirements:

- Clearly display the amount that will transfer.
- Do not show this action when zero quantity is available.
- Default to the next routing step.

## Touch Targets

Optimize for smartphone use and fat-finger prevention.

Requirements:

- Use large touch targets.
- Maintain generous spacing between primary actions.
- Keep destructive actions physically separated from normal transfer actions.
- Avoid small icons as the only interaction target.
- Avoid tightly packed buttons.
- Do not require precise tapping.

Primary production controls should be usable comfortably with a thumb.

## Numeric Entry

Quantity entry should be optimized for speed.

Requirements:

- Use numeric input modes appropriate for mobile devices.
- Do not allow letters in quantity fields.
- Avoid decimal quantities unless explicitly required by a future feature.
- Default to whole-piece quantities.
- Select or clear the field appropriately so users can immediately type.
- Avoid quantity steppers that require many repeated taps for normal batch quantities.

For one-piece movement, use the dedicated +1 control rather than requiring numeric entry.

## Defaults

Prefer intelligent defaults over operator selection.

The system should automatically default:

- Current Work Order from the QR code
- Current routing step from the QR code
- Destination routing step to the next step in sequence
- Transfer quantity to 1 when using one-piece-flow controls

Do not ask the operator to select information the system already knows.

## Dropdowns

Avoid dropdowns in normal production execution.

Do not use dropdowns for:

- Work Order
- Routing step
- Operator
- Destination step when the next routing step is already known
- Transaction type when dedicated controls are clearer

Only introduce a dropdown when there is a legitimate exception that cannot be resolved automatically.

## Confirmation Behavior

Do not require confirmation for every normal production transaction.

Excessive confirmations make one-piece flow impractical.

Normal +1 transfer:

- No confirmation required when valid.

Batch transfer:

- A single confirmation is acceptable after numeric entry.

Scrap:

- Explicit confirmation required.

Potentially unusual or destructive actions:

- Confirmation may be required.

## Undo

Where practical, provide a short-lived Undo action immediately after a production transaction.

Example:

Transferred 1 to Deburr    Undo

Undo should:

- Reverse the specific event safely.
- Be available for only a short period.
- Not require navigating to another screen.

Do not build a complex historical editing interface solely for this feature.

## Quantity Safety

The interface must clearly communicate current quantities.

Prevent:

- Transferring more pieces than are currently available at a routing step.
- Scrapping more pieces than are currently available.
- Accidental negative quantities.
- Zero-quantity production events.

Overproduction is valid elsewhere in the production model and must not be treated as an error merely because total production exceeds Work Order quantity.

## Feedback

Every transaction should provide immediate visual feedback.

Examples:

- Transferred 1 to Deburr
- Transferred 25 to Inspection
- Scrapped 2 at CNC Mill

Do not use verbose success messages.

Errors should clearly explain what prevented the action.

Example:

Only 12 pieces are currently available.

## Loading Behavior

Production transactions should feel immediate.

When a transaction is processing:

- Prevent accidental duplicate submission.
- Show lightweight progress feedback.
- Do not block the entire screen unnecessarily.
- Restore the primary controls quickly after completion.

Design defensively for slow or inconsistent shop-floor connectivity.

## Screen Layout

Prioritize vertical smartphone layouts.

Recommended information hierarchy:

1. WO number and Part number
2. Routing step
3. Current quantity
4. Next routing step
5. +1 action
6. Batch Transfer
7. Scrap

Administrative details belong elsewhere.

Do not reproduce the entire physical traveler on the smartphone screen.

The traveler communicates the work.

The mobile interface records the flow.

## Navigation

After a successful transaction, avoid unnecessary navigation.

For one-piece flow:

- Keep the user on the same routing-step screen so another +1 transaction can be performed immediately if needed.

Provide an obvious way to close or leave the screen, but do not make navigation part of the normal transaction.

## Accessibility and Readability

Use:

- High contrast
- Large readable text
- Clear quantity labels
- Plain language
- Obvious action labels

Avoid:

- Tiny secondary text
- Ambiguous icons
- Color as the only indicator of meaning
- Excessive animation
- Dense layouts

## Do Not Add

Do not add the following to the mobile production screen unless explicitly requested:

- Production scheduling
- Employee selection
- Labor tracking
- Machine selection
- Work-center selection
- OEE
- Setup timers
- Performance metrics
- Production dashboards
- Customer information
- Pricing
- Inventory transactions
- Long work-instruction forms
- Full traveler replacement

Keep this interface narrowly focused on production movement and scrap capture.
