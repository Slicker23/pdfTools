CREATE TYPE "public"."job_status" AS ENUM('pending', 'processing', 'completed', 'failed');
CREATE TYPE "public"."job_type" AS ENUM('pdf_to_word', 'pdf_to_excel', 'pdf_to_ppt', 'word_to_pdf', 'ocr', 'batch', 'redaction');
CREATE TYPE "public"."team_role" AS ENUM('owner', 'admin', 'member');

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "name" text,
  "image" text,
  "google_id" text UNIQUE,
  "paid" boolean DEFAULT false NOT NULL,
  "documents_processed" integer DEFAULT 0 NOT NULL,
  "server_jobs_today" integer DEFAULT 0 NOT NULL,
  "ai_credits_used" integer DEFAULT 0 NOT NULL,
  "ai_credits_reset_at" timestamp,
  "stripe_customer_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "stripe_session_id" text NOT NULL UNIQUE,
  "stripe_payment_intent_id" text,
  "amount" integer NOT NULL,
  "currency" text DEFAULT 'eur' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tool" text NOT NULL,
  "file_name" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "type" "job_type" NOT NULL,
  "status" "job_status" DEFAULT 'pending' NOT NULL,
  "input_key" text,
  "output_key" text,
  "error" text,
  "metadata" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

CREATE TABLE IF NOT EXISTS "teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" "team_role" DEFAULT 'member' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "cloud_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" text NOT NULL,
  "access_token" text NOT NULL,
  "refresh_token" text,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
