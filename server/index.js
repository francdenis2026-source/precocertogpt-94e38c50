const routeMeta = {"/":{"title":"PreçoCerto | Marketplace Local","description":"Compare, escolha e compre perto de você. Descubra preços, estabelecimentos e vendas online no comércio local.","image":"/social/preco-certo.png"},"/estabelecimentos":{"title":"Estabelecimentos | PreçoCerto","description":"Descubra o comércio local, entre nos estabelecimentos e explore catálogos, preços e opções de compra.","image":"/social/estabelecimentos.png"},"/dorinha-barroso":{"title":"Dorinha Barroso · Livros & Autora | PreçoCerto","description":"Conheça Dorinha Barroso, escritora e educadora acreana, descubra suas obras e compre exemplares diretamente com a autora.","image":"/social/dorinha-barroso.png"},"/autora/dorinha-barroso":{"title":"Dorinha Barroso · Livros & Autora | PreçoCerto","description":"Conheça Dorinha Barroso, escritora e educadora acreana, descubra suas obras e compre exemplares diretamente com a autora.","image":"/social/dorinha-barroso.png"},"/fremix-producoes":{"title":"FreMix Produções · Cultura & Música Local | PreçoCerto","description":"Conheça a FreMix Produções, assista a uma seleção do canal e encontre informações para autorização de reprodução.","image":"/social/fremix-producoes.png"},"/cultura/fremix-producoes":{"title":"FreMix Produções · Cultura & Música Local | PreçoCerto","description":"Conheça a FreMix Produções, assista a uma seleção do canal e encontre informações para autorização de reprodução.","image":"/social/fremix-producoes.png"}};

function metaFor(pathname) {
  if (routeMeta[pathname]) return routeMeta[pathname];
  if (pathname.startsWith("/estabelecimento/")) return routeMeta["/estabelecimentos"];
  if (pathname.startsWith("/loja/")) return routeMeta["/"];
  return null;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function withMeta(html, requestUrl, meta) {
  const url = new URL(requestUrl);
  const canonical = url.origin + url.pathname;
  const image = url.origin + meta.image;
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const block = [
    "<title>" + title + "</title>",
    '<meta name="description" content="' + description + '" />',
    '<link rel="canonical" href="' + canonical + '" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:locale" content="pt_BR" />',
    '<meta property="og:site_name" content="PreçoCerto" />',
    '<meta property="og:title" content="' + title + '" />',
    '<meta property="og:description" content="' + description + '" />',
    '<meta property="og:url" content="' + canonical + '" />',
    '<meta property="og:image" content="' + image + '" />',
    '<meta property="og:image:secure_url" content="' + image + '" />',
    '<meta property="og:image:type" content="image/png" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta property="og:image:alt" content="' + title + '" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    '<meta name="twitter:title" content="' + title + '" />',
    '<meta name="twitter:description" content="' + description + '" />',
    '<meta name="twitter:image" content="' + image + '" />'
  ].join("\n    ");

  html = html.replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, "")
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, "");
  return html.replace("</head>", "    " + block + "\n  </head>");
}

const app = {
  async fetch(request, env) {
    if (!env?.ASSETS?.fetch) return new Response("PreçoCerto", { status: 200 });

    const response = await env.ASSETS.fetch(request);
    if (request.method !== "GET") return response;

    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    if (!acceptsHtml) return response;

    const url = new URL(request.url);
    const meta = metaFor(url.pathname);

    if (meta) {
      let base = response;
      if (response.status === 404) {
        const indexUrl = new URL(request.url);
        indexUrl.pathname = "/index.html";
        base = await env.ASSETS.fetch(new Request(indexUrl, request));
      }
      const html = await base.text();
      return new Response(withMeta(html, request.url, meta), {
        status: 200,
        headers: { ...Object.fromEntries(base.headers), "content-type": "text/html; charset=UTF-8", "cache-control": "public, max-age=300" },
      });
    }

    if (response.status !== 404) return response;
    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};

export default app;
