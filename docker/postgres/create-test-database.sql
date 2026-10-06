-- Runs once when the local Postgres volume is first created.
-- Pest uses this separate database so tests never touch development data.
CREATE DATABASE pilaph_test OWNER pilaph;
