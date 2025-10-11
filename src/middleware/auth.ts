import { FastifyRequest, FastifyReply } from "fastify";

export const apiKeyAuth =
  (config: any) =>
  async (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // Public endpoints that don't require authentication
    if (["/", "/health"].includes(req.url) || req.url.startsWith("/ui")) {
      return done();
    }

    // Temporarily disable authentication for local usage testing
    const apiKey = config.APIKEY;

    // If no API key is configured, allow all access
    if (!apiKey) {
      return done();
    }

    const isConfigEndpoint = req.url.startsWith("/api/config");
    const isRestartEndpoint = req.url === "/api/restart";

    // For config endpoints and restart endpoint, implement granular access control
    if (isConfigEndpoint || isRestartEndpoint) {
      // Attach access level to request for later use
      (req as any).accessLevel = "restricted";

      // If API key is set, check authentication
      const authHeaderValue =
        req.headers.authorization || req.headers["x-api-key"];
      const authKey: string = Array.isArray(authHeaderValue)
        ? authHeaderValue[0]
        : authHeaderValue || "";

      if (!authKey) {
        (req as any).accessLevel = "restricted";
        return done();
      }

      let token = "";
      if (authKey.startsWith("Bearer")) {
        token = authKey.split(" ")[1];
      } else {
        token = authKey;
      }

      if (token !== apiKey) {
        (req as any).accessLevel = "restricted";
        return done();
      }

      // Full access for authenticated users
      (req as any).accessLevel = "full";
      return done();
    }

    const authHeaderValue =
      req.headers.authorization || req.headers["x-api-key"];
    const authKey: string = Array.isArray(authHeaderValue)
      ? authHeaderValue[0]
      : authHeaderValue || "";
    if (!authKey) {
      reply.status(401).send("APIKEY is missing");
      return;
    }
    let token = "";
    if (authKey.startsWith("Bearer")) {
      token = authKey.split(" ")[1];
    } else {
      token = authKey;
    }

    if (token !== apiKey) {
      reply.status(401).send("Invalid API key");
      return;
    }

    done();
  };
