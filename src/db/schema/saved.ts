import { index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { properties } from "./properties";

/** A signed-in user's saved (bookmarked) listings. Private to that user. */
export const savedProperties = pgTable(
  "saved_properties",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.propertyId] }),
    index("saved_properties_user_recent_idx").on(t.userId, t.createdAt.desc()),
  ],
);
