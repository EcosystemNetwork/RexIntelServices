-- 0026_intel_cited_event_kind
--
-- Adds `intel_cited` to the contribution_event_kind enum. Awarded (+1) when
-- a later approved intel submission references an address that an earlier
-- approved submission (by a different submitter) was first to flag. Closes
-- the loop on the address-graph moat: the original tipster keeps earning
-- as their address attributions compound through new investigations.

ALTER TYPE "contribution_event_kind" ADD VALUE IF NOT EXISTS 'intel_cited';
