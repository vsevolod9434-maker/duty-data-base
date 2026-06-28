const defaultAllowedOrigins = ["https://vsevolod9434-maker.github.io"];

function readAllowedOrigins() {
  const configuredOrigins = Deno.env.get("DUTY_ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== "*");

  return configuredOrigins?.length ? configuredOrigins : defaultAllowedOrigins;
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  const allowedOrigins = readAllowedOrigins();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };

  if (!origin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigins[0];
  } else if (allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function preflightResponse(request: Request) {
  return new Response("ok", { headers: corsHeaders(request) });
}

export function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
    },
    status,
  });
}

export function errorResponse(request: Request, code: string, message: string, status: number) {
  return jsonResponse(request, { code, message }, status);
}

export function logEdgeError(scope: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${scope}] ${message}`);
}
