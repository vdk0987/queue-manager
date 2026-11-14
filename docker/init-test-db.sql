-- Creates the isolated database used by the API integration tests.
-- Runs only when the Postgres volume is initialised for the first time.
SELECT 'CREATE DATABASE queuepilot_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'queuepilot_test')\gexec
