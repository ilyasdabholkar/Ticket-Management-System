# Verification scripts

Focused, repeatable SQL checks for RLS, locking and business rules (not an automated test suite).
Each script impersonates `authenticated` users via `set local role` / `request.jwt.claims` inside a
transaction that is rolled back. Added from Phase 2 onward.
