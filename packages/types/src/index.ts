export const userRoles = ["ADMIN", "PRODUCTION_MANAGER", "OPERATOR", "QUALITY_CONTROLLER"] as const;
export type UserRole = (typeof userRoles)[number];

export type AuthenticatedUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
};

export type ManagedUser = AuthenticatedUser & {
  isActive: boolean;
  tabletAccessEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  activeMachineSession?: {
    id: string;
    machineName: string;
    startedAt: string;
    runningBarReference: string | null;
  } | null;
};

export type MachineStatus = "ACTIVE" | "MAINTENANCE" | "INACTIVE";

export type ManagedMachine = {
  id: string;
  name: string;
  internalNumber: string;
  type: string;
  status: MachineStatus;
  description: string | null;
  location: string | null;
  createdAt: string;
  updatedAt: string;
  assignedBarCount?: number;
};

export type PieceStatus =
  "PLANNED" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "DELAYED" | "ARCHIVED";
export type PiecePriority = "HIGH" | "NORMAL" | "LOW";
export type PieceUnitStatus =
  | "PENDING"
  | "FACONNEE"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "QUALITY_PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "SCRAPPED";

export type PieceProductionStatus = "PENDING" | "FACONNEE" | "AFFECTEE" | "LANCEE" | "FABRIQUEE";
export type QualityStatus = "NOT_INSPECTED" | "CONFORME" | "NON_CONFORME";
export type CuttingPlanStatus =
  "DRAFT" | "APPROVED" | "PARTIALLY_VALIDATED" | "VALIDATED" | "CANCELLED" | "ARCHIVED";
export type CuttingPlanProposalStatus = "PROPOSED" | "VALIDATED" | "CANCELLED";

export type CuttingPlanBarProposal = {
  id: string;
  reference: string;
  ordinal: number;
  profile: string;
  rawLengthMm: number;
  usedLengthMm: number;
  wasteMm: number;
  cuts: Array<{ lengthMm: number; quantity: number }>;
  status: CuttingPlanProposalStatus;
  pieceUnitCount: number;
  cuttingBarId: string | null;
  cuttingBarReference: string | null;
};

export type OperatorIdentity = Pick<AuthenticatedUser, "id" | "displayName">;
export type MachineSessionMember = OperatorIdentity & { role: "LEAD" | "HELPER" };
export type ProductionNonConformityReason =
  "DIMENSION" | "CUTTING_ERROR" | "DRILLING_ERROR" | "MATERIAL_DEFECT" | "DEFORMATION" | "OTHER";

export type ProductionNonConformity = {
  id: string;
  offerId: string;
  pieceId: string;
  pieceUnitId: string;
  cuttingBarId: string;
  productionRunId: string;
  machineId: string;
  pieceReference: string;
  sequenceNumber: number;
  barReference: string;
  offerReference: string;
  machineName: string;
  reportedBy: OperatorIdentity;
  reason: ProductionNonConformityReason;
  comment: string | null;
  status: "OPEN";
  reportedAt: string;
};

export type ProductionRunSummary = {
  id: string;
  offerId: string;
  offerReference: string;
  cuttingBarId: string;
  barReference: string;
  profile: string;
  rawLengthMm: number;
  status: "RUNNING" | "COMPLETED" | "CANCELLED";
  machineId: string;
  machineName: string;
  machineInternalNumber: string;
  machineSessionId: string;
  startedByOperatorId: string;
  startedBy: OperatorIdentity;
  startedAt: string;
  finishedAt: string | null;
  cancelledAt?: string | null;
  team: MachineSessionMember[];
  pieceCount: number;
  openNonConformityCount: number;
};

export type MachineSessionSummary = {
  id: string;
  status: "ACTIVE" | "ENDED";
  machineId: string;
  machineName: string;
  machineInternalNumber: string;
  leadOperatorId: string;
  startedAt: string;
  endedAt: string | null;
  team: MachineSessionMember[];
};

export type TabletMachineOption = {
  id: string;
  name: string;
  internalNumber: string;
  type: string;
  waitingBars: number;
};

export type TabletProductionRun = ProductionRunSummary & {
  bar: ManagedCuttingBar;
  nonConformities: ProductionNonConformity[];
};

export type ProductionMonitorBar = {
  bar: ManagedCuttingBar;
  machineSession: MachineSessionSummary | null;
  run: ProductionRunSummary | null;
  openNonConformities: ProductionNonConformity[];
};

export type ProductionOperationStatus = "IN_PROGRESS" | "COMPLETED";
export type QualityControlResult = "CONFORM" | "NON_CONFORM";
export type QualityDefectCategory =
  "DIMENSIONAL" | "SURFACE" | "MATERIAL" | "WELDING" | "FINISH" | "DAMAGE" | "OTHER";
export type QualityDispositionType = "REWORK" | "SCRAP" | "REMAKE" | "DEVIATION";
export type QualityDispositionStatus = "COMPLETED" | "PENDING" | "APPROVED" | "REJECTED";

export type PieceImage = {
  id: string;
  originalName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  sortOrder: number;
  url: string;
  createdAt: string;
};

export type ManagedPiece = {
  id: string;
  reference: string;
  quantity: number;
  completedUnits: number;
  profile: string;
  quality: string;
  lengthMm: number;
  unitWeightKg: number | null;
  totalWeightKg: number | null;
  designation: string;
  priority: PiecePriority;
  dueDate: string | null;
  status: PieceStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  imageCount: number;
  coverImageUrl: string | null;
};

export type PieceUnitDetail = {
  id: string;
  pieceId: string;
  sequenceNumber: number;
  status: PieceUnitStatus;
  productionStatus?: PieceProductionStatus;
  qualityStatus?: QualityStatus;
  currentMachineId: string | null;
  currentMachineName: string | null;
  currentOperatorId: string | null;
  currentOperatorName: string | null;
  currentProductionOperatorId?: string | null;
  currentProductionOperatorName?: string | null;
  startedAt: string | null;
  manufacturedAt: string | null;
  controlledAt: string | null;
  qualityResult: QualityControlResult | null;
  activeAssignment: {
    id: string;
    machineId: string;
    machineName: string;
    queuePosition: number | null;
    assignedAt: string;
    reason: string | null;
  } | null;
};

export type PieceDetail = ManagedPiece & {
  units: PieceUnitDetail[];
  images: PieceImage[];
};

export type ProfileFamily = "IPE" | "HEA" | "UPN" | "L" | "ROND" | "OTHER";

export type MaterialProfileCatalogItem = {
  id: string;
  profile: string;
  aliases?: string[];
  kgPerMeter: number;
  rawLengthsMm: number[];
  isActive: boolean;
  updatedAt: string;
};

export type AvailableProfile = {
  profile: string;
  family: ProfileFamily;
  pieceCount: number;
  totalQuantity: number;
};

export type FaconnageRequirement = {
  profile: string;
  lengthMm: number;
  quantity: number;
};

export type FaconnagePreparation = {
  preparationId: string;
  selectedProfiles: string[];
  requirements: FaconnageRequirement[];
  summary: {
    selectedProfileCount: number;
    pieceRows: number;
    totalQuantity: number;
    lengthCount: number;
  };
};

export type PieceImportRow = {
  row: number;
  values: Record<string, string | number | undefined>;
  canonicalProfile?: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type PieceImportColumn = {
  sourceHeader: string;
  field: string;
  label: string;
  ignored: boolean;
};

export type PieceImportPreview = {
  filename: string;
  sourceFormat: "CSV" | "TEKLA_XLS" | "XLSX";
  columns: PieceImportColumn[];
  rowsTotal: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  rows: PieceImportRow[];
};

export type PieceImportResult = {
  sourceFormat: "CSV" | "TEKLA_XLS" | "XLSX";
  status: "COMMITTED" | "FAILED";
  rowsTotal: number;
  rowsCreated: number;
  rowsRejected: number;
  warningRows: number;
};

export type UserSettings = {
  density: "comfortable" | "compact";
  notificationsEnabled: boolean;
  updatedAt: string | null;
};

export type ManagedNotification = {
  id: string;
  eventType: string;
  title: string;
  message: string;
  actorName: string | null;
  href: string;
  offerId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ManagedNotificationsPage = {
  notifications: ManagedNotification[];
  unreadCount: number;
  eventTypes: string[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type RealtimeEvent = {
  type: string;
  entityType: string;
  entityId: string;
  actorUserId?: string;
  occurredAt: string;
};

export type AssignablePieceUnit = {
  id: string;
  pieceId: string;
  reference: string;
  sequenceNumber: number;
  profile: string;
  status: PieceUnitStatus;
  priority: PiecePriority;
};

export type ManagedAssignment = {
  id: string;
  offerId: string;
  barId: string | null;
  pieceUnitId: string;
  pieceId: string;
  reference: string;
  sequenceNumber: number;
  profile: string;
  unitStatus: PieceUnitStatus;
  pieceStatus: PieceStatus;
  priority: PiecePriority;
  machineId: string;
  machineName: string;
  machineStatus: MachineStatus;
  assignedById: string;
  assignedAt: string;
  queuePosition: number | null;
  active: boolean;
  reason: string | null;
};

export type ManagedProductionOperation = {
  id: string;
  pieceId: string;
  pieceUnitId: string;
  reference: string;
  sequenceNumber: number;
  profile: string;
  lengthMm: number;
  machineId: string;
  machineName: string;
  operatorId: string;
  operatorName: string;
  status: ProductionOperationStatus;
  unitStatus: PieceUnitStatus;
  pieceStatus: PieceStatus;
  startedAt: string;
  completedAt: string | null;
};

export type ProductionQueueItem = {
  pieceUnitId: string;
  pieceId: string;
  reference: string;
  sequenceNumber: number;
  profile: string;
  lengthMm: number;
  priority: PiecePriority;
  status: PieceUnitStatus;
  machineId: string;
  machineName: string;
  assignedAt: string;
  queuePosition: number | null;
};

export type MachineDetail = ManagedMachine & {
  queue: ProductionQueueItem[];
  queuePagination: PageMetadata;
  activeOperationCount: number;
  cuttingBars: MachineCuttingBar[];
  cuttingBarsPagination: PageMetadata;
  barMetrics: {
    assigned: number;
    inProgress: number;
    fabricatedToday: number;
    fabricatedTotal: number;
  };
  activeSession?: MachineSessionSummary | null;
  currentProductionRun?: ProductionRunSummary | null;
};

export type PageMetadata = { page: number; pageSize: number; total: number; totalPages: number };

export type MachineCuttingBar = {
  id: string;
  offerId: string;
  offerReference: string;
  reference: string;
  profile: string;
  rawLengthMm: number;
  usedLengthMm: number;
  wasteMm: number;
  status: CuttingBarStatus;
  qualityStatus?: QualityStatus;
};

export type CuttingBarStatus =
  "FACONNEE" | "AFFECTEE" | "LANCEE" | "FABRIQUEE" | "NON_CONFORME" | "CANCELLED";

export type ManagedCuttingBar = {
  id: string;
  offerId: string;
  offerReference: string;
  cuttingPlanId: string;
  reference: string;
  profile: string;
  rawLengthMm: number;
  usedLengthMm: number;
  wasteMm: number;
  status: CuttingBarStatus;
  qualityStatus?: QualityStatus;
  machine: { id: string; name: string; internalNumber: string } | null;
  items: Array<{
    id: string;
    pieceUnitId: string;
    pieceId: string;
    reference: string;
    sequenceNumber: number;
    lengthMm: number;
    weightKg: number | null;
    status: PieceUnitStatus;
    productionStatus?: PieceProductionStatus;
    qualityStatus?: QualityStatus;
    active: boolean;
  }>;
  assignmentHistory?: Array<{
    id: string;
    machineId: string;
    machineName: string;
    assignedAt: string;
    unassignedAt: string | null;
    active: boolean;
  }>;
  createdAt: string;
};

export type ManagedBarAssignment = {
  id: string;
  cuttingBarId: string;
  machineId: string;
  machineName: string;
  assignedById: string;
  assignedAt: string;
  unassignedAt: string | null;
  active: boolean;
  bar: ManagedCuttingBar;
};

export type ManagedQualityPendingUnit = {
  pieceUnitId: string;
  pieceId: string;
  reference: string;
  sequenceNumber: number;
  profile: string;
  lengthMm: number;
  priority: PiecePriority;
  status: "QUALITY_PENDING";
  pieceStatus: PieceStatus;
  machineName: string | null;
  operatorName: string | null;
  manufacturedAt: string | null;
};

export type ManagedQualityControl = {
  id: string;
  pieceUnitId: string;
  pieceId: string;
  reference: string;
  sequenceNumber: number;
  result: QualityControlResult;
  comment: string | null;
  defectCategory: QualityDefectCategory | null;
  cycle: number;
  images: QualityControlImage[];
  disposition: QualityDisposition | null;
  controllerId: string;
  controllerName: string;
  controlledAt: string;
};

export type QualityControlImage = {
  id: string;
  originalName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  url: string;
  createdAt: string;
};

export type QualityDisposition = {
  id: string;
  pieceUnitId: string;
  qualityControlId: string;
  type: QualityDispositionType;
  status: QualityDispositionStatus;
  reason: string;
  approvalComment: string | null;
  requestedById: string;
  requestedByName: string;
  approvedById: string | null;
  approvedByName: string | null;
  requestedAt: string;
  decidedAt: string | null;
  completedAt: string | null;
};

export type ManagedHistoryEvent = {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: UserRole | "OPERATOR" | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type HistoryPage = {
  events: ManagedHistoryEvent[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DashboardMachineLoad = {
  id: string;
  name: string;
  internalNumber: string;
  type: string;
  status: MachineStatus;
  queueCount: number;
  inProgressCount: number;
};

export type DashboardPiece = {
  id: string;
  reference: string;
  profile: string;
  lengthMm: number;
  quantity: number;
  completedUnits: number;
  priority: PiecePriority;
  dueDate: string | null;
  status: PieceStatus;
  machineName: string | null;
};

export type DashboardDelayedPiece = DashboardPiece & {
  delayDays: number;
};

export type DashboardStatusBreakdown = {
  status: PieceStatus;
  count: number;
};

export type DashboardUnitStatusBreakdown = {
  status: PieceUnitStatus;
  count: number;
};

export type DashboardPriorityBreakdown = {
  priority: PiecePriority;
  count: number;
};

export type DashboardQualitySummary = {
  pendingUnits: number;
  inspectedUnits: number;
  conformUnits: number;
  nonConformUnits: number;
  conformityRate: number;
  defectBreakdown?: Array<{
    category: QualityDefectCategory;
    count: number;
  }>;
  dispositionBreakdown?: Array<{
    type: QualityDispositionType;
    count: number;
  }>;
  pendingDeviationCount?: number;
};

export type DashboardDueDateSummary = {
  overduePieces: number;
  dueTodayPieces: number;
  dueNextSevenDaysPieces: number;
  withoutDueDatePieces: number;
};

export type DashboardTrendPoint = {
  date: string;
  startedUnits: number;
  completedUnits: number;
  conformUnits: number;
  nonConformUnits: number;
};

export type DashboardOverview = {
  summary: {
    totalPieces: number;
    totalUnits: number;
    completedUnits: number;
    progressPercent: number;
    inProductionUnits: number;
    delayedPieces: number;
    activeMachines: number;
    maintenanceMachines: number;
    totalMachines: number;
    openNonConformities: number;
  };
  machineLoads: DashboardMachineLoad[];
  recentActivity: ManagedHistoryEvent[];
  delayedPieces: DashboardDelayedPiece[];
  activePieces: DashboardPiece[];
  statusBreakdown: DashboardStatusBreakdown[];
  unitStatusBreakdown: DashboardUnitStatusBreakdown[];
  priorityBreakdown: DashboardPriorityBreakdown[];
  quality: DashboardQualitySummary;
  dueDateSummary: DashboardDueDateSummary;
  trendDays: number;
  productionTrend: DashboardTrendPoint[];
};

export type DashboardKpi = {
  label: string;
  value: string;
  detail: string;
  trend?: string;
  tone?: "neutral" | "positive" | "warning" | "danger";
};

export type MachineLoad = {
  id: string;
  name: string;
  specialty: string;
  utilization: number;
  queue: string;
  status: MachineStatus;
};

export type ProductionPiece = {
  reference: string;
  profile: string;
  lengthMm: number;
  quantity: number;
  completed: number;
  machine: string;
  status: "En fabrication" | "Affectée" | "Terminée" | "En retard";
  priority: "Haute" | "Normale" | "Basse";
  dueDate: string;
};
export {
  historyEntityLabel,
  historyEntityTypes,
  historyEventLabel,
  historyEventTypes,
} from "./history-labels";
