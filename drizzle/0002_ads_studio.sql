CREATE TABLE "ad_insights_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"date" text NOT NULL,
	"spend_sen" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"purchases" integer DEFAULT 0 NOT NULL,
	"revenue_sen" integer DEFAULT 0 NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"attribution" text DEFAULT '7d_click,1d_view' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_slot_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"ad_id" text NOT NULL,
	"kind" text NOT NULL,
	"period_start" text,
	"status" text DEFAULT 'reserved' NOT NULL,
	"meta_ad_id" text,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"product_id" text,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"step" text DEFAULT 'product' NOT NULL,
	"objective" text,
	"strategy" jsonb,
	"audience" jsonb,
	"daily_budget_sen" integer,
	"original_budget_sen" integer,
	"target_cpp_sen" integer,
	"creative" jsonb,
	"creative_id" text,
	"destination_url" text,
	"meta_campaign_id" text,
	"meta_adset_id" text,
	"meta_creative_id" text,
	"meta_ad_id" text,
	"meta_effective_status" text,
	"meta_review" jsonb,
	"last_error" text,
	"duplicated_from_id" text,
	"published_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"playbook" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ads_subscriptions" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'ads_studio' NOT NULL,
	"status" text NOT NULL,
	"price_sen" integer NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"payment_status" text DEFAULT 'paid' NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ad_ref" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost_sen" integer;--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD CONSTRAINT "ad_insights_daily_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD CONSTRAINT "ad_insights_daily_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_slot_ledger" ADD CONSTRAINT "ad_slot_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_slot_ledger" ADD CONSTRAINT "ad_slot_ledger_ad_id_ads_id_fk" FOREIGN KEY ("ad_id") REFERENCES "public"."ads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_creative_id_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creatives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_settings" ADD CONSTRAINT "ads_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ads_subscriptions" ADD CONSTRAINT "ads_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_insights_uq" ON "ad_insights_daily" USING btree ("ad_id","date");--> statement-breakpoint
CREATE INDEX "ad_insights_ws_idx" ON "ad_insights_daily" USING btree ("workspace_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_slot_ad_uq" ON "ad_slot_ledger" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "ad_slot_ws_idx" ON "ad_slot_ledger" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "ads_ws_idx" ON "ads" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_meta_ad_uq" ON "ads" USING btree ("meta_ad_id");