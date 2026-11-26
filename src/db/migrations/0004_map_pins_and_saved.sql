CREATE TABLE "saved_properties" (
	"user_id" text NOT NULL,
	"property_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_properties_user_id_property_id_pk" PRIMARY KEY("user_id","property_id")
);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "saved_properties" ADD CONSTRAINT "saved_properties_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_properties" ADD CONSTRAINT "saved_properties_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_properties_user_recent_idx" ON "saved_properties" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_location_pair" CHECK (("properties"."latitude" IS NULL) = ("properties"."longitude" IS NULL));--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_location_range" CHECK ("properties"."latitude" IS NULL OR ("properties"."latitude" BETWEEN -90 AND 90 AND "properties"."longitude" BETWEEN -180 AND 180));