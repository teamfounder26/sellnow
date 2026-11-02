ALTER TYPE "public"."fulfillment_status" ADD VALUE 'READY_TO_SHIP';--> statement-breakpoint
ALTER TYPE "public"."fulfillment_status" ADD VALUE 'BOOKING_PENDING';--> statement-breakpoint
ALTER TYPE "public"."fulfillment_status" ADD VALUE 'SHIPPED';--> statement-breakpoint
ALTER TYPE "public"."fulfillment_status" ADD VALUE 'DELIVERED';--> statement-breakpoint
ALTER TYPE "public"."fulfillment_status" ADD VALUE 'RETURNED';--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cod_remittances" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"order_id" text NOT NULL,
	"amount_sen" integer NOT NULL,
	"status" text NOT NULL,
	"reference" text,
	"recorded_by" text,
	"remitted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'NOT_CONNECTED' NOT NULL,
	"credentials_ciphertext" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courier_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disbursement_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"settlement_id" text NOT NULL,
	"attempt_no" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text,
	"status" text NOT NULL,
	"provider_status" text,
	"response" jsonb,
	"error" text,
	"initiated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"amount_sen" integer,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"txn_id" text NOT NULL,
	"workspace_id" text,
	"account" text NOT NULL,
	"amount_sen" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_transfer_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"order_id" text NOT NULL,
	"proof_asset_id" text,
	"payer_reference" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"order_id" text NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"amount_sen" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"order_id" text NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"bill_id" text,
	"amount_sen" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_status" text,
	"processing_fee_sen" integer DEFAULT 0 NOT NULL,
	"platform_fee_sen" integer DEFAULT 0 NOT NULL,
	"refunded_sen" integer DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"reconcile_status" text DEFAULT 'unreconciled' NOT NULL,
	"reconciled_at" timestamp with time zone,
	"reconcile_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"result" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_bank_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"bank_code" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_number_ciphertext" text NOT NULL,
	"account_last4" text NOT NULL,
	"holder_name" text NOT NULL,
	"account_type" text DEFAULT 'personal' NOT NULL,
	"status" text DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_by" text,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_payment_accounts" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'NOT_ACTIVATED' NOT NULL,
	"business_type" text,
	"legal_name" text,
	"registration_number" text,
	"id_number_ciphertext" text,
	"id_number_last4" text,
	"contact_phone" text,
	"terms_accepted_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"settlement_date" text NOT NULL,
	"environment" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'CALCULATED' NOT NULL,
	"tenant_count" integer DEFAULT 0 NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"gross_sen" integer DEFAULT 0 NOT NULL,
	"fees_sen" integer DEFAULT 0 NOT NULL,
	"adjustments_sen" integer DEFAULT 0 NOT NULL,
	"net_sen" integer DEFAULT 0 NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"second_approved_by" text,
	"second_approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_holds" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" text,
	"released_by" text,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_items" (
	"id" text PRIMARY KEY NOT NULL,
	"settlement_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"gross_sen" integer NOT NULL,
	"processing_fee_sen" integer DEFAULT 0 NOT NULL,
	"platform_fee_sen" integer DEFAULT 0 NOT NULL,
	"net_sen" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'CALCULATED' NOT NULL,
	"hold_reason" text,
	"gross_sen" integer NOT NULL,
	"processing_fee_sen" integer NOT NULL,
	"platform_fee_sen" integer NOT NULL,
	"refunds_sen" integer NOT NULL,
	"adjustments_sen" integer NOT NULL,
	"net_sen" integer NOT NULL,
	"bank_account_id" text,
	"bank_snapshot" jsonb,
	"scheduled_for" text NOT NULL,
	"completed_at" timestamp with time zone,
	"provider_ref" text,
	"provider_status" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"shipment_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"status" text NOT NULL,
	"provider_status" text,
	"description" text,
	"source" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"order_id" text NOT NULL,
	"connection_id" text,
	"provider" text NOT NULL,
	"status" text DEFAULT 'BOOKING_PENDING' NOT NULL,
	"provider_status" text,
	"service_code" text,
	"service_name" text,
	"courier_name" text,
	"courier_cost_sen" integer,
	"cod_amount_sen" integer DEFAULT 0 NOT NULL,
	"weight_grams" integer,
	"external_order_id" text,
	"tracking_number" text,
	"awb_asset_id" text,
	"bulk_job_id" text,
	"last_error" text,
	"provider_response" jsonb,
	"booked_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_rate_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"zone" text NOT NULL,
	"delivery_type" text NOT NULL,
	"min_grams" integer NOT NULL,
	"max_grams" integer NOT NULL,
	"fee_sen" integer NOT NULL,
	"courier" text,
	"priority" integer DEFAULT 100 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"shipper" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_zones" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"states" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"postcode_ranges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"monthly_sen" integer NOT NULL,
	"annual_sen" integer,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"monthly_credits" integer NOT NULL,
	"transaction_fee_bps" integer DEFAULT 0 NOT NULL,
	"entitlements" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"workspace_id" text,
	"message" text NOT NULL,
	"link" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_feature_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_subscriptions" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"price_sen" integer NOT NULL,
	"current_period_end" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"scheduled_plan_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_status" text DEFAULT 'NEW' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" text DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "settlement_status" text DEFAULT 'NOT_ELIGIBLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cod_status" text DEFAULT 'NOT_APPLICABLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cod_fee_sen" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "weight_grams" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_rule_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "courier_cost_sen" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_remittances" ADD CONSTRAINT "cod_remittances_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_remittances" ADD CONSTRAINT "cod_remittances_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cod_remittances" ADD CONSTRAINT "cod_remittances_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courier_connections" ADD CONSTRAINT "courier_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disbursement_attempts" ADD CONSTRAINT "disbursement_attempts_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disbursement_attempts" ADD CONSTRAINT "disbursement_attempts_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_transfer_verifications" ADD CONSTRAINT "manual_transfer_verifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_transfer_verifications" ADD CONSTRAINT "manual_transfer_verifications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_transfer_verifications" ADD CONSTRAINT "manual_transfer_verifications_proof_asset_id_assets_id_fk" FOREIGN KEY ("proof_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_transfer_verifications" ADD CONSTRAINT "manual_transfer_verifications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_settings" ADD CONSTRAINT "order_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_settings" ADD CONSTRAINT "order_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_adjustments" ADD CONSTRAINT "payment_adjustments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_bank_accounts" ADD CONSTRAINT "seller_bank_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_bank_accounts" ADD CONSTRAINT "seller_bank_accounts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_bank_accounts" ADD CONSTRAINT "seller_bank_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_payment_accounts" ADD CONSTRAINT "seller_payment_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_payment_accounts" ADD CONSTRAINT "seller_payment_accounts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_batches" ADD CONSTRAINT "settlement_batches_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_batches" ADD CONSTRAINT "settlement_batches_second_approved_by_users_id_fk" FOREIGN KEY ("second_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_holds" ADD CONSTRAINT "settlement_holds_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_holds" ADD CONSTRAINT "settlement_holds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_holds" ADD CONSTRAINT "settlement_holds_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_batch_id_settlement_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."settlement_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_bank_account_id_seller_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."seller_bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_connection_id_courier_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."courier_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_awb_asset_id_assets_id_fk" FOREIGN KEY ("awb_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_rate_rules" ADD CONSTRAINT "shipping_rate_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_settings" ADD CONSTRAINT "shipping_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_zones" ADD CONSTRAINT "shipping_zones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_alerts" ADD CONSTRAINT "system_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_feature_overrides" ADD CONSTRAINT "tenant_feature_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_notes" ADD CONSTRAINT "tenant_notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_notes" ADD CONSTRAINT "tenant_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_scheduled_plan_id_subscription_plans_id_fk" FOREIGN KEY ("scheduled_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_events_ws_idx" ON "billing_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cod_remit_order_uq" ON "cod_remittances" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courier_conn_ws_provider_uq" ON "courier_connections" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE INDEX "courier_conn_ws_idx" ON "courier_connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courier_webhook_uq" ON "courier_webhook_events" USING btree ("provider","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "disb_attempt_uq" ON "disbursement_attempts" USING btree ("settlement_id","attempt_no");--> statement-breakpoint
CREATE INDEX "disb_provider_idx" ON "disbursement_attempts" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "funding_source_idx" ON "funding_snapshots" USING btree ("source","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_source_uq" ON "ledger_entries" USING btree ("source_type","source_id","account");--> statement-breakpoint
CREATE INDEX "ledger_ws_account_idx" ON "ledger_entries" USING btree ("workspace_id","account");--> statement-breakpoint
CREATE INDEX "ledger_txn_idx" ON "ledger_entries" USING btree ("txn_id");--> statement-breakpoint
CREATE INDEX "manual_tx_order_idx" ON "manual_transfer_verifications" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_adj_ws_idx" ON "payment_adjustments" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_tx_bill_uq" ON "payment_transactions" USING btree ("bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_tx_order_uq" ON "payment_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_tx_ws_idx" ON "payment_transactions" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_webhook_uq" ON "payout_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "seller_bank_ws_idx" ON "seller_bank_accounts" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_bank_current_uq" ON "seller_bank_accounts" USING btree ("workspace_id") WHERE superseded_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_batch_date_uq" ON "settlement_batches" USING btree ("settlement_date","environment");--> statement-breakpoint
CREATE INDEX "settlement_holds_ws_idx" ON "settlement_holds" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_items_source_uq" ON "settlement_items" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "settlement_items_settlement_idx" ON "settlement_items" USING btree ("settlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_batch_ws_uq" ON "settlements" USING btree ("batch_id","workspace_id");--> statement-breakpoint
CREATE INDEX "settlements_ws_idx" ON "settlements" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_events_dedupe_uq" ON "shipment_events" USING btree ("shipment_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "shipment_events_ship_idx" ON "shipment_events" USING btree ("shipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_order_active_uq" ON "shipments" USING btree ("order_id") WHERE status not in ('CANCELLED','FAILED');--> statement-breakpoint
CREATE INDEX "shipments_ws_idx" ON "shipments" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "shipments_tracking_idx" ON "shipments" USING btree ("provider","tracking_number");--> statement-breakpoint
CREATE INDEX "shipments_external_idx" ON "shipments" USING btree ("provider","external_order_id");--> statement-breakpoint
CREATE INDEX "shipping_rules_ws_idx" ON "shipping_rate_rules" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "shipping_zones_ws_idx" ON "shipping_zones" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "system_alerts_open_uq" ON "system_alerts" USING btree ("dedupe_key") WHERE resolved_at is null;--> statement-breakpoint
CREATE INDEX "system_alerts_open_idx" ON "system_alerts" USING btree ("resolved_at","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_override_uq" ON "tenant_feature_overrides" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "tenant_notes_ws_idx" ON "tenant_notes" USING btree ("workspace_id");