import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { properties, savedProperties, uploads, user } from "../../db/schema";
import type { Page } from "../../lib/response";
import { offsetFor } from "../../lib/validation";
import {
  listColumns,
  primaryImageJoin,
  propertyNotFound,
  publicVisibility,
  toListItem,
} from "../properties/property.service";
import type { PropertyListItem } from "../properties/property.types";

/** Most ids one user can have saved; the ids list is returned whole. */
export const MAX_SAVED = 500;

export type SavedListItem = PropertyListItem & { savedAt: Date };

/** Saved listings that are still public (a removed or rejected listing drops out). */
export async function listSaved(
  userId: string,
  pagination: { page: number; limit: number },
): Promise<Page<SavedListItem>> {
  const where = and(eq(savedProperties.userId, userId), ...publicVisibility());
  const [rows, [totals]] = await Promise.all([
    db
      .select({ ...listColumns, savedAt: savedProperties.createdAt })
      .from(savedProperties)
      .innerJoin(properties, eq(properties.id, savedProperties.propertyId))
      .innerJoin(user, eq(user.id, properties.tenantId))
      .leftJoin(uploads, primaryImageJoin)
      .where(where)
      .orderBy(desc(savedProperties.createdAt), desc(properties.id))
      .limit(pagination.limit)
      .offset(offsetFor(pagination)),
    db
      .select({ total: count() })
      .from(savedProperties)
      .innerJoin(properties, eq(properties.id, savedProperties.propertyId))
      .innerJoin(user, eq(user.id, properties.tenantId))
      .where(where),
  ]);
  return {
    items: rows.map(toListItem),
    ...pagination,
    total: totals?.total ?? 0,
  };
}

/** Ids of every saved listing (to mark cards as saved). */
export async function listSavedIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: savedProperties.propertyId })
    .from(savedProperties)
    .where(eq(savedProperties.userId, userId))
    .orderBy(desc(savedProperties.createdAt))
    .limit(MAX_SAVED);
  return rows.map((r) => r.id);
}

/** Idempotent. Only a publicly visible listing can be saved; anything else is a 404. */
export async function saveProperty(
  userId: string,
  propertyId: string,
): Promise<{ propertyId: string; saved: true }> {
  const [visible] = await db
    .select({ id: properties.id })
    .from(properties)
    .innerJoin(user, eq(user.id, properties.tenantId))
    .where(and(eq(properties.id, propertyId), ...publicVisibility()));
  if (!visible) throw propertyNotFound();
  await db.insert(savedProperties).values({ userId, propertyId }).onConflictDoNothing();
  return { propertyId, saved: true };
}

/** Idempotent: removing something not saved is not an error. */
export async function unsaveProperty(
  userId: string,
  propertyId: string,
): Promise<{ propertyId: string; saved: false }> {
  await db
    .delete(savedProperties)
    .where(and(eq(savedProperties.userId, userId), eq(savedProperties.propertyId, propertyId)));
  return { propertyId, saved: false };
}
