// Keep the original Guide pages, assets and APIs behind the same server-side gate.
const cookieName = "gv-guide-session";
const privateHeaders = { "cache-control": "private, no-store" };

export function guidePath(path) {
  try { path = decodeURIComponent(path).replace(/[/\\]+/g, "/").toLowerCase(); } catch { return ""; }
  return /^\/(?:guide|api\/guide)(?:\/|$)/.test(path) ? path : "";
}

export async function guideAccess(req, env, path, { verifyIdToken, fsField }) {
  const url = new URL(req.url);
  if (path === "/api/guide/visibility" && req.method === "GET") {
    const open = env.GUIDE_PUBLIC === "true";
    return Response.json({ open, status: open ? (env.GUIDE_STATUS || "Released") : "Ripening" }, { headers: privateHeaders });
  }

  const session = path === "/api/guide/session";
  if (!session && env.GUIDE_PUBLIC === "true") return null;
  if (session && (req.headers.get("origin") !== url.origin || !["POST", "DELETE"].includes(req.method))) {
    return new Response(null, { status: 403, headers: privateHeaders });
  }

  const cookie = (req.headers.get("cookie") || "").split(/;\s*/).find(c => c.startsWith(cookieName + "="));
  const token = session || path.startsWith("/api/guide/")
    ? (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || cookie?.slice(cookieName.length + 1)
    : cookie?.slice(cookieName.length + 1);
  const setCookie = (value, maxAge) => cookieName + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge;
  if (session && req.method === "DELETE") {
    return new Response(null, { status: 204, headers: { ...privateHeaders, "set-cookie": setCookie("", 0) } });
  }
  try {
    if (token) {
      const user = await verifyIdToken(token, env.FIREBASE_PROJECT_ID);
      const role = (await fsField(env, "access/" + user.uid, user, "role")).trim().toLowerCase();
      if (["founder", "hnic"].includes(role)) {
        if (!session) return null;
        return new Response(null, { status: 204, headers: { ...privateHeaders, "set-cookie": setCookie(token, 1800) } });
      }
    }
  } catch {
    // Firebase or role lookup failure leaves Guide closed.
  }
  return new Response("Not found", { status: 404, headers: privateHeaders });
}

export function privateGuideResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("cache-control", privateHeaders["cache-control"]);
  return new Response(response.body, { status: response.status, headers });
}
