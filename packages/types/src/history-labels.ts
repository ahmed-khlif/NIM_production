const eventLabels: Record<string, string> = {
  CLIENT_CREATED: "Client cr\u00e9\u00e9",
  CLIENT_UPDATED: "Fiche client modifi\u00e9e",
  CLIENT_ARCHIVED: "Client archiv\u00e9",
  CLIENT_RESTORED: "Client restaur\u00e9",
  CLIENT_PHOTO_UPDATED: "Photo client modifi\u00e9e",
  CLIENT_PHOTO_REMOVED: "Photo client supprim\u00e9e",
  AUTH_LOGIN: "Connexion",
  AUTH_LOGIN_FAILED: "Échec de connexion",
  AUTH_LOGOUT: "Déconnexion",
  AUTH_PASSWORD_CHANGED: "Mot de passe modifié",
  USER_CREATED: "Utilisateur créé",
  USER_UPDATED: "Utilisateur modifié",
  USER_DISABLED: "Utilisateur désactivé",
  USER_REACTIVATED: "Utilisateur réactivé",
  USER_PASSWORD_RESET: "Mot de passe réinitialisé",
  MACHINE_CREATED: "Machine créée",
  MACHINE_UPDATED: "Machine modifiée",
  MACHINE_DELETED: "Machine supprimée",
  MACHINE_STATUS_CHANGED: "Statut machine modifié",
  MACHINE_BARS_ASSIGNED: "Barres affectées à la machine",
  MACHINE_SESSION_STARTED: "Session machine ouverte",
  MACHINE_SESSION_TEAM_UPDATED: "Invitation à une équipe machine",
  MACHINE_SESSION_ENDED: "Session machine terminée",
  PIECE_CREATED: "Pièce créée",
  PIECE_UPDATED: "Pièce modifiée",
  PIECE_ARCHIVED: "Pièce archivée",
  PIECE_DELETED: "Pièce supprimée",
  PIECE_IMPORTED: "Pièce importée",
  PIECES_IMPORTED: "Import de pièces terminé",
  PIECE_IMAGE_ADDED: "Photo de pièce ajoutée",
  PIECE_IMAGE_REMOVED: "Photo de pièce supprimée",
  ASSIGNMENT_CREATED: "Affectation créée",
  ASSIGNMENT_REASSIGNED: "Affectation réaffectée",
  ASSIGNMENT_UNASSIGNED: "Affectation retirée",
  PRODUCTION_STARTED: "Production démarrée",
  PRODUCTION_COMPLETED: "Production terminée",
  PIECE_PRODUCTION_STARTED: "Fabrication de la pièce démarrée",
  PIECE_PRODUCTION_COMPLETED: "Fabrication de la pièce terminée",
  BAR_ASSIGNED_TO_MACHINE: "Barre affectée à la machine",
  BAR_UNASSIGNED_FROM_MACHINE: "Barre retirée de la machine",
  BAR_PRODUCTION_STARTED: "Fabrication de la barre démarrée",
  BAR_PRODUCTION_COMPLETED: "Fabrication de la barre terminée",
  BAR_PRODUCTION_LAUNCH_CANCELLED: "Lancement de barre annulé",
  PRODUCTION_RUN_CANCELLED: "Lancement de production annulé",
  PIECE_PRODUCTION_LAUNCH_CANCELLED: "Lancement de pièce annulé",
  CUTTING_BAR_CREATED: "Barre créée",
  CUTTING_BARS_GENERATED: "Barres générées",
  CUTTING_BAR_CANCELLED: "Barre annulée",
  CUTTING_PLAN_VALIDATED: "Plan de façonnage validé",
  CUTTING_PLAN_PARTIALLY_VALIDATED: "Plan de façonnage partiellement validé",
  CUTTING_PLAN_REVISED: "Plan de façonnage révisé",
  CUTTING_PLAN_DELETED: "Plan de façonnage supprimé",
  NON_CONFORMITY_REPORTED: "Non-conformité signalée",
  QUALITY_VALIDATED: "Contrôle conforme",
  QUALITY_REJECTED: "Contrôle non conforme",
  QUALITY_DISPOSITION_COMPLETED: "Traitement qualité enregistré",
  QUALITY_DEVIATION_REQUESTED: "Dérogation qualité à décider",
  QUALITY_DEVIATION_APPROVED: "Dérogation qualité approuvée",
  QUALITY_DEVIATION_REJECTED: "Dérogation qualité refusée",
  QUALITY_DEFECT_IMAGE_ADDED: "Photo de défaut ajoutée",
  QUALITY_DEFECT_IMAGE_REMOVED: "Photo de défaut supprimée",
  OFFER_CREATED: "Affaire créée",
  OFFER_UPDATED: "Affaire modifiée",
  OFFER_ARCHIVED: "Affaire archivée",
  OFFER_DELETED: "Affaire supprimée",
  OFFER_RESTORED: "Affaire restaurée",
  CUTTING_PLAN_APPROVED: "Plan de coupe validé",
  CUTTING_PLAN_CANCELLED: "Reliquat du plan supprimé",
  FACONNAGE_OPTIMIZATION_EXECUTED: "Mise en barres calculée",
  FACONNAGE_PREPARATION_CREATED: "Préparation du façonnage créée",
  OFFER_PRODUCTION_STARTED: "Production de l’affaire démarrée",
  OPERATOR_TABLET_ACTIVATED: "Accès tablette activé",
  OPERATOR_TABLET_DEACTIVATED: "Accès tablette désactivé",
  OPERATOR_KEY_RESET: "Clé opérateur renouvelée",
  OPERATOR_LOGIN: "Connexion opérateur",
  OPERATOR_LOGIN_FAILED: "Échec de connexion opérateur",
  OPERATOR_LOGOUT: "Déconnexion opérateur",
  SETTINGS_UPDATED: "Préférences modifiées",
  IMPORT_BATCH_REMOVED: "Import retiré",
  MATERIAL_PROFILE_CREATED: "Profil matière créé",
  MATERIAL_PROFILE_UPDATED: "Profil matière modifié",
};

eventLabels.OFFER_STATUS_OVERRIDDEN = "Statut de l’affaire forcé par un administrateur";

const entityLabels: Record<string, string> = {
  CLIENT: "Client",
  AUTH: "Authentification",
  USER: "Utilisateur",
  MACHINE: "Machine",
  PIECE: "Pièce",
  PIECE_UNIT: "Unité de pièce",
  ASSIGNMENT: "Affectation",
  PRODUCTION_OPERATION: "Production",
  PRODUCTION_RUN: "Lancement de production",
  QUALITY_CONTROL: "Contrôle qualité",
  NON_CONFORMITY: "Non-conformité",
  OFFER: "Affaire",
  CUTTING_PLAN: "Plan de façonnage",
  CUTTING_BAR: "Barre",
  MACHINE_SESSION: "Session machine",
  FACONNAGE_PREPARATION: "Préparation de façonnage",
  IMPORT_BATCH: "Import de pièces",
  MATERIAL_PROFILE: "Profil matière",
};

export function historyEventLabel(value: string): string {
  return (
    eventLabels[value] ??
    value
      .replaceAll("_", " ")
      .toLocaleLowerCase("fr")
      .replace(/^./u, (character) => character.toLocaleUpperCase("fr"))
  );
}

export function historyEntityLabel(value: string): string {
  return entityLabels[value] ?? "Élément de production";
}

export const historyEventTypes = Object.keys(eventLabels);
export const historyEntityTypes = Object.keys(entityLabels);
