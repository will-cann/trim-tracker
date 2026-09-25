# Reports & Analytics

**Elevator pitch:** See weekly trim labor productivity and cost-per-pound — with a natural-language report builder built but not yet exposed in nav.

## Who it's for

Department managers and above. Labor cost metrics: admin/owner.

**Nav:** Reports · Min role: department_manager+

## Problem

Managers export trim sessions to Excel to answer basic questions: grams per hour, pounds flowered, labor cost per pound.

## Value

Trim performance metrics live in the same app that captures the weights. Wage slider turns hours into estimated labor $/lb for executives.

## Key capabilities (shipped — visible UI)

- Trim Performance dashboard (default Reports view)
- Week navigation
- Metrics: trim labor hours, avg g/hour, flower lbs, trim lbs
- Throughput chart, trimmer stats table, trimmer performance chart
- Executive wage input → estimated labor cost and $/lb; cost ratio chart
- Data from completed trim sessions

## Built but not user-facing yet

Natural-language Reports Builder (prompt → Claude → SQL-safe report spec → charts; save/pin/reload) exists in code. The shipped Reports screen hardcodes the trim-performance tab — do not demo NL builder unless product has enabled the tab for that environment.

## Demo script

1. Flip to a week with completed trim sessions → show g/hour and lbs.
2. As admin, adjust hourly wage → watch labor $/lb update.
3. Drill trimmer table / performance chart for individual variance.
4. If asked about custom reports: "NL builder is on the roadmap for the Reports nav; trim performance ships today."

## Talking points

- "The numbers come from the same sessions your floor just submitted."
- "Cost per pound is a management lever, not a payroll export."
- "Start with trim labor — that's where most facilities bleed time."

## Differentiators

- Ops capture and labor analytics in one product
- (When exposed) NL → guarded SQL report compiler over cultivation schema

## Do not claim

- That natural-language custom reports are available in the current Reports UI
- Full cross-module analytics suite as the default view (trim-centric today)
- Payroll / HRIS integration (wage is a client-side estimate)

## Related modules

[Trim Sessions](./trim-sessions.md) · [Team & Roles](./team-roles.md)
