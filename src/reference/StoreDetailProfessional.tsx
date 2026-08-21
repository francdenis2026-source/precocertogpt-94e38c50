import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Clock3, Info, MapPin, PackageSearch, Search, ShieldCheck, SlidersHorizontal, Store, Tag } from "lucide-react";
import { fetchCatalog } from "../data/remoteCatalog";
import type { CatalogPayload, Product } from "../data/catalog";
import { resolveProductImage } from "../data/productImageResolver";
import { getStoreLogoUrl } from "../data/storeLogos";
import { normalizeStoreKind } from "../data/sectorCatalog";
import { marketplaceSectors } from "./MarketplaceSectors";
import { PublicHeader } from "./ReferenceExperience";
import "./StoreDetailProfessional.css";
import "./StoreExperienceAcai2026.css";
import "./StoreSectorHero.css";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PAGE_SIZE = 20;


const STORE_BACKDROPS = [
  "/supermercado-hero.jpg",
  "/mercado-local-profissional.webp",
  "/hero-feijo-mercado-claro-2026.webp",
  "/mercado-bairro-feijo-v1.webp",
  "/supermercado-premium.jpg",
  "/marketplace-local-profissional-v2.webp",
];

// Escolha estavel: a mesma loja recebe sempre a mesma imagem, e lojas
// diferentes tendem a receber imagens diferentes.
function storeBackdrop(key: string) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return STORE_BACKDROPS[hash % STORE_BACKDROPS.length];
}

// Cada setor recebe um hero próprio: mercados mantêm a fotografia real do
// comércio, e os demais (farmácia, padaria, cultura, serviços) — sem fotos
// próprias no acervo — ganham um cartão com a cor e o ícone do setor, para
// não repetir uma imagem de supermercado num perfil que não é um mercado.
const marketSectorId = marketplaceSectors[0].id;
function sectorForStore(kind?: string) {
  const normalized = normalizeStoreKind(kind);
  return marketplaceSectors.find(sector => sector.businessKinds.map(normalizeStoreKind).includes(normalized)) || marketplaceSectors[0];
}

const SECTOR_TAGLINES: Record<string, string> = {
  markets: "Consulte produtos, marcas e preços organizados para comparar antes de comprar.",
  pharmacies: "Medicamentos, higiene e cuidados pessoais organizados por este estabelecimento de saúde.",
  bakery: "Cardápio e itens preparados deste comércio, organizados para consulta antes de ir até lá.",
  books: "Obras, autoria e projeto cultural deste perfil, sem mistura com catálogo de supermercado.",
  services: "Especialidade, contato e área de atendimento deste prestador de serviço local.",
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function cleanBrand(value?: string | null) {
  const brand = (value || "").trim();
  if (!brand || brand === "-" || brand === "—" || normalize(brand) === "nao identificada") return "Marca não informada";
  return brand;
}

function ProductImage({ product }: { product: Product }) {
  const source = resolveProductImage(product);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  if (source && !failed) return <img src={source} alt={product.name} width="200" height="160" loading="lazy" onError={() => setFailed(true)} />;
  return <span className="store-pro-fallback" role="img" aria-label={`Imagem de ${product.name} em atualização`}><PackageSearch /><small>{product.category}<em>Imagem em atualização</em></small></span>;
}

export function StoreDetailProfessional() {
  const { identifier = "" } = useParams();
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [sort, setSort] = useState<"name" | "price-asc" | "price-desc">("name");
  const [page, setPage] = useState(1);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchCatalog("", { force: true })
      .then(data => { if (active) setCatalog(data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const store = useMemo(() => catalog?.stores.find(item => String(item.id) === identifier || item.slug === identifier), [catalog, identifier]);
  const allProducts = useMemo(() => {
    if (!catalog || !store) return [];
    return catalog.products.filter(item => item.offers?.some(offer => String(offer.establishmentId) === String(store.id)) || String(item.establishmentId) === String(store.id));
  }, [catalog, store]);

  const specialties = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of allProducts) {
      const label = (product.category || "").trim();
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [allProducts]);

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(allProducts.map(product => product.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"))], [allProducts]);
  const filteredProducts = useMemo(() => {
    const term = normalize(query);
    const filtered = allProducts.filter(product => {
      const matchesCategory = category === "Todos" || product.category === category;
      const matchesQuery = !term || normalize(`${product.name} ${product.brand || ""} ${product.category || ""} ${product.size || ""}`).includes(term);
      return matchesCategory && matchesQuery;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "price-asc") return a.minPrice - b.minPrice || a.name.localeCompare(b.name, "pt-BR");
      if (sort === "price-desc") return b.minPrice - a.minPrice || a.name.localeCompare(b.name, "pt-BR");
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [allProducts, query, category, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleProducts = useMemo(() => filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filteredProducts, safePage]);
  useEffect(() => setPage(1), [query, category, sort]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  if (loading) return <main className="store-pro-state"><span className="store-pro-loader" /><h1>Carregando estabelecimento…</h1></main>;
  if (!store || !catalog) return <main className="store-pro-state"><Store /><h1>Estabelecimento não encontrado</h1><Link to="/estabelecimentos">Voltar aos estabelecimentos</Link></main>;

  const startResult = filteredProducts.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const endResult = Math.min(safePage * PAGE_SIZE, filteredProducts.length);
  const logoUrl = getStoreLogoUrl(store.name);
  const isBonsAmigos = normalize(store.name).includes("bons amigos");
  const sector = sectorForStore(store.kind);
  const isMarketSector = sector.id === marketSectorId;
  const backdrop = isMarketSector ? storeBackdrop(store.slug || String(store.id)) : undefined;
  const showLogo = logoUrl && !logoFailed;
  const SectorIcon = sector.icon;

  return <div className={`ref-page store-pro-page${isBonsAmigos ? " store-pro-page--bons-amigos" : ""}`}>
    <PublicHeader current="stores"/>
    <main id="conteudo-principal" className="store-pro-shell">
      <div className="store-pro-topline">
        <Link className="store-pro-back" to="/estabelecimentos"><ArrowLeft /> Todos os estabelecimentos</Link>
        <span><MapPin /> Feijó · Acre</span>
      </div>

      <section
        className={`store-pro-hero${isBonsAmigos ? " store-pro-hero--bons-amigos" : ""}${isMarketSector ? "" : ` store-pro-hero--sector store-pro-hero--${sector.id}`}`}
        aria-labelledby="store-title"
        style={!isBonsAmigos && backdrop ? { backgroundImage: `url('${backdrop}')` } : undefined}
      >
        <div className="store-pro-hero__overlay" />
        {isBonsAmigos && <div className="store-pro-brand-art" aria-hidden="true"><img src="/branding/bons-amigos-hero.jpg?v=20260818" alt="" width="600" height="240" /></div>}
        {!isBonsAmigos && !isMarketSector && <SectorIcon className="store-pro-hero__watermark" aria-hidden="true" />}
        <div className="store-pro-hero__content">
          <div className={`store-pro-logo${showLogo ? " has-image" : ""}`} style={!showLogo ? { background: store.color } : undefined}>
            {showLogo
              ? <img src={logoUrl} alt={`Logomarca ${store.name}`} width="92" height="92" onError={() => setLogoFailed(true)} />
              : <Store />}
          </div>
          <div className="store-pro-copy">
            <span><SectorIcon aria-hidden="true" /> {sector.shortLabel.toLocaleUpperCase("pt-BR")} · FEIJÓ, ACRE</span>
            <h1 id="store-title">{store.name}</h1>
            {specialties.length > 0 && <ul className="store-pro-specialties" aria-label="Especialidades do estabelecimento">
              {specialties.map(([label, count]) => <li key={label}>{label}<b>{count}</b></li>)}
            </ul>}
            <p>{SECTOR_TAGLINES[sector.id] || SECTOR_TAGLINES[marketSectorId]}</p>
            <div className="store-pro-meta-line">
              <b><BadgeCheck /> {allProducts.length || store.products} produtos no catálogo</b>
              <b><Clock3 /> informações organizadas pelo PreçoCerto</b>
            </div>
          </div>
          <div className="store-pro-status"><BadgeCheck /><span><strong>Catálogo verificado</strong><small>Dados locais organizados</small></span></div>
        </div>
      </section>

      <div className="store-pro-notice"><Info /><span><strong>Catálogo informativo</strong><small>O PreçoCerto exibe informações de produtos e preços. Este espaço ainda não representa venda direta ou canal oficial do estabelecimento.</small></span></div>

      <section className="store-pro-summary" aria-label="Resumo do estabelecimento">
        <article><strong>{allProducts.length}</strong><span>produtos encontrados</span></article>
        <article><strong>{Math.max(1, categories.length - 1)}</strong><span>categorias disponíveis</span></article>
        <article><ShieldCheck /><span><b>Compare com clareza</b><small>Marca, embalagem e preço visíveis</small></span></article>
      </section>

      <section className="store-pro-catalog" aria-labelledby="store-catalog-title">
        <header className="store-pro-catalog-head">
          <div><span>CATÁLOGO</span><h2 id="store-catalog-title">Produtos deste estabelecimento</h2><p>{filteredProducts.length} {filteredProducts.length === 1 ? "resultado" : "resultados"}{query || category !== "Todos" ? " com os filtros atuais" : " disponíveis"}</p></div>
          <span className="store-pro-catalog-hint"><Search /> Pesquise por nome, marca ou categoria</span>
        </header>

        <div className="store-pro-toolbar">
          <label className="store-pro-search"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex.: refresco, Brassuk, leite em pó…" aria-label="Buscar no catálogo do estabelecimento" /></label>
          <label className="store-pro-select"><SlidersHorizontal /><select value={category} onChange={event => setCategory(event.target.value)} aria-label="Filtrar por categoria">{categories.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="store-pro-select"><select value={sort} onChange={event => setSort(event.target.value as typeof sort)} aria-label="Ordenar produtos"><option value="name">Ordenar: A–Z</option><option value="price-asc">Menor preço</option><option value="price-desc">Maior preço</option></select></label>
        </div>

        {visibleProducts.length ? <div className="ref-product-grid store-pro-grid">{visibleProducts.map(product => <Link key={product.id} to={`/produto/${product.slug || product.id}`}>
          <div className="store-pro-product-image"><ProductImage product={product} /></div>
          <small className="store-pro-category">{product.category}</small>
          <strong>{product.name}</strong>
          <span className="store-pro-brand"><Tag aria-hidden="true"/><b>Marca</b> {cleanBrand(product.brand)}</span>
          <span className="store-pro-spec">{product.size || product.unit || "Unidade não informada"}</span>
          <footer><em>preço cadastrado</em><b>{brl.format(product.minPrice)}</b></footer>
        </Link>)}</div> : <div className="store-pro-empty"><PackageSearch /><h3>Nenhum produto encontrado</h3><p>Tente outro nome ou remova algum filtro.</p><button type="button" className="pc-btn pc-btn--ghost" onClick={() => { setQuery(""); setCategory("Todos"); }}>Limpar filtros</button></div>}

        {pageCount > 1 && <nav className="store-pro-pagination" aria-label="Paginação do catálogo">
          <span>Mostrando {startResult}–{endResult} de {filteredProducts.length}</span>
          <div><button type="button" disabled={safePage === 1} onClick={() => setPage(value => Math.max(1, value - 1))} aria-label="Página anterior"><ChevronLeft /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).filter(number => number === 1 || number === pageCount || Math.abs(number - safePage) <= 1).map((number, index, list) => <span key={number}>{index > 0 && number - list[index - 1] > 1 && <i>…</i>}<button type="button" className={number === safePage ? "is-active" : ""} aria-current={number === safePage ? "page" : undefined} onClick={() => setPage(number)}>{number}</button></span>)}<button type="button" disabled={safePage === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))} aria-label="Próxima página"><ChevronRight /></button></div>
        </nav>}
      </section>

      <aside className="store-pro-bottom-note"><ShieldCheck /><strong>Informação para comparação</strong><span>Confirme estoque, disponibilidade e condições diretamente no estabelecimento.</span><Link className="pc-btn pc-btn--ghost" to="/fale-conosco">Saiba mais <ArrowRight /></Link></aside>
    </main>
  </div>;
}
