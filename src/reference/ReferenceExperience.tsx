import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, BadgeCheck, Building2,
  Check, Code2, Eye, Heart, Info, LayoutDashboard, LockKeyhole, Mail, Map as MapIcon,
  MapPin, Menu, MessageCircle, Minus, Moon, PackageSearch, PiggyBank, Plus, Search, ShieldCheck, ShoppingBag, ShoppingBasket,
  SlidersHorizontal, Store, Sun, Tag, TrendingDown, UserRound, UsersRound, WalletCards, X,
} from "lucide-react";
import { buildCatalog, type CatalogPayload, type Product, verifiedDatasetMetrics } from "../data/catalog";
import { fetchCatalog, normalize } from "../data/remoteCatalog";
import { resolveProductImage } from "../data/productImageResolver";
import { getStoreLogoUrl } from "../data/storeLogos";
import { loadSessionProfile, requestPasswordReset, signIn, signUp } from "../lib/roles";
import { useFavorites } from "../features/favorites/FavoritesProvider";
import { OnlinePresence } from "../components/OnlinePresence";
import { SectorNavigator, getMarketplaceSector } from "./MarketplaceSectors";
import "./ReferenceExperience.css";
import "./ReferencePages.css";
import "./ReferencePagesMore.css";
import "./ReferenceResponsive.css";
import "./CompactShell.css";
import "./TypographyScale.css";
import "./HomeStoryRefinement.css";
import "./InteractionPolish.css";
import "./DarkThemeRefinement.css";
import "./ProductCardRefinement.css";
import "./SearchResultsRefinement.css";
import "./MobileAppRefinement.css";
import "./ProductComparisonRefinement.css";
import "./HomepageCompactDensity.css";
import "./Chrome2026.css";
import "./HomeSmartBasket.css";
import "./Home2026.css";
import "./Stores2026.css";
import "./StoreExperienceAcai2026.css";

const initialCatalog = buildCatalog();
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlWhole = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const percentage = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("pt-BR");
const clampSmartBudget = (value: number) => Math.min(10000, Math.max(50, Math.round(value)));

function ProductRangeSummary({ product }: { product: Product }) {
  const storeCount = product.storeCount || product.offers?.length || 1;
  const difference = Math.max(0, product.maxPrice - product.minPrice);

  if (storeCount <= 1) return <>{brl.format(product.minPrice)}<small>1 loja consultada</small></>;
  if (difference <= 0) return <>{brl.format(product.minPrice)}<small>Mesmo preço em {storeCount} lojas</small></>;

  return <>{brl.format(product.minPrice)} — {brl.format(product.maxPrice)}<small>{storeCount} lojas comparadas · diferença de {brl.format(difference)}</small></>;
}

function normalizeProductSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}

type ProductComparisonOffer = {
  establishment: string;
  neighborhood: string;
  value: number;
};

function compareProductAcrossStores(products: Product[], selected: Product | null) {
  if (!selected) return null;

  const selectedName = normalizeProductSearch(selected.name);
  const selectedSize = normalizeProductSearch(selected.size || "");
  const selectedBarcode = normalizeProductSearch(selected.barcode || "");
  const matchingProducts = products.filter(product => {
    const barcode = normalizeProductSearch(product.barcode || "");
    if (selectedBarcode && barcode) return barcode === selectedBarcode;
    return normalizeProductSearch(product.name) === selectedName
      && normalizeProductSearch(product.size || "") === selectedSize;
  });

  const offers: ProductComparisonOffer[] = [];
  matchingProducts.forEach(product => {
    if (product.offers?.length) {
      product.offers.forEach(offer => {
        if (Number.isFinite(offer.value) && offer.value > 0) offers.push({
          establishment: offer.establishment || "Comércio local",
          neighborhood: offer.neighborhood || "Feijó",
          value: offer.value,
        });
      });
      return;
    }
    if (Number.isFinite(product.minPrice) && product.minPrice > 0) offers.push({
      establishment: product.establishment || "Comércio local",
      neighborhood: product.neighborhood || "Feijó",
      value: product.minPrice,
    });
  });

  const uniqueByStore = new Map<string, ProductComparisonOffer>();
  offers.forEach(offer => {
    const storeKey = normalizeProductSearch(offer.establishment);
    const current = uniqueByStore.get(storeKey);
    if (!current || offer.value < current.value) uniqueByStore.set(storeKey, offer);
  });

  const ranked = [...uniqueByStore.values()].sort((a, b) => a.value - b.value);
  if (!ranked.length) return null;
  const lowest = ranked[0];
  const highest = ranked[ranked.length - 1];
  const difference = Math.max(0, highest.value - lowest.value);
  return {
    lowest,
    highest,
    difference,
    percentage: highest.value > 0 ? (difference / highest.value) * 100 : 0,
    storeCount: ranked.length,
  };
}

function productSearchScore(product: Product, rawQuery: string) {
  const term = normalizeProductSearch(rawQuery);
  if (!term) return 0;
  const name = normalizeProductSearch(product.name);
  const queryWords = term.split(/\s+/).filter(Boolean);
  const nameWords = name.split(/\s+/).filter(Boolean);
  if (name === term) return 0;
  if (name.startsWith(`${term} `)) return 1;
  if (name === term || name.endsWith(` ${term}`) || name.includes(` ${term} `)) return 2;
  if (name.includes(term)) return 3;
  if (queryWords.every(word => nameWords.includes(word))) return 4;
  if (queryWords.every(word => nameWords.some(nameWord => nameWord.startsWith(word)))) return 5;
  const context = normalizeProductSearch(`${product.brand} ${product.category} ${product.establishment}`);
  if (context.includes(term)) return 10;
  if (queryWords.every(word => context.includes(word))) return 11;
  if (queryWords.some(word => context.includes(word))) return 12;
  return 99;
}

function useCatalogState() {
  const [catalog, setCatalog] = useState<CatalogPayload>({ ...initialCatalog, metrics: verifiedDatasetMetrics });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetchCatalog()
      .then(value => { if (active) setCatalog(value); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return { catalog, loading };
}

function useCatalog() { return useCatalogState().catalog; }

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link className="ref-brand" to="/" aria-label="PreçoCerto — início">
    {inverse
      ? <img className="ref-brand__inverse" src="/logo-preco-certo-inversa.svg" alt="PreçoCerto" />
      : <><img className="ref-brand__light" src="/logo-preco-certo.svg" alt="PreçoCerto" /><img className="ref-brand__dark" src="/logo-preco-certo-inversa.svg" alt="" aria-hidden="true" /></>}
    <span>FEIJÓ · ACRE</span>
  </Link>;
}

export type FooterPanel = "contato" | "desenvolvedor" | null;

export function FooterInfoDialogs({ open, onClose }: { open: FooterPanel; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", closeOnEscape); };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="pc-dev-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      {open === "contato"
        ? <section className="pc-contact-dialog" role="dialog" aria-modal="true" aria-labelledby="pc-contact-title">
            <button className="pc-dev-close" type="button" aria-label="Fechar contato" onClick={onClose}><X /></button>
            <span className="pc-contact-icon"><Mail aria-hidden="true" /></span>
            <div className="pc-contact-copy"><small>CANAL OFICIAL</small><h2 id="pc-contact-title">Fale com o PreçoCerto</h2><p>Dúvidas, sugestões, parcerias, informações sobre lojas virtuais ou suporte à plataforma.</p></div>
            <a className="pc-contact-email" href="mailto:precocerto-fj@proton.me"><Mail /> <span><small>E-mail</small><strong>precocerto-fj@proton.me</strong></span></a>
            <p className="pc-contact-note"><ShieldCheck /> Utilize este endereço para contatos relacionados ao PreçoCerto.</p>
          </section>
        : <section className="pc-dev-dialog" role="dialog" aria-modal="true" aria-labelledby="pc-dev-title" aria-describedby="pc-dev-description">
            <button className="pc-dev-close" type="button" aria-label="Fechar informações" onClick={onClose}><X /></button>
            <header className="pc-dev-header">
              <span className="pc-dev-avatar"><Store aria-hidden="true" /></span>
              <div><small>PREÇOCERTO · MARKETPLACE LOCAL</small><h2 id="pc-dev-title">Comércio local em uma plataforma própria.</h2><p>Catálogo, lojas virtuais, gestão de vendas e comparação de preços em um só ecossistema.</p></div>
            </header>
            <p id="pc-dev-description" className="pc-dev-intro">O PreçoCerto nasceu em Feijó-AC para aproximar consumidores, comerciantes e prestadores locais. Além da comparação de preços, a plataforma evolui como marketplace: cada negócio pode criar sua própria loja virtual, organizar produtos e administrar sua presença e suas vendas dentro do ecossistema.</p>
            <div className="pc-dev-grid">
              <article><ShoppingBag /><div><strong>Marketplace local</strong><p>Uma vitrine digital para negócios da cidade, reunindo descoberta, catálogo, comparação e jornada de compra em um ambiente único.</p></div></article>
              <article><Building2 /><div><strong>Loja virtual própria</strong><p>Comerciantes podem estruturar sua presença digital, publicar produtos e ofertas e gerenciar a operação da própria loja dentro da plataforma.</p></div></article>
              <article><ShieldCheck /><div><strong>Clareza para o consumidor</strong><p>Quando um estabelecimento ainda não possui venda direta habilitada, o PreçoCerto identifica a página como catálogo informativo para evitar confusão.</p></div></article>
              <article><Info /><div><strong>Informação para decidir melhor</strong><p>Preços e estabelecimentos são organizados para facilitar a comparação e ajudar o público a tomar decisões de compra com mais contexto.</p></div></article>
              <article><Code2 /><div><strong>Tecnologia da plataforma</strong><p>Aplicação web construída com React, TypeScript, Vite e integração com Supabase, preparada para experiências responsivas e evolução contínua.</p></div></article>
              <article><Heart /><div><strong>Projeto feito em Feijó</strong><p>Uma iniciativa local pensada para fortalecer a presença digital dos negócios e tornar o comércio da cidade mais acessível para quem compra.</p></div></article>
            </div>
            <div className="pc-dev-signature"><span><UserRound /> Desenvolvimento e idealização</span><strong>Franc D’nis</strong><small>Assinatura técnica do projeto</small></div>
            <footer className="pc-dev-footer"><span><MapPin /> Feijó · Acre · Brasil</span><button type="button" onClick={() => onClose()}><MessageCircle /> Fechar</button></footer>
          </section>}
    </div>,
    document.body,
  );
}

function StoreLogo({ name }: { name: string }) {
  const source = getStoreLogoUrl(name);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return source && !failed
    ? <img src={source} alt={`Logomarca de ${name}`} loading="lazy" onError={() => setFailed(true)} />
    : <Store aria-hidden="true" />;
}

function ProductVisual({ product, eager = false }: { product: Product; eager?: boolean }) {
  const source = resolveProductImage(product);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return source && !failed
    ? <img src={source} alt={product.name} width="280" height="240" loading={eager ? "eager" : "lazy"} onError={() => setFailed(true)} />
    : <span className="ref-product-fallback" role="img" aria-label={`Imagem de ${product.name} em atualização`}><span className="ref-product-fallback__mark"><PackageSearch aria-hidden="true" /></span><small>{product.category || "Produto local"}<em>Imagem em atualização</em></small></span>;
}

type BasketEntry = { productId: string; quantity: number };
const BASKET_KEY = "precocerto:active_basket_items";

function readBasket(): BasketEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(BASKET_KEY) || "[]") as Array<Partial<BasketEntry> & { id?: string | number }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(item => ({ productId: String(item.productId ?? item.id ?? ""), quantity: Math.max(1, Number(item.quantity || 1)) })).filter(item => item.productId);
  } catch { return []; }
}

function writeBasket(items: BasketEntry[]) {
  localStorage.setItem(BASKET_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("pc:basket-changed"));
}

function useBasket() {
  const [items, setItems] = useState<BasketEntry[]>(readBasket);
  useEffect(() => {
    const refresh = () => setItems(readBasket());
    window.addEventListener("storage", refresh);
    window.addEventListener("pc:basket-changed", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("pc:basket-changed", refresh); };
  }, []);
  const update = (productId: string | number, delta: number) => {
    const id = String(productId);
    const current = readBasket();
    const found = current.find(item => item.productId === id);
    const next = found
      ? current.map(item => item.productId === id ? { ...item, quantity: item.quantity + delta } : item).filter(item => item.quantity > 0)
      : delta > 0 ? [...current, { productId: id, quantity: delta }] : current;
    writeBasket(next);
  };
  return { items, update, count: items.reduce((sum, item) => sum + item.quantity, 0) };
}

function ThemeButton() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const toggle = () => {
    const next = !dark;
    setDark(next);
    const theme = next ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("theme", theme);
  };
  return <button className="ref-theme" type="button" onClick={toggle} aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}>{dark ? <Sun /> : <Moon />}</button>;
}

export function PublicHeader({ current }: { current?: "home" | "search" | "basket" | "stores" | "profile" }) {
  const [menu, setMenu] = useState(false);
  const { count } = useBasket();
  useEffect(() => { setMenu(false); }, [current]);
  return <header className="ref-header">
    <div className="ref-shell ref-header__inner">
      <Brand />
      <nav className="ref-nav" aria-label="Navegação principal">
        <Link className={current === "home" ? "is-active" : ""} to="/">Início</Link>
        <Link to="/explorar">Setores</Link>
        <Link className={current === "search" ? "is-active" : ""} to="/buscar">Buscar</Link>
        <Link className={current === "stores" ? "is-active" : ""} to="/estabelecimentos">Lojas</Link>
        <Link className={current === "basket" ? "is-active" : ""} to="/cesta-basica">Lista {count > 0 && <b>{count}</b>}</Link>
      </nav>
      <div className="ref-header__utility">
        <span className="ref-location"><MapPin aria-hidden="true" /><span><small>Você está em</small><strong>Feijó, AC</strong></span></span>
        {current === "home" && <OnlinePresence />}
      </div>
      <div className="ref-header__actions">
        <ThemeButton />
        <Link className="ref-favorites-link" to="/favoritos" aria-label="Favoritos"><Heart /></Link>
        <Link className="ref-signin" to="/login">Entrar</Link>
        <button type="button" className="ref-menu" aria-label={menu ? "Fechar menu" : "Abrir menu"} aria-expanded={menu} onClick={() => setMenu(value => !value)}>{menu ? <X /> : <Menu />}</button>
      </div>
    </div>
    {menu && <nav className="ref-mobile-menu" aria-label="Menu">
      <Link to="/explorar" onClick={() => setMenu(false)}><SlidersHorizontal aria-hidden="true" /> Explorar setores</Link>
      <Link to="/buscar" onClick={() => setMenu(false)}><Search aria-hidden="true" /> Buscar no PreçoCerto</Link>
      <Link to="/estabelecimentos" onClick={() => setMenu(false)}><Store aria-hidden="true" /> Estabelecimentos</Link>
      <Link to="/cesta-basica" onClick={() => setMenu(false)}><ShoppingBasket aria-hidden="true" /> Lista de compras</Link>
      <Link to="/favoritos" onClick={() => setMenu(false)}><Heart aria-hidden="true" /> Meus favoritos</Link>
      <Link to="/lojista" onClick={() => setMenu(false)}><Building2 aria-hidden="true" /> Para negócios</Link>
      <div className="ref-mobile-menu__footer"><ThemeButton /><span>Alterar tema</span></div>
    </nav>}
  </header>;
}

export function PublicFooter() {
  const [panel, setPanel] = useState<FooterPanel>(null);
  return <footer className="ref-footer">
    <div className="ref-shell ref-footer__inner">
      <div className="ref-footer__identity">
        <Brand inverse />
        <p>O preço certo perto de você.</p>
        <div className="ref-footer__panel-triggers">
          <button type="button" onClick={() => setPanel("contato")}><MessageCircle aria-hidden="true" /> Contato</button>
          <button type="button" onClick={() => setPanel("desenvolvedor")}><UserRound aria-hidden="true" /> Desenvolvedor</button>
        </div>
      </div>
      <nav aria-label="Navegação do rodapé">
        <div><strong>Plataforma</strong><Link to="/buscar">Comparar preços</Link><Link to="/explorar">Setores</Link><Link to="/estabelecimentos">Lojas locais</Link><Link to="/cesta-basica">Lista de compras</Link></div>
        <div><strong>Negócios</strong><Link to="/lojista">Seja um parceiro</Link><Link to="/quero-vender">Quero vender</Link><Link to="/painel-lojista">Painel lojista</Link></div>
        <div><strong>Suporte</strong><Link to="/fale-conosco">Fale conosco</Link><Link to="/colaborar">Colaborar</Link><Link to="/meus-pedidos">Rastrear pedido</Link></div>
      </nav>
      <div className="ref-footer__meta"><span><BadgeCheck aria-hidden="true" /> Preços locais verificados</span><small>&copy; 2026 PreçoCerto · Feijó, AC <i className="ref-footer__dev">dev. &lt;FrancD'nis&gt;</i></small></div>
    </div>
    <FooterInfoDialogs open={panel} onClose={() => setPanel(null)} />
  </footer>;
}

export function AppDock({ current }: { current: "home" | "search" | "basket" | "stores" | "profile" }) {
  return <nav className="ref-dock" aria-label="Navegação principal do aplicativo">
    <Link className={current === "home" ? "is-active" : ""} to="/" aria-current={current === "home" ? "page" : undefined}><LayoutDashboard aria-hidden="true" /><span>Início</span></Link>
    <Link className={current === "search" ? "is-active" : ""} to="/buscar" aria-current={current === "search" ? "page" : undefined}><Search aria-hidden="true" /><span>Buscar</span></Link>
    <Link className={current === "basket" ? "is-active" : ""} to="/cesta-basica" aria-current={current === "basket" ? "page" : undefined}><ShoppingBasket aria-hidden="true" /><span>Cesta</span></Link>
    <Link className={current === "stores" ? "is-active" : ""} to="/estabelecimentos" aria-current={current === "stores" ? "page" : undefined}><Store aria-hidden="true" /><span>Lojas</span></Link>
    <Link className={current === "profile" ? "is-active" : ""} to="/favoritos" aria-current={current === "profile" ? "page" : undefined}><Heart aria-hidden="true" /><span>Favoritos</span></Link>
  </nav>;
}

function SmartBasketHome() {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [budget, setBudget] = useState(350);
  const [people, setPeople] = useState(2);

  useEffect(() => {
    let active = true;
    void loadSessionProfile().then(profile => { if (active) setAuthenticated(Boolean(profile)); });
    return () => { active = false; };
  }, []);

  const perPerson = useMemo(() => budget / Math.max(1, people), [budget, people]);
  const changeBudget = (delta: number) => setBudget(current => clampSmartBudget(current + delta));
  const startPlanner = () => {
    sessionStorage.setItem("precocerto:smart-basket-prefill", JSON.stringify({ budget, people }));
    const destination = `/cesta-inteligente?budget=${budget}&people=${people}`;
    navigate(authenticated ? destination : `/login?redirect=${encodeURIComponent(destination)}`);
  };

  return <section className="home-smart-basket" aria-labelledby="home-smart-basket-title">
    <div className="home-smart-basket__shell">
      <div className="home-smart-basket__copy">
        <span className="home-smart-basket__eyebrow"><ShoppingBasket aria-hidden="true" /> CESTA INTELIGENTE PREÇOCERTO</span>
        <h2 id="home-smart-basket-title">Monte uma cesta que cabe no seu orçamento.</h2>
        <p>Informe quanto pode gastar e o PreçoCerto organiza uma sugestão de compra com itens essenciais, usando os preços cadastrados no comércio local.</p>
        <div className="home-smart-basket__modes" aria-label="Modos de comparação">
          <span><PiggyBank aria-hidden="true" /><b>Maior economia</b><small>Menor preço de cada item, mesmo em lojas diferentes.</small></span>
          <span><Store aria-hidden="true" /><b>Mais praticidade</b><small>Melhor combinação possível em um único estabelecimento.</small></span>
        </div>
        <div className="home-smart-basket__trust"><BadgeCheck aria-hidden="true" /> Ferramenta exclusiva para usuários cadastrados · sua cesta pode ser salva na conta</div>
      </div>
      <div className="home-smart-basket__planner" aria-label="Planejamento rápido da cesta">
        <header><span><WalletCards aria-hidden="true" /></span><div><small>PLANEJAMENTO RÁPIDO</small><strong>Quanto você quer gastar?</strong></div></header>
        <div className="home-smart-basket__money">
          <div className="home-smart-basket__money-label"><span>Orçamento disponível</span><small>Ajuste em passos de R$ 50</small></div>
          <div className="home-smart-basket__budget-control" role="group" aria-label="Selecionar orçamento disponível">
            <button type="button" onClick={() => changeBudget(-50)} disabled={budget <= 50} aria-label="Diminuir orçamento em 50 reais"><Minus aria-hidden="true" /></button>
            <label><span>R$</span><input aria-label="Valor do orçamento disponível" type="number" inputMode="numeric" min="50" max="10000" step="50" value={budget} onChange={event => setBudget(clampSmartBudget(Number(event.target.value) || 50))} /></label>
            <button type="button" onClick={() => changeBudget(50)} disabled={budget >= 10000} aria-label="Aumentar orçamento em 50 reais"><Plus aria-hidden="true" /></button>
          </div>
        </div>
        <div className="home-smart-basket__quick-values" aria-label="Sugestões rápidas de orçamento">
          {[150, 250, 350, 500].map(value => <button key={value} type="button" className={budget === value ? "is-active" : ""} onClick={() => setBudget(value)}><span>{brlWhole.format(value)}</span>{value === 350 && <small>mais usado</small>}</button>)}
        </div>
        <label className="home-smart-basket__people"><span><UsersRound aria-hidden="true" /> Pessoas na casa</span><select value={people} onChange={event => setPeople(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8].map(value => <option key={value} value={value}>{value} {value === 1 ? "pessoa" : "pessoas"}</option>)}</select></label>
        <div className="home-smart-basket__estimate"><span>Referência por pessoa</span><strong>{brlWhole.format(perPerson)}</strong></div>
        <button className="home-smart-basket__cta" type="button" onClick={startPlanner}>{authenticated === false ? "Entrar e montar minha cesta" : "Montar minha cesta"}<ArrowRight aria-hidden="true" /></button>
        <small className="home-smart-basket__note">A ferramenta é de planejamento de compras e não representa recomendação nutricional nem cesta oficial de governo.</small>
      </div>
    </div>
  </section>;
}

export function ReferenceHome() {
  const searchFormRef = useRef<HTMLFormElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchPointerActiveRef = useRef(false);
  const productDialogRef = useRef<HTMLDivElement>(null);
  const productDialogHistoryRef = useRef<string | null>(null);
  const { catalog, loading: catalogLoading } = useCatalogState();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedComparison, setSelectedComparison] = useState<ReturnType<typeof compareProductAcrossStores>>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [featuredHour, setFeaturedHour] = useState(() => Math.floor(Date.now() / 3_600_000));
  const featured = useMemo(() => {
    const eligible = catalog.products.filter(product => product.minPrice > 0 && Boolean(resolveProductImage(product)));
    const byStore = new Map<string, Product[]>();
    eligible.forEach(product => {
      const storeKey = String(product.establishmentId || product.establishmentSlug || product.establishment).toLocaleLowerCase("pt-BR");
      if (!storeKey) return;
      byStore.set(storeKey, [...(byStore.get(storeKey) || []), product]);
    });
    const daySeed = Math.floor(featuredHour / 24);
    const hash = (value: string) => Array.from(value).reduce((total, character) => Math.imul(total ^ character.charCodeAt(0), 16777619) >>> 0, daySeed >>> 0);
    const stores = [...byStore.entries()].sort(([a], [b]) => hash(a) - hash(b));
    if (!stores.length) return [];
    const start = (featuredHour * 4) % stores.length;
    return Array.from({ length: Math.min(4, stores.length) }, (_, index) => stores[(start + index) % stores.length])
      .map(([storeKey, products], index) => products[hash(`${storeKey}:${featuredHour}:${index}`) % products.length]);
  }, [catalog.products, featuredHour]);
  const lead = useMemo(() => {
    const productsWithImage = catalog.products.filter(product => product.minPrice > 0 && Boolean(resolveProductImage(product)));
    if (!productsWithImage.length) return undefined;
    const seed = Math.imul(featuredHour ^ (featuredHour >>> 16), 2246822519) >>> 0;
    return productsWithImage[seed % productsWithImage.length];
  }, [catalog.products, featuredHour]);
  const receipt = useMemo(() => [...catalog.products].filter(product => product.minPrice > 0).sort((a, b) => (b.maxPrice - b.minPrice) - (a.maxPrice - a.minPrice)).slice(0, 3), [catalog.products]);
  const searchResults = useMemo(() => {
    const term = normalizeProductSearch(query);
    if (!term) return [];
    return catalog.products
      .filter(product => product.minPrice > 0)
      .map(product => ({ product, score: productSearchScore(product, term) }))
      .filter(item => item.score < 99)
      .sort((a, b) => a.score - b.score || a.product.minPrice - b.product.minPrice || a.product.name.localeCompare(b.product.name, "pt-BR"))
      .slice(0, 5)
      .map(item => item.product);
  }, [catalog.products, query]);
  useEffect(() => setActiveSearchIndex(-1), [query]);
  useEffect(() => {
    let cancelled = false;
    if (!selectedProduct) {
      setSelectedComparison(null);
      setComparisonLoading(false);
      return;
    }
    setSelectedComparison(null);
    setComparisonLoading(true);
    void fetchCatalog("", { force: true })
      .then(freshCatalog => { if (!cancelled) setSelectedComparison(compareProductAcrossStores(freshCatalog.products, selectedProduct)); })
      .catch(() => { if (!cancelled) setSelectedComparison(null); })
      .finally(() => { if (!cancelled) setComparisonLoading(false); });
    return () => { cancelled = true; };
  }, [selectedProduct]);
  useEffect(() => {
    if (!selectedProduct) return;
    const marker = `product-dialog-${Date.now()}-${String(selectedProduct.id)}`;
    window.history.pushState({ ...window.history.state, productDialog: marker }, "", window.location.href);
    productDialogHistoryRef.current = marker;
    const handlePopState = () => { if (productDialogHistoryRef.current !== marker) return; productDialogHistoryRef.current = null; setSelectedProduct(null); };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [selectedProduct?.id]);
  const closeProductDialog = () => { if (productDialogHistoryRef.current) window.history.back(); else setSelectedProduct(null); };
  const leaveProductDialog = () => { if (productDialogHistoryRef.current) { const nextState = { ...(window.history.state || {}) }; delete nextState.productDialog; window.history.replaceState(nextState, "", window.location.href); productDialogHistoryRef.current = null; } setSelectedProduct(null); };
  useEffect(() => { let intervalId = 0; const remaining = 3_600_000 - (Date.now() % 3_600_000); const timeoutId = window.setTimeout(() => { setFeaturedHour(Math.floor(Date.now() / 3_600_000)); intervalId = window.setInterval(() => setFeaturedHour(Math.floor(Date.now() / 3_600_000)), 3_600_000); }, remaining); return () => { window.clearTimeout(timeoutId); if (intervalId) window.clearInterval(intervalId); }; }, []);
  useEffect(() => { if (!searchOpen || activeSearchIndex < 0) return; document.getElementById(`resultado-busca-${activeSearchIndex}`)?.scrollIntoView({ block: "nearest" }); }, [activeSearchIndex, searchOpen]);
  useEffect(() => {
    if (!searchOpen) return;
    const closeSearch = () => { setSearchOpen(false); setActiveSearchIndex(-1); };
    const isInsideSearch = (event: PointerEvent) => { if (searchFormRef.current?.contains(event.target as Node)) return true; const panel = document.getElementById("resultados-busca-home"); if (!panel) return false; const bounds = panel.getBoundingClientRect(); return event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom; };
    const handlePointerDown = (event: PointerEvent) => { if (isInsideSearch(event)) { searchPointerActiveRef.current = true; return; } closeSearch(); };
    const handlePointerEnd = () => { window.requestAnimationFrame(() => { searchPointerActiveRef.current = false; }); };
    const handleFocusIn = (event: FocusEvent) => { if (!searchPointerActiveRef.current && !searchFormRef.current?.contains(event.target as Node)) closeSearch(); };
    document.addEventListener("pointerdown", handlePointerDown, true); document.addEventListener("pointerup", handlePointerEnd, true); document.addEventListener("pointercancel", handlePointerEnd, true); document.addEventListener("focusin", handleFocusIn);
    return () => { document.removeEventListener("pointerdown", handlePointerDown, true); document.removeEventListener("pointerup", handlePointerEnd, true); document.removeEventListener("pointercancel", handlePointerEnd, true); document.removeEventListener("focusin", handleFocusIn); searchPointerActiveRef.current = false; };
  }, [searchOpen]);
  const clearSearch = () => { setQuery(""); setSearchOpen(false); setActiveSearchIndex(-1); window.requestAnimationFrame(() => searchInputRef.current?.focus()); };
  const submit = (event: FormEvent) => { event.preventDefault(); navigate(query.trim() ? `/buscar?q=${encodeURIComponent(query.trim())}` : "/buscar"); };
  useEffect(() => {
    if (!selectedProduct) return;
    const body = document.body; const previousOverflow = body.style.overflow; const previousPaddingRight = body.style.paddingRight; const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth; body.style.overflow = "hidden"; if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    const dialog = productDialogRef.current; const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])') || []); focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeProductDialog(); if (event.key !== "Tab") return; const items = focusable(); if (!items.length) return; const first = items[0]; const last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } };
    document.addEventListener("keydown", handleKeyDown); return () => { document.removeEventListener("keydown", handleKeyDown); body.style.overflow = previousOverflow; body.style.paddingRight = previousPaddingRight; searchInputRef.current?.focus(); };
  }, [selectedProduct]);
  return <div className="ref-page ref-home"><PublicHeader current="home" /><main id="conteudo-principal">
      <section className="ref-hero"><div className="ref-shell ref-hero__grid"><div className="ref-hero__copy"><span className="ref-kicker"><i /> AO VIVO EM FEIJÓ</span><h1>Compare antes<br /><em>de comprar.</em></h1><p>Encontre os menores preços em mercados e mercearias de Feijó. Informação local para economizar todos os dias.</p><form ref={searchFormRef} className={`ref-search${query ? " has-query" : ""}`} onSubmit={submit} role="search" onFocus={() => setSearchOpen(true)}><Search aria-hidden="true" /><input ref={searchInputRef} name="busca" autoComplete="off" value={query} onChange={event => { setQuery(event.target.value); setSearchOpen(true); }} onKeyDown={event => { if (event.key === "ArrowDown" && searchResults.length) { event.preventDefault(); setSearchOpen(true); setActiveSearchIndex(index => Math.min(index + 1, searchResults.length - 1)); } else if (event.key === "ArrowUp" && searchResults.length) { event.preventDefault(); setSearchOpen(true); setActiveSearchIndex(index => index <= 0 ? searchResults.length - 1 : index - 1); } else if (event.key === "Home" && searchOpen && searchResults.length) { event.preventDefault(); setActiveSearchIndex(0); } else if (event.key === "End" && searchOpen && searchResults.length) { event.preventDefault(); setActiveSearchIndex(searchResults.length - 1); } else if (event.key === "Enter" && searchOpen && activeSearchIndex >= 0 && searchResults[activeSearchIndex]) { event.preventDefault(); setSearchOpen(false); setSelectedProduct(searchResults[activeSearchIndex]); } else if (event.key === "Escape") { event.preventDefault(); setSearchOpen(false); setActiveSearchIndex(-1); } }} placeholder="Buscar produto, marca ou mercado…" aria-label="Buscar produto, marca ou mercado" role="combobox" aria-autocomplete="list" aria-expanded={searchOpen && Boolean(query.trim())} aria-controls="resultados-busca-home" aria-activedescendant={activeSearchIndex >= 0 ? `resultado-busca-${activeSearchIndex}` : undefined} />{query && <button className="ref-search-clear" type="button" aria-label="Limpar pesquisa" title="Limpar pesquisa" onPointerDown={event => event.preventDefault()} onClick={clearSearch}><X aria-hidden="true" /><span>Limpar</span></button>}<button className="ref-search-submit" type="submit" aria-label="Ver todos os resultados">Comparar <ArrowRight /></button>{searchOpen && query.trim() && <div className="ref-search-results" id="resultados-busca-home" role="listbox" aria-label="Resultados da pesquisa"><header><span>Melhores correspondências</span><small aria-live="polite">{searchResults.length ? `${searchResults.length} ${searchResults.length === 1 ? "produto encontrado" : "produtos encontrados"}` : "Nenhum produto encontrado"}</small></header>{searchResults.length ? <div className="ref-search-results__list">{searchResults.map((product, index) => <button id={`resultado-busca-${index}`} key={product.id} type="button" role="option" aria-selected={activeSearchIndex === index} tabIndex={-1} className={activeSearchIndex === index ? "is-keyboard-active" : ""} onMouseEnter={() => setActiveSearchIndex(index)} onClick={() => { setSearchOpen(false); setActiveSearchIndex(-1); setSelectedProduct(product); }} aria-label={`Ver detalhes de ${product.name}, menor preço ${brl.format(product.minPrice)}`}><span className="ref-search-results__image"><ProductVisual product={product} /></span><span className="ref-search-results__copy"><small>{product.category}</small><strong>{product.name}</strong><em>{product.establishment || "Comércio local"}</em></span><span className="ref-search-results__price"><small>Menor preço</small><strong>{brl.format(product.minPrice)}</strong></span><ArrowRight aria-hidden="true" /></button>)}</div> : <div className="ref-search-results__empty" role="status"><PackageSearch aria-hidden="true" /><div><strong>Não encontramos esse produto.</strong><span>Confira a escrita ou tente uma palavra do nome, como “arroz”, “leite” ou “sabão”.</span></div></div>}<footer><small><kbd>↑</kbd><kbd>↓</kbd> navegar · <kbd>Enter</kbd> abrir · <kbd>Esc</kbd> fechar</small><button type="submit">Ver todos os resultados <ArrowRight aria-hidden="true" /></button></footer></div>}</form><div className="ref-trust"><span><BadgeCheck /> Preços verificados</span><span><MapPin /> Hiperlocal</span><span><ShieldCheck /> Dados protegidos</span></div></div>{catalogLoading ? <div className="ref-live-card ref-live-card--loading" aria-busy="true" aria-label="Carregando preço verificado"><div className="ref-live-card__top"><span>PREÇO VERIFICADO</span><small>Atualizando dados…</small></div><div className="ref-live-card__skeleton"><i /><div><i /><i /><i /></div></div><div className="ref-live-card__skeleton-prices"><i /><i /></div><span className="ref-live-card__loading-label">Consultando os preços mais recentes de Feijó…</span></div> : lead && <div className="ref-live-card"><div className="ref-live-card__top"><span>PREÇO VERIFICADO</span><small>Novo destaque a cada 60 min</small></div><div className="ref-live-card__product"><ProductVisual product={lead} eager /><div><small>{lead.category}</small><h2>{lead.name}</h2><p>{lead.size || lead.brand}</p></div></div><div className="ref-live-card__prices"><div><small>Menor preço</small><strong>{brl.format(lead.minPrice)}</strong><span>{lead.establishment}</span></div><div><small>Economize até</small><strong>{brl.format(Math.max(0, lead.maxPrice - lead.minPrice))}</strong><span>comparando agora</span></div></div><button type="button" onClick={() => navigate(`/produto/${lead.slug || lead.id}`)}>Ver comparação completa <ArrowRight /></button></div>}</div></section>
      <SmartBasketHome />
      <section className="ref-proof"><div className="ref-shell ref-proof__grid"><div><strong>{integer.format(catalog.metrics.prices)}</strong><span>preços verificados</span></div><div><strong>{integer.format(catalog.metrics.products)}</strong><span>produtos monitorados</span></div><div><strong>{integer.format(catalog.metrics.stores)}</strong><span>estabelecimentos locais</span></div><div><strong>Feijó</strong><span>feito para nossa cidade</span></div></div></section>
      <section className="ref-sectors ref-shell" aria-labelledby="ref-sectors-title"><div className="ref-sectors__heading"><div><span>EXPLORE SEM MISTURAR</span><h2 id="ref-sectors-title">Cada busca no lugar certo.</h2></div><p>Escolha um setor para ver produtos, serviços, lojas e profissionais com filtros próprios.</p></div><SectorNavigator compact/><Link className="ref-sectors__all" to="/explorar">Entender todos os setores <ArrowRight /></Link></section>
      <section className="ref-section ref-shell"><div className="ref-section__heading"><div><h2>Onde seu dinheiro rende mais.</h2><p className="ref-section__rotation-note">Seleção renovada a cada 60 minutos, com um comércio diferente em cada destaque.</p></div><Link to="/buscar">Ver todos os preços <ArrowRight /></Link></div><div className="ref-price-board">{featured.map((product, index) => <Link to={`/produto/${product.slug || product.id}`} className="ref-price-row" key={product.id}><span className="ref-price-rank">{String(index + 1).padStart(2, "0")}</span><span className="ref-price-image"><ProductVisual product={product} /></span><span className="ref-price-name"><small>{product.category}</small><strong>{product.name}</strong><em>{product.size || product.brand}</em></span><span className="ref-price-store"><small>melhor em</small><strong>{product.establishment}</strong><em>{product.neighborhood}</em></span><span className="ref-price-value"><small>a partir de</small><strong>{brl.format(product.minPrice)}</strong><em>{product.storeCount || product.offers?.length || 1} ofertas</em></span><ArrowRight /></Link>)}</div></section>
      <section className="ref-economy"><div className="ref-shell ref-economy__grid"><div><h2>Compare sua lista.<br />Sinta a diferença no bolso.</h2><p>Compare a mesma lista em diferentes lojas e veja, em valores reais, quanto pode economizar no seu bolso.</p><div className="ref-economy__signals"><span><BadgeCheck /> {receipt.length} itens comparados</span><span><MapPin /> Preços de Feijó</span></div><Link to="/cesta-basica">Montar lista de compras <ArrowRight /></Link></div><aside className="ref-receipt" aria-label="Simulação de economia da lista"><header className="ref-receipt__top"><div><strong>PREÇO<span>CERTO</span></strong><small>Comparação local</small></div><span>SIMULAÇÃO</span></header><div className="ref-receipt__meta"><span>Feijó · Acre</span><span>Atualizado hoje</span></div>{receipt.map(product => <div className="ref-receipt__item" key={product.id}><div><span>{product.name}</span><small>{product.establishment}</small></div><strong>{brl.format(product.minPrice)}</strong><em>Economia {brl.format(Math.max(0, product.maxPrice - product.minPrice))}</em></div>)}<div className="ref-receipt__summary"><div><span>Total nos menores preços</span><strong>{brl.format(receipt.reduce((sum, item) => sum + item.minPrice, 0))}</strong></div></div><div className="ref-receipt__total"><div><span>Você pode economizar</span><small>nesta lista</small></div><strong>{brl.format(receipt.reduce((sum, item) => sum + Math.max(0, item.maxPrice - item.minPrice), 0))}</strong></div><footer className="ref-receipt__note"><BadgeCheck /><span>Preços locais verificados<small>Consulte antes da compra.</small></span></footer></aside></div></section>
      <section className="ref-local"><div className="ref-shell ref-local__inner"><div><h2>O mercado do seu bairro,<br />na sua mão.</h2><p>Explore catálogos, veja atualizações e encontre lojas perto de você.</p></div><div className="ref-local__actions"><Link to="/estabelecimentos"><Store /> Ver estabelecimentos <ArrowRight /></Link><Link to="/lojista"><Building2 /> Cadastrar meu comércio <ArrowRight /></Link></div></div></section>
    </main><PublicFooter /><AppDock current="home" />{selectedProduct && <div className="ref-product-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeProductDialog(); }}><div ref={productDialogRef} className="ref-product-dialog" role="dialog" aria-modal="true" aria-labelledby="produto-modal-titulo"><button className="ref-product-dialog__close" type="button" aria-label="Fechar detalhes do produto" onClick={closeProductDialog}><X aria-hidden="true" /></button><div className="ref-product-dialog__visual"><span>{selectedProduct.category}</span><ProductVisual product={selectedProduct} eager /></div><section><span className="ref-product-dialog__eyebrow"><BadgeCheck /> PREÇO LOCAL VERIFICADO</span><h2 id="produto-modal-titulo">{selectedProduct.name}</h2><p>{[selectedProduct.brand, selectedProduct.size].filter(Boolean).join(" · ")}</p><div className="ref-product-dialog__prices" aria-busy={comparisonLoading}><div className={comparisonLoading ? "is-loading" : ""}><small>Menor preço ao vivo</small><strong>{comparisonLoading ? "Consultando…" : brl.format(selectedComparison?.lowest.value ?? selectedProduct.minPrice)}</strong><span>{comparisonLoading ? "Buscando estabelecimentos" : selectedComparison?.lowest.establishment || selectedProduct.establishment || "Comércio local"}</span></div><div className={comparisonLoading ? "is-loading" : (selectedComparison?.difference || 0) > 0 ? "has-savings" : "no-savings"}><small>Diferença encontrada</small><strong>{comparisonLoading ? "Atualizando preços…" : (selectedComparison?.difference || 0) > 0 ? brl.format(selectedComparison!.difference) : "Sem diferença ainda"}</strong><span>{comparisonLoading ? "Comparando o mesmo produto em lojas distintas" : (selectedComparison?.difference || 0) > 0 ? `${percentage.format(selectedComparison!.percentage)}% · de ${brl.format(selectedComparison!.highest.value)} para ${brl.format(selectedComparison!.lowest.value)}` : `${selectedComparison?.storeCount || 1} ${(selectedComparison?.storeCount || 1) === 1 ? "loja consultada" : "lojas consultadas"}`}</span></div></div><div className="ref-product-dialog__store"><MapPin aria-hidden="true" /><span><small>Melhor opção encontrada</small><strong>{comparisonLoading ? "Atualizando estabelecimento…" : selectedComparison?.lowest.establishment || selectedProduct.establishment || "Comércio local"}</strong><em>{comparisonLoading ? "Consulta ao vivo em andamento" : selectedComparison?.lowest.neighborhood || selectedProduct.neighborhood || "Feijó, Acre"}</em></span></div><Link to={`/produto/${selectedProduct.slug || selectedProduct.id}`} onClick={leaveProductDialog}>Ver comparação completa <ArrowRight aria-hidden="true" /></Link></section></div></div>}</div>;
}

export function ReferenceStoresPage() {
  const catalog = useCatalog(); const [params] = useSearchParams(); const activeDirectorySector = getMarketplaceSector(params.get("setor")); const [query, setQuery] = useState(""); const [mapStore, setMapStore] = useState(""); const [visibleStores, setVisibleStores] = useState(6); const stores = catalog.stores.filter(store => { const matchesQuery = normalize(`${store.name} ${store.neighborhood}`).includes(normalize(query)); const matchesSector = !activeDirectorySector || activeDirectorySector.businessKinds.includes(store.kind || "market"); return matchesQuery && matchesSector; }); const listedStores = stores.slice(0, visibleStores); useEffect(() => setVisibleStores(6), [query]); const mapLabel = mapStore || `${activeDirectorySector?.label || "Estabelecimentos"} em Feijó`; const mapQuery = encodeURIComponent(`${mapLabel}, Acre, Brasil`);
  return <div className="ref-page ref-directory ref-stores-page"><PublicHeader current="stores" /><main id="conteudo-principal" className="ref-shell ref-directory__main"><section className="ref-stores-hero"><div><span>{activeDirectorySector ? activeDirectorySector.eyebrow.toLocaleUpperCase("pt-BR") : "COMÉRCIO LOCAL VERIFICADO"}</span><h1>{activeDirectorySector ? activeDirectorySector.label : <>Negócios locais,<br />mais perto.</>}</h1><p>{activeDirectorySector?.description || "Descubra estabelecimentos de Feijó, consulte catálogos e encontre onde comprar melhor."}</p><div><BadgeCheck /> {stores.length} {stores.length === 1 ? "cadastro neste setor" : "cadastros neste setor"}</div></div><Link to="/lojista">Cadastrar meu negócio <ArrowRight /></Link></section><div className="ref-search-sectors"><SectorNavigator active={activeDirectorySector?.id || "all"} compact/></div><div className="ref-stores-toolbar"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={activeDirectorySector ? `Buscar em ${activeDirectorySector.shortLabel}` : "Buscar negócio ou bairro"} aria-label="Buscar estabelecimento" /><span>{stores.length} {stores.length === 1 ? "resultado" : "resultados"}</span></div><section className="ref-stores-directory"><div className="ref-store-cards"><header><div><span>ESTABELECIMENTOS</span><h2>Comércios para explorar</h2></div><small>Catálogos e preços locais</small></header>{listedStores.map(store => <article className={`ref-store-card${mapStore === store.name ? " is-map-active" : ""}`} key={store.id}><button className="ref-store-card__select" type="button" onClick={() => setMapStore(store.name)} aria-label={`Mostrar ${store.name} no mapa`}><i style={{ background: store.color }}><StoreLogo name={store.name} /></i><span><small>{store.neighborhood}</small><strong>{store.name}</strong><em>{store.products} produtos no catálogo</em></span><MapPin aria-hidden="true" /></button><footer><button type="button" onClick={() => setMapStore(store.name)}><MapPin /> Localizar</button><Link to={`/estabelecimento/${store.slug}`}>Abrir catálogo <ArrowRight /></Link></footer></article>)}{visibleStores < stores.length && <button className="ref-stores-more" type="button" onClick={() => setVisibleStores(count => Math.min(count + 6, stores.length))}>Mostrar mais estabelecimentos <span>{stores.length - visibleStores} restantes</span></button>}{!stores.length && <div className="ref-empty"><Store /><h2>Nenhum estabelecimento encontrado</h2><p>Tente buscar por outro nome ou bairro.</p></div>}</div><aside className="ref-stores-map" id="mapa-estabelecimentos"><header><MapIcon /><span><strong>{mapStore || "Mapa do comércio local"}</strong><small>{mapStore ? "Localização pesquisada em Feijó" : `Explore ${activeDirectorySector?.shortLabel.toLocaleLowerCase("pt-BR") || "negócios"} de Feijó`}</small></span></header><iframe key={mapQuery} title={`Mapa de ${mapLabel}`} src={`https://www.google.com/maps?q=${mapQuery}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /><a href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer">Abrir mapa completo <ArrowRight /></a></aside></section></main><PublicFooter /><AppDock current="stores" /></div>;
}

export function ReferenceFavoritesPage() { const catalog = useCatalog(); const { favoriteIds, loading, toggleFavorite } = useFavorites(); const products = catalog.products.filter(item => favoriteIds.includes(String(item.id))); return <div className="ref-page ref-directory"><PublicHeader /><main id="conteudo-principal" className="ref-shell ref-directory__main"><div className="ref-page-title"><div><span>SEUS PRODUTOS</span><h1>Favoritos para acompanhar.</h1><p>Reúna aqui os preços que você quer consultar de novo.</p></div><div className="ref-update"><Heart /><span>{favoriteIds.length} favoritos<small>sincronizados com sua conta</small></span></div></div>{loading ? <div className="ref-empty"><span className="ref-spinner" /><p>Carregando favoritos…</p></div> : products.length ? <div className="ref-product-grid">{products.map(product => <article key={product.id}><button type="button" onClick={() => void toggleFavorite(product.id)} aria-label={`Remover ${product.name}`}><X /></button><Link to={`/produto/${product.slug}`}><div><ProductVisual product={product} /></div><small>{product.category}</small><strong>{product.name}</strong><span>{product.size}</span><footer><em>a partir de</em><b>{brl.format(product.minPrice)}</b></footer></Link></article>)}</div> : <div className="ref-empty ref-empty--large"><Heart /><h2>Nenhum favorito ainda</h2><p>Salve produtos para consultar os preços mais rápido.</p><Link to="/buscar">Explorar preços <ArrowRight /></Link></div>}</main><PublicFooter /><AppDock current="profile" /></div>; }

export function ReferenceAuthPage({ mode }: { mode: "login" | "register" }) { const navigate = useNavigate(); const [accountType, setAccountType] = useState<"consumer" | "merchant">("consumer"); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setMessage(""); const data = new FormData(event.currentTarget); const email = String(data.get("email") || "").trim(); const password = String(data.get("password") || ""); const result = mode === "login" ? await signIn(email, password) : await signUp(email, password, String(data.get("name") || "").trim()); setBusy(false); if (result.error) setMessage(result.error); else navigate(accountType === "merchant" ? "/painel-lojista" : "/"); }; const recover = async () => { const email = prompt("Digite seu e-mail para recuperar a senha:")?.trim(); if (!email) return; const result = await requestPasswordReset(email); setMessage(result.error || "Enviamos as instruções para o seu e-mail."); }; return <div className="ref-auth"><aside className="ref-auth__story"><Brand inverse /><div className="ref-auth__hero-copy"><span className="ref-kicker"><MapPin /> FEIJÓ, ACRE</span><h1>Escolhas melhores<br />começam por aqui.</h1><p>Compare preços locais com clareza e compre com mais confiança.</p><div className="ref-auth__trust-grid"><article><BadgeCheck /><span><strong>Preços verificados</strong><small>Informação local atualizada</small></span></article><article><Search /><span><strong>Compare em segundos</strong><small>Produtos e mercados de Feijó</small></span></article></div></div><small>PreçoCerto · Economia perto de você</small></aside><main className="ref-auth__form"><Link className="ref-auth__back" to="/"><ArrowLeft /> Voltar ao PreçoCerto</Link><div className="ref-auth__card"><span className="ref-auth__eyebrow">{mode === "login" ? "BEM-VINDO DE VOLTA" : "COMECE AGORA"}</span><h2>{mode === "login" ? "Entrar na sua conta" : "Criar sua conta"}</h2><p>{mode === "login" ? "Acesse preços, favoritos e seus últimos comparativos." : "Escolha como você quer usar o PreçoCerto."}</p><div className="ref-account-tabs"><button type="button" className={accountType === "consumer" ? "is-active" : ""} onClick={() => setAccountType("consumer")}><UserRound /> Consumidor<small>Quero comparar preços</small></button><button type="button" className={accountType === "merchant" ? "is-active" : ""} onClick={() => setAccountType("merchant")}><Store /> Comerciante<small>Quero divulgar ofertas</small></button></div><form onSubmit={submit}>{mode === "register" && <label>Nome completo<input name="name" required autoComplete="name" /></label>}<label>E-mail<input name="email" type="email" required autoComplete="email" /></label><label>Senha<input name="password" type="password" minLength={6} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>{message && <p className="ref-auth__message" role="status">{message}</p>}<button className="ref-auth__submit" type="submit" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar minha conta"}<ArrowRight /></button></form>{mode === "login" && <button type="button" className="ref-auth__recover" onClick={recover}>Esqueci minha senha</button>}<div className="ref-auth__switch"><span>{mode === "login" ? "Ainda não tem conta?" : "Já possui uma conta?"}</span><Link to={mode === "login" ? "/cadastro" : "/login"}>{mode === "login" ? "Criar conta" : "Entrar"}</Link></div><p className="ref-auth__safe"><LockKeyhole /> Seus dados estão protegidos.</p></div></main><AppDock current="profile" /></div>; }

export function ReferenceMerchantDashboard() { const catalog = useCatalog(); const rows = catalog.products.slice(0, 6); return <div className="ref-admin ref-merchant-admin"><aside className="ref-admin__sidebar"><Brand inverse /><nav><span>GESTÃO</span><Link className="is-active" to="/painel-lojista"><LayoutDashboard /> Visão geral</Link><Link to="/painel-lojista/catalogo"><PackageSearch /> Catálogo</Link><Link to="/painel-lojista/vendas-online"><ShoppingBasket /> Pedidos</Link><span>NEGÓCIO</span><Link to="/painel-lojista/configurar-negocio"><Store /> Minha loja</Link><Link to="/estabelecimentos"><Eye /> Ver no site</Link></nav><small>PreçoCerto · Feijó, Acre</small></aside><main id="conteudo-principal" className="ref-admin__main"><header><div><span>PAINEL DO COMERCIANTE</span><h1>Central Super</h1><p>Preços, estoque e visibilidade do seu catálogo.</p></div><div><ThemeButton /><Link to="/">Ver site</Link></div></header><section className="ref-admin__cards"><article><Tag /><span>Produtos publicados</span><strong>{rows.length}</strong><small>catálogo ativo</small></article><article><BadgeCheck /><span>Preços atualizados</span><strong>92%</strong><small>nas últimas 24 horas</small></article><article><Eye /><span>Visualizações</span><strong>1.284</strong><small>nesta semana</small></article><article><TrendingDown /><span>Melhores preços</span><strong>4</strong><small>liderando comparações</small></article></section><section className="ref-merchant-table"><header><div><span>CATÁLOGO</span><h2>Preços e estoque</h2></div><button type="button"><Plus /> Novo produto</button></header><div className="ref-results-table"><div className="ref-results-table__head"><span>Produto</span><span>Status</span><span>Mercado local</span><span>Seu preço</span><span /></div>{rows.map(product => <div className="ref-result-row" key={product.id}><span className="ref-result-product"><i><ProductVisual product={product} /></i><span><small>{product.category}</small><strong>{product.name}</strong><em>{product.size}</em></span></span><span className="ref-status"><Check /> publicado</span><span className="ref-result-range">{brl.format(product.minPrice)} — {brl.format(product.maxPrice)}<small>{product.storeCount} lojas</small></span><strong className="ref-result-price">{brl.format(product.minPrice)}</strong><button type="button" aria-label={`Editar ${product.name}`}>Editar</button></div>)}</div></section></main></div>; }

type InfoKind = "collaborate" | "contact" | "pharmacies" | "orders" | "culture";
const infoCopy: Record<InfoKind, { eyebrow: string; title: string; copy: string; action: string; to: string }> = { collaborate: { eyebrow: "COLABORE COM FEIJÓ", title: "Ajude a manter os preços úteis.", copy: "Compartilhe atualizações e fortaleça uma base local mais transparente para todos.", action: "Entrar para colaborar", to: "/login" }, contact: { eyebrow: "FALE COM O PREÇOCERTO", title: "Estamos perto para ouvir.", copy: "Envie sua dúvida, sugestão ou proposta de parceria com o comércio local.", action: "Acessar minha conta", to: "/login" }, pharmacies: { eyebrow: "SAÚDE LOCAL", title: "Farmácias de Feijó.", copy: "A cobertura de preços de farmácias está sendo organizada com verificação e responsabilidade.", action: "Ver estabelecimentos", to: "/estabelecimentos" }, orders: { eyebrow: "SUAS COMPRAS", title: "Pedidos em um só lugar.", copy: "Entre para acompanhar pagamentos, preparo e entrega dos pedidos feitos nas lojas participantes.", action: "Entrar para continuar", to: "/login" }, culture: { eyebrow: "CULTURA DE FEIJÓ", title: "Talento local também tem valor.", copy: "Descubra projetos, livros e produções da nossa cidade dentro do ecossistema PreçoCerto.", action: "Explorar estabelecimentos", to: "/estabelecimentos" } };
export function ReferenceInfoPage({ kind }: { kind: InfoKind }) { const content = infoCopy[kind]; return <div className="ref-page"><PublicHeader /><main id="conteudo-principal" className="ref-info"><span>{content.eyebrow}</span><h1>{content.title}</h1><p>{content.copy}</p><Link to={content.to}>{content.action} <ArrowRight /></Link></main><PublicFooter /></div>; }
export function ReferenceNotFound() { return <div className="ref-page"><PublicHeader /><main id="conteudo-principal" className="ref-info"><span>PÁGINA NÃO ENCONTRADA</span><h1>Vamos voltar ao preço certo.</h1><p>Este endereço não existe ou foi reorganizado na nova experiência.</p><Link to="/">Ir para a homepage <ArrowRight /></Link></main><PublicFooter /></div>; }
