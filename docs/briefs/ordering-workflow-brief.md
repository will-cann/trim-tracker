### Cannabis Ordering Workflow

- Does all the cannabis ordering across 11 stores
- Source of truth: Dutchie (POS) — everything flows in and out through there
  - Headset (SaaS, POS-integrated) generates reorder reports but is unreliable if vendor/category data is inconsistent
  - Metric data exists but costs are sometimes wrong
- Reorder quantities = blend of sales velocity + subjective judgment
  - Example: same strain at 29% vs. 27% THC can sell differently despite being a “like-for-like” reorder
- First-party ordering (own grows) handled by Brian’s supply chain team
- Third-party ordering handled personally via Excel spreadsheets
  - Prefers Excel over platforms like Leaflink or Apex — those become bottlenecks
  - Key advantage: can scan a column, see total units across all stores, and quickly calculate case quantities (e.g. 32 units/case)
  - Platforms obscure totals — have to manually count through a cart

### Pain Points

- Disparate vendor menus arrive in inconsistent Excel formats (merged cells, logos pasted over cells, no standard structure)
  - Business Central standardization effort underway to fix this
- Headset reorder reports can over-recommend — need to sanity-check against total velocity
  - Example: report says 2 cases of Florida Kush + 3 cases of Cushman, but only 2.5 cases sold total
- Placing orders: sends finalized order back to reps who manually enter it — reps say this takes hours
- Business Central’s OCR for purchase orders not yet proven out; skeptical it’ll deliver

### Opportunity / Product Fit

- Core need: one unified interface to view all available vendor menus, plan order quantities, then auto-submit orders to reps (or directly)
  - Draft emails to reps = immediate time-saver
  - Longer term: parse inbound menu emails automatically and present in a sortable/filterable table
- Neurocann interface demoed — Wgparkhurst1 building this; 250 commits in ~2 weeks

### Next Steps

- Wgparkhurst1
  - Send website link for Neurocann (currently hosted under Trim Tracker domain — Neurocann domain recently taken down by Brian)
  - Code up ~3 new features before tomorrow’s call
  - Follow up tomorrow (call scheduled at 3 PM Eastern)
