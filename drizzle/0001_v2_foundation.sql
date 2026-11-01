ALTER TYPE "public"."storefront_status" ADD VALUE 'GENERATING';--> statement-breakpoint
ALTER TYPE "public"."storefront_status" ADD VALUE 'READY_FOR_REVIEW';--> statement-breakpoint
ALTER TYPE "public"."storefront_status" ADD VALUE 'FAILED';--> statement-breakpoint
CREATE TABLE "achievement_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"unlock_id" text NOT NULL,
	"presented_at" timestamp with time zone,
	"collected_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_notifications_unlock_id_unique" UNIQUE("unlock_id")
);
--> statement-breakpoint
CREATE TABLE "achievement_unlocks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"key" text NOT NULL,
	"level" integer NOT NULL,
	"source_type" text,
	"source_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"stage" text,
	"stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_profile_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"version" integer NOT NULL,
	"category" "business_category",
	"fields" jsonb NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"session_id" text,
	"url" text NOT NULL,
	"platform" text NOT NULL,
	"status" text NOT NULL,
	"http_status" integer,
	"title" text,
	"description" text,
	"extracted" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_inputs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"session_id" text NOT NULL,
	"kind" text NOT NULL,
	"asset_id" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"text" text,
	"text_edited" boolean DEFAULT false NOT NULL,
	"error" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "locale" SET DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN "estimated_cost_micros" integer;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD COLUMN "stage" text DEFAULT 'idea' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD COLUMN "idea_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD COLUMN "no_links" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD COLUMN "website_type" text;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD COLUMN "research_job_id" text;--> statement-breakpoint
ALTER TABLE "onboarding_sessions" ADD COLUMN "generation_job_id" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "collection" text;--> statement-breakpoint
ALTER TABLE "storefronts" ADD COLUMN "website_type" text;--> statement-breakpoint
ALTER TABLE "storefronts" ADD COLUMN "viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "storefronts" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "storefronts" ADD COLUMN "last_generation_job_id" text;--> statement-breakpoint
ALTER TABLE "achievement_notifications" ADD CONSTRAINT "achievement_notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_notifications" ADD CONSTRAINT "achievement_notifications_unlock_id_achievement_unlocks_id_fk" FOREIGN KEY ("unlock_id") REFERENCES "public"."achievement_unlocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_unlocks" ADD CONSTRAINT "achievement_unlocks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profile_versions" ADD CONSTRAINT "business_profile_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profile_versions" ADD CONSTRAINT "business_profile_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_sources" ADD CONSTRAINT "imported_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_sources" ADD CONSTRAINT "imported_sources_session_id_onboarding_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."onboarding_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_inputs" ADD CONSTRAINT "onboarding_inputs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_inputs" ADD CONSTRAINT "onboarding_inputs_session_id_onboarding_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."onboarding_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_inputs" ADD CONSTRAINT "onboarding_inputs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievement_ntf_ws_idx" ON "achievement_notifications" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_unlock_uq" ON "achievement_unlocks" USING btree ("workspace_id","key","level");--> statement-breakpoint
CREATE INDEX "achievement_ws_idx" ON "achievement_unlocks" USING btree ("workspace_id","unlocked_at");--> statement-breakpoint
CREATE INDEX "ai_jobs_ws_idx" ON "ai_jobs" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_active_uq" ON "ai_jobs" USING btree ("workspace_id","kind") WHERE status in ('QUEUED','PROCESSING','VALIDATING','RETRYING');--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_uq" ON "auth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_versions_uq" ON "business_profile_versions" USING btree ("workspace_id","version");--> statement-breakpoint
CREATE INDEX "imported_sources_session_idx" ON "imported_sources" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "onboarding_inputs_session_idx" ON "onboarding_inputs" USING btree ("session_id");