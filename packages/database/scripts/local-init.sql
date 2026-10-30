-- Local development credentials only. Never reuse for a hosted service.
CREATE ROLE mamalik_content LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD 'local-content-only';
CREATE DATABASE mamalik_content OWNER mamalik_content;
