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

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem(KEY) || "en");
  const setLang = (l) => { localStorage.setItem(KEY, l); setLangState(l); };
  const t = useCallback((key, vars) => {
    let s = (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
    if (vars) Object.keys(vars).forEach((k) => { s = s.replace(`{${k}}`, vars[k]); });
    return s;
  }, [lang]);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx) || { lang: "en", setLang: () => {}, t: (k) => k };
