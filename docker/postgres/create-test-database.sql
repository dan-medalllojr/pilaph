-- Runs once when the local Postgres volume is first created.
-- Pest uses this separate database so tests never touch development data.
CREATE DATABASE pilaph_test OWNER pilaph;
-- The production image run by docker compose (`app`) has its own database,
-- so its queue worker never takes jobs from `composer run dev`.
CREATE DATABASE pilaph_docker OWNER pilaph;
