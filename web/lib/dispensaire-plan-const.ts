// Plan de rangement OFFICIEL des coffres du Dispensaire de Saint-Denis
// (transcrit de l'affiche fournie par la Direction). Sert de graine à
// l'import « Importer le plan officiel ». Pur, importable partout.

export type PlanCoffre = { nom: string; emplacement: string; note: string; categorie: string; items: string[] };

export const PLAN_RANGEMENT: PlanCoffre[] = [
  // Coffres prioritaires — accès rapide et vital
  { nom: "Coffre 1 — Urgences", emplacement: "Coffres prioritaires", categorie: "medicament", note: "À n'ouvrir qu'en cas d'urgence vitale.", items: ["Poches de sang", "Seringues d'adrénaline", "Bandages", "Attelles"] },
  { nom: "Coffre 2 — Pansements", emplacement: "Coffres prioritaires", categorie: "materiel", note: "Pour tous les soins et protections.", items: ["Bandages patients", "Bandages classiques"] },
  { nom: "Coffre 3 — Matériel Médical", emplacement: "Coffres prioritaires", categorie: "materiel", note: "Matériel d'examen et d'usage courant.", items: ["Stéthoscopes", "Seringues", "Filtres à coton"] },
  { nom: "Coffre 4 — Médicaments", emplacement: "Coffres prioritaires", categorie: "medicament", note: "Médicaments généraux et tonifiants.", items: ["Toniques", "Sirop pour la grippe", "Sirop pour le rhume"] },
  { nom: "Coffre 5 — Médicaments Digestifs", emplacement: "Coffres prioritaires", categorie: "medicament", note: "Pour les troubles digestifs et intestinaux.", items: ["Sirop pour la gastro", "Sirop pour la dysphérie"] },
  // Coffres de soutien et approvisionnements
  { nom: "Coffre 6 — Produits Médicaux", emplacement: "Coffres de soutien", categorie: "matiere", note: "Pour l'hygiène, la désinfection et certaines préparations.", items: ["Alcool à 90°", "Eau gazeuse"] },
  { nom: "Coffre 7 — Contenants", emplacement: "Coffres de soutien", categorie: "materiel", note: "Pour préparations, mélanges et réserves.", items: ["Bouteilles vides"] },
  { nom: "Coffre 8 — Artisanat Médical", emplacement: "Coffres de soutien", categorie: "matiere", note: "Matériaux souples pour fabrication et réparations.", items: ["Tissu", "Cuir"] },
  { nom: "Coffre 9 — Artisanat Médical 2", emplacement: "Coffres de soutien", categorie: "matiere", note: "Matériaux rigides pour soutiens et structures.", items: ["Zinc", "Planches de bois"] },
  { nom: "Coffre 10 — Réserve Générale", emplacement: "Coffres de soutien", categorie: "autre", note: "Pour prévenir les manques et soutenir le dispensaire.", items: ["Stocks divers"] },
  // Herboristerie de base — plantes médicinales brutes
  { nom: "Coffre 11 — Thym", emplacement: "Herboristerie", categorie: "matiere", note: "Antiseptique naturel, utile pour les voies respiratoires.", items: ["Thym"] },
  { nom: "Coffre 12 — Massie Anglaise", emplacement: "Herboristerie", categorie: "matiere", note: "Apaisante pour la toux et les irritations.", items: ["Massie Anglaise"] },
  { nom: "Coffre 13 — Menthe", emplacement: "Herboristerie", categorie: "matiere", note: "Facilite la digestion, calme les spasmes et rafraîchit.", items: ["Menthe"] },
  { nom: "Coffre 14 — Origan", emplacement: "Herboristerie", categorie: "matiere", note: "Antiseptique et digestif, utile contre les infections légères.", items: ["Origan"] },
  { nom: "Coffre 15 — Fleur de Glycine", emplacement: "Herboristerie", categorie: "matiere", note: "Sédative légère, favorise le repos et apaise l'anxiété.", items: ["Fleur de Glycine"] },
  { nom: "Coffre 16 — Fleur d'Araignée", emplacement: "Herboristerie", categorie: "matiere", note: "Relaxante musculaire, idéale contre les tensions et douleurs.", items: ["Fleur d'Araignée"] },
  { nom: "Coffre 17 — Ginseng", emplacement: "Herboristerie", categorie: "matiere", note: "Tonique général, renforce le corps et redonne de l'énergie.", items: ["Ginseng"] },
  { nom: "Coffre 18 — Groseille", emplacement: "Herboristerie", categorie: "matiere", note: "Riche en vitamines, tonique et rafraîchissante.", items: ["Groseille"] },
  { nom: "Coffre 19 — Mûre", emplacement: "Herboristerie", categorie: "matiere", note: "Nourrissante et légèrement laxative, riche en minéraux.", items: ["Mûre"] },
  { nom: "Coffre 20 — Orange", emplacement: "Herboristerie", categorie: "matiere", note: "Riche en vitamine C, tonique et bonne pour le moral.", items: ["Orange"] },
];
