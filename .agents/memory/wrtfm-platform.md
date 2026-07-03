---
name: WRTFM Platform Architecture
description: Key decisions and patterns for the WorldwideRapidTaskForMoney full-stack platform
---

## Auth pattern
- Backend: in-memory session Map (token → userId) in `artifacts/api-server/src/routes/auth.ts`; `getUserIdFromToken` exported for use in all routes
- Frontend: `setAuthTokenGetter` from `@workspace/api-client-react` wired on login/register in `useSession.login()`; token persisted to `localStorage` key `wrtfm_token`
- Role demo switcher in nav for dev; real auth goes through `/auth/login`

## Authorization enforcement
- Admin-only routes (verifications review, admin-summary): check `usersTable.role === "admin"` inline
- Ownership routes (assignments GET/submit): verify `assignment.workerId === userId` OR `user.role === "admin"`
- Dashboard routes: require auth (any authenticated user for activity/stats, admin for admin-summary)

**Why:** Code review caught auth bypass; fixes applied inline rather than via middleware to keep routes self-contained.

## Verification engine
- Located at `artifacts/api-server/src/lib/verification-engine.ts`
- Deterministic — randomness removed after code review flagged it as making payment outcomes non-auditable
- Decision thresholds: ≥0.85 = auto_approved, <0.45 = auto_rejected, else = manual_review

## Demo seed accounts
- admin@wrtfm.io / admin123 (role: admin)
- marie@agencedigitale.fr / client123 (role: client)
- john@brandco.com / client123 (role: client)
- kofi@gmail.com / worker123 (role: worker)
- fatima@yahoo.fr / worker123 (role: worker)
