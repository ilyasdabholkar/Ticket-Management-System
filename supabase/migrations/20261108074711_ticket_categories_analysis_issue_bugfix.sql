-- New ticket categories (2026-11-08): Analysis (ANL), Issue (ISS), Bug Fix (BUG).
-- Kept in its own migration because a new enum value cannot be used in the transaction that adds it.
alter type public.ticket_category add value if not exists 'analysis';
alter type public.ticket_category add value if not exists 'issue';
alter type public.ticket_category add value if not exists 'bug_fix';
