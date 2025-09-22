import { FastifyRequest, FastifyReply } from "fastify";

export const apiKeyAuth =
  (config: any) =>
  async (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // Public endpoints that don't require authentication
    if (["/", "/health"].includes(req.url) || req.url.startsWith("/ui")) {
      return done();
    }

    // Sensitive endpoints that require authentication
    const sensitiveEndpoints = [
      '/api/usage/summary',
      '/api/usage/details',
      '/api/usage/export',
      '/api/costs/models',
      '/api/statusline/usage'
    ];

    const isSensitiveEndpoint = sensitiveEndpoints.some(endpoint =>
      req.url.startsWith(endpoint)
    );

    const apiKey = config.APIKEY;

    // Check if this is a sensitive endpoint that always requires auth
    if (isSensitiveEndpoint && !apiKey) {
      reply.status(401).send("Authentication required for this endpoint");
      return;
    }

    if (!apiKey) {
      // If no API key is set, enable CORS for local
      const allowedOrigins = [
        `http://127.0.0.1:${config.PORT || 3456}`,
        `http://localhost:${config.PORT || 3456}`,
      ];
      if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) {
        reply.status(403).send("CORS not allowed for this origin");
        return;
      } else {
        reply.header('Access-Control-Allow-Origin', `http://127.0.0.1:${config.PORT || 3456}`);
        reply.header('Access-Control-Allow-Origin', `http://localhost:${config.PORT || 3456}`);
      }
      return done();
    }
    const isConfigEndpoint = req.url.startsWith("/api/config");
    const isRestartEndpoint = req.url === "/api/restart";

    // For config endpoints, restart endpoint, and sensitive usage endpoints, we implement granular access control
    if (isConfigEndpoint || isRestartEndpoint || isSensitiveEndpoint) {
      // Attach access level to request for later use
      (req as any).accessLevel = "restricted";

      // If no API key is set in config, allow restricted access
      if (!apiKey) {
        (req as any).accessLevel = "restricted";
        return done();
      }

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
