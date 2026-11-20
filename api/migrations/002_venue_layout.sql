-- Optional drawing data for a venue's seat map (e.g. a stadium's rings of sectors).
-- Seats themselves stay in `seats`; this only says how to draw the sectors.
ALTER TABLE venues ADD COLUMN layout jsonb;
