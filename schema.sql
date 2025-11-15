-- src/schema.sql
-- COMPLETE DATABASE SCHEMA

-- THE FIX: Drop all tables first for a clean slate during migration/testing.
DROP TABLE IF EXISTS public.note_reports CASCADE; -- NEW: For Phase 2 Community Curation
DROP TABLE IF EXISTS public.note_versions CASCADE; -- NEW: For Phase 2 Version Control
DROP TABLE IF EXISTS public.pending_registrations CASCADE; -- NEW: For Phase 1 Registration Flow
DROP TABLE IF EXISTS public.refresh_tokens CASCADE; -- NEW: For Phase 1 Remember Me
DROP TABLE IF EXISTS public.note_ratings CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.user_notifications CASCADE;
DROP TABLE IF EXISTS public.user_favourites CASCADE;
DROP TABLE IF EXISTS public.user_views CASCADE;
DROP TABLE IF EXISTS public.suggestions CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.otps CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.note_access_permissions CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.app_settings CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- === INITIAL SETUP ===
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- Auto-timestamp function (used by app_settings)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- === USERS & AUTHENTICATION TABLES (Phase 1 Fixes Incorporated) ===

CREATE TABLE public.users (
    id SERIAL PRIMARY KEY,
    name character varying(100) NOT NULL,
    age integer,
    username character varying(50) UNIQUE NOT NULL,
    email character varying(150) UNIQUE NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'user'::character varying,
    free_views integer DEFAULT 0,
    subscription_expiry timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp with time zone,
    is_verified boolean DEFAULT false,
    verification_token character varying(255),
    -- verification_token_expires TIMESTAMPTZ, -- Removed: Handled in PENDING_REGISTRATIONS or implicitly
    registration_ip character varying(45),
    mobile_number character varying(255) UNIQUE,
    is_mobile_verified boolean DEFAULT false NOT NULL,
    totp_secret character varying(255), -- For 2FA
    school_college character varying(255),
    bio text,
    badges text[] DEFAULT ARRAY[]::text[],
    reset_token TEXT,
    reset_token_expires TIMESTAMPTZ
);

-- PHASE 1 FIX: Pending Registration Table (temp storage until OTP verified)
CREATE TABLE public.pending_registrations (
    id BIGSERIAL PRIMARY KEY,
    name character varying(100) NOT NULL,
    email character varying(150) UNIQUE NOT NULL,
    password character varying(255) NOT NULL,
    username character varying(50) NOT NULL,
    mobile_number character varying(255),
    role character varying(20) DEFAULT 'user'::character varying,
    otp character varying(6) NOT NULL,
    otp_created_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);
CREATE INDEX idx_pending_registrations_email ON public.pending_registrations(email);


-- PHASE 1 FIX: Remember Me / Refresh Token Table
CREATE TABLE public.refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL, -- Hashed refresh token
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    revoked BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);


CREATE TABLE public.otps (
    email character varying(255) PRIMARY KEY,
    otp character varying(6) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.roles (
    id SERIAL PRIMARY KEY,
    name character varying(50) UNIQUE NOT NULL
);

CREATE TABLE public.user_roles (
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role_id integer NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- === NOTES & VERSIONING TABLES (Phase 2 Setup) ===

CREATE TABLE public.notes (
    id SERIAL PRIMARY KEY,
    user_id integer REFERENCES public.users(id) ON DELETE CASCADE,
    title character varying(255) NOT NULL,
    pdf_path text, -- Local path (legacy)
    file_url TEXT, -- Cloudinary secure URL (NEW)
    cloudinary_public_id TEXT, -- Cloudinary ID (NEW)
    view_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    material_type character varying(50) NOT NULL, -- learnify_material, personal_material, university_material
    institution_type character varying(100), -- School, College
    field character varying(100),
    course character varying(100),
    subject character varying(100),
    university_name character varying(150),
    approval_status character varying(20) DEFAULT 'pending'::character varying NOT NULL, -- pending, approved, rejected
    rejection_reason text,
    is_free boolean DEFAULT false,
    expiry_date date
);
CREATE INDEX idx_notes_user_id ON public.notes(user_id);
CREATE INDEX idx_notes_approval_status ON public.notes(approval_status);


-- PHASE 2: New table for Version Control
CREATE TABLE public.note_versions (
    id BIGSERIAL PRIMARY KEY,
    note_id INT NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    uploader_id INT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    title character varying(255) NOT NULL,
    file_url TEXT NOT NULL,
    cloudinary_public_id TEXT NOT NULL,
    version_hash character varying(64) UNIQUE, -- SHA-256 hash of the file
    upload_date TIMESTAMPTZ DEFAULT NOW(),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL, -- pending, approved, rejected
    review_reason TEXT,
    is_latest_approved BOOLEAN DEFAULT FALSE,
    -- Tracks the version this submission is replacing, if applicable
    previous_version_id BIGINT REFERENCES public.note_versions(id) ON DELETE SET NULL
);
CREATE INDEX idx_note_versions_note_id ON public.note_versions(note_id);
CREATE INDEX idx_note_versions_status ON public.note_versions(status);


-- === SUBSCRIPTION & PAYMENT TABLES ===

CREATE TABLE public.subscriptions (
    id SERIAL PRIMARY KEY,
    user_id integer REFERENCES public.users(id) ON DELETE CASCADE,
    plan character varying(50) NOT NULL,
    start_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    end_date timestamp with time zone,
    status character varying(20) DEFAULT 'active'::character varying
);

CREATE TABLE public.payments (
    id SERIAL PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    plan character varying(50) NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    gateway_txn_id character varying(255) UNIQUE NOT NULL,
    status character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- === INTERACTION & METADATA TABLES ===

CREATE TABLE public.note_ratings (
    id SERIAL PRIMARY KEY,
    note_id integer NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (note_id, user_id)
);

CREATE TABLE public.user_favourites (
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    note_id integer NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (user_id, note_id)
);

CREATE TABLE public.user_views (
    id SERIAL PRIMARY KEY,
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    note_id integer NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    viewed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, note_id)
);

-- PHASE 2: NEW table for Community Curation / Note Flagging
CREATE TABLE public.note_reports (
    id SERIAL PRIMARY KEY,
    note_id integer NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    reporter_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reason character varying(255) NOT NULL, -- Selected reason for flagging (e.g., 'Incomplete Info')
    comment text,
    status character varying(20) DEFAULT 'new'::character varying NOT NULL, -- new, reviewed, actioned
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE (note_id, reporter_id) -- Prevent spamming reports for the same note by the same user
);


CREATE TABLE public.suggestions (
    id SERIAL PRIMARY KEY,
    user_id integer REFERENCES public.users(id),
    message text NOT NULL,
    status character varying(50) DEFAULT 'new'::character varying,
    admin_reply text,
    created_at timestamp with time zone DEFAULT now(),
    replied_at timestamp with time zone
);

CREATE TABLE public.notifications (
    id SERIAL PRIMARY KEY,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.user_notifications (
    user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    notification_id integer NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    is_read boolean DEFAULT false,
    PRIMARY KEY (user_id, notification_id)
);

CREATE TABLE public.chat_messages (
    id SERIAL PRIMARY KEY,
    user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
    username character varying(50) NOT NULL,
    message_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.note_access_permissions (
    id SERIAL PRIMARY KEY,
    note_id integer NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
    owner_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    requester_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status character varying(20) NOT NULL DEFAULT 'pending',
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE (note_id, requester_id)
);

-- === APP SETTINGS ===

CREATE TABLE public.app_settings (
    id SERIAL PRIMARY KEY,
    setting_key character varying(50) UNIQUE NOT NULL,
    setting_value boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

-- Add initial setting
INSERT INTO app_settings (setting_key, setting_value) VALUES ('is_subscription_enabled', true) ON CONFLICT (setting_key) DO NOTHING;

-- Trigger to update app_settings updated_at timestamp
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON app_settings
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();


-- === INITIAL DATA INSERT (Example Admin) ===

-- Ensure pgcrypto extension is created for safe password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Insert a placeholder admin user. NOTE: The server.js already handles this on startup,
-- but having it here makes the schema runnable.
INSERT INTO users (name, email, password, role, is_verified, username, registration_ip, mobile_number, last_login)
VALUES (
    'Admin',
    'learnify887@gmail.com',
    '$2b$10$nQ6c1AxFx08dD2VCtGfofONa5nNaJndHozboblryTO16QiTaEAZzm', -- Hashed 'Msdhoni@18' or similar
    'admin',
    TRUE,
    'admin_default',
    '127.0.0.1',
    '9999999999',
    NOW()
) ON CONFLICT (email) DO NOTHING;