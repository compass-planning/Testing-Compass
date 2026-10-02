import React, { createContext, useContext, useState, useCallback } from "react";

const DICT = {
  en: {
    // language toggle
    lang_en: "EN", lang_fr: "FR",
    // MyPlan (client portal)
    welcome_back: "Welcome back, {name}",
    myplan_sub: "Your plan at a glance. Your advisor keeps this up to date — reach out any time to make changes.",
    net_worth: "Net Worth", total_assets: "Total Assets", total_debt: "Total Debt",
    my_goals: "My Goals", no_goals_title: "No goals yet", no_goals_body: "Your advisor will add goals to your plan.",
    by_year: "by {year}",
    readonly_note: "This is a read-only view maintained by your advisor. Contact them to update your goals or financial details.",
    replay_tour: "Replay tour",
    tour1_title: "Your net worth at a glance",
    tour1_body: "The cards up top show your net worth, total assets and total debt — refreshed whenever your advisor updates your plan.",
    tour2_title: "Track your goals",
    tour2_body: "Every goal your advisor sets up appears below with a live progress bar, so you always know how close you are.",
    tour3_title: "Your advisor keeps it current",
    tour3_body: "This view is read-only. To change a goal or add details, just reach out to your advisor — they manage everything here for you.",
    skip: "Skip", back: "Back", next: "Next", get_started: "Get started",
    // Client Report preview
    live_preview: "Live preview — reflects your selected sections ({n} on)",
    protection_score: "Protection score", retirement_success: "Retirement success", not_run: "Not run",
    balance_sheet: "Balance sheet", total_liabilities: "Total liabilities", monthly_expenses: "Monthly expenses",
    retirement: "Retirement", scenario: "Scenario", projected_portfolio: "Projected portfolio at retirement",
    target_monthly_income: "Target monthly income", retirement_age: "Retirement age", success_probability: "Success probability",
    no_retirement: "No retirement scenario saved yet.",
    protection_gaps: "Protection gaps", life_gap: "Life insurance gap", di_gap: "Disability monthly gap", ltc_gap: "Long-term care gap",
    no_protection: "No protection analyses saved yet.",
    top_goals: "Top goals", no_goals: "No goals on file.",
    estate: "Estate", probate_fees: "Probate fees", deemed_tax: "Deemed tax", settlement_cost: "Settlement cost",
    no_estate: "No estate register entries.",
    crossborder: "US / cross-border", jurisdiction: "Jurisdiction", us_federal_tax: "US federal tax",
    us_state_tax: "US state tax", total_us_tax: "Total US tax", ss_67: "Social Security at 67",
    education: "Education funding (RESP)", combined_projected: "Combined projected value", covered: "covered",
    attached_documents: "Attached documents",
  },
  fr: {
    lang_en: "EN", lang_fr: "FR",
    welcome_back: "Bon retour, {name}",
    myplan_sub: "Votre plan en un coup d'œil. Votre conseiller le tient à jour — contactez-le à tout moment pour des changements.",
    net_worth: "Valeur nette", total_assets: "Actif total", total_debt: "Dette totale",
    my_goals: "Mes objectifs", no_goals_title: "Aucun objectif pour l'instant", no_goals_body: "Votre conseiller ajoutera des objectifs à votre plan.",
    by_year: "d'ici {year}",
    readonly_note: "Ceci est une vue en lecture seule gérée par votre conseiller. Contactez-le pour mettre à jour vos objectifs ou vos renseignements financiers.",
    replay_tour: "Revoir la visite",
    tour1_title: "Votre valeur nette en un coup d'œil",
    tour1_body: "Les cartes en haut affichent votre valeur nette, votre actif total et votre dette totale — mis à jour dès que votre conseiller modifie votre plan.",
    tour2_title: "Suivez vos objectifs",
    tour2_body: "Chaque objectif établi par votre conseiller apparaît ci-dessous avec une barre de progression en direct, pour toujours savoir où vous en êtes.",
    tour3_title: "Votre conseiller le tient à jour",
    tour3_body: "Cette vue est en lecture seule. Pour modifier un objectif ou ajouter des détails, contactez simplement votre conseiller — il gère tout ici pour vous.",
    skip: "Passer", back: "Retour", next: "Suivant", get_started: "Commencer",
    live_preview: "Aperçu en direct — reflète les sections sélectionnées ({n} activées)",
    protection_score: "Indice de protection", retirement_success: "Réussite de la retraite", not_run: "Non calculé",
    balance_sheet: "Bilan", total_liabilities: "Passif total", monthly_expenses: "Dépenses mensuelles",
    retirement: "Retraite", scenario: "Scénario", projected_portfolio: "Portefeuille projeté à la retraite",
    target_monthly_income: "Revenu mensuel cible", retirement_age: "Âge de la retraite", success_probability: "Probabilité de réussite",
    no_retirement: "Aucun scénario de retraite enregistré.",
    protection_gaps: "Lacunes de protection", life_gap: "Lacune d'assurance vie", di_gap: "Lacune mensuelle d'invalidité", ltc_gap: "Lacune de soins de longue durée",
    no_protection: "Aucune analyse de protection enregistrée.",
    top_goals: "Principaux objectifs", no_goals: "Aucun objectif au dossier.",
    estate: "Succession", probate_fees: "Frais d'homologation", deemed_tax: "Impôt présumé", settlement_cost: "Coût de règlement",
    no_estate: "Aucune entrée au registre successoral.",
    crossborder: "É.-U. / transfrontalier", jurisdiction: "Juridiction", us_federal_tax: "Impôt fédéral américain",
    us_state_tax: "Impôt d'État américain", total_us_tax: "Impôt américain total", ss_67: "Sécurité sociale à 67 ans",
    education: "Financement des études (REEE)", combined_projected: "Valeur projetée combinée", covered: "couvert",
    attached_documents: "Documents joints",
  },
};

const Ctx = createContext(null);
const KEY = "compass_lang";

// English-keyed FR map for the global advisor-screen pass (nav, page headers, chrome, empties).
const EN2FR = {
  // nav + groups
  "Net Worth": "Valeur nette", "Goals": "Objectifs", "Debt": "Dettes", "Retirement": "Retraite",
  "Education": "Études", "Insurance": "Assurance", "Cross-Border": "Transfrontalier",
  "Cash Flow": "Flux de trésorerie", "Tax & Estate": "Fiscalité et succession",
  "AI Insights": "Analyses IA", "Documents": "Documents", "Client Report": "Rapport client",
  "Financial Plan": "Plan financier", "Privacy & PIPEDA": "Confidentialité et LPRPDE",
  "Audit Log": "Journal d'audit", "My Plan": "Mon plan", "Insights": "Analyses", "My Goals": "Mes objectifs",
  "My Profile": "Mon profil", "My Dashboard": "Mon tableau de bord", "Dashboard": "Tableau de bord",
  "Client Profile": "Profil du client", "Clients": "Clients", "Tasks": "Tâches", "Households": "Ménages",
  "CRM Sync": "Synchro CRM", "Work with an Advisor": "Travailler avec un conseiller",
  "Activity Log": "Journal d'activité",
  "Financial Planning Suite": "Suite de planification financière", "Reports": "Rapports",
  "Governance": "Gouvernance", "Overview": "Vue d'ensemble", "Privacy": "Confidentialité",
  // chrome
  "Active client": "Client actif", "Change client": "Changer de client", "Sign out": "Se déconnecter",
  "Change password": "Changer le mot de passe", "Current password": "Mot de passe actuel",
  "New password": "Nouveau mot de passe", "Confirm new password": "Confirmer le nouveau mot de passe",
  "Update password": "Mettre à jour le mot de passe", "Cancel": "Annuler",
  "At least 8 characters, different from your current one": "Au moins 8 caractères, différent de l'actuel",
  "MFA On": "AMF activée", "MFA Off": "AMF désactivée", "Tier": "Palier",
  "Enterprise": "Entreprise", "Advisor": "Conseiller", "Solo": "Solo",
  // page titles
  "Documents & Meetings": "Documents et réunions", "Education (RESP)": "Études (REEE)",
  "Financial Goals": "Objectifs financiers", "Household Queue": "File des ménages",
  "Insurance & Protection": "Assurance et protection", "Task Board": "Tableau des tâches",
  "US / Cross-Border": "É.-U. / transfrontalier",
  // page subtitles
  "A branded one-page household summary you can download and share.": "Un sommaire d'une page à votre image, à télécharger et à partager.",
  "A consolidated snapshot of your household plan across every module.": "Un aperçu consolidé du plan du ménage, tous modules confondus.",
  "A secure vault for plans, statements and wills — plus recorded meeting notes.": "Un coffre sécurisé pour les plans, relevés et testaments — avec les notes de réunion enregistrées.",
  "An insight-led view of where your household stands today.": "Une vue axée sur les analyses de la situation actuelle du ménage.",
  "Append-only record of activity within your tenant scope. Foundation for PIPEDA breach/audit reporting.": "Registre en ajout seul de l'activité dans votre périmètre. Base des rapports d'audit et d'atteinte LPRPDE.",
  "Balances, rates and payoff strategy for the household.": "Soldes, taux et stratégie de remboursement du ménage.",
  "Canadian projection, Monte Carlo stress-testing and drawdown strategy.": "Projection canadienne, simulations Monte-Carlo et stratégie de décaissement.",
  "Canadian tax projection, registered-account room and estate planning (illustrative).": "Projection fiscale canadienne, droits de cotisation et planification successorale (à titre indicatif).",
  "Classify tax jurisdiction and estimate US federal + state tax and Social Security for cross-border households.": "Déterminez la juridiction fiscale et estimez l'impôt fédéral et d'État américain ainsi que la Sécurité sociale pour les ménages transfrontaliers.",
  "Every household in your book, scored and triaged by what needs attention.": "Chaque ménage de votre portefeuille, noté et trié selon ce qui requiert votre attention.",
  "Follow-ups logged from your household queue, in one place.": "Les suivis consignés depuis votre file de ménages, au même endroit.",
  "Household balance sheet — assets, liabilities and education savings.": "Bilan du ménage — actifs, passifs et épargne-études.",
  "Household details that power your plan: income, retirement age and spouse.": "Les renseignements du ménage qui alimentent votre plan : revenu, âge de la retraite et conjoint.",
  "Household members, income and retirement details that power the plan.": "Membres du ménage, revenu et détails de retraite qui alimentent le plan.",
  "Life-insurance needs analysis, disability and long-term-care planning.": "Analyse des besoins en assurance vie, invalidité et soins de longue durée.",
  "Manage consent, exercise your right to access and erasure, and review your retention policy.": "Gérez le consentement, exercez vos droits d'accès et d'effacement, et consultez votre politique de conservation.",
  "Monthly household income versus expenses.": "Revenus mensuels du ménage par rapport aux dépenses.",
  "Plain-language, plan-aware guidance generated from your household data.": "Des conseils en langage clair, adaptés au plan, générés à partir des données du ménage.",
  "Plan an RESP for each child with CESG and CLB grants, then save them as goals.": "Planifiez un REEE pour chaque enfant avec les subventions SCEE et BEC, puis enregistrez-les comme objectifs.",
  "Promote your Solo plan to an advisor-managed household. Your explicit consent is re-captured and the migration is fully audited.": "Faites passer votre plan Solo à un ménage géré par un conseiller. Votre consentement explicite est recueilli de nouveau et la migration est entièrement auditée.",
  "Salesforce is the authoritative source of truth. Compass pulls from it — deletions never propagate back.": "Salesforce est la source de vérité. Compass s'y synchronise — les suppressions ne sont jamais propagées en retour.",
  "Track progress toward retirement, income, legacy and major-purchase goals.": "Suivez la progression vers vos objectifs de retraite, de revenu, d'héritage et d'achats importants.",
  // common empties
  "No clients yet": "Aucun client pour l'instant", "No household members yet": "Aucun membre du ménage",
  "No goals yet": "Aucun objectif pour l'instant", "No goals on file.": "Aucun objectif au dossier.",
  // common actions / fields (planner pages)
  "Add entry": "Ajouter une entrée", "Quick add:": "Ajout rapide :", "Cancel": "Annuler",
  "Name": "Nom", "Owner": "Propriétaire", "Category": "Catégorie", "Name / notes": "Nom / notes",
  "Market value": "Valeur marchande", "Balance": "Solde", "Mortgage / Loan": "Hypothèque / Prêt",
  "Net worth": "Valeur nette", "Total assets": "Actif total", "Total liabilities": "Passif total",
  "Assets": "Actifs", "Liabilities": "Passifs",
  "Use Quick Add to record an entry.": "Utilisez l'ajout rapide pour enregistrer une entrée.",
  // Goals page
  "New goal": "Nouvel objectif", "Edit": "Modifier",
  "Create your first financial goal to start tracking.": "Créez votre premier objectif financier pour commencer le suivi.",
  "Goal title": "Titre de l'objectif", "Target year": "Année cible", "Target amount": "Montant cible",
  "Current amount": "Montant actuel", "Monthly contribution": "Cotisation mensuelle",
  "Expected growth (%/yr)": "Croissance prévue (%/an)", "Save goal": "Enregistrer l'objectif",
  "Create goal": "Créer l'objectif", "New financial goal": "Nouvel objectif financier",
  // Debt page
  "Add debt": "Ajouter une dette", "Total debt": "Dette totale", "Monthly payments": "Paiements mensuels",
  "Weighted avg rate": "Taux moyen pondéré", "Lifetime interest": "Intérêts à vie",
  "No debts yet": "Aucune dette pour l'instant",
  "Add a mortgage, loan or line of credit to see payoff analytics.": "Ajoutez une hypothèque, un prêt ou une marge de crédit pour voir l'analyse de remboursement.",
  "Lender": "Prêteur", "Rate": "Taux", "Payment": "Paiement", "Payoff": "Remboursement",
  "Interest": "Intérêts", "Debt name": "Nom de la dette", "Debt-free in": "Libre de dettes dans",
  "Total interest": "Intérêts totaux", "Payoff order": "Ordre de remboursement",
  // modal fields + planner page chrome (NetWorth / Debt / Goals / Insurance / Retirement / Tax)
  "Save": "Enregistrer", "CRM-managed": "Géré par CRM", "Loading…": "Chargement…",
  "Balance (CAD)": "Solde (CAD)", "Market value (CAD)": "Valeur marchande (CAD)",
  "Total value (CAD)": "Valeur totale (CAD)", "Current value (CAD)": "Valeur actuelle (CAD)",
  "Mortgage amount ($)": "Montant de l'hypothèque ($)", "Interest rate (%)": "Taux d'intérêt (%)",
  "Mortgage payment ($)": "Paiement hypothécaire ($)", "Payment frequency": "Fréquence de paiement",
  "Property taxes ($/yr)": "Taxes foncières ($/an)", "Rental property?": "Immeuble locatif ?",
  "Monthly rental income ($)": "Revenu locatif mensuel ($)", "Held in a holding company?": "Détenu par une société de portefeuille ?",
  "Holding type": "Type de placement", "Contribution amount ($)": "Montant de la cotisation ($)",
  "Contribution frequency": "Fréquence des cotisations", "Purchase price ($)": "Prix d'achat ($)",
  "Loan amount ($)": "Montant du prêt ($)", "Payment ($)": "Paiement ($)",
  "Loan length (years)": "Durée du prêt (années)", "Purchase date": "Date d'achat",
  "Extra monthly payment (CAD)": "Paiement mensuel supplémentaire (CAD)", "Balance ($)": "Solde ($)",
  "Rate (%)": "Taux (%)", "Monthly payment ($)": "Paiement mensuel ($)",
  "Link to owner (optional)": "Lier à un propriétaire (optionnel)",
  "Retirement age": "Âge de la retraite",
  // Insurance
  "Save to household": "Enregistrer au ménage", "Annual income": "Revenu annuel",
  "Working years remaining": "Années de travail restantes", "Personal consumption rate": "Taux de consommation personnelle",
  "Mortgage balance": "Solde hypothécaire", "Other debts": "Autres dettes",
  "Education fund target": "Objectif de fonds d'études", "Final expenses": "Dépenses finales",
  "Existing life coverage": "Couverture vie existante", "Liquid assets": "Actifs liquides",
  "Discount rate (HLV)": "Taux d'actualisation (VVH)", "Withdrawal rate (Cap. Retention)": "Taux de retrait (rétention du capital)",
  "Preferred method": "Méthode préférée", "Life": "Vie", "Disability": "Invalidité", "Long-Term Care": "Soins de longue durée",
  // Retirement
  "Prefill from profile": "Préremplir à partir du profil", "Save & reuse": "Enregistrer et réutiliser",
  "Expected return (%)": "Rendement prévu (%)", "Inflation (%)": "Inflation (%)", "Life expectancy": "Espérance de vie",
  "Current age": "Âge actuel", "Plan to age": "Planifier jusqu'à l'âge", "Province": "Province",
  "Projection": "Projection", "Monte Carlo": "Monte-Carlo", "Guardrails": "Garde-fous",
  "Timing": "Calendrier", "Decisions": "Décisions", "Scenarios": "Scénarios",
  // Tax
  "Taxable income (CAD)": "Revenu imposable (CAD)", "Federal tax": "Impôt fédéral", "Provincial tax": "Impôt provincial",
  "Earned income": "Revenu gagné", "Contributed this year": "Cotisé cette année", "Unused carry-forward": "Report inutilisé",
  "Eligible since (year 18+ & resident)": "Admissible depuis (18 ans+ et résident)",
  "Total contributions to date": "Cotisations totales à ce jour", "Realized gain": "Gain réalisé",
  "RRSP": "REER", "TFSA": "CELI", "Capital Gains": "Gains en capital", "Income Splitting": "Fractionnement du revenu",
  "Estate": "Succession", "Expiring soon": "Expire bientôt", "Renews soon": "Renouvellement proche",
  "Life Needs": "Besoins vie", "CPP / OAS Timing": "Calendrier RPC / SV",
  "Tax Projection": "Projection fiscale", "RRSP Room": "Droits REER", "TFSA Room": "Droits CELI",
  // Retirement sub-tab fields
  "Desired income ($/yr, after-tax)": "Revenu souhaité ($/an, après impôt)", "RRSP balance": "Solde REER",
  "TFSA balance": "Solde CELI", "Non-registered balance": "Solde non enregistré",
  "Non-reg tax treatment": "Traitement fiscal non enregistré", "Non-reg ACB": "PBR non enregistré",
  "Annual RRSP contribution": "Cotisation REER annuelle", "Annual TFSA contribution": "Cotisation CELI annuelle",
  "DB pension ($/yr)": "Rente PD ($/an)", "CPP (monthly, today's $)": "RPC (mensuel, $ d'aujourd'hui)",
  "CPP start age": "Âge de début du RPC", "OAS (monthly, today's $)": "SV (mensuel, $ d'aujourd'hui)",
  "OAS start age": "Âge de début de la SV", "Portfolio allocation": "Répartition du portefeuille",
  "Number of paths": "Nombre de trajectoires", "Current income": "Revenu actuel",
  "Expected retirement income": "Revenu de retraite prévu", "Your income": "Votre revenu",
  "Eligible pension": "Rente admissible", "Spouse income": "Revenu du conjoint", "Scenario name": "Nom du scénario",
  // Tax sub-tab fields
  "Other taxable income": "Autre revenu imposable", "Primary income": "Revenu principal",
  "Estate value (net worth)": "Valeur de la succession (valeur nette)", "Registered assets (RRSP/RRIF)": "Actifs enregistrés (REER/FERR)",
  "Entry type": "Type d'entrée", "Asset / policy": "Actif / police", "Beneficiary": "Bénéficiaire",
  "Allocation (%)": "Répartition (%)", "Document name": "Nom du document", "Status": "Statut",
  "Renewing soon": "Renouvellement proche", "Accept all": "Tout accepter",
};

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(KEY) || "en");
  const setLang = (l) => { localStorage.setItem(KEY, l); setLangState(l); };
  const t = useCallback((key, vars) => {
    let s = (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
    if (vars) Object.keys(vars).forEach((k) => { s = s.replace(`{${k}}`, vars[k]); });
    return s;
  }, [lang]);
  const tr = useCallback((s) => (lang === "fr" && typeof s === "string" ? (EN2FR[s] || s) : s), [lang]);
  return <Ctx.Provider value={{ lang, setLang, t, tr }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx) || { lang: "en", setLang: () => {}, t: (k) => k, tr: (s) => s };
export const useTr = () => (useContext(Ctx) || { tr: (s) => s }).tr;
