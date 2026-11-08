-- Phase 11 (part 1): two more final statuses.
--   completed : work finished without a production release (documents, analysis)
--   dropped   : work cancelled (optional reason)
-- Kept in a separate migration because a new enum value cannot be used in the transaction that adds it.
alter type public.ticket_status add value if not exists 'completed';
alter type public.ticket_status add value if not exists 'dropped';
