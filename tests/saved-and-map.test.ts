import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  api,
  createProperty,
  createSeeker,
  createTenant,
  createTestApp,
  setUserStatus,
  type TestApp,
} from "./helpers";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.app.close();
});

/** A unique area so each test filters to only its own listings. */
const uniqueArea = () => `Area${randomUUID().slice(0, 8)}`;

describe("map pins", () => {
  it("stores a pin on create and returns it on detail and list", async () => {
    const tenant = await createTenant(t.app);
    const area = uniqueArea();
    const created = await createProperty(t.app, tenant, { area, latitude: -1.2921, longitude: 36.7856 });
    expect(created).toMatchObject({ latitude: -1.2921, longitude: 36.7856 });

    const list = await api(t.app, "GET", `/api/properties?area=${area}`);
    expect(list.body.data[0]).toMatchObject({ latitude: -1.2921, longitude: 36.7856 });
  });

  it("listings without a pin return null coordinates", async () => {
    const tenant = await createTenant(t.app);
    const created = await createProperty(t.app, tenant);
    expect(created).toMatchObject({ latitude: null, longitude: null });
  });

  it("rejects half a pin and out-of-range values (422)", async () => {
    const tenant = await createTenant(t.app);
    const half = await api(t.app, "POST", "/api/properties", {
      cookie: tenant.cookie,
      body: { ...validBody(), latitude: -1.29 },
    });
    expect(half.status).toBe(422);
    const range = await api(t.app, "POST", "/api/properties", {
      cookie: tenant.cookie,
      body: { ...validBody(), latitude: 95, longitude: 36.8 },
    });
    expect(range.status).toBe(422);
  });

  it("the owner can move and clear the pin", async () => {
    const tenant = await createTenant(t.app);
    const p = await createProperty(t.app, tenant, { latitude: -1.29, longitude: 36.78 });
    const moved = await api(t.app, "PATCH", `/api/properties/${p.id}`, {
      cookie: tenant.cookie,
      body: { latitude: -1.3, longitude: 36.8 },
    });
    expect(moved.body.data).toMatchObject({ latitude: -1.3, longitude: 36.8 });
    const cleared = await api(t.app, "PATCH", `/api/properties/${p.id}`, {
      cookie: tenant.cookie,
      body: { latitude: null, longitude: null },
    });
    expect(cleared.body.data).toMatchObject({ latitude: null, longitude: null });
  });

  it("filters by map bounds; listings without a pin are left out", async () => {
    const tenant = await createTenant(t.app);
    const area = uniqueArea();
    const inside = await createProperty(t.app, tenant, { area, latitude: -1.29, longitude: 36.78 });
    await createProperty(t.app, tenant, { area, latitude: -0.5, longitude: 37.5 });
    await createProperty(t.app, tenant, { area });

    const res = await api(t.app, "GET", `/api/properties?area=${area}&north=-1.2&south=-1.4&east=36.9&west=36.7`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([inside.id]);
  });

  it("bounds must come as all four, with south <= north (422)", async () => {
    expect((await api(t.app, "GET", "/api/properties?north=-1.2&south=-1.4")).status).toBe(422);
    expect((await api(t.app, "GET", "/api/properties?north=-1.4&south=-1.2&east=37&west=36")).status).toBe(422);
  });
});

describe("room and amenity filters", () => {
  it("minBedrooms and minBathrooms are lower bounds", async () => {
    const tenant = await createTenant(t.app);
    const area = uniqueArea();
    await createProperty(t.app, tenant, { area, bedrooms: 1, bathrooms: 1 });
    const two = await createProperty(t.app, tenant, { area, bedrooms: 2, bathrooms: 2 });
    const three = await createProperty(t.app, tenant, { area, bedrooms: 3, bathrooms: 1 });

    const beds = await api(t.app, "GET", `/api/properties?area=${area}&minBedrooms=2&sort=price_asc`);
    expect(beds.body.data.map((p: { id: string }) => p.id).sort()).toEqual([two.id, three.id].sort());
    const baths = await api(t.app, "GET", `/api/properties?area=${area}&minBathrooms=2`);
    expect(baths.body.data.map((p: { id: string }) => p.id)).toEqual([two.id]);
  });

  it("amenities must all be present, case-insensitively", async () => {
    const tenant = await createTenant(t.app);
    const area = uniqueArea();
    const both = await createProperty(t.app, tenant, { area, amenities: ["Parking", "Wifi"] });
    await createProperty(t.app, tenant, { area, amenities: ["parking"] });

    const res = await api(t.app, "GET", `/api/properties?area=${area}&amenities=parking,%20WIFI`);
    expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([both.id]);
  });
});

describe("saved listings", () => {
  it("requires a session (401)", async () => {
    expect((await api(t.app, "GET", "/api/saved")).status).toBe(401);
    expect((await api(t.app, "PUT", `/api/saved/${randomUUID()}`)).status).toBe(401);
  });

  it("save, list, ids and remove are idempotent and private to the user", async () => {
    const tenant = await createTenant(t.app);
    const seeker = await createSeeker(t.app);
    const other = await createSeeker(t.app, "Other");
    const p = await createProperty(t.app, tenant);

    for (let i = 0; i < 2; i++) {
      const put = await api(t.app, "PUT", `/api/saved/${p.id}`, { cookie: seeker.cookie });
      expect(put.status).toBe(200);
      expect(put.body.data).toEqual({ propertyId: p.id, saved: true });
    }

    const list = await api(t.app, "GET", "/api/saved", { cookie: seeker.cookie });
    expect(list.body.meta).toMatchObject({ total: 1 });
    expect(list.body.data[0]).toMatchObject({ id: p.id, title: p.title });
    expect(list.body.data[0].savedAt).toBeTruthy();

    const ids = await api(t.app, "GET", "/api/saved/ids", { cookie: seeker.cookie });
    expect(ids.body.data).toEqual([p.id]);
    expect((await api(t.app, "GET", "/api/saved/ids", { cookie: other.cookie })).body.data).toEqual([]);

    for (let i = 0; i < 2; i++) {
      const del = await api(t.app, "DELETE", `/api/saved/${p.id}`, { cookie: seeker.cookie });
      expect(del.status).toBe(200);
      expect(del.body.data).toEqual({ propertyId: p.id, saved: false });
    }
    expect((await api(t.app, "GET", "/api/saved", { cookie: seeker.cookie })).body.meta).toMatchObject({ total: 0 });
  });

  it("a listing that is not public cannot be saved (404) and drops out of the saved list", async () => {
    const tenant = await createTenant(t.app);
    const seeker = await createSeeker(t.app);
    const p = await createProperty(t.app, tenant);

    expect((await api(t.app, "PUT", `/api/saved/${randomUUID()}`, { cookie: seeker.cookie })).status).toBe(404);

    await api(t.app, "PUT", `/api/saved/${p.id}`, { cookie: seeker.cookie });
    await setUserStatus(tenant.id, "SUSPENDED");
    expect((await api(t.app, "GET", "/api/saved", { cookie: seeker.cookie })).body.meta).toMatchObject({ total: 0 });
    expect((await api(t.app, "PUT", `/api/saved/${p.id}`, { cookie: seeker.cookie })).status).toBe(404);
  });

  it("rejects a malformed id (422)", async () => {
    const seeker = await createSeeker(t.app);
    expect((await api(t.app, "PUT", "/api/saved/not-a-uuid", { cookie: seeker.cookie })).status).toBe(422);
  });
});

function validBody() {
  return {
    title: "Modern two bedroom apartment",
    description: "Bright apartment close to shops, schools and public transport.",
    propertyType: "APARTMENT",
    priceAmount: 45000,
    county: "Nairobi",
    area: "Kilimani",
  };
}
