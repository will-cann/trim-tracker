# Team & Roles

**Elevator pitch:** Invite the crew, assign roles and departments, and gate modules by who should see them.

## Who it's for

Admins and directors configuring access. Every user experiences the result in the sidebar.

**Nav:** Team (and Team section in Settings)

## Problem

Facility software either shows everyone everything or builds brittle custom permissions. Trim techs shouldn't see buyer POs; buyers shouldn't live in the plant map.

## Value

Simple role ladder plus department scoping. Sidebar hides what you shouldn't touch. Trimmer profiles double as roster for the trim floor.

## Key capabilities (shipped)

- Roles: admin | director | department_manager | technician
- Departments: cultivation, extraction, post_harvest, trim, procurement, lab, compliance
- Auth0 invites (email + copy invite URL)
- Trimmer profiles as team roster dual-use
- Sidebar visibility by department and minimum role
  - Ordering: procurement + manager+
  - Reports: manager+
  - Admins/directors see everything

## Demo script

1. As admin, invite a technician scoped to trim.
2. Log in (or show) that technician sidebar — no Ordering / Reports.
3. Show a procurement manager seeing Ordering.

## Talking points

- "Access follows how cannabis facilities actually organize — by department."
- "Managers see their lane; directors see the building."

## Differentiators

- Department-aware module gating without enterprise IAM complexity
- Same team model feeds trimmer assignment on the floor

## Do not claim

- Full SSO / SCIM / HRIS sync
- Fine-grained field-level permissions
- That invite email always sends without SendGrid configured (stubs in local/dev)

## Related modules

[Trim Sessions](./trim-sessions.md) · [Ordering & Procurement](./ordering-procurement.md) · [Reports & Analytics](./reports-analytics.md) · [Settings](./settings.md)
