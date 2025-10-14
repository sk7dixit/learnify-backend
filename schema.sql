--
-- PostgreSQL database dump
--

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

-- Drop existing tables with CASCADE to handle dependencies
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.user_notifications CASCADE;
DROP TABLE IF EXISTS public.user_favourites CASCADE;
DROP TABLE IF EXISTS public.suggestions CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.otps CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.note_ratings CASCADE;
DROP TABLE IF EXISTS public.note_access_permissions CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.app_settings CASCADE;
DROP TABLE IF EXISTS public.user_views CASCADE;
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

SET default_tablespace = '';
SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public;
--
CREATE TABLE public.app_settings (
    id integer NOT NULL,
    setting_key character varying(50) NOT NULL,
    setting_value boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

--
-- Name: app_settings_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.app_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;

--
-- Name: chat_messages; Type: TABLE; Schema: public;
--
CREATE TABLE public.chat_messages (
    id integer NOT NULL,
    user_id integer,
    username character varying(50) NOT NULL,
    message_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.chat_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;

--
-- Name: note_access_permissions; Type: TABLE; Schema: public;
--
CREATE TABLE public.note_access_permissions (
    id integer NOT NULL,
    note_id integer,
    owner_id integer,
    requester_id integer,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: note_access_permissions_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.note_access_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.note_access_permissions_id_seq OWNED BY public.note_access_permissions.id;

--
-- Name: note_ratings; Type: TABLE; Schema: public;
--
CREATE TABLE public.note_ratings (
    id integer NOT NULL,
    note_id integer NOT NULL,
    user_id integer NOT NULL,
    rating integer NOT NULL,
    review_text text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT note_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

--
-- Name: note_ratings_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.note_ratings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.note_ratings_id_seq OWNED BY public.note_ratings.id;

--
-- Name: notes; Type: TABLE; Schema: public;
--
CREATE TABLE public.notes (
    id integer NOT NULL,
    user_id integer,
    title character varying(255) NOT NULL,
    pdf_path text NOT NULL,
    view_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    category character varying(50),
    stream character varying(100),
    course character varying(100),
    discipline character varying(100),
    is_free boolean DEFAULT false,
    expiry_date date,
    material_type character varying(50) NOT NULL,
    institution_type character varying(100),
    field character varying(100),
    subject character varying(100),
    university_name character varying(150),
    approval_status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    rejection_reason text
);

--
-- Name: notes_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.notes_id_seq OWNED BY public.notes.id;

--
-- Name: notifications; Type: TABLE; Schema: public;
--
CREATE TABLE public.notifications (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;

--
-- Name: otps; Type: TABLE; Schema: public;
--
CREATE TABLE public.otps (
    email character varying(255) NOT NULL,
    otp character varying(6) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: payments; Type: TABLE; Schema: public;
--
CREATE TABLE public.payments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    plan character varying(50) NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    gateway_txn_id character varying(255) NOT NULL,
    status character varying(50) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;

--
-- Name: roles; Type: TABLE; Schema: public;
--
CREATE TABLE public.roles (
    id integer NOT NULL,
    name character varying(50) NOT NULL
);

--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;

--
-- Name: subscriptions; Type: TABLE; Schema: public;
--
CREATE TABLE public.subscriptions (
    id integer NOT NULL,
    user_id integer,
    plan character varying(50) NOT NULL,
    start_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    end_date timestamp without time zone,
    status character varying(20) DEFAULT 'active'::character varying
);

--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.subscriptions_id_seq OWNED BY public.subscriptions.id;

--
-- Name: suggestions; Type: TABLE; Schema: public;
--
CREATE TABLE public.suggestions (
    id integer NOT NULL,
    user_id integer,
    message text NOT NULL,
    status character varying(50) DEFAULT 'new'::character varying,
    admin_reply text,
    created_at timestamp with time zone DEFAULT now(),
    replied_at timestamp with time zone
);

--
-- Name: suggestions_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.suggestions_id_seq OWNED BY public.suggestions.id;

--
-- Name: user_favourites; Type: TABLE; Schema: public;
--
CREATE TABLE public.user_favourites (
    user_id integer NOT NULL,
    note_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

--
-- Name: user_notifications; Type: TABLE; Schema: public;
--
CREATE TABLE public.user_notifications (
    user_id integer NOT NULL,
    notification_id integer NOT NULL,
    is_read boolean DEFAULT false
);

--
-- Name: user_roles; Type: TABLE; Schema: public;
--
CREATE TABLE public.user_roles (
    user_id integer NOT NULL,
    role_id integer NOT NULL
);

--
-- Name: user_views; Type: TABLE; Schema: public;
--
CREATE TABLE public.user_views (
    id integer NOT NULL,
    user_id integer NOT NULL,
    note_id integer NOT NULL,
    viewed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

--
-- Name: user_views_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.user_views_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.user_views_id_seq OWNED BY public.user_views.id;

--
-- Name: users; Type: TABLE; Schema: public;
--
CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    age integer,
    email character varying(150) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'user'::character varying,
    free_views integer DEFAULT 0,
    subscription_expiry timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_verified boolean DEFAULT false,
    verification_token character varying(255),
    registration_ip character varying(45),
    mobile_number character varying(255),
    is_mobile_verified boolean DEFAULT false NOT NULL,
    totp_secret character varying(255),
    school_college character varying(255),
    bio text,
    last_login timestamp with time zone,
    username character varying(50) NOT NULL,
    badges text[] DEFAULT ARRAY[]::text[]
);

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public;
--
CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

--
-- Name: app_settings id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_id_seq'::regclass);

--
-- Name: chat_messages id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);

--
-- Name: note_access_permissions id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.note_access_permissions ALTER COLUMN id SET DEFAULT nextval('public.note_access_permissions_id_seq'::regclass);

--
-- Name: note_ratings id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.note_ratings ALTER COLUMN id SET DEFAULT nextval('public.note_ratings_id_seq'::regclass);

--
-- Name: notes id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.notes ALTER COLUMN id SET DEFAULT nextval('public.notes_id_seq'::regclass);

--
-- Name: notifications id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);

--
-- Name: payments id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);

--
-- Name: roles id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);

--
-- Name: subscriptions id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);

--
-- Name: suggestions id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.suggestions ALTER COLUMN id SET DEFAULT nextval('public.suggestions_id_seq'::regclass);

--
-- Name: user_views id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.user_views ALTER COLUMN id SET DEFAULT nextval('public.user_views_id_seq'::regclass);

--
-- Name: users id; Type: DEFAULT; Schema: public;
--
ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);

--
-- Name: app_settings app_settings_setting_key_key; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_setting_key_key UNIQUE (setting_key);

--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);

--
-- Name: note_access_permissions note_access_permissions_note_id_requester_id_key; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.note_access_permissions
    ADD CONSTRAINT note_access_permissions_note_id_requester_id_key UNIQUE (note_id, requester_id);

--
-- Name: note_access_permissions note_access_permissions_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.note_access_permissions
    ADD CONSTRAINT note_access_permissions_pkey PRIMARY KEY (id);

--
-- Name: note_ratings note_ratings_note_id_user_id_key; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.note_ratings
    ADD CONSTRAINT note_ratings_note_id_user_id_key UNIQUE (note_id, user_id);

--
-- Name: note_ratings note_ratings_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.note_ratings
    ADD CONSTRAINT note_ratings_pkey PRIMARY KEY (id);

--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);

--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

--
-- Name: otps otps_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_pkey PRIMARY KEY (email);

--
-- Name: payments payments_gateway_txn_id_key; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_gateway_txn_id_key UNIQUE (gateway_txn_id);

--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);

--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);

--
-- Name: suggestions suggestions_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.suggestions
    ADD CONSTRAINT suggestions_pkey PRIMARY KEY (id);

--
-- Name: user_favourites user_favourites_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_favourites
    ADD CONSTRAINT user_favourites_pkey PRIMARY KEY (user_id, note_id);

--
-- Name: user_notifications user_notifications_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_pkey PRIMARY KEY (user_id, notification_id);

--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);

--
-- Name: user_views user_views_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_views
    ADD CONSTRAINT user_views_pkey PRIMARY KEY (id);

--
-- Name: user_views user_views_user_id_note_id_key; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_views
    ADD CONSTRAINT user_views_user_id_note_id_key UNIQUE (user_id, note_id);

--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

--
-- Name: users users_mobile_number_key; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_mobile_number_key UNIQUE (mobile_number);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);

--
-- Name: idx_notes_approval_status; Type: INDEX; Schema: public;
--
CREATE INDEX idx_notes_approval_status ON public.notes USING btree (approval_status);

--
-- Name: idx_notes_field; Type: INDEX; Schema: public;
--
CREATE INDEX idx_notes_field ON public.notes USING btree (field);

--
-- Name: idx_notes_institution_type; Type: INDEX; Schema: public;
--
CREATE INDEX idx_notes_institution_type ON public.notes USING btree (institution_type);

--
-- Name: idx_notes_material_type; Type: INDEX; Schema: public;
--
CREATE INDEX idx_notes_material_type ON public.notes USING btree (material_type);

--
-- Name: idx_notes_university_name; Type: INDEX; Schema: public;
--
CREATE INDEX idx_notes_university_name ON public.notes USING btree (university_name);

--
-- Name: idx_notes_user_id; Type: INDEX; Schema: public;
--
CREATE INDEX idx_notes_user_id ON public.notes USING btree (user_id);

--
-- Name: idx_subscriptions_end_date; Type: INDEX; Schema: public;
--
CREATE INDEX idx_subscriptions_end_date ON public.subscriptions USING btree (end_date);

--
-- Name: idx_subscriptions_user_id; Type: INDEX; Schema: public;
--
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);

--
-- Name: chat_messages chat_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: note_access_permissions note_access_permissions_note_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.note_access_permissions
    ADD CONSTRAINT note_access_permissions_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;

--
-- Name: note_access_permissions note_access_permissions_owner_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.note_access_permissions
    ADD CONSTRAINT note_access_permissions_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: note_access_permissions note_access_permissions_requester_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.note_access_permissions
    ADD CONSTRAINT note_access_permissions_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: note_ratings note_ratings_note_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.note_ratings
    ADD CONSTRAINT note_ratings_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;

--
-- Name: note_ratings note_ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.note_ratings
    ADD CONSTRAINT note_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: notes notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: suggestions suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.suggestions
    ADD CONSTRAINT suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);

--
-- Name: user_favourites user_favourites_note_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_favourites
    ADD CONSTRAINT user_favourites_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;

--
-- Name: user_favourites user_favourites_user_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_favourites
    ADD CONSTRAINT user_favourites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_notifications user_notifications_notification_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;

--
-- Name: user_notifications user_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_notifications
    ADD CONSTRAINT user_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;

--
-- Name: user_views user_views_note_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_views
    ADD CONSTRAINT user_views_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;

--
-- Name: user_views user_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public;
--
ALTER TABLE ONLY public.user_views
    ADD CONSTRAINT user_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--

