const LOGIN_PATTERN = /^(?:(?:app-)?[1-9][0-9]{0,14}|identicon-[a-f0-9]{64})$/;

export async function onRequestGet(context: {
  params: { login?: string };
}): Promise<Response> {
  const login = context.params.login || "";
  if (!LOGIN_PATTERN.test(login)) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "public, s-maxage=300" },
    });
  }

  try {
    const source = login.startsWith("identicon-")
      ? `https://www.gravatar.com/avatar/${login.slice(10)}?d=identicon&s=96`
      : login.startsWith("app-")
        ? `https://avatars.githubusercontent.com/in/${login.slice(4)}?s=96`
        : `https://avatars.githubusercontent.com/u/${login}?s=96`;
    const upstream = await fetch(source, {
      headers: { "User-Agent": "Luotopia-Homepage-Pages" },
      redirect: "follow",
      cf: {
        cacheTtl: 7 * 24 * 3600,
        cacheEverything: true,
        cacheTtlByStatus: { "200-299": 7 * 24 * 3600, "404": 300, "500-599": 0 },
      },
    } as RequestInit);
    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel();
      return new Response("Not found", {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "Cache-Control": "public, s-maxage=300" },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
        "CDN-Cache-Control": "public, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Avatar fetch failed", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
