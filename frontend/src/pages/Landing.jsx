import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Check, ShieldCheck, Lock, MapPin, Languages, Menu, X,
  TrendingUp, Calculator, Wallet, Sparkles, Building2, UserCog, User as UserIcon,
  ChevronDown, Star, FileText, Mic, ScanLine,
} from "lucide-react";
import { CompassMark } from "@/components/Logo";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";

/* ----------------------------------------------------------- copy (EN/FR) */
const COPY = {
  en: {
    nav: { features: "Features", who: "Who it's for", pricing: "Pricing", trust: "Security", faq: "FAQ" },
    signin: "Sign In", getStarted: "Get Started",
    goApp: "Open app",
    heroEyebrow: "Canadian Retirement Intelligence",
    heroTitle1: "Your financial future,",
    heroTitle2: "clearly mapped.",
    heroSub: "Precision retirement planning built for Canadian tax rules — CPP/OAS timing, RRSP/TFSA/RESP optimization, Monte Carlo simulations and cross-border US routing.",
    heroCtaPrimary: "Start your free plan",
    heroCtaSecondary: "Sign in",
    heroCardTitle: "Retirement projection",
    heroCardScenario: "Base case · retire at 65",
    heroSuccess: "Success rate",
    heroPaths: "1,000 simulated market paths",
    heroStat1: "Median portfolio", heroStat2: "Safe spend / yr", heroDelta: "+2.4% vs last run",
    trustTitle: "Built for Canadians, trusted by advisors",
    trust: [
      { t: "PIPEDA compliant", d: "Privacy by design", icon: ShieldCheck },
      { t: "Canadian data residency", d: "Stored & processed in Canada", icon: MapPin },
      { t: "TOTP MFA + encryption", d: "Bank-grade account security", icon: Lock },
      { t: "Bilingual EN / FR", d: "Full native localization", icon: Languages },
    ],
    featuresEyebrow: "The engine",
    featuresTitle: "Everything a retirement plan needs — in one place",
    featuresSub: "The same engines advisors use, from drawdown math to AI-written summaries.",
    features: [
      { icon: TrendingUp, badge: "Core engine", title: "Monte Carlo + guardrails", desc: "Stress-test portfolios across thousands of market paths with dynamic spending guardrails that flag when to adjust." },
      { icon: Calculator, badge: "Tax optimization", title: "CRA & cross-border tax math", desc: "RRSP vs TFSA drawdown order, OAS clawback avoidance, and US 401(k)/IRA cross-border treatment." },
      { icon: Wallet, badge: "Balance sheet", title: "Net worth & goals", desc: "Consolidated tracking of real estate, corporate holdings, pensions and debt amortization." },
      { icon: Sparkles, badge: "AI intelligence", title: "AI financial reports", desc: "Plain-language plan summaries, OCR for tax slips and voice-assisted meeting notes." },
    ],
    featureMini: [
      { icon: FileText, t: "Document vault" },
      { icon: ScanLine, t: "OCR letters importer" },
      { icon: Mic, t: "Voice transcription" },
    ],
    whoEyebrow: "Who it's for",
    whoTitle: "One platform, three isolated tiers",
    whoSub: "Strict tenant-scope enforcement keeps every workspace separate and secure.",
    tiers: [
      { id: "solo", icon: UserIcon, title: "Solo", subtitle: "Self-directed individuals & couples", points: ["Personalized RRSP/TFSA math", "CPP/OAS optimization", "RESP education grant tracker", "Instant PDF plan export"] },
      { id: "advisor", icon: UserCog, title: "Advisor-led", subtitle: "Wealth managers & CFP® professionals", points: ["Multi-client household dashboard", "Branded client reports", "Document vault with OCR", "CRM sync & meeting notes"], featured: true },
      { id: "enterprise", icon: Building2, title: "Enterprise", subtitle: "Firms & pension funds", points: ["Dedicated isolated tenant", "SSO / SAML & custom SLA", "Full audit trail & compliance", "Batch Monte Carlo & API"] },
    ],
    popular: "Most popular",
    pricingEyebrow: "Pricing",
    pricingTitle: "Simple, transparent pricing",
    pricingSub: "Prices in CAD. Cancel anytime. No bank-linking required.",
    perMo: "/mo",
    plans: [
      { name: "Solo", price: "$29", note: "For individuals & couples", cta: "Start free", features: ["1 household plan", "Monte Carlo projections", "Tax optimization math", "Plain-language AI reports", "PIPEDA-encrypted vault"] },
      { name: "Advisor", price: "$149", note: "For advisory practices", cta: "Start advisor trial", featured: true, features: ["Up to 50 households", "Branded client PDF reports", "Advisor queue & tasks", "Claude OCR tax-slip reader", "Whisper meeting transcripts"] },
      { name: "Enterprise", price: "Custom", note: "For firms & pension funds", cta: "Contact sales", features: ["Unlimited households & seats", "Isolated data tenant", "SSO / SAML + audit logging", "Dedicated account manager", "99.95% uptime SLA"] },
    ],
    quotesEyebrow: "Trusted by planners",
    quotesTitle: "Advisors and households, aligned",
    quotes: [
      { q: "The CRA tax math and OAS clawback calculations save us hours on every plan. Our clients finally understand their projections.", a: "Sarah Tremblay, CFP®", r: "Senior Wealth Advisor · Toronto" },
      { q: "Seeing our Monte Carlo success rate across different CPP claim ages gave us the confidence to retire three years earlier.", a: "Marcus & Elena V.", r: "Solo subscribers · Vancouver" },
    ],
    faqEyebrow: "Questions",
    faqTitle: "Frequently asked questions",
    faqs: [
      { q: "How does Compass handle Canadian tax rules and CRA updates?", a: "Our tax & estate engine encodes federal and provincial brackets, RRSP/TFSA room, and OAS clawback thresholds, and is kept current with each year's CRA rules." },
      { q: "Is my financial data stored in Canada?", a: "Yes. Compass is Canadian-resident and PIPEDA-compliant. Your data is stored and processed in Canada, and you can export or erase it at any time." },
      { q: "Can I use Compass if I hold US assets or dual CAD/USD accounts?", a: "Absolutely. The cross-border module classifies your jurisdiction and estimates US federal and state tax plus Social Security alongside your Canadian plan." },
      { q: "How do the three tiers isolate client data?", a: "Every tier runs under strict tenant-scope enforcement, so Solo, Advisor and Enterprise workspaces never share data. Enterprise can run in a dedicated isolated tenant." },
      { q: "Do I need to link my bank accounts?", a: "No. Compass never requires live bank connections — you stay in control of what you enter, and sensitive data stays encrypted in your vault." },
    ],
    ctaTitle: "Ready to map your financial future?",
    ctaSub: "Create a free Solo plan in minutes — upgrade to an advisor anytime.",
    ctaBtn: "Get started free",
    footerTagline: "Canadian retirement intelligence for individuals, advisors and enterprises.",
    footerCols: [
      { h: "Product", links: ["Features", "Pricing", "Security", "FAQ"] },
      { h: "Solutions", links: ["Solo households", "Wealth advisors", "Enterprise"] },
      { h: "Legal", links: ["Privacy Policy", "PIPEDA Compliance", "Terms of Service"] },
    ],
    madeIn: "Made in Canada",
    rights: "© 2026 Compass Planning. All rights reserved.",
  },
  fr: {
    nav: { features: "Fonctions", who: "Pour qui", pricing: "Tarifs", trust: "Sécurité", faq: "FAQ" },
    signin: "Se connecter", getStarted: "Commencer",
    goApp: "Ouvrir l'app",
    heroEyebrow: "Intelligence de retraite canadienne",
    heroTitle1: "Votre avenir financier,",
    heroTitle2: "clairement tracé.",
    heroSub: "Planification de retraite de précision conçue pour les règles fiscales canadiennes — calendrier RPC/SV, optimisation REER/CELI/REEE, simulations Monte-Carlo et gestion transfrontalière.",
    heroCtaPrimary: "Commencer gratuitement",
    heroCtaSecondary: "Se connecter",
    heroCardTitle: "Projection de retraite",
    heroCardScenario: "Scénario de base · retraite à 65 ans",
    heroSuccess: "Taux de réussite",
    heroPaths: "1 000 trajectoires de marché simulées",
    heroStat1: "Portefeuille médian", heroStat2: "Dépense sûre / an", heroDelta: "+2,4 % vs dernier calcul",
    trustTitle: "Conçu pour les Canadiens, approuvé par les conseillers",
    trust: [
      { t: "Conforme à la LPRPDE", d: "Confidentialité intégrée", icon: ShieldCheck },
      { t: "Données hébergées au Canada", d: "Stockées et traitées au Canada", icon: MapPin },
      { t: "AMF TOTP + chiffrement", d: "Sécurité de niveau bancaire", icon: Lock },
      { t: "Bilingue EN / FR", d: "Localisation native complète", icon: Languages },
    ],
    featuresEyebrow: "Le moteur",
    featuresTitle: "Tout ce qu'un plan de retraite exige — au même endroit",
    featuresSub: "Les mêmes moteurs que les conseillers utilisent, du décaissement aux résumés rédigés par l'IA.",
    features: [
      { icon: TrendingUp, badge: "Moteur principal", title: "Monte-Carlo + garde-fous", desc: "Testez vos portefeuilles sur des milliers de trajectoires de marché avec des garde-fous de dépenses dynamiques." },
      { icon: Calculator, badge: "Optimisation fiscale", title: "Fiscalité ARC et transfrontalière", desc: "Ordre de décaissement REER/CELI, évitement de la récupération de la SV et traitement des 401(k)/IRA américains." },
      { icon: Wallet, badge: "Bilan", title: "Valeur nette et objectifs", desc: "Suivi consolidé de l'immobilier, des sociétés de portefeuille, des régimes et de l'amortissement des dettes." },
      { icon: Sparkles, badge: "Intelligence IA", title: "Rapports financiers IA", desc: "Résumés de plan en langage clair, OCR des feuillets fiscaux et notes de réunion assistées par la voix." },
    ],
    featureMini: [
      { icon: FileText, t: "Coffre de documents" },
      { icon: ScanLine, t: "Importateur OCR" },
      { icon: Mic, t: "Transcription vocale" },
    ],
    whoEyebrow: "Pour qui",
    whoTitle: "Une plateforme, trois paliers isolés",
    whoSub: "L'application stricte du périmètre garde chaque espace séparé et sécurisé.",
    tiers: [
      { id: "solo", icon: UserIcon, title: "Solo", subtitle: "Particuliers et couples autonomes", points: ["Calculs REER/CELI personnalisés", "Optimisation RPC/SV", "Suivi des subventions REEE", "Export PDF instantané"] },
      { id: "advisor", icon: UserCog, title: "Conseiller", subtitle: "Gestionnaires de patrimoine et CFP®", points: ["Tableau multi-clients", "Rapports clients personnalisés", "Coffre de documents avec OCR", "Synchro CRM et notes"], featured: true },
      { id: "enterprise", icon: Building2, title: "Entreprise", subtitle: "Firmes et caisses de retraite", points: ["Locataire isolé dédié", "SSO / SAML et SLA sur mesure", "Journal d'audit complet", "Monte-Carlo par lots et API"] },
    ],
    popular: "Le plus populaire",
    pricingEyebrow: "Tarifs",
    pricingTitle: "Des tarifs simples et transparents",
    pricingSub: "Prix en CAD. Annulable à tout moment. Aucune liaison bancaire requise.",
    perMo: "/mois",
    plans: [
      { name: "Solo", price: "29 $", note: "Pour particuliers et couples", cta: "Commencer", features: ["1 plan de ménage", "Projections Monte-Carlo", "Calculs d'optimisation fiscale", "Rapports IA en langage clair", "Coffre chiffré LPRPDE"] },
      { name: "Conseiller", price: "149 $", note: "Pour les cabinets-conseils", cta: "Essai conseiller", featured: true, features: ["Jusqu'à 50 ménages", "Rapports PDF personnalisés", "File et tâches du conseiller", "Lecteur OCR de feuillets", "Transcriptions de réunions"] },
      { name: "Entreprise", price: "Sur mesure", note: "Firmes et caisses de retraite", cta: "Contacter les ventes", features: ["Ménages et sièges illimités", "Locataire de données isolé", "SSO / SAML + journal d'audit", "Gestionnaire de compte dédié", "SLA de disponibilité 99,95 %"] },
    ],
    quotesEyebrow: "Approuvé par les planificateurs",
    quotesTitle: "Conseillers et ménages, alignés",
    quotes: [
      { q: "Les calculs d'impôt ARC et de récupération de la SV nous font gagner des heures sur chaque plan. Nos clients comprennent enfin leurs projections.", a: "Sarah Tremblay, CFP®", r: "Conseillère principale · Toronto" },
      { q: "Voir notre taux de réussite Monte-Carlo selon l'âge de demande du RPC nous a donné la confiance de prendre notre retraite trois ans plus tôt.", a: "Marcus et Elena V.", r: "Abonnés Solo · Vancouver" },
    ],
    faqEyebrow: "Questions",
    faqTitle: "Questions fréquentes",
    faqs: [
      { q: "Comment Compass gère-t-il les règles fiscales canadiennes et les mises à jour de l'ARC?", a: "Notre moteur fiscal et successoral encode les tranches fédérales et provinciales, les droits REER/CELI et les seuils de récupération de la SV, et est tenu à jour chaque année." },
      { q: "Mes données financières sont-elles stockées au Canada?", a: "Oui. Compass est résident canadien et conforme à la LPRPDE. Vos données sont stockées et traitées au Canada, et vous pouvez les exporter ou les effacer à tout moment." },
      { q: "Puis-je utiliser Compass si je détiens des actifs américains ou des comptes CAD/USD?", a: "Absolument. Le module transfrontalier classe votre juridiction et estime l'impôt fédéral et d'État américain ainsi que la Sécurité sociale." },
      { q: "Comment les trois paliers isolent-ils les données?", a: "Chaque palier applique un périmètre strict : les espaces Solo, Conseiller et Entreprise ne partagent jamais de données. L'Entreprise peut utiliser un locataire isolé dédié." },
      { q: "Dois-je lier mes comptes bancaires?", a: "Non. Compass n'exige jamais de connexions bancaires en direct — vous gardez le contrôle de ce que vous saisissez, et les données sensibles restent chiffrées." },
    ],
    ctaTitle: "Prêt à tracer votre avenir financier?",
    ctaSub: "Créez un plan Solo gratuit en quelques minutes — passez à un conseiller quand vous voulez.",
    ctaBtn: "Commencer gratuitement",
    footerTagline: "Intelligence de retraite canadienne pour particuliers, conseillers et entreprises.",
    footerCols: [
      { h: "Produit", links: ["Fonctions", "Tarifs", "Sécurité", "FAQ"] },
      { h: "Solutions", links: ["Ménages Solo", "Conseillers", "Entreprise"] },
      { h: "Légal", links: ["Politique de confidentialité", "Conformité LPRPDE", "Conditions d'utilisation"] },
    ],
    madeIn: "Fait au Canada",
    rights: "© 2026 Compass Planning. Tous droits réservés.",
  },
};

const IMG = {
  advisor: "https://images.unsplash.com/photo-1714974528737-3e6c7e4d11af?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
  couple: "https://images.unsplash.com/photo-1596481945138-87b779ad006f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
  skyline: "https://images.pexels.com/photos/25696388/pexels-photo-25696388.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1400",
  advisorAvatar: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
  coupleAvatar: "https://images.unsplash.com/photo-1595235546582-7b25720b79da?crop=entropy&cs=srgb&fm=jpg&q=85&w=200",
};

const PURPLE = "linear-gradient(135deg, #2E1B6A 0%, #3B1F80 55%, #4B1D93 100%)";
const fade = { initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-80px" }, transition: { duration: 0.6, ease: "easeOut" } };

/* ----------------------------------------------------------- building blocks */
function Eyebrow({ children }) {
  return <div className="inline-flex items-center gap-2 rounded-full border border-[#00DF89]/30 bg-[#00DF89]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[#00DF89]">{children}</div>;
}

function Gauge({ value = 94 }) {
  const r = 52, c = 2 * Math.PI * r, off = c - (value / 100) * c;
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} stroke="rgba(255,255,255,0.12)" strokeWidth="10" fill="none" />
        <circle cx="60" cy="60" r={r} stroke="#00DF89" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-heading text-3xl font-extrabold text-white">{value}%</span>
      </div>
    </div>
  );
}

function FanChart() {
  return (
    <svg viewBox="0 0 320 120" className="w-full" preserveAspectRatio="none" data-testid="hero-fan-chart">
      <defs>
        <linearGradient id="fanFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#00DF89" stopOpacity="0.35" />
          <stop offset="1" stopColor="#00DF89" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 95 C80 80 160 55 320 10 L320 55 C160 80 80 92 0 102 Z" fill="url(#fanFill)" />
      <path d="M0 98 C80 86 160 60 320 32" stroke="#00DF89" strokeWidth="2.5" fill="none" />
      <path d="M0 102 C80 96 160 82 320 62" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" strokeDasharray="4 4" />
    </svg>
  );
}

/* ----------------------------------------------------------- page */
export default function Landing() {
  const { lang, setLang } = useLang();
  const { user } = useAuth();
  const nav = useNavigate();
  const t = COPY[lang === "fr" ? "fr" : "en"];
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (path) => () => nav(path);
  const navItems = [
    { id: "features", label: t.nav.features },
    { id: "who", label: t.nav.who },
    { id: "pricing", label: t.nav.pricing },
    { id: "trust", label: t.nav.trust },
    { id: "faq", label: t.nav.faq },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#120B2E] text-white font-sans antialiased" data-testid="landing-page">
      {/* ---------------- header ---------------- */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${scrolled ? "backdrop-blur-xl bg-[#120B2E]/85 border-b border-white/10" : "bg-transparent"}`}
        data-testid="landing-header"
      >
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-3" data-testid="landing-logo">
            <CompassMark size={40} />
            <div className="leading-none">
              <div className="font-heading text-lg font-extrabold uppercase tracking-tight text-white">Compass</div>
              <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#00DF89]">Planning</div>
            </div>
          </a>

          <nav className="hidden items-center gap-8 lg:flex">
            {navItems.map((n) => (
              <a key={n.id} href={`#${n.id}`} className="text-sm font-medium text-[#C0B8E3] transition-colors hover:text-white" data-testid={`nav-${n.id}`}>{n.label}</a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center rounded-full border border-white/15 p-0.5 sm:flex" data-testid="landing-lang-toggle">
              {["en", "fr"].map((l) => (
                <button key={l} onClick={() => setLang(l)} data-testid={`lang-${l}`}
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase transition-colors ${lang === l ? "bg-white text-[#2E1B6A]" : "text-[#C0B8E3] hover:text-white"}`}>{l}</button>
              ))}
            </div>
            {user ? (
              <button onClick={go(user.tier === "admin" ? "/admin" : user.is_client ? "/my-plan" : "/dashboard")} className="hidden rounded-xl bg-[#00DF89] px-4 py-2 text-sm font-bold text-[#0B061E] transition-transform hover:-translate-y-0.5 sm:inline-flex" data-testid="header-open-app">{t.goApp}</button>
            ) : (
              <>
                <button onClick={go("/login")} className="hidden rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:inline-flex" data-testid="header-sign-in">{t.signin}</button>
                <button onClick={go("/login?mode=register")} className="inline-flex items-center gap-1.5 rounded-xl bg-[#00DF89] px-4 py-2 text-sm font-bold text-[#0B061E] shadow-[0_6px_20px_rgba(0,223,137,0.35)] transition-transform hover:-translate-y-0.5" data-testid="header-get-started">{t.getStarted}<ArrowRight size={15} /></button>
              </>
            )}
            <button onClick={() => setMobileOpen((o) => !o)} className="rounded-lg p-2 text-white lg:hidden" data-testid="mobile-menu-btn" aria-label="Menu">{mobileOpen ? <X size={22} /> : <Menu size={22} />}</button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/10 bg-[#120B2E]/95 px-4 py-4 lg:hidden" data-testid="mobile-menu">
            <div className="flex flex-col gap-1">
              {navItems.map((n) => (
                <a key={n.id} href={`#${n.id}`} onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#C0B8E3] hover:bg-white/5">{n.label}</a>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={go("/login")} className="flex-1 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white">{t.signin}</button>
              <button onClick={go("/login?mode=register")} className="flex-1 rounded-xl bg-[#00DF89] px-4 py-2.5 text-sm font-bold text-[#0B061E]">{t.getStarted}</button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {["en", "fr"].map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase ${lang === l ? "bg-white text-[#2E1B6A]" : "border border-white/15 text-[#C0B8E3]"}`}>{l}</button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* ---------------- hero ---------------- */}
      <section id="top" className="relative overflow-hidden pt-32 pb-20 lg:pt-44 lg:pb-28" style={{ background: PURPLE }}>
        <div className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(0,223,137,0.18), transparent 70%)" }} />
        <div className="pointer-events-none absolute -left-40 bottom-0 h-[28rem] w-[28rem] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(123,97,255,0.5), transparent 70%)" }} />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
            <Eyebrow>{t.heroEyebrow}</Eyebrow>
            <h1 className="mt-6 font-heading text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              {t.heroTitle1}<br /><span className="text-[#00DF89]">{t.heroTitle2}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#C0B8E3] sm:text-lg">{t.heroSub}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <button onClick={go("/login?mode=register")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00DF89] px-7 py-3.5 text-base font-bold text-[#0B061E] shadow-[0_10px_30px_rgba(0,223,137,0.4)] transition-transform hover:-translate-y-0.5" data-testid="hero-get-started-btn">{t.heroCtaPrimary}<ArrowRight size={18} /></button>
              <button onClick={go("/login")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/10" data-testid="hero-sign-in-btn">{t.heroCtaSecondary}</button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 40, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }} className="relative" data-testid="hero-preview-card">
            <div className="rounded-3xl border border-white/15 bg-white/[0.07] p-6 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-[#8C82B5]">{t.heroCardScenario}</div>
                  <div className="font-heading text-lg font-bold text-white">{t.heroCardTitle}</div>
                </div>
                <div className="rounded-lg bg-[#00DF89]/15 px-2.5 py-1 text-xs font-bold text-[#00DF89]">Monte Carlo</div>
              </div>
              <div className="mt-5 flex items-center gap-5">
                <Gauge value={94} />
                <div>
                  <div className="text-sm text-[#C0B8E3]">{t.heroSuccess}</div>
                  <div className="mt-1 text-xs text-[#8C82B5]">{t.heroPaths}</div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-[#00DF89]"><TrendingUp size={14} /> {t.heroDelta}</div>
                </div>
              </div>
              <div className="mt-5"><FanChart /></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/5 p-3">
                  <div className="text-xs text-[#8C82B5]">{t.heroStat1}</div>
                  <div className="font-heading text-xl font-extrabold text-white">$1.82M</div>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <div className="text-xs text-[#8C82B5]">{t.heroStat2}</div>
                  <div className="font-heading text-xl font-extrabold text-[#00DF89]">$78,400</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------------- trust band ---------------- */}
      <section id="trust" className="border-y border-white/10 bg-[#160D36] py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.p {...fade} className="mb-8 text-center text-sm font-semibold uppercase tracking-[0.2em] text-[#8C82B5]">{t.trustTitle}</motion.p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" data-testid="landing-trust-band">
            {t.trust.map((item, i) => (
              <motion.div key={item.t} {...fade} transition={{ ...fade.transition, delay: i * 0.08 }} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00DF89]/12 text-[#00DF89]"><item.icon size={20} /></div>
                <div>
                  <div className="text-sm font-bold text-white">{item.t}</div>
                  <div className="text-xs text-[#8C82B5]">{item.d}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- features ---------------- */}
      <section id="features" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div {...fade} className="max-w-2xl">
            <Eyebrow>{t.featuresEyebrow}</Eyebrow>
            <h2 className="mt-5 font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t.featuresTitle}</h2>
            <p className="mt-4 text-base text-[#C0B8E3]">{t.featuresSub}</p>
          </motion.div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-12" data-testid="landing-features-grid">
            {t.features.map((f, i) => (
              <motion.div key={f.title} {...fade} transition={{ ...fade.transition, delay: i * 0.06 }}
                className={`group rounded-3xl border border-white/10 bg-white/[0.04] p-7 transition-all hover:border-[#00DF89]/40 hover:bg-white/[0.06] ${i === 0 || i === 3 ? "md:col-span-7" : "md:col-span-5"}`}
                data-testid={`feature-card-${i}`}>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00DF89]/12 text-[#00DF89] transition-transform group-hover:scale-110"><f.icon size={24} /></div>
                <div className="mt-5 inline-block rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[#8C82B5]">{f.badge}</div>
                <h3 className="mt-3 font-heading text-xl font-bold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#C0B8E3]">{f.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.div {...fade} className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {t.featureMini.map((m) => (
              <div key={m.t} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-[#C0B8E3]"><m.icon size={16} className="text-[#00DF89]" />{m.t}</div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ---------------- who it's for ---------------- */}
      <section id="who" className="relative overflow-hidden border-y border-white/10 bg-[#160D36] py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div {...fade} className="mx-auto max-w-2xl text-center">
            <Eyebrow>{t.whoEyebrow}</Eyebrow>
            <h2 className="mt-5 font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t.whoTitle}</h2>
            <p className="mt-4 text-base text-[#C0B8E3]">{t.whoSub}</p>
          </motion.div>

          <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3" data-testid="landing-tiers-showcase">
            {t.tiers.map((tier, i) => (
              <motion.div key={tier.id} {...fade} transition={{ ...fade.transition, delay: i * 0.1 }}
                className={`relative rounded-3xl p-8 ${tier.featured ? "border-2 border-[#00DF89]/50 bg-white/[0.07]" : "border border-white/10 bg-white/[0.03]"}`}
                data-testid={`tier-card-${tier.id}`}>
                {tier.featured && <div className="absolute -top-3 left-8 rounded-full bg-[#00DF89] px-3 py-1 text-xs font-bold text-[#0B061E]">{t.popular}</div>}
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0052FF] to-[#00DF89] text-white"><tier.icon size={24} /></div>
                <h3 className="mt-5 font-heading text-2xl font-extrabold text-white">{tier.title}</h3>
                <p className="mt-1 text-sm text-[#8C82B5]">{tier.subtitle}</p>
                <ul className="mt-6 space-y-3">
                  {tier.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm text-[#C0B8E3]"><Check size={17} className="mt-0.5 shrink-0 text-[#00DF89]" />{p}</li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- imagery split ---------------- */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <motion.div {...fade} className="relative">
            <img src={IMG.couple} alt="Retired couple overlooking a Canadian lake" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-2xl" data-testid="imagery-couple" />
            <div className="absolute -bottom-5 -right-5 hidden rounded-2xl border border-white/15 bg-[#160D36]/90 p-4 backdrop-blur sm:block">
              <div className="text-xs text-[#8C82B5]">Retire</div>
              <div className="font-heading text-2xl font-extrabold text-[#00DF89]">3 yrs earlier</div>
            </div>
          </motion.div>
          <motion.div {...fade}>
            <Eyebrow>{lang === "fr" ? "Confiance" : "Confidence"}</Eyebrow>
            <h2 className="mt-5 font-heading text-3xl font-bold tracking-tight sm:text-4xl">{lang === "fr" ? "Prenez vos décisions de retraite avec clarté" : "Make retirement decisions with clarity"}</h2>
            <p className="mt-4 text-base text-[#C0B8E3]">{lang === "fr" ? "Voyez l'impact du calendrier RPC/SV, de l'ordre de décaissement et des chocs de marché — avant de vous engager. Des chiffres clairs, un langage clair." : "See the impact of CPP/OAS timing, drawdown order and market shocks — before you commit. Clear numbers, clear language."}</p>
            <div className="mt-8 grid grid-cols-3 gap-6">
              {[["94%", t.heroSuccess], ["10k+", "Monte Carlo"], ["EN/FR", lang === "fr" ? "Bilingue" : "Bilingual"]].map(([v, l]) => (
                <div key={l}><div className="font-heading text-3xl font-extrabold text-white">{v}</div><div className="mt-1 text-xs text-[#8C82B5]">{l}</div></div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------------- pricing ---------------- */}
      <section id="pricing" className="border-y border-white/10 bg-[#160D36] py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div {...fade} className="mx-auto max-w-2xl text-center">
            <Eyebrow>{t.pricingEyebrow}</Eyebrow>
            <h2 className="mt-5 font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t.pricingTitle}</h2>
            <p className="mt-4 text-base text-[#C0B8E3]">{t.pricingSub}</p>
          </motion.div>

          <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3" data-testid="landing-pricing">
            {t.plans.map((p, i) => (
              <motion.div key={p.name} {...fade} transition={{ ...fade.transition, delay: i * 0.1 }}
                className={`relative flex flex-col rounded-3xl p-8 ${p.featured ? "border-2 border-[#00DF89]/50 bg-gradient-to-b from-white/[0.09] to-white/[0.03]" : "border border-white/10 bg-white/[0.03]"}`}
                data-testid={`pricing-card-${p.name.toLowerCase()}`}>
                {p.featured && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#00DF89] px-3 py-1 text-xs font-bold text-[#0B061E]">{t.popular}</div>}
                <div className="font-heading text-lg font-bold text-white">{p.name}</div>
                <div className="mt-1 text-xs text-[#8C82B5]">{p.note}</div>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="font-heading text-4xl font-extrabold text-white">{p.price}</span>
                  {p.price.match(/\d/) && <span className="text-sm text-[#8C82B5]">{t.perMo}</span>}
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-[#C0B8E3]"><Check size={17} className="mt-0.5 shrink-0 text-[#00DF89]" />{f}</li>
                  ))}
                </ul>
                <button onClick={go(p.name.toLowerCase() === "enterprise" || p.name.toLowerCase() === "entreprise" ? "/login" : "/login?mode=register")}
                  className={`mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-transform hover:-translate-y-0.5 ${p.featured ? "bg-[#00DF89] text-[#0B061E] shadow-[0_8px_24px_rgba(0,223,137,0.35)]" : "border border-white/20 bg-white/5 text-white hover:bg-white/10"}`}
                  data-testid={`pricing-cta-${p.name.toLowerCase()}`}>{p.cta}<ArrowRight size={16} /></button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- testimonials ---------------- */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div {...fade} className="mx-auto max-w-2xl text-center">
            <Eyebrow>{t.quotesEyebrow}</Eyebrow>
            <h2 className="mt-5 font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t.quotesTitle}</h2>
          </motion.div>
          <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2" data-testid="landing-testimonials">
            {t.quotes.map((qu, i) => (
              <motion.figure key={qu.a} {...fade} transition={{ ...fade.transition, delay: i * 0.1 }} className="rounded-3xl border border-white/10 bg-white/[0.04] p-8">
                <div className="flex gap-1 text-[#00DF89]">{[...Array(5)].map((_, s) => <Star key={s} size={16} fill="currentColor" />)}</div>
                <blockquote className="mt-5 text-lg leading-relaxed text-white">“{qu.q}”</blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <img src={i === 0 ? IMG.advisorAvatar : IMG.coupleAvatar} alt={qu.a} className="h-11 w-11 rounded-full object-cover" />
                  <div><div className="text-sm font-bold text-white">{qu.a}</div><div className="text-xs text-[#8C82B5]">{qu.r}</div></div>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- faq ---------------- */}
      <section id="faq" className="border-t border-white/10 bg-[#160D36] py-20 lg:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <motion.div {...fade} className="text-center">
            <Eyebrow>{t.faqEyebrow}</Eyebrow>
            <h2 className="mt-5 font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t.faqTitle}</h2>
          </motion.div>
          <div className="mt-12 space-y-3" data-testid="landing-faq">
            {t.faqs.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={i} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]" data-testid={`faq-item-${i}`}>
                  <button onClick={() => setOpenFaq(open ? -1 : i)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left" data-testid={`faq-toggle-${i}`}>
                    <span className="font-semibold text-white">{f.q}</span>
                    <ChevronDown size={20} className={`shrink-0 text-[#00DF89] transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && <div className="px-6 pb-5 text-sm leading-relaxed text-[#C0B8E3]" data-testid={`faq-answer-${i}`}>{f.a}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- cta banner ---------------- */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div {...fade} className="relative overflow-hidden rounded-3xl px-8 py-16 text-center lg:px-16" style={{ background: PURPLE }} data-testid="landing-cta-banner">
            <img src={IMG.skyline} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20" />
            <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(0,223,137,0.3), transparent 70%)" }} />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl font-heading text-3xl font-extrabold leading-tight sm:text-4xl lg:text-5xl">{t.ctaTitle}</h2>
              <p className="mx-auto mt-5 max-w-xl text-base text-[#C0B8E3]">{t.ctaSub}</p>
              <button onClick={go("/login?mode=register")} className="mt-9 inline-flex items-center gap-2 rounded-xl bg-[#00DF89] px-8 py-4 text-base font-bold text-[#0B061E] shadow-[0_12px_32px_rgba(0,223,137,0.45)] transition-transform hover:-translate-y-0.5" data-testid="cta-banner-btn">{t.ctaBtn}<ArrowRight size={18} /></button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------------- footer ---------------- */}
      <footer className="border-t border-white/10 bg-[#0E0824] py-14" data-testid="landing-footer">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-10 lg:grid-cols-5">
            <div className="col-span-2">
              <div className="flex items-center gap-3">
                <CompassMark size={36} />
                <div className="leading-none">
                  <div className="font-heading text-base font-extrabold uppercase tracking-tight text-white">Compass</div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#00DF89]">Planning</div>
                </div>
              </div>
              <p className="mt-4 max-w-xs text-sm text-[#8C82B5]">{t.footerTagline}</p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-[#C0B8E3]"><MapPin size={13} className="text-[#00DF89]" />{t.madeIn}</div>
            </div>
            {t.footerCols.map((col) => (
              <div key={col.h}>
                <div className="text-sm font-bold text-white">{col.h}</div>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l}><Link to="/login" className="text-sm text-[#8C82B5] transition-colors hover:text-white">{l}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
            <p className="text-xs text-[#8C82B5]">{t.rights}</p>
            <div className="flex items-center gap-1 rounded-full border border-white/10 p-0.5">
              {["en", "fr"].map((l) => (
                <button key={l} onClick={() => setLang(l)} className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${lang === l ? "bg-white text-[#2E1B6A]" : "text-[#8C82B5] hover:text-white"}`} data-testid={`footer-lang-${l}`}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
