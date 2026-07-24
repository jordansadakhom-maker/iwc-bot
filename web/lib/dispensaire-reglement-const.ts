// Règlement du Cabinet Médical de Saint-Denis + Avenant N°1 — textes officiels
// (transcrits fidèlement depuis les documents fournis par la Direction). Purs,
// importables côté client.

export const REGLEMENT_ENTETE = {
  titre: "Règlement du Cabinet",
  sous: "Établi conformément au Code Médical de l'État de Louisiane",
  devise: "Soigner — Soulager — Préserver",
  latin: "Sancte Lucas, ora pro nobis",
  annee: "Anno Domini 1904",
};

export type Article = { num: string; titre: string; texte: string[] };

export const REGLEMENT_ARTICLES: Article[] = [
  { num: "I", titre: "Devoir du médecin", texte: ["Tout médecin se doit de porter secours sans distinction à toute personne blessée ou souffrante.", "Il agit selon les principes du serment médical, en priorisant la vie et le bien du patient."] },
  { num: "II", titre: "Pratique médicale", texte: ["Nul soin ne sera entrepris sans examen préalable.", "Les traitements doivent être adaptés, mesurés et conformes aux connaissances du praticien.", "Nul ne peut pratiquer un acte qu'il ne maîtrise."] },
  { num: "III", titre: "Discipline & hiérarchie", texte: ["Le Chef de Cabinet dirige le cabinet et prend les décisions finales.", "Les assistants et apprentis sont placés sous son autorité.", "Toute directive émanant des autorités médicales de l'État prévaut sur les décisions internes."] },
  { num: "IV", titre: "Conduite exemplaire", texte: ["Le respect, le sang-froid et la dignité sont exigés en toute circonstance.", "Tout abus, négligence ou comportement contraire aux valeurs médicales sera sanctionné."] },
  { num: "V", titre: "Limites de la médecine", texte: ["Les blessures graves exigent temps, repos et vigilance.", "La guérison ne saurait être garantie.", "Le médecin lutte contre la mort, mais ne la commande point."] },
  { num: "VI", titre: "Secret médical", texte: ["Toute information relative aux patients est strictement confidentielle.", "Elle ne peut être divulguée qu'en cas de nécessité reconnue par la loi ou les autorités compétentes."] },
  { num: "VII", titre: "Hygiène & rigueur", texte: ["Le praticien veille à la propreté de ses mains, de ses instruments et de son environnement.", "Ses outils doivent être entretenus et en état de fonctionnement."] },
  { num: "VIII", titre: "Organisation des soins", texte: ["En cas d'afflux de blessés, la priorité est donnée aux cas les plus graves selon le jugement médical."] },
  { num: "IX", titre: "Registres & savoir", texte: ["Chaque médecin tient un registre fidèle de ses actes et observations.", "Le savoir se transmet, dans le respect des usages et de la profession."] },
];

export const REGLEMENT_PIED = { devise: "Ars Medicina — Humanitas — Scientia", latin: "Primum non nocere — d'abord, ne pas nuire", signature: "Dr. Ed Remington, Chef de Cabinet Médical de Saint-Denis" };

export const AVENANT = {
  titre: "Avenant N°I au Règlement Intérieur",
  objet: "Relatif aux obligations de présence du personnel médical",
  date: "05 juin 1904",
  section: "Présence et obligation de déclaration des absences",
  paragraphes: [
    "Afin d'assurer la continuité des soins et le bon fonctionnement du Cabinet Médical – Hôpital de Saint-Denis ainsi que de son Dispensaire, tout membre du personnel médical est tenu de déclarer toute absence prévisible ou prolongée.",
    "Toute absence de trois (3) jours consécutifs non déclarée dans le Registre officiel des absences sera considérée comme un manquement au règlement intérieur. Dans ce cas, il sera prononcé à l'encontre du praticien un premier blâme disciplinaire, lequel sera inscrit à son dossier administratif.",
    "En cas de récidive entraînant un second blâme disciplinaire, les faits seront considérés comme une faute grave portant atteinte au bon fonctionnement du Cabinet Médical.",
    "Cette faute grave entraînera, sauf décision exceptionnelle motivée de la Direction, la radiation définitive du Cabinet Médical – Hôpital de Saint-Denis, avec cessation immédiate des fonctions et restitution de l'ensemble du matériel appartenant à l'établissement.",
    "Il appartient à chaque médecin de veiller personnellement à la bonne tenue du Registre des absences et d'informer la Direction dans les meilleurs délais de toute indisponibilité, quelle qu'en soit la nature.",
  ],
};
