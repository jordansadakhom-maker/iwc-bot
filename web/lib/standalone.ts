// Mode « site autonome du Dispensaire ».
//
// Activé par la variable d'environnement NEXT_PUBLIC_DISPENSAIRE_STANDALONE="true".
// Quand il est actif, le déploiement se comporte comme un site dédié au
// Dispensaire de Saint-Denis : plus aucune mention d'Iron Wolf, l'accueil pointe
// sur le Dispensaire, et tout le reste de la plateforme est verrouillé.
//
// Par défaut (variable absente) : comportement Iron Wolf normal — donc le
// déploiement Iron Wolf existant n'est PAS affecté.
export const STANDALONE = process.env.NEXT_PUBLIC_DISPENSAIRE_STANDALONE === "true";
