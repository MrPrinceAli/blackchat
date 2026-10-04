-- PRD §5.1. Tidak ada kolom IP, user agent, atau waktu login.
CREATE TABLE accounts (
  username    TEXT PRIMARY KEY,      -- ^[a-z0-9_]{3,20}$
  user_id     TEXT NOT NULL UNIQUE,
  ed_pk       TEXT NOT NULL,
  x_pk        TEXT NOT NULL,
  x_pk_sig    TEXT NOT NULL,
  salt        TEXT NOT NULL,
  auth_hash   TEXT NOT NULL,
  vault       TEXT NOT NULL,         -- ciphertext
  contacts    TEXT,                  -- ciphertext
  seq         INTEGER NOT NULL,      -- anti-replay untuk update bertanda tangan
  expires_at  INTEGER NOT NULL       -- epoch ms = waktu register + 72 jam
) STRICT;
CREATE INDEX accounts_expires ON accounts(expires_at);
