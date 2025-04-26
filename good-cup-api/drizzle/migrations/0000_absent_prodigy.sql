CREATE SCHEMA "good_cup";
--> statement-breakpoint
CREATE TABLE "good_cup"."beans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"roaster" text,
	"origin" text,
	"process" text,
	"roast_level" text,
	"roasted_date" timestamp with time zone,
	"flavor_notes" text[],
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "good_cup"."brew_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "good_cup"."brews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bean_id" uuid NOT NULL,
	"brew_device_id" uuid,
	"grinder_id" uuid,
	"timestamp" timestamp with time zone NOT NULL,
	"steep_time_seconds" integer,
	"grind_size" text,
	"water_temp_celsius" numeric,
	"use_bloom" boolean,
	"bloom_time_seconds" integer,
	"notes" text,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "good_cup"."grinders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "good_cup"."user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"default_brew_device_id" uuid,
	"default_grinder_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "good_cup"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "good_cup"."beans" ADD CONSTRAINT "beans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "good_cup"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_cup"."brew_devices" ADD CONSTRAINT "brew_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "good_cup"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_cup"."brews" ADD CONSTRAINT "brews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "good_cup"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_cup"."brews" ADD CONSTRAINT "brews_bean_id_beans_id_fk" FOREIGN KEY ("bean_id") REFERENCES "good_cup"."beans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_cup"."brews" ADD CONSTRAINT "brews_brew_device_id_brew_devices_id_fk" FOREIGN KEY ("brew_device_id") REFERENCES "good_cup"."brew_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_cup"."brews" ADD CONSTRAINT "brews_grinder_id_grinders_id_fk" FOREIGN KEY ("grinder_id") REFERENCES "good_cup"."grinders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_cup"."grinders" ADD CONSTRAINT "grinders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "good_cup"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_cup"."user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "good_cup"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_cup"."user_settings" ADD CONSTRAINT "user_settings_default_brew_device_id_brew_devices_id_fk" FOREIGN KEY ("default_brew_device_id") REFERENCES "good_cup"."brew_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "good_cup"."user_settings" ADD CONSTRAINT "user_settings_default_grinder_id_grinders_id_fk" FOREIGN KEY ("default_grinder_id") REFERENCES "good_cup"."grinders"("id") ON DELETE set null ON UPDATE no action;