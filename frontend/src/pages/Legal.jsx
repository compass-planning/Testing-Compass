import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { CompassMark } from "@/components/Logo";
import { useLang } from "@/lib/i18n";

const COMPANY = "Westoak Innovations";
const CONTACT = "privacy@westoak.dev";
const UPDATED = { en: "Last updated: June 2026", fr: "Dernière mise à jour : juin 2026" };

const DOCS = {
  privacy: {
    en: {
      title: "Privacy Policy",
      intro: `${COMPANY} ("we", "us") operates Compass Planning. This Privacy Policy explains what personal information we collect, how we use it, and the rights you have. It applies to our website and the Compass Planning application.`,
      sections: [
        { h: "Information we collect", p: "We collect the information you provide to build your retirement plan — such as your name, email, age, income, assets, debts, insurance and goals — along with account and security data (hashed passwords, two-factor settings) and basic technical logs needed to operate the service securely." },
        { h: "How we use your information", p: "We use your information only to provide and improve the planning services you request: running projections, generating reports, and letting your advisor (if any) maintain your plan. We do not sell your personal information, and we do not use it for third-party advertising." },
        { h: "Data residency", p: "Compass Planning is built for Canadian residents. Personal information is stored and processed in Canada. Where a feature relies on a sub-processor, we require contractual safeguards consistent with Canadian privacy law." },
        { h: "Security", p: "We protect your data with encryption in transit and at rest, TOTP-based two-factor authentication, strict tenant isolation between workspaces, and audit logging. No system is perfectly secure, but we work continuously to safeguard your information." },
        { h: "Your rights", p: "You can access, correct, export or erase your personal information at any time from within the application, or by contacting us. We retain data only as long as needed to provide the service or meet legal obligations." },
        { h: "Contact us", p: `Questions about this policy or your data can be sent to ${CONTACT}.` },
      ],
    },
    fr: {
      title: "Politique de confidentialité",
      intro: `${COMPANY} (« nous ») exploite Compass Planning. La présente politique explique quels renseignements personnels nous recueillons, comment nous les utilisons et les droits dont vous disposez. Elle s'applique à notre site Web et à l'application Compass Planning.`,
      sections: [
        { h: "Renseignements recueillis", p: "Nous recueillons les renseignements que vous fournissez pour établir votre plan de retraite — nom, courriel, âge, revenu, actifs, dettes, assurances et objectifs — ainsi que des données de compte et de sécurité (mots de passe hachés, paramètres d'authentification à deux facteurs) et des journaux techniques de base nécessaires au fonctionnement sécurisé du service." },
        { h: "Utilisation de vos renseignements", p: "Nous utilisons vos renseignements uniquement pour fournir et améliorer les services de planification demandés : projections, rapports et mise à jour de votre plan par votre conseiller (le cas échéant). Nous ne vendons pas vos renseignements personnels et ne les utilisons pas à des fins de publicité tierce." },
        { h: "Hébergement des données", p: "Compass Planning est conçu pour les résidents canadiens. Les renseignements personnels sont stockés et traités au Canada. Lorsqu'une fonction dépend d'un sous-traitant, nous exigeons des garanties contractuelles conformes au droit canadien de la vie privée." },
        { h: "Sécurité", p: "Nous protégeons vos données par le chiffrement en transit et au repos, l'authentification à deux facteurs TOTP, une isolation stricte entre les espaces et la journalisation d'audit. Aucun système n'est parfaitement sûr, mais nous travaillons sans cesse à protéger vos renseignements." },
        { h: "Vos droits", p: "Vous pouvez consulter, corriger, exporter ou effacer vos renseignements personnels à tout moment dans l'application ou en nous contactant. Nous conservons les données uniquement le temps nécessaire à la prestation du service ou au respect de nos obligations légales." },
        { h: "Nous joindre", p: `Pour toute question sur cette politique ou vos données, écrivez à ${CONTACT}.` },
      ],
    },
  },
  pipeda: {
    en: {
      title: "PIPEDA Compliance",
      intro: "Compass Planning is designed to comply with Canada's Personal Information Protection and Electronic Documents Act (PIPEDA). This page summarises how we meet its ten fair information principles.",
      sections: [
        { h: "Accountability", p: `${COMPANY} is responsible for the personal information under its control and has designated a privacy contact (${CONTACT}) to oversee compliance.` },
        { h: "Identifying purposes & consent", p: "We identify why we collect your information before or at the time of collection, and we obtain your meaningful consent. During registration you explicitly consent to our processing your data to provide retirement planning services; you may withdraw consent at any time." },
        { h: "Limiting collection, use & retention", p: "We collect only what is necessary for the planning features you use, use it only for those purposes, and retain it only as long as needed. You can erase your data from within the app." },
        { h: "Accuracy & safeguards", p: "We keep information as accurate as the data you provide, and protect it with encryption, two-factor authentication and tenant isolation appropriate to its sensitivity." },
        { h: "Openness & individual access", p: "This policy is openly available. You have the right to access your personal information and to challenge its accuracy; access and export tools are built into the application." },
        { h: "Challenging compliance", p: `You may address any concern about our handling of your information to ${CONTACT}. If unresolved, you may contact the Office of the Privacy Commissioner of Canada.` },
      ],
    },
    fr: {
      title: "Conformité à la LPRPDE",
      intro: "Compass Planning est conçu pour respecter la Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE) du Canada. Cette page résume comment nous respectons ses dix principes d'équité en matière de renseignements.",
      sections: [
        { h: "Responsabilité", p: `${COMPANY} est responsable des renseignements personnels sous son contrôle et a désigné un responsable de la protection de la vie privée (${CONTACT}) pour superviser la conformité.` },
        { h: "Détermination des fins et consentement", p: "Nous déterminons pourquoi nous recueillons vos renseignements avant ou au moment de la collecte et obtenons votre consentement éclairé. À l'inscription, vous consentez explicitement au traitement de vos données pour fournir des services de planification de retraite; vous pouvez retirer ce consentement à tout moment." },
        { h: "Limitation de la collecte, de l'usage et de la conservation", p: "Nous ne recueillons que ce qui est nécessaire aux fonctions utilisées, ne l'utilisons qu'à ces fins et ne le conservons que le temps requis. Vous pouvez effacer vos données dans l'application." },
        { h: "Exactitude et mesures de sécurité", p: "Nous maintenons les renseignements aussi exacts que les données que vous fournissez et les protégeons par le chiffrement, l'authentification à deux facteurs et l'isolation des espaces, selon leur sensibilité." },
        { h: "Transparence et accès individuel", p: "Cette politique est accessible publiquement. Vous avez le droit d'accéder à vos renseignements personnels et d'en contester l'exactitude; des outils d'accès et d'exportation sont intégrés à l'application." },
        { h: "Possibilité de porter plainte", p: `Vous pouvez adresser toute préoccupation concernant le traitement de vos renseignements à ${CONTACT}. En cas de non-résolution, vous pouvez communiquer avec le Commissariat à la protection de la vie privée du Canada.` },
      ],
    },
  },
  terms: {
    en: {
      title: "Terms of Service",
      intro: `These Terms of Service govern your use of Compass Planning, operated by ${COMPANY}. By creating an account or using the service, you agree to these terms.`,
      sections: [
        { h: "The service", p: "Compass Planning provides retirement and financial-planning tools, including projections, tax and estate calculations, and reporting. The service is offered on Solo, Advisor and Enterprise tiers with the features described at sign-up." },
        { h: "Not financial advice", p: "Compass Planning is a software tool. Its projections and summaries are illustrative and do not constitute financial, tax, legal or investment advice. Always consult a qualified professional before making decisions. Results depend on the assumptions and data you enter." },
        { h: "Your account", p: "You are responsible for maintaining the confidentiality of your credentials and for activity under your account. You must enable two-factor authentication where required and provide accurate information." },
        { h: "Acceptable use", p: "You agree not to misuse the service, attempt to access other tenants' data, reverse-engineer the platform, or use it unlawfully. We may suspend accounts that violate these terms." },
        { h: "Fees & cancellation", p: "Paid plans are billed in Canadian dollars at the rates shown. You may cancel at any time; access continues through the end of the current billing period. Prices may change with notice." },
        { h: "Liability & changes", p: `To the extent permitted by law, the service is provided "as is" and ${COMPANY} is not liable for decisions made using it. We may update these terms and will note the effective date above. Questions: ${CONTACT}.` },
      ],
    },
    fr: {
      title: "Conditions d'utilisation",
      intro: `Les présentes conditions régissent votre utilisation de Compass Planning, exploité par ${COMPANY}. En créant un compte ou en utilisant le service, vous acceptez ces conditions.`,
      sections: [
        { h: "Le service", p: "Compass Planning fournit des outils de planification de retraite et financière, dont des projections, des calculs fiscaux et successoraux et des rapports. Le service est offert selon les paliers Solo, Conseiller et Entreprise, avec les fonctions décrites à l'inscription." },
        { h: "Pas de conseil financier", p: "Compass Planning est un outil logiciel. Ses projections et résumés sont fournis à titre indicatif et ne constituent pas un conseil financier, fiscal, juridique ou en placement. Consultez toujours un professionnel qualifié avant de prendre une décision. Les résultats dépendent des hypothèses et des données que vous saisissez." },
        { h: "Votre compte", p: "Vous êtes responsable de la confidentialité de vos identifiants et des activités sous votre compte. Vous devez activer l'authentification à deux facteurs lorsque requis et fournir des renseignements exacts." },
        { h: "Utilisation acceptable", p: "Vous vous engagez à ne pas détourner le service, à ne pas tenter d'accéder aux données d'autres espaces, à ne pas désosser la plateforme ni à l'utiliser de façon illégale. Nous pouvons suspendre les comptes qui enfreignent ces conditions." },
        { h: "Frais et résiliation", p: "Les forfaits payants sont facturés en dollars canadiens aux tarifs affichés. Vous pouvez résilier à tout moment; l'accès se poursuit jusqu'à la fin de la période de facturation en cours. Les prix peuvent changer sur préavis." },
        { h: "Responsabilité et modifications", p: `Dans la mesure permise par la loi, le service est fourni « tel quel » et ${COMPANY} n'est pas responsable des décisions prises en l'utilisant. Nous pouvons mettre à jour ces conditions et en indiquerons la date d'entrée en vigueur ci-dessus. Questions : ${CONTACT}.` },
      ],
    },
  },
};

export default function Legal({ doc = "privacy" }) {
  const { lang, setLang } = useLang();
  const L = lang === "fr" ? "fr" : "en";
  const d = (DOCS[doc] || DOCS.privacy)[L];

  return (
    <div className="min-h-screen bg-[#120B2E] text-white font-sans" data-testid={`legal-${doc}`}>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#120B2E]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3" data-testid="legal-home">
            <CompassMark size={34} />
            <div className="leading-none">
              <div className="font-heading text-base font-extrabold uppercase tracking-tight text-white">Compass</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#00DF89]">Planning</div>
            </div>
          </Link>
          <div className="flex items-center gap-1 rounded-full border border-white/15 p-0.5">
            {["en", "fr"].map((l) => (
              <button key={l} onClick={() => setLang(l)} data-testid={`legal-lang-${l}`}
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase transition-colors ${lang === l ? "bg-white text-[#2E1B6A]" : "text-[#C0B8E3] hover:text-white"}`}>{l}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#00DF89] hover:underline" data-testid="legal-back">
          <ArrowLeft size={15} /> {lang === "fr" ? "Retour à l'accueil" : "Back to home"}
        </Link>
        <h1 className="mt-6 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{d.title}</h1>
        <p className="mt-2 text-xs uppercase tracking-wider text-[#8C82B5]">{UPDATED[L]}</p>
        <p className="mt-6 text-base leading-relaxed text-[#C0B8E3]">{d.intro}</p>

        <div className="mt-10 space-y-8">
          {d.sections.map((s, i) => (
            <section key={i} data-testid={`legal-section-${i}`}>
              <h2 className="font-heading text-xl font-bold text-white">{s.h}</h2>
              <p className="mt-2 text-base leading-relaxed text-[#C0B8E3]">{s.p}</p>
            </section>
          ))}
        </div>

        <div className="mt-14 border-t border-white/10 pt-8 text-sm text-[#8C82B5]">
          © 2026 {COMPANY} · Compass Planning · {CONTACT}
        </div>
      </main>
    </div>
  );
}
