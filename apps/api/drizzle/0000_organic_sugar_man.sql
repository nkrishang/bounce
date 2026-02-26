CREATE TABLE "bet_metadata" (
	"bet_id" integer PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"slug" text DEFAULT '' NOT NULL,
	"condition_id" text NOT NULL,
	"outcome_index" integer NOT NULL,
	"outcome_token_id" text NOT NULL,
	"is_yes_outcome" boolean DEFAULT true NOT NULL,
	"market_question" text DEFAULT '' NOT NULL,
	"market_image" text,
	"outcome_price" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_executions" (
	"bet_id" integer PRIMARY KEY NOT NULL,
	"prepare_status" text DEFAULT 'pending' NOT NULL,
	"prepare_tx_hash" text,
	"order_id" text,
	"clob_status" text,
	"finalize_status" text,
	"finalize_tx_hash" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
