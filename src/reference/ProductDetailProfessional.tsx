import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, BarChart3, CalendarDays, CheckCircle2,
  ChevronRight, Factory, Heart, Home, Info, Layers3, MapPin, Package,
  PackageSearch, ShieldCheck, ShoppingBasket, Store, Tag, TrendingDown,
} from "lucide-react";
import { fetchCatalog } from "../data/remoteCatalog";
import type { CatalogPayload, Product } from "../data/catalog";
import { resolveProductImage } from "../data/productImageResolver";
import { useFavorites } from "../features/favorites/FavoritesProvider";
import { supabase } from "../lib/supabase";
import { PublicHeader } from "./ReferenceExperience";
import "./ProductDetailUltimate2026.css";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BASKET_KEY = "precocerto:active_basket_items";
const PENDING_BASKET_KEY = "pc:pending_basket_item";
type BasketEntry = { productId: string; quantity: number };
type ProductExtra = { manufacturer: string; barcode: string };

function cleanValue(value?: string | null, fallback = "Não informado") {
  const text = (value || "").trim();
  if (!text || text === "-" || text === "—" || text.toLocaleLowerCase("pt-BR") === "não identificada") return fallback;
  return text;
}

function readBasket(): BasketEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(BASKET_KEY) || "[]") as BasketEntry[];
    return Array.isArray(parsed) ? parsed.filter(item => item?.productId && item.quantity > 0) : [];
  } catch { return []; }
}

function writeBasket(items: BasketEntry[]) {
  localStorage.setItem(BASKET_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("pc:basket-changed"));
}

function ProductImage({ product, compact = false }: { product: Product; compact?: boolean }) {
  const source = resolveProductImage(product);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  if (source && !failed) return <img className={compact ? "pdx-image pdx-image--compact" : "pdx-image"} src={source} alt={product.name} width="400" height="400" loading={compact ? "lazy" : "eager"} onError={() => setFailed(true)} />;
  return <div className={compact ? "pdx-image-fallback pdx-image-fallback--compact" : "pdx-image-fallback"} role="img" aria-label={`Imagem de ${product.name} em atualização`}><PackageSearch /><span>Imagem em atualização</span></div>;
}

function formatDate(value?: string) {
  if (!value) return "Atualizado recentemente";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Atualizado recentemente";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function PriceHistory({ product }: { product: Product }) {
  const points = (product.price_history || []).filter(item => Number.isFinite(item.value)).slice(-10);
  if (points.length < 2) return <div className="pdx-history-empty"><BarChart3 /><div><strong>Histórico em formação</strong><span>Novas coletas vão mostrar a evolução do preço deste produto.</span></div></div>;

  const values = points.map(item => item.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(.01, max - min);
  const coords = points.map((item, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 84 - ((item.value - min) / spread) * 62;
    return `${x},${y}`;
  }).join(" ");

  return <div className="pdx-chart">
    <div className="pdx-chart-stats"><span><small>Menor</small><strong>{brl.format(min)}</strong></span><span><small>Maior</small><strong>{brl.format(max)}</strong></span></div>
    <svg viewBox="0 0 100 100" role="img" aria-label={`Histórico de preços entre ${brl.format(min)} e ${brl.format(max)}`} preserveAspectRatio="none">
      <line x1="0" y1="84" x2="100" y2="84"/><line x1="0" y1="53" x2="100" y2="53"/><line x1="0" y1="22" x2="100" y2="22"/>
      <polyline points={coords} />
      {points.map((item, index) => { const [x, y] = coords.split(" ")[index].split(","); return <circle key={`${item.date}-${index}`} cx={x} cy={y} r="1.8"/>; })}
    </svg>
    <div className="pdx-chart-labels">{points.map((item, index) => (index === 0 || index === points.length - 1 || index === Math.floor(points.length / 2)) ? <span key={item.date}>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(item.date))}</span> : <span key={item.date}/>)}</div>
  </div>;
}

export function ProductDetailProfessional() {
  const { identifier = "" } = useParams();
  const { isFavorite, toggleFavorite } = useFavorites();
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [basket, setBasket] = useState<BasketEntry[]>([]);
  const [message, setMessage] = useState("");
  const [extra, setExtra] = useState<ProductExtra>({ manufacturer: "", barcode: "" });

  useEffect(() => {
    let active = true;
    fetchCatalog("", { force: true }).then(data => { if (active) setCatalog(data); }).finally(() => { if (active) setLoading(false); });
    setBasket(readBasket());
    const sync = () => setBasket(readBasket());
    window.addEventListener("pc:basket-changed", sync);
    return () => { active = false; window.removeEventListener("pc:basket-changed", sync); };
  }, []);

  const product = useMemo(() => catalog?.products.find(item => String(item.id) === identifier || item.slug === identifier), [catalog, identifier]);

  useEffect(() => {
    if (!product || !supabase) return;
    let active = true;
    void supabase.from("products").select("manufacturer, barcode").eq("id", String(product.id)).maybeSingle().then(({ data, error }) => {
      if (!active || error || !data) return;
      setExtra({ manufacturer: cleanValue((data as { manufacturer?: string | null }).manufacturer, ""), barcode: cleanValue((data as { barcode?: string | null }).barcode, "") });
    });
    return () => { active = false; };
  }, [product]);

  const offers = useMemo(() => product ? (product.offers?.length ? [...product.offers] : [{ establishmentId: product.establishmentId, establishmentSlug: product.establishmentSlug, establishment: product.establishment, neighborhood: product.neighborhood, storeColor: product.storeColor, value: product.minPrice, capturedAt: product.capturedAt }]).sort((a,b)=>a.value-b.value) : [], [product]);
  const similar = useMemo(() => !product || !catalog ? [] : catalog.products.filter(item => String(item.id) !== String(product.id) && item.category === product.category).sort((a,b) => a.minPrice - b.minPrice).slice(0, 4), [catalog, product]);
  const basketRows = useMemo(() => !catalog ? [] : basket.map(entry => ({ entry, product: catalog.products.find(item => String(item.id) === entry.productId) })).filter(row => row.product), [basket, catalog]);
  const basketTotal = basketRows.reduce((sum, row) => sum + (row.product?.minPrice || 0) * row.entry.quantity, 0);

  const addToBasket = async (target: Product) => {
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    if (!session?.user) {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      sessionStorage.setItem(PENDING_BASKET_KEY, JSON.stringify({ productId: String(target.id), returnTo, createdAt: Date.now() }));
      window.location.assign(`/login?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }
    const current = readBasket();
    const id = String(target.id);
    const existing = current.find(item => item.productId === id);
    const next = existing ? current.map(item => item.productId === id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { productId: id, quantity: 1 }];
    writeBasket(next); setBasket(next); setMessage("Produto adicionado à sua lista."); window.setTimeout(() => setMessage(""), 2200);
  };

  if (loading) return <main className="pdx-state"><span className="pdx-loader"/><h1>Carregando produto…</h1><p>Buscando preços e informações atualizadas.</p></main>;
  if (!product) return <main className="pdx-state"><PackageSearch/><h1>Produto não encontrado</h1><p>Este item pode ter sido atualizado ou removido.</p><Link to="/buscar">Voltar para a busca</Link></main>;

  const favorite = isFavorite(product.id);
  const quantity = basket.find(item => item.productId === String(product.id))?.quantity || 0;
  const updatedAt = formatDate(product.updated_at || product.capturedAt);
  const brand = cleanValue(product.brand);
  const manufacturer = cleanValue(extra.manufacturer);
  const barcode = cleanValue(extra.barcode || product.barcode);
  const bestOffer = offers[0];
  const priceSpread = offers.length > 1 ? Math.max(0, offers[offers.length - 1].value - offers[0].value) : 0;
  const previousPrice = Number(product.previousPrice || 0);
  const savingVsPrevious = previousPrice > product.minPrice ? previousPrice - product.minPrice : 0;

  return <div className="pdx-page">
    <PublicHeader/>

    <main id="conteudo-principal" className="pdx-shell">
      <nav className="pdx-breadcrumb" aria-label="Navegação estrutural"><Link to="/"><Home/><span>Início</span></Link><ChevronRight/><Link to={`/buscar?q=${encodeURIComponent(product.category)}`}>{product.category}</Link><ChevronRight/><span>{product.name}</span></nav>

      <section className="pdx-product" aria-labelledby="pdx-title">
        <div className="pdx-visual">
          <div className="pdx-image-stage"><span className="pdx-category-badge">{product.category}</span><ProductImage product={product}/></div>
          <div className="pdx-visual-note"><ShieldCheck/><span><strong>Imagem informativa</strong><small>O produto e a embalagem podem sofrer atualização pelo fabricante.</small></span></div>
        </div>

        <div className="pdx-core">
          <div className="pdx-identity"><span className="pdx-brand-pill"><Tag/> {brand}</span><h1 id="pdx-title">{product.name}</h1><p>{product.size || product.unit || "Embalagem não informada"}</p></div>

          <div className="pdx-price-block">
            <div><span>MENOR PREÇO ENCONTRADO <BadgeCheck/></span><strong>{brl.format(product.minPrice)}</strong><small>{bestOffer ? `em ${bestOffer.establishment}` : "preço verificado"}</small></div>
            <div className="pdx-price-facts">
              <span><Store/><b>{offers.length}</b><small>{offers.length === 1 ? "loja consultada" : "lojas comparadas"}</small></span>
              <span><TrendingDown/><b>{priceSpread ? brl.format(priceSpread) : "-"}</b><small>diferença entre lojas</small></span>
              <span><CalendarDays/><b>{updatedAt}</b><small>última verificação</small></span>
            </div>
            {savingVsPrevious > 0 && <div className="pdx-price-saving"><TrendingDown/> Está {brl.format(savingVsPrevious)} abaixo do último preço registrado.</div>}
          </div>

          <div className="pdx-actions"><button type="button" className={favorite ? "is-active" : ""} onClick={() => void toggleFavorite(product.id)}><Heart fill={favorite ? "currentColor" : "none"}/>{favorite ? "Salvo nos favoritos" : "Salvar nos favoritos"}</button><button type="button" className="pdx-primary-action pc-btn pc-btn--primary" onClick={() => void addToBasket(product)}><ShoppingBasket/>{quantity ? `Adicionar mais um · ${quantity} na lista` : "Adicionar à lista de compras"}</button></div>

          <div className="pdx-trust"><CheckCircle2/><span><strong>Preço organizado pelo PreçoCerto</strong><small>Use como referência e confirme disponibilidade diretamente com o estabelecimento.</small></span></div>
        </div>

        <aside className="pdx-specs" aria-label="Informações do produto">
          <header><span>INFORMAÇÕES DO PRODUTO</span><h2>Identificação clara</h2></header>
          <dl>
            <div><dt><Tag/>Marca</dt><dd>{brand}</dd></div>
            <div><dt><Factory/>Fabricante</dt><dd>{manufacturer}</dd></div>
            <div><dt><Layers3/>Categoria</dt><dd>{product.category}</dd></div>
            <div><dt><Package/>Embalagem</dt><dd>{product.size || product.unit || "Não informada"}</dd></div>
            <div><dt><BadgeCheck/>Código de barras</dt><dd>{barcode}</dd></div>
          </dl>
        </aside>
      </section>

      <section className="pdx-commerce-grid">
        <article className="pdx-card pdx-offers" aria-labelledby="offers-title">
          <header><div><span>ONDE COMPRAR</span><h2 id="offers-title">Compare os preços encontrados</h2><p>{offers.length > 1 ? "Ordenado do menor para o maior preço." : "Este produto ainda possui preço registrado em um estabelecimento."}</p></div><Link to="/estabelecimentos"><MapPin/>Ver estabelecimentos</Link></header>
          <div className="pdx-offer-list">{offers.slice(0, 6).map((offer,index)=><Link to={`/estabelecimento/${offer.establishmentSlug || offer.establishmentId}`} key={`${offer.establishmentId}-${offer.value}`} className={index===0 ? "is-best" : ""}><span className="pdx-rank">{index+1}</span><span className="pdx-store-info"><strong>{offer.establishment}</strong><small><MapPin/>{offer.neighborhood || "Feijó"}</small></span>{index===0 && <em><BadgeCheck/>MENOR PREÇO</em>}<span className="pdx-offer-price"><strong>{brl.format(offer.value)}</strong><small>{formatDate(offer.capturedAt)}</small></span><ArrowRight/></Link>)}</div>
        </article>

        <article className="pdx-card pdx-history-card"><header><div><span>EVOLUÇÃO DO PREÇO</span><h2>Histórico recente</h2></div><Link to={`/buscar?q=${encodeURIComponent(product.name)}`}>Ver similares <ArrowRight/></Link></header><PriceHistory product={product}/></article>
      </section>

      <section className="pdx-secondary-grid">
        <article className="pdx-card pdx-similar"><header><div><span>ALTERNATIVAS</span><h2>Produtos similares</h2></div></header>{similar.length ? <div className="pdx-similar-grid">{similar.map(item => <Link to={`/produto/${item.slug || item.id}`} key={item.id}><div className="pdx-similar-image"><ProductImage product={item} compact/></div><span className="pdx-similar-copy"><small>{cleanValue(item.brand)} · {item.size || item.unit}</small><strong>{item.name}</strong><em>{item.establishment}</em></span><b>{brl.format(item.minPrice)}</b></Link>)}</div> : <p className="pdx-empty-copy">Nenhum produto similar disponível nesta categoria.</p>}</article>

        <aside className="pdx-card pdx-list-card"><header><div><span>SUA LISTA</span><h2>Lista de compras</h2></div><b>{basket.reduce((sum,item)=>sum+item.quantity,0)} itens</b></header>{basketRows.length ? <div className="pdx-list-preview">{basketRows.slice(0,3).map(({entry,product:item}) => item && <div key={entry.productId}><span>{entry.quantity}×</span><p><strong>{item.name}</strong><small>{cleanValue(item.brand)}</small></p><b>{brl.format(item.minPrice*entry.quantity)}</b></div>)}</div> : <div className="pdx-list-empty"><ShoppingBasket/><span>Sua lista ainda está vazia.</span></div>}<footer><span>Total estimado</span><strong>{brl.format(basketTotal)}</strong></footer><Link to="/cesta-basica">Abrir lista completa <ArrowRight/></Link></aside>
      </section>

      <aside className="pdx-disclaimer"><Info/><div><strong>Catálogo informativo</strong><span>Preços e disponibilidade podem mudar. O PreçoCerto organiza as informações para facilitar sua comparação; a confirmação final deve ser feita com o estabelecimento.</span></div></aside>
    </main>



    <div className="pdx-mobile-bar"><div><small>Menor preço</small><strong>{brl.format(product.minPrice)}</strong></div><button type="button" className="pc-btn pc-btn--primary" onClick={() => void addToBasket(product)}><ShoppingBasket/>{quantity ? `Adicionar (${quantity})` : "Adicionar à lista"}</button></div>
    {message && <div className="pdx-toast" role="status" aria-live="polite">{message}</div>}
  </div>;
}
