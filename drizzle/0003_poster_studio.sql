CREATE TABLE "poster_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"product_id" text,
	"status" text DEFAULT 'brief' NOT NULL,
	"settings" jsonb NOT NULL,
	"intel" jsonb NOT NULL,
	"brief" jsonb NOT NULL,
	"brief_by" text NOT NULL,
	"generation_id" text,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poster_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"poster_id" text NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"text_mode" text DEFAULT 'overlay' NOT NULL,
	"status" text NOT NULL,
	"art_asset_id" text,
	"image_asset_id" text,
	"copy" jsonb NOT NULL,
	"style" text NOT NULL,
	"ratio" text NOT NULL,
	"prompt" text,
	"provider" text,
	"model" text,
	"credits" integer DEFAULT 0 NOT NULL,
	"generation_id" text,
	"error" text,
	"request_key" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "posters" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"project_id" text NOT NULL,
	"product_id" text,
	"idx" integer NOT NULL,
	"theme" text NOT NULL,
	"angle" text NOT NULL,
	"style" text NOT NULL,
	"ratio" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"copy" jsonb NOT NULL,
	"prompt" text NOT NULL,
	"art_prompt" text NOT NULL,
	"prompt_edited" boolean DEFAULT false NOT NULL,
	"current_version_id" text,
	"ad_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "poster_projects" ADD CONSTRAINT "poster_projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_projects" ADD CONSTRAINT "poster_projects_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_projects" ADD CONSTRAINT "poster_projects_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_projects" ADD CONSTRAINT "poster_projects_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_projects" ADD CONSTRAINT "poster_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_versions" ADD CONSTRAINT "poster_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_versions" ADD CONSTRAINT "poster_versions_poster_id_posters_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."posters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_versions" ADD CONSTRAINT "poster_versions_art_asset_id_assets_id_fk" FOREIGN KEY ("art_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_versions" ADD CONSTRAINT "poster_versions_image_asset_id_assets_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_versions" ADD CONSTRAINT "poster_versions_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poster_versions" ADD CONSTRAINT "poster_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posters" ADD CONSTRAINT "posters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posters" ADD CONSTRAINT "posters_project_id_poster_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."poster_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posters" ADD CONSTRAINT "posters_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posters" ADD CONSTRAINT "posters_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "poster_projects_ws_idx" ON "poster_projects" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "poster_versions_uq" ON "poster_versions" USING btree ("poster_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "poster_versions_key_uq" ON "poster_versions" USING btree ("workspace_id","request_key");--> statement-breakpoint
CREATE INDEX "poster_versions_poster_idx" ON "poster_versions" USING btree ("poster_id");--> statement-breakpoint
CREATE INDEX "posters_ws_idx" ON "posters" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "posters_project_idx" ON "posters" USING btree ("project_id");