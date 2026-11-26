import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { paginated, success } from "../../lib/response";
import { paginationQuerySchema, type PaginationQuery } from "../../lib/validation";
import { getUser, requireAuth } from "../../plugins/auth";
import * as savedService from "./saved.service";

const tags = ["Saved"];
const propertyParam = z.object({ propertyId: z.uuid() });
type PropertyParam = z.infer<typeof propertyParam>;

/** A signed-in user's saved listings. Every route needs an ACTIVE session. */
export async function savedRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const auth = { onRequest: [requireAuth] };

  app.get(
    "/",
    {
      ...auth,
      schema: {
        tags,
        description: "Saved listings, newest saved first",
        querystring: paginationQuerySchema,
      },
    },
    async (request: FastifyRequest<{ Querystring: PaginationQuery }>) =>
      paginated(await savedService.listSaved(getUser(request).id, request.query)),
  );

  app.get("/ids", { ...auth, schema: { tags, description: "Ids of all saved listings" } }, async (request) =>
    success(await savedService.listSavedIds(getUser(request).id)),
  );

  app.put(
    "/:propertyId",
    {
      ...auth,
      schema: {
        tags,
        description: "Save a listing (idempotent)",
        params: propertyParam,
      },
    },
    async (request: FastifyRequest<{ Params: PropertyParam }>) =>
      success(await savedService.saveProperty(getUser(request).id, request.params.propertyId)),
  );

  app.delete(
    "/:propertyId",
    {
      ...auth,
      schema: {
        tags,
        description: "Remove a saved listing (idempotent)",
        params: propertyParam,
      },
    },
    async (request: FastifyRequest<{ Params: PropertyParam }>) =>
      success(await savedService.unsaveProperty(getUser(request).id, request.params.propertyId)),
  );
}
