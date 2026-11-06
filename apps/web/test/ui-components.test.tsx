import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { ProductionProgress } from "@/components/ui/production-progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SuggestionInput } from "@/components/ui/suggestion-input";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { UsersView } from "@/features/users/users-view";
import { MachinesView } from "@/features/machines/machines-view";
import { PiecesView } from "@/features/pieces/pieces-view";
import { AssignmentsView } from "@/features/assignments/assignments-view";
import { OperatorView } from "@/features/operator/operator-view";
import { QualityView } from "@/features/quality/quality-view";
import { HistoryView } from "@/features/history/history-view";
import { SettingsView } from "@/features/settings/settings-view";
import { MaterialProfilesView } from "@/features/settings/material-profiles-view";
import { NotificationsView } from "@/features/notifications/notifications-view";
import { ProfileView } from "@/features/auth/profile-view";
import { LoginForm } from "@/features/auth/login-form";
import { OfflineStatus } from "@/components/pwa/offline-status";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable } from "@/components/ui/data-table";
import { Table } from "@/components/ui/table";
import { TableColumnHeader, TableSortIndicator } from "@/components/ui/table-sort";
import { PlanningCalendarView } from "@/features/planning/planning-calendar-view";
import { AppHeader } from "@/components/layout/app-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PieceImportView } from "@/features/pieces/piece-import-view";
import { FaconnagePreparationView } from "@/features/pieces/faconnage-preparation-view";
import { PieceDetailView } from "@/features/pieces/piece-detail-view";
import { MachineDetailView } from "@/features/machines/machine-detail-view";
import { OffersView } from "@/features/offers/offers-view";
import { GlobalSearchView } from "@/features/search/global-search-view";
import { ClientsView } from "@/features/clients/clients-view";
import { OfferFormSheet } from "@/features/offers/offer-form-sheet";
import { OfferOverviewView } from "@/features/offers/offer-overview-view";
import { OfferBarAssignmentsView } from "@/features/offers/offer-bar-assignments-view";
import { OfferBarsView } from "@/features/offers/offer-bars-view";
import { OperatorTabletLoginView } from "@/features/operator/operator-tablet-login-view";
import { OperatorTabletSessionView } from "@/features/operator/operator-tablet-session-view";
import {
  getOffersRequest,
  getPiecesRequest,
  getMachinesPageRequest,
  getMachineRequest,
  unassignOfferBarRequest,
  getProductionMonitorRequest,
  getDashboardOverviewRequest,
  loginRequest,
  getOfferRequest,
  getOfferCuttingPlansRequest,
  cancelCuttingPlanRequest,
  getOfferPiecesRequest,
  getPieceFacetsRequest,
  getOfferNextPieceReferenceRequest,
  getOfferBarSummaryRequest,
  getOfferMaterialReportRequest,
  getOfferBarAssignmentsRequest,
  assignOfferBarsRequest,
  getOfferProductionSummaryRequest,
  getHistoryRequest,
  getProductionCurrentRequest,
  getQualityHistoryRequest,
  getProductionNonConformitiesRequest,
  getCurrentTabletOperatorRequest,
  getCurrentMachineSessionRequest,
  operatorTabletLoginRequest,
  getNotificationsRequest,
  markNotificationReadRequest,
  markAllNotificationsReadRequest,
  createMaterialProfileRequest,
  createOfferPieceRequest,
  createOfferPiecesBatchRequest,
  getMaterialProfilesRequest,
  prepareOfferFaconnageRequest,
  updateMaterialProfileRequest,
  overrideOfferStatusRequest,
  getClientsRequest,
  createClientRequest,
  previewPieceImportRequest,
} from "@/features/auth/auth-client";

const sidebarTestState = vi.hoisted(() => ({
  pathname: "/dashboard" as string,
  role: "ADMIN" as string,
  searchParams: "" as string,
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => sidebarTestState.pathname,
  useSearchParams: () => new URLSearchParams(sidebarTestState.searchParams),
  useRouter: () => ({ replace: sidebarTestState.replace, push: sidebarTestState.push }),
  useParams: () => ({ id: "piece-1" }),
}));
vi.mock("next/image", () => ({
  default: ({ priority: _priority, fill: _fill, ...props }: Record<string, unknown>) => (
    <img {...props} />
  ),
}));
vi.mock("recharts", () => {
  const ChartStub = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Bar: ChartStub,
    BarChart: ChartStub,
    Area: ChartStub,
    AreaChart: ChartStub,
    Line: ChartStub,
    LineChart: ChartStub,
    CartesianGrid: ChartStub,
    Cell: ChartStub,
    Legend: ChartStub,
    Pie: ChartStub,
    PieChart: ChartStub,
    ResponsiveContainer: ChartStub,
    Tooltip: ChartStub,
    XAxis: ChartStub,
    YAxis: ChartStub,
  };
});
vi.mock("react-big-calendar", () => ({
  Calendar: ({ events }: { events: Array<{ title: string }> }) => (
    <div data-testid="calendar-mock">
      {events.map((event) => (
        <span key={event.title}>{event.title}</span>
      ))}
    </div>
  ),
  dateFnsLocalizer: () => ({}),
}));
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "1", username: "admin", displayName: "Admin", role: sidebarTestState.role },
    logout: vi.fn(),
    refresh: vi
      .fn()
      .mockResolvedValue({ id: "1", username: "admin", displayName: "Admin", role: "ADMIN" }),
  }),
}));
vi.mock("@/features/auth/auth-client", () => ({
  ApiError: class ApiError extends Error {},
  loginRequest: vi.fn().mockResolvedValue({
    user: { id: "1", username: "admin", displayName: "Admin", role: "ADMIN" },
  }),
  operatorTabletLoginRequest: vi.fn(),
  getCurrentTabletOperatorRequest: vi.fn().mockResolvedValue({ operator: null }),
  getCurrentMachineSessionRequest: vi
    .fn()
    .mockResolvedValue({ session: null, bars: [], activeRun: null }),
  getTabletMachinesRequest: vi.fn().mockResolvedValue({ machines: [] }),
  getAvailableOperatorsRequest: vi.fn().mockResolvedValue({ operators: [] }),
  startMachineSessionRequest: vi.fn(),
  operatorTabletLogoutRequest: vi.fn(),
  endMachineSessionRequest: vi.fn(),
  getOffersRequest: vi.fn().mockResolvedValue({ offers: [] }),
  getClientsRequest: vi.fn().mockResolvedValue({
    clients: [],
    pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
  }),
  getClientsExportDataRequest: vi.fn(),
  exportClientsRequest: vi.fn(),
  getClientRequest: vi.fn(),
  createClientRequest: vi.fn(),
  updateClientRequest: vi.fn(),
  archiveClientRequest: vi.fn(),
  restoreClientRequest: vi.fn(),
  uploadClientPhotoRequest: vi.fn(),
  getClientPhotoUrl: vi.fn((id: string) => `http://localhost:4000/clients/${id}/photo`),
  getProductionMonitorRequest: vi.fn().mockResolvedValue({
    bars: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    counts: { shaped: 0, assigned: 0, inProgress: 0, fabricated: 0, openNonConformities: 0 },
  }),
  createOfferRequest: vi.fn(),
  updateOfferRequest: vi.fn(),
  overrideOfferStatusRequest: vi.fn(),
  archiveOfferRequest: vi.fn(),
  restoreOfferRequest: vi.fn(),
  deleteOfferRequest: vi.fn(),
  getOfferRequest: vi.fn().mockResolvedValue({ offer: { id: "offer-1", status: "DRAFT" } }),
  getPieceFacetsRequest: vi.fn().mockResolvedValue({
    profiles: ["Profil 40"],
    qualities: ["S275JR"],
    designations: ["POUTRE"],
  }),
  getOfferPieceFacetsRequest: vi
    .fn()
    .mockResolvedValue({ profiles: ["IPE200"], qualities: ["S275JR"], designations: ["POUTRE"] }),
  getOfferBarsRequest: vi.fn().mockResolvedValue({ bars: [], statusCounts: {}, total: 0 }),
  getOfferMaterialReportRequest: vi.fn(),
  getOfferBarSummaryRequest: vi.fn().mockResolvedValue({ statusCounts: {}, total: 0 }),
  getOfferProductionSummaryRequest: vi
    .fn()
    .mockResolvedValue({ summary: { statusCounts: {}, totals: { pendingQuality: 0 } } }),
  getOfferBarAssignmentsRequest: vi.fn().mockResolvedValue({ availableBars: [], assignments: [] }),
  assignOfferBarsRequest: vi.fn(),
  unassignOfferBarRequest: vi.fn(),
  cancelOfferBarRequest: vi.fn(),
  getUsersRequest: vi.fn().mockResolvedValue({
    users: [
      {
        id: "1",
        username: "admin",
        displayName: "Admin",
        role: "ADMIN",
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastLoginAt: null,
      },
    ],
  }),
  getUsersPageRequest: vi.fn().mockImplementation(({ search }: { search?: string } = {}) =>
    Promise.resolve({
      users: search
        ? []
        : [
            {
              id: "1",
              username: "admin",
              displayName: "Admin",
              role: "ADMIN",
              isActive: true,
              tabletAccessEnabled: false,
              createdAt: "2026-01-01T00:00:00.000Z",
              lastLoginAt: null,
            },
          ],
      pagination: { page: 1, pageSize: 20, total: search ? 0 : 1, totalPages: 1 },
      summary: { activeCount: 1, adminCount: 1, tabletAccessCount: 0 },
    }),
  ),
  createUserRequest: vi.fn(),
  updateUserRequest: vi.fn(),
  setUserActiveRequest: vi.fn(),
  resetUserPasswordRequest: vi.fn(),
  changePasswordRequest: vi.fn().mockResolvedValue({ success: true }),
  getMachinesRequest: vi.fn().mockResolvedValue({
    machines: [
      {
        id: "machine-1",
        name: "CNC-06",
        internalNumber: "CNC-06",
        type: "DÃƒÂ©coupe",
        status: "ACTIVE",
        description: null,
        location: "Atelier A",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  }),
  getMachinesPageRequest: vi.fn().mockResolvedValue({
    machines: [
      {
        id: "machine-1",
        name: "CNC-06",
        internalNumber: "CNC-06",
        type: "DÃƒÂ©coupe",
        status: "ACTIVE",
        description: null,
        location: "Atelier A",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        assignedBarCount: 0,
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    statusCounts: { ACTIVE: 1 },
  }),
  createMachineRequest: vi.fn(),
  updateMachineRequest: vi.fn(),
  setMachineStatusRequest: vi.fn(),
  getMachineRequest: vi.fn().mockResolvedValue({
    machine: {
      id: "machine-1",
      name: "CNC-06",
      internalNumber: "CNC-06",
      type: "DÃƒÂ©coupe",
      status: "ACTIVE",
      description: null,
      location: "Atelier A",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      activeOperationCount: 0,
      queue: [],
      queuePagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
      assignedBarCount: 0,
      cuttingBars: [],
      cuttingBarsPagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
      barMetrics: { assigned: 0, inProgress: 0, fabricatedToday: 0, fabricatedTotal: 0 },
    },
  }),
  getMachineHistoryRequest: vi
    .fn()
    .mockResolvedValue({ events: [], page: 1, pageSize: 8, total: 0, totalPages: 0 }),
  getPiecesRequest: vi.fn().mockResolvedValue({
    pieces: [
      {
        id: "piece-1",
        offerId: "offer-1",
        productionStatusCounts: { PENDING: 3, FACONNEE: 0, AFFECTEE: 0, LANCEE: 0, FABRIQUEE: 0 },
        isUnstarted: true,
        reference: "CMD-001",
        quantity: 3,
        completedUnits: 1,
        profile: "Profil 40",
        quality: "S275JR",
        lengthMm: 6000,
        unitWeightKg: 2.4,
        totalWeightKg: 7.2,
        designation: "POUTRE",
        priority: "HIGH",
        dueDate: "2026-12-01T23:59:59.000Z",
        status: "PLANNED",
        createdById: "1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        imageCount: 0,
        coverImageUrl: null,
      },
    ],
    profiles: ["Profil 40"],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  }),
  getAllPiecesRequest: vi.fn().mockResolvedValue({
    pieces: [
      {
        id: "piece-planning-1",
        reference: "CMD-001",
        dueDate: "2026-12-01T23:59:59.000Z",
        status: "PLANNED",
        priority: "HIGH",
        profile: "IPE200",
      },
    ],
  }),
  getPlanningPiecesRequest: vi.fn().mockResolvedValue({
    pieces: [
      {
        id: "piece-planning-1",
        reference: "CMD-001",
        dueDate: "2026-12-01T23:59:59.000Z",
        status: "PLANNED",
        priority: "HIGH",
        profile: "IPE200",
      },
    ],
  }),
  getOfferPiecesRequest: vi.fn().mockResolvedValue({ pieces: [] }),
  getOfferNextPieceReferenceRequest: vi.fn().mockResolvedValue({ reference: "P-014" }),
  createOfferPieceRequest: vi.fn().mockResolvedValue({ piece: { id: "piece-new" } }),
  createOfferPiecesBatchRequest: vi
    .fn()
    .mockResolvedValue({ pieces: [{ id: "piece-1" }, { id: "piece-2" }] }),
  getPieceRequest: vi.fn().mockResolvedValue({
    piece: {
      id: "piece-1",
      reference: "CMD-001",
      quantity: 3,
      completedUnits: 1,
      profile: "Profil 40",
      quality: "S275JR",
      lengthMm: 6000,
      unitWeightKg: 2.4,
      totalWeightKg: 7.2,
      designation: "POUTRE",
      priority: "HIGH",
      dueDate: "2026-12-01T23:59:59.000Z",
      status: "PLANNED",
      createdById: "1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      imageCount: 0,
      coverImageUrl: null,
      images: [],
      units: [
        {
          id: "unit-1",
          pieceId: "piece-1",
          sequenceNumber: 1,
          status: "ASSIGNED",
          currentMachineId: "machine-1",
          currentMachineName: "CNC-06",
          currentOperatorId: null,
          currentOperatorName: null,
          startedAt: null,
          manufacturedAt: null,
          controlledAt: null,
          qualityResult: null,
          activeAssignment: {
            id: "assignment-1",
            machineId: "machine-1",
            machineName: "CNC-06",
            queuePosition: 1,
            assignedAt: "2026-01-01T08:00:00.000Z",
            reason: null,
          },
        },
      ],
    },
  }),
  getPieceHistoryRequest: vi
    .fn()
    .mockResolvedValue({ events: [], page: 1, pageSize: 8, total: 0, totalPages: 0 }),
  previewPieceImportRequest: vi.fn(),
  commitPieceImportRequest: vi.fn(),
  getAvailableProfilesRequest: vi.fn().mockResolvedValue({
    profiles: [
      { profile: "IPE200", family: "IPE", pieceCount: 2, totalQuantity: 5 },
      { profile: "HEA300", family: "HEA", pieceCount: 1, totalQuantity: 2 },
      { profile: "DEMI-IPE400", family: "OTHER", pieceCount: 1, totalQuantity: 1 },
    ],
    totalProfiles: 3,
    totalPieceRows: 4,
  }),
  getOfferAvailableProfilesRequest: vi.fn().mockResolvedValue({
    profiles: [
      { profile: "IPE200", family: "IPE", pieceCount: 2, totalQuantity: 5 },
      { profile: "HEA300", family: "HEA", pieceCount: 1, totalQuantity: 2 },
      { profile: "DEMI-IPE400", family: "OTHER", pieceCount: 1, totalQuantity: 1 },
    ],
    totalProfiles: 3,
    totalPieceRows: 4,
  }),
  prepareFaconnageRequest: vi.fn().mockResolvedValue({
    preparation: {
      preparationId: "prep-1",
      selectedProfiles: ["IPE200"],
      requirements: [{ profile: "IPE200", lengthMm: 6000, quantity: 5 }],
      summary: { selectedProfileCount: 1, pieceRows: 2, totalQuantity: 5, lengthCount: 1 },
    },
  }),
  prepareOfferFaconnageRequest: vi.fn().mockResolvedValue({
    preparation: {
      preparationId: "prep-1",
      selectedProfiles: ["IPE200"],
      requirements: [{ profile: "IPE200", lengthMm: 6000, quantity: 5 }],
      summary: { selectedProfileCount: 1, pieceRows: 2, totalQuantity: 5, lengthCount: 1 },
    },
  }),
  optimizeFaconnageRequest: vi.fn().mockResolvedValue({
    optimization: {
      plan: {
        id: "plan-1",
        reference: "OFF-001-CP-001",
        status: "DRAFT",
        createdAt: "2026-10-16T10:00:00.000Z",
      },
      proposals: Array.from({ length: 5 }, (_, index) => ({
        id: `proposal-${index + 1}`,
        reference: `OFF-001-P${String(index + 1).padStart(3, "0")}`,
        ordinal: index + 1,
        profile: "IPE200",
        rawLengthMm: 6000,
        usedLengthMm: 6000,
        wasteMm: 0,
        cuts: [{ lengthMm: 6000, quantity: 1 }],
        status: "PROPOSED",
        pieceUnitCount: 1,
        cuttingBarId: null,
        cuttingBarReference: null,
      })),
      profiles: [
        {
          profile: "IPE200",
          status: "OPTIMAL",
          totalBars: 5,
          totalRawLengthMm: 30000,
          totalUsedLengthMm: 30000,
          totalWasteMm: 0,
          utilizationRate: 100,
          bars: Array.from({ length: 5 }, () => ({
            rawLengthMm: 6000,
            cuts: [{ lengthMm: 6000, quantity: 1 }],
            usedLengthMm: 6000,
            wasteMm: 0,
            utilizationRate: 100,
          })),
          requirementSummary: [{ lengthMm: 6000, requestedQuantity: 5, producedQuantity: 5 }],
          alternatives: [],
        },
      ],
      summary: {
        profileCount: 1,
        totalBars: 5,
        totalRawLengthMm: 30000,
        totalUsedLengthMm: 30000,
        totalWasteMm: 0,
        utilizationRate: 100,
      },
    },
  }),
  validateCuttingPlanBarsRequest: vi.fn().mockResolvedValue({
    plan: {
      id: "plan-1",
      reference: "OFF-001-CP-001",
      status: "PARTIALLY_VALIDATED",
      validatedBarCount: 1,
      remainingBarCount: 4,
      barsCreated: 1,
    },
  }),
  cancelCuttingPlanRequest: vi.fn(),
  deleteDraftCuttingPlanRequest: vi.fn(),
  getOfferCuttingPlansRequest: vi.fn().mockResolvedValue({ plans: [] }),
  getOfferCuttingPlanRequest: vi.fn(),
  createPieceRequest: vi.fn(),
  updatePieceRequest: vi.fn(),
  archivePieceRequest: vi.fn(),
  getAssignmentsRequest: vi.fn().mockResolvedValue({
    assignments: [
      {
        id: "assignment-1",
        pieceUnitId: "unit-1",
        pieceId: "piece-1",
        reference: "CMD-001",
        sequenceNumber: 1,
        profile: "Profil 40",
        unitStatus: "ASSIGNED",
        pieceStatus: "ASSIGNED",
        priority: "HIGH",
        machineId: "machine-1",
        machineName: "CNC-06",
        machineStatus: "ACTIVE",
        assignedById: "1",
        assignedAt: "2026-01-01T08:00:00.000Z",
        queuePosition: 1,
        active: true,
        reason: null,
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    availableUnitCount: 0,
    activeMachineCount: 1,
  }),
  getAvailableAssignmentUnitsRequest: vi.fn().mockResolvedValue({
    availableUnits: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  }),
  createAssignmentRequest: vi.fn(),
  reassignAssignmentRequest: vi.fn(),
  unassignAssignmentRequest: vi.fn(),
  getProductionCurrentRequest: vi.fn().mockResolvedValue({ current: null, queue: [] }),
  startProductionRequest: vi.fn(),
  completeProductionUnitRequest: vi.fn(),
  finishProductionRequest: vi.fn(),
  getQualityPendingRequest: vi.fn().mockResolvedValue({
    units: [
      {
        pieceUnitId: "unit-quality-1",
        pieceId: "piece-1",
        reference: "CMD-001",
        sequenceNumber: 1,
        profile: "Profil 40",
        lengthMm: 6000,
        priority: "HIGH",
        status: "QUALITY_PENDING",
        pieceStatus: "COMPLETED",
        machineName: "CNC-06",
        operatorName: "OpÃƒÂ©rateur",
        manufacturedAt: "2026-01-01T10:00:00.000Z",
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  }),
  getQualityHistoryRequest: vi.fn().mockResolvedValue({
    controls: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
  }),
  getProductionNonConformitiesRequest: vi.fn().mockResolvedValue({ nonConformities: [] }),
  validateQualityRequest: vi.fn(),
  requestQualityDisposition: vi.fn().mockResolvedValue({ disposition: { id: "disposition-1" } }),
  decideQualityDeviation: vi.fn(),
  getQualityDefectImageUrl: vi.fn(
    (controlId: string, imageId: string) => `/quality/${controlId}/${imageId}`,
  ),
  uploadQualityDefectImageRequest: vi.fn(),
  removeQualityDefectImageRequest: vi.fn(),
  getHistoryRequest: vi.fn().mockResolvedValue({
    events: [
      {
        id: "event-1",
        eventType: "QUALITY_VALIDATED",
        entityType: "QUALITY_CONTROL",
        entityId: "control-1",
        actorUserId: "1",
        actorName: "Admin",
        actorRole: "ADMIN",
        metadata: { result: "CONFORM" },
        createdAt: "2026-01-01T10:00:00.000Z",
      },
    ],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  }),
  getDashboardOverviewRequest: vi.fn().mockResolvedValue({
    summary: {
      totalPieces: 1,
      totalUnits: 3,
      completedUnits: 1,
      progressPercent: 33,
      inProductionUnits: 1,
      delayedPieces: 0,
      activeMachines: 1,
      maintenanceMachines: 0,
      totalMachines: 1,
      openNonConformities: 0,
    },
    machineLoads: [],
    recentActivity: [],
    delayedPieces: [],
    activePieces: [],
    statusBreakdown: [],
    unitStatusBreakdown: [],
    priorityBreakdown: [],
    quality: {
      pendingUnits: 0,
      inspectedUnits: 0,
      conformUnits: 0,
      nonConformUnits: 0,
      conformityRate: 0,
    },
    dueDateSummary: {
      overduePieces: 0,
      dueTodayPieces: 0,
      dueNextSevenDaysPieces: 0,
      withoutDueDatePieces: 0,
    },
    productionTrend: [],
    trendDays: 14,
  }),
  getSettingsRequest: vi.fn().mockResolvedValue({
    settings: { density: "comfortable", notificationsEnabled: true, updatedAt: null },
  }),
  getMaterialProfilesRequest: vi.fn().mockResolvedValue({
    profiles: [
      {
        id: "profile-ipe200",
        reference: "IPE200",
        profile: "IPE200",
        kgPerMeter: 22.4,
        rawLengthsMm: [6000, 12100, 15100],
        isActive: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "profile-hea300",
        reference: "HEA300",
        profile: "HEA300",
        kgPerMeter: 88.3,
        rawLengthsMm: [12100, 15100],
        isActive: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    total: 2,
  }),
  createMaterialProfileRequest: vi.fn(),
  updateMaterialProfileRequest: vi.fn(),
  updateSettingsRequest: vi.fn().mockResolvedValue({
    settings: {
      density: "compact",
      notificationsEnabled: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  }),
  getNotificationsRequest: vi.fn().mockResolvedValue({
    notifications: [
      {
        id: "notification-1",
        eventType: "BAR_PRODUCTION_STARTED",
        title: "Fabrication de la barre dÃƒÂ©marrÃƒÂ©e",
        actorName: "Samira",
        message: "La fabrication de AFF-B001 a dÃƒÂ©marrÃƒÂ© Ã‚Â· Scie 01.",
        href: "/offers/offer-1/bars",
        offerId: "offer-1",
        readAt: null,
        createdAt: "2026-01-01T10:00:00.000Z",
      },
    ],
    unreadCount: 1,
    eventTypes: ["BAR_PRODUCTION_STARTED"],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  }),
  markNotificationReadRequest: vi
    .fn()
    .mockResolvedValue({ id: "notification-1", readAt: "2026-01-01T11:00:00.000Z" }),
  markAllNotificationsReadRequest: vi
    .fn()
    .mockResolvedValue({ updatedCount: 1, readAt: "2026-01-01T11:00:00.000Z" }),
}));
import { AppSidebar } from "@/components/layout/app-sidebar";

afterEach(() => {
  sidebarTestState.pathname = "/dashboard";
  sidebarTestState.role = "ADMIN";
  sidebarTestState.searchParams = "";
  sidebarTestState.replace.mockClear();
  sidebarTestState.push.mockClear();
});

describe("shared UI foundation", () => {
  it("sorts rows through the shadcn data table header", async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={[{ accessorKey: "name", header: "Nom" }]}
        data={[{ name: "Zinc" }, { name: "Acier" }]}
        caption="Catalogue matiÃƒÂ¨re"
      />,
    );

    const sortButton = screen.getByRole("button", { name: "Trier par Nom" });
    expect(sortButton).toHaveAttribute("aria-sort", "none");
    await user.click(sortButton);
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Acier");
    expect(sortButton).toHaveAttribute("aria-sort", "ascending");
  });

  it("defaults profile tables to ascending profile order while keeping import order opt-out available", () => {
    const profileSortKey = `nim-table-sort:${window.location.pathname}:profile-default-sort-test`;
    window.sessionStorage.removeItem(profileSortKey);
    const { unmount } = render(
      <Table aria-label="Profils matiÃ¨re" data-sort-key="profile-default-sort-test">
        <thead><tr><th>RÃ©fÃ©rence</th><th>Profil</th></tr></thead>
        <tbody>
          <tr><td>2</td><td>IPE200</td></tr>
          <tr><td>1</td><td>HEA140</td></tr>
        </tbody>
      </Table>,
    );

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("1HEA140");
    expect(screen.getByRole("columnheader", { name: "Profil" })).toHaveAttribute("aria-sort", "ascending");

    unmount();
    window.sessionStorage.removeItem(`nim-table-sort:${window.location.pathname}:import-order-test`);
    render(
      <Table aria-label="AperÃ§u import" data-sort-key="import-order-test" defaultSortByProfile={false}>
        <thead><tr><th>Ligne</th><th>Profil</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>IPE200</td></tr>
          <tr><td>2</td><td>HEA140</td></tr>
        </tbody>
      </Table>,
    );
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("1IPE200");
    window.sessionStorage.removeItem(profileSortKey);
    window.sessionStorage.removeItem(`nim-table-sort:${window.location.pathname}:import-order-test`);
  });

  it("defaults the shadcn data table to its profile column", () => {
    render(
      <DataTable
        columns={[{ accessorKey: "profile", header: "Profil" }]}
        data={[{ profile: "IPE200" }, { profile: "HEA140" }]}
      />,
    );

    expect(screen.getAllByRole("row")[1]).toHaveTextContent("HEA140");
    expect(screen.getByRole("button", { name: "Trier par Profil" })).toHaveAttribute("aria-sort", "ascending");
  });

  it("manually sorts every shared table by the clicked column and direction", async () => {
    const user = userEvent.setup();
    render(
      <Table aria-label="Barres" className="nim-data-table">
        <thead>
          <tr>
            <th>Profil</th>
            <th className="text-right">{"Quantit\u00e9"}</th>
            <th data-sortable="false">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>IPE200</td>
            <td>10</td>
            <td>Ouvrir</td>
          </tr>
          <tr>
            <td>HEA140</td>
            <td>2</td>
            <td>Ouvrir</td>
          </tr>
        </tbody>
      </Table>,
    );

    const quantityHeader = screen.getByRole("button", { name: "Trier par Quantit\u00e9" });
    expect(screen.queryByRole("button", { name: "Trier par Actions" })).not.toBeInTheDocument();
    await user.click(quantityHeader);
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("HEA1402Ouvrir");
    expect(screen.getAllByRole("columnheader")[1]).toHaveAttribute("aria-sort", "ascending");
    await user.click(quantityHeader);
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("IPE20010Ouvrir");
    expect(screen.getAllByRole("columnheader")[1]).toHaveAttribute("aria-sort", "descending");
    await user.click(screen.getByRole("button", { name: "Trier par Profil" }));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("HEA1402Ouvrir");
    expect(screen.getAllByRole("columnheader")[0]).toHaveAttribute("aria-sort", "ascending");
  });

  it("keeps the chosen sort when a paginated table remounts with its next page", async () => {
    const user = userEvent.setup();
    const sortKey = `nim-table-sort:${window.location.pathname}:pagination-sort-persistence-test`;
    window.sessionStorage.removeItem(sortKey);
    const page = (rows: Array<[string, number]>) => (
      <Table
        data-sort-key="pagination-sort-persistence-test"
        aria-label="Pagination test"
        className="nim-data-table"
      >
        <thead>
          <tr>
            <th>Profil</th>
            <th>{"Quantit\\u00e9"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([profile, quantity]) => (
            <tr key={profile}>
              <td>{profile}</td>
              <td>{quantity}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    );

    const firstPage = render(
      page([
        ["IPE200", 10],
        ["HEA140", 2],
      ]),
    );
    const quantityHeader = screen.getByRole("button", { name: "Trier par Quantit\\u00e9" });
    await user.click(quantityHeader);
    await user.click(quantityHeader);
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("IPE20010");
    firstPage.unmount();

    render(
      page([
        ["HEA120", 3],
        ["IPE300", 8],
      ]),
    );
    await waitFor(() => {
      expect(screen.getAllByRole("columnheader")[1]).toHaveAttribute("aria-sort", "descending");
      expect(screen.getAllByRole("row")[1]).toHaveTextContent("IPE3008");
    });
    window.sessionStorage.removeItem(sortKey);
  });

  it("renders a consistent sortable table header affordance", async () => {
    const onSort = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <th>
              <TableColumnHeader direction="asc" label="Date" onSort={onSort}>
                Date
              </TableColumnHeader>
            </th>
            <th>
              <TableSortIndicator direction="none" />
            </th>
          </tr>
        </thead>
      </table>,
    );

    const sortButton = screen.getByRole("button", { name: "Trier par Date" });
    expect(sortButton).toBeInTheDocument();
    expect(sortButton).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(sortButton);
    expect(onSort).toHaveBeenCalledOnce();
    expect(document.querySelectorAll(".nim-table-sort-icon")).toHaveLength(2);
  });
  it("lets an admin override an Affaire status after a clear data-preservation confirmation", async () => {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => undefined,
    });
    vi.mocked(getOfferRequest).mockResolvedValueOnce({
      offer: {
        id: "offer-1",
        reference: "OFF-001",
        revision: "A",
        name: "Atelier Nord",
        clientName: null,
        clientId: null,
        site: null,
        description: null,
        status: "COMPLETED",
        archivedAt: null,
        createdAt: "2026-10-01T08:00:00.000Z",
        updatedAt: "2026-10-16T08:00:00.000Z",
        pieceRows: 4,
        totalUnits: 8,
        manufacturedUnits: 8,
        profileCount: 2,
        progressRate: 100,
        plannedBars: 2,
        latestPlan: null,
        cuttingPlans: [],
      },
    } as never);
    vi.mocked(getOfferRequest).mockResolvedValue({
      offer: {
        id: "offer-1",
        reference: "OFF-001",
        revision: "A",
        name: "Atelier Nord",
        clientName: null,
        clientId: null,
        site: null,
        description: null,
        status: "DRAFT",
        archivedAt: null,
        createdAt: "2026-10-01T08:00:00.000Z",
        updatedAt: "2026-10-16T08:00:00.000Z",
        pieceRows: 4,
        totalUnits: 8,
        manufacturedUnits: 8,
        profileCount: 2,
        progressRate: 100,
        plannedBars: 2,
        latestPlan: null,
        cuttingPlans: [],
      },
    } as never);
    vi.mocked(overrideOfferStatusRequest).mockResolvedValueOnce({ offer: {} as never });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OfferOverviewView offerId="offer-1" />
      </QueryClientProvider>,
    );

    await userEvent.click(
      await screen.findByRole("combobox", { name: "Modifier le statut de lÃ¢â‚¬â„¢affaire" }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Brouillon" }));
    expect(
      await screen.findByText(/ne rÃƒÂ©initialise ni les barres, affectations, fabrications/i),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirmer le statut" }));

    await waitFor(() =>
      expect(overrideOfferStatusRequest).toHaveBeenCalledWith("offer-1", "DRAFT"),
    );
  });

  it("shows existing values as suggestions while keeping the input free-form", async () => {
    function SuggestionHarness(): ReactNode {
      const [value, setValue] = useState("");
      return (
        <SuggestionInput
          aria-label="Profil"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onValueSelect={setValue}
          suggestions={["IPE200", "IPE200", "HEA140"]}
        />
      );
    }
    render(<SuggestionHarness />);
    const input = screen.getByRole("combobox", { name: "Profil" });
    await userEvent.type(input, "IPE");
    expect(screen.getByRole("listbox", { name: "Valeurs dÃƒÂ©jÃƒ  utilisÃƒÂ©es" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "IPE200" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "HEA140" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("option", { name: "IPE200" }));
    expect(input).toHaveValue("IPE200");
    await userEvent.clear(input);
    await userEvent.type(input, "CUSTOM-PROFILE");
    expect(input).toHaveValue("CUSTOM-PROFILE");
    expect(screen.getByText(/Aucune suggestion correspondante/)).toBeInTheDocument();
  });

  it("validates tablet operator credentials before calling the API", async () => {
    vi.mocked(getCurrentTabletOperatorRequest).mockRejectedValueOnce(new Error("Unauthorized"));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorTabletLoginView />
      </QueryClientProvider>,
    );
    const submit = await screen.findByRole("button", { name: "Se connecter" });
    await waitFor(() => expect(submit).toBeEnabled());

    fireEvent.submit(submit.closest("form") as HTMLFormElement);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(operatorTabletLoginRequest).not.toHaveBeenCalled();
  });

  it("confirms and caches the tablet session before redirecting to production", async () => {
    const operator = { id: "operator-1", displayName: "Ahmed Ben Ali" };
    vi.mocked(getCurrentTabletOperatorRequest)
      .mockResolvedValueOnce({ operator: null as never })
      .mockResolvedValueOnce({ operator });
    vi.mocked(operatorTabletLoginRequest).mockResolvedValueOnce({
      operator,
      expiresAt: "2026-10-20T23:00:00.000Z",
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorTabletLoginView />
      </QueryClientProvider>,
    );

    await userEvent.type(await screen.findByLabelText("Identifiant"), "ahmed");
    await userEvent.type(screen.getByLabelText("Mot de passe"), "Operator!2026");
    await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() =>
      expect(sidebarTestState.replace).toHaveBeenCalledWith("/production/tablet"),
    );
    expect(queryClient.getQueryData(["tablet", "operator"])).toEqual({ operator });
  });

  it("shows only bars in the authenticated operator's active machine session", async () => {
    vi.mocked(getCurrentTabletOperatorRequest).mockResolvedValueOnce({
      operator: { id: "operator-1", displayName: "Ahmed Ben Ali" },
    });
    vi.mocked(getCurrentMachineSessionRequest).mockResolvedValue({
      session: {
        id: "session-1",
        status: "ACTIVE",
        machineId: "machine-1",
        machineName: "Kaltenbach 01",
        machineInternalNumber: "KAL-01",
        leadOperatorId: "operator-1",
        startedAt: "2026-01-01T08:00:00.000Z",
        endedAt: null,
        team: [{ id: "operator-1", displayName: "Ahmed Ben Ali", role: "LEAD" }],
      },
      offers: [{ id: "offer-1", reference: "OFF-2026-0042", name: "Atelier Nord", barCount: 1 }],
      bars: [
        {
          id: "bar-1",
          offerId: "offer-1",
          offerReference: "OFF-2026-0042",
          cuttingPlanId: "plan-1",
          reference: "OFF42-B001",
          profile: "IPE200",
          rawLengthMm: 12000,
          usedLengthMm: 11800,
          wasteMm: 200,
          status: "AFFECTEE",
          machine: { id: "machine-1", name: "Kaltenbach 01", internalNumber: "KAL-01" },
          items: [
            {
              id: "bar-item-1",
              pieceUnitId: "unit-1",
              pieceId: "piece-1",
              reference: "P-001",
              sequenceNumber: 1,
              lengthMm: 3200,
              weightKg: 71.2,
              status: "ASSIGNED",
              productionStatus: "AFFECTEE",
              qualityStatus: "NOT_INSPECTED",
              active: true,
            },
          ],
          createdAt: "2026-01-01T07:00:00.000Z",
        },
      ],
      activeRun: null,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorTabletSessionView />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Kaltenbach 01" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Choisissez une affaire" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /OFF-2026-0042/ }));
    expect(screen.getByText("OFF42-B001")).toBeInTheDocument();
    expect(screen.getByText("Barres regroupÃƒÂ©es par profil")).toBeInTheDocument();
    expect(screen.queryByText("Aucune barre en attente")).not.toBeInTheDocument();
  });

  it("renders the Offer-first workspace with a useful empty state", async () => {
    vi.mocked(getOffersRequest).mockResolvedValueOnce({
      offers: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
      facets: { clients: [], sites: [] },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OffersView />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Affaires" })).toBeInTheDocument();
    expect(await screen.findByText("Aucune affaire")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CrÃƒÂ©er la premiÃƒÂ¨re affaire" })).toBeEnabled();
  });

  it("keeps Offer overview production metrics in unit counts, separate from bars", async () => {
    vi.mocked(getOfferRequest).mockResolvedValueOnce({
      offer: {
        id: "offer-1",
        reference: "OFF-001",
        revision: "A",
        name: "Atelier Nord",
        clientName: "Client A",
        clientId: "client-a",
        site: "Tunis",
        description: null,
        status: "IN_PRODUCTION",
        archivedAt: null,
        createdAt: "2026-10-01T08:00:00.000Z",
        updatedAt: "2026-10-16T08:00:00.000Z",
        pieceRows: 12,
        totalUnits: 50,
        manufacturedUnits: 18,
        profileCount: 4,
        progressRate: 36,
        plannedBars: 10,
        latestPlan: null,
        cuttingPlans: [],
      },
    } as never);
    vi.mocked(getOfferBarSummaryRequest).mockResolvedValueOnce({
      total: 10,
      statusCounts: { FACONNEE: 2, AFFECTEE: 3, LANCEE: 1, FABRIQUEE: 4 },
    });
    vi.mocked(getOfferProductionSummaryRequest).mockResolvedValueOnce({
      summary: { statusCounts: { PENDING: 7 }, totals: { pendingQuality: 2 } },
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OfferOverviewView offerId="offer-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Ãƒâ€°tat des unitÃƒÂ©s")).toBeInTheDocument();
    expect(screen.getByText("18 / 50 unitÃƒÂ©s fabriquÃƒÂ©es")).toBeInTheDocument();
    expect(screen.getByText("Ãƒâ‚¬ faÃƒÂ§onner")).toBeInTheDocument();
    expect(screen.getByText("En fabrication")).toBeInTheDocument();
    expect(screen.queryByText("Ãƒâ‚¬ affecter")).not.toBeInTheDocument();
    expect(screen.getByText("2 unitÃƒÂ©(s) attendent un contrÃƒÂ´le qualitÃƒÂ©.")).toBeInTheDocument();
    expect(screen.queryByText("profils dÃƒÂ©taillÃƒÂ©s")).not.toBeInTheDocument();
  });

  it("links managers from a ready Affaire directly back to saved plan validation", async () => {
    vi.mocked(getOfferRequest).mockResolvedValueOnce({
      offer: {
        id: "offer-1",
        reference: "OFF-001",
        revision: "A",
        name: "Atelier Nord",
        clientName: "Client A",
        clientId: "client-a",
        site: "Tunis",
        description: null,
        status: "READY",
        archivedAt: null,
        createdAt: "2026-10-01T08:00:00.000Z",
        updatedAt: "2026-10-16T08:00:00.000Z",
        pieceRows: 12,
        totalUnits: 50,
        manufacturedUnits: 0,
        profileCount: 4,
        progressRate: 0,
        plannedBars: 10,
        latestPlan: null,
        cuttingPlans: [
          {
            id: "plan-1",
            reference: "PLAN-001",
            status: "VALIDATED",
            totalBars: 10,
            totalWasteMm: 120,
            utilizationRate: 92,
            createdAt: "2026-10-16T08:00:00.000Z",
          },
        ],
      },
    } as never);
    vi.mocked(getOfferBarSummaryRequest).mockResolvedValueOnce({
      total: 0,
      statusCounts: { FACONNEE: 0, AFFECTEE: 0, LANCEE: 0, FABRIQUEE: 0 },
    });
    vi.mocked(getOfferProductionSummaryRequest).mockResolvedValueOnce({
      summary: { statusCounts: { PENDING: 50 }, totals: { pendingQuality: 0 } },
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OfferOverviewView offerId="offer-1" />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("link", { name: /Revenir .* la validation du plan/i }),
    ).toHaveAttribute("href", "/offers/offer-1/faconnage#saved-plans");
  });

  it("renders a status badge and progress value", () => {
    render(
      <>
        <StatusBadge tone="active">Active</StatusBadge>
        <ProductionProgress completed={8} total={10} />
      </>,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("8 / 10")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("renders the supplied product illustration in empty states", () => {
    render(
      <EmptyState
        title="Aucune machine"
        description="Aucune machine configurÃƒÂ©e."
        illustration="/assets/illustrations/machine-maintenance.png"
        illustrationAlt="Machine en maintenance"
      />,
    );
    expect(screen.getByRole("img", { name: "Machine en maintenance" })).toHaveAttribute(
      "src",
      expect.stringContaining("machine-maintenance.png"),
    );
  });

  it("keeps buttons accessible by their visible label", () => {
    render(<Button>Se connecter</Button>);
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeInTheDocument();
  });

  it("gives shared buttons and inputs the minimum touch-target height", () => {
    render(
      <>
        <Button>Action principale</Button>
        <Button size="icon" aria-label="Ouvrir le menu">
          Menu
        </Button>
        <Input aria-label="Recherche" />
      </>,
    );

    expect(screen.getByRole("button", { name: "Action principale" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Ouvrir le menu" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Ouvrir le menu" })).toHaveClass("min-w-11");
    expect(screen.getByRole("textbox", { name: "Recherche" })).toHaveClass("min-h-11");
  });

  it("exposes progress semantics for assistive technology", () => {
    render(<ProductionProgress completed={8} total={10} />);
    expect(
      screen
        .getAllByRole("progressbar")
        .every((element) => element.getAttribute("aria-valuenow") === "80"),
    ).toBe(true);
  });

  it("renders the responsive application navigation", () => {
    render(<AppSidebar />);
    expect(screen.getByRole("link", { name: "Tableau de bord" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Machines" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ouvrir le menu" })).toBeInTheDocument();
  });

  it("uses one shared user directory entry for operator accounts", () => {
    const { rerender } = render(<AppSidebar />);

    expect(screen.getByRole("link", { name: "Utilisateurs" })).toHaveAttribute("href", "/users");
    expect(screen.queryByRole("link", { name: "OpÃƒÂ©rateurs" })).not.toBeInTheDocument();

    sidebarTestState.role = "PRODUCTION_MANAGER";
    rerender(<AppSidebar />);

    expect(screen.getByRole("link", { name: "OpÃƒÂ©rateurs" })).toHaveAttribute(
      "href",
      "/users?role=OPERATOR",
    );
    expect(screen.queryByRole("link", { name: "Utilisateurs" })).not.toBeInTheDocument();
  });

  it("shows the Offers navigation entry", () => {
    render(<AppSidebar />);
    expect(screen.getByRole("link", { name: "Affaires" })).toHaveAttribute("href", "/offers");
  });

  it("marks an Offer descendant as the active sidebar destination", () => {
    const { rerender } = render(<AppSidebar />);
    sidebarTestState.pathname = "/offers/offer-1/pieces";
    rerender(<AppSidebar />);
    expect(screen.getByRole("link", { name: "Affaires" })).toHaveAttribute("aria-current", "page");
  });

  it("shows contextual workspace links beneath Affaires and highlights the current section", () => {
    sidebarTestState.pathname = "/offers/offer-1/pieces/import";
    render(<AppSidebar />);
    const linkFor = (href: string) => screen.getAllByRole("link").find((link) => link.getAttribute("href") === href);

    expect(linkFor("/offers")?.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText((text) => text.startsWith("Espace de l"))).toBeInTheDocument();
    expect(linkFor("/offers/offer-1")).toBeInTheDocument();
    expect(linkFor("/offers/offer-1/pieces")?.getAttribute("aria-current")).toBe("page");
    expect(linkFor("/offers/offer-1/bar-assignments")).toBeInTheDocument();
    expect(linkFor("/offers/offer-1/production")).toBeInTheDocument();
    expect(linkFor("/offers/offer-1/pieces/import")).toBeUndefined();
    expect(linkFor("/production")).toBeInTheDocument();
  });

  it("keeps the Affaire workspace visible on its overview route", () => {
    sidebarTestState.pathname = "/offers/offer-1";
    render(<AppSidebar />);
    const linkFor = (href: string) => screen.getAllByRole("link").find((link) => link.getAttribute("href") === href);

    expect(linkFor("/offers/offer-1")?.getAttribute("aria-current")).toBe("page");
    expect(linkFor("/offers/offer-1/faconnage")).toBeInTheDocument();
    expect(linkFor("/offers")?.getAttribute("aria-current")).toBe("page");
  });

  it("keeps Offer navigation manager-only", () => {
    sidebarTestState.pathname = "/offers";
    sidebarTestState.role = "OPERATOR";
    render(<AppSidebar />);

    expect(screen.queryByRole("link", { name: "Affaires" })).not.toBeInTheDocument();
  });

  it("personalizes the dashboard from the authenticated user", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardView />
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Production en un coup dÃ¢â‚¬â„¢Ã…â€œil" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Avancement de fabrication")).toBeInTheDocument();
    expect(screen.getByText("Machines actives")).toBeInTheDocument();
    expect(screen.queryByText(/% actif/)).not.toBeInTheDocument();
  });

  it("surfaces operational exceptions as direct dashboard actions", async () => {
    vi.mocked(getDashboardOverviewRequest).mockResolvedValueOnce({
      summary: {
        totalPieces: 4,
        totalUnits: 8,
        completedUnits: 2,
        progressPercent: 25,
        inProductionUnits: 2,
        delayedPieces: 3,
        activeMachines: 1,
        maintenanceMachines: 1,
        totalMachines: 2,
        openNonConformities: 2,
      },
      machineLoads: [],
      recentActivity: [],
      delayedPieces: [],
      activePieces: [],
      statusBreakdown: [],
      unitStatusBreakdown: [],
      priorityBreakdown: [],
      quality: {
        pendingUnits: 5,
        inspectedUnits: 0,
        conformUnits: 0,
        nonConformUnits: 0,
        conformityRate: 0,
      },
      dueDateSummary: {
        overduePieces: 3,
        dueTodayPieces: 0,
        dueNextSevenDaysPieces: 0,
        withoutDueDatePieces: 0,
      },
      productionTrend: [],
      trendDays: 14,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <DashboardView />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "Ãƒâ‚¬ traiter en prioritÃƒÂ©" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PiÃƒÂ¨ces en retard/ })).toHaveAttribute(
      "href",
      "/offers",
    );
    expect(screen.getByRole("link", { name: /ContrÃƒÂ´les qualitÃƒÂ© en attente/ })).toHaveAttribute(
      "href",
      "/quality",
    );
    expect(screen.getByRole("link", { name: /Machines en maintenance/ })).toHaveAttribute(
      "href",
      "/machines",
    );
  });

  it("renders API-backed dashboard charts", () => {
    render(
      <DashboardCharts
        machineLoads={[
          {
            id: "machine-1",
            name: "CNC-06",
            internalNumber: "CNC-06",
            type: "DÃƒÂ©coupe",
            status: "ACTIVE",
            queueCount: 2,
            inProgressCount: 1,
          },
        ]}
        statusBreakdown={[
          { status: "IN_PROGRESS", count: 1 },
          { status: "COMPLETED", count: 2 },
        ]}
        unitStatusBreakdown={[{ status: "IN_PROGRESS", count: 3 }]}
        priorityBreakdown={[{ priority: "HIGH", count: 1 }]}
        quality={{
          pendingUnits: 0,
          inspectedUnits: 2,
          conformUnits: 2,
          nonConformUnits: 0,
          conformityRate: 100,
          defectBreakdown: [],
          dispositionBreakdown: [],
          pendingDeviationCount: 0,
        }}
        dueDateSummary={{
          overduePieces: 0,
          dueTodayPieces: 0,
          dueNextSevenDaysPieces: 1,
          withoutDueDatePieces: 0,
        }}
        productionTrend={[
          {
            date: "2026-01-01",
            startedUnits: 1,
            completedUnits: 1,
            conformUnits: 1,
            nonConformUnits: 0,
          },
        ]}
        trendDays={14}
      />,
    );
    expect(screen.getByTestId("machine-load-chart")).toBeInTheDocument();
    expect(screen.getByTestId("piece-status-chart")).toBeInTheDocument();
    expect(screen.getByTestId("unit-flow-chart")).toBeInTheDocument();
    expect(screen.getByTestId("priority-chart")).toBeInTheDocument();
    expect(screen.getByTestId("production-trend-chart")).toBeInTheDocument();
    expect(screen.getByTestId("quality-defect-chart")).toBeInTheDocument();
    expect(screen.getByTestId("quality-disposition-chart")).toBeInTheDocument();
  });

  it("renders the planning calendar from persisted piece due dates", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PlanningCalendarView />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId("planning-calendar")).toBeInTheDocument();
    expect(screen.getByText("CMD-001")).toBeInTheDocument();
  });

  it("shows the authenticated role and notification entry point", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppHeader />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("Administrateur")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /thÃƒÂ¨me sombre|thÃƒÂ¨me clair/i }),
    ).toBeInTheDocument();
  });

  it("submits header searches to the full global search page", async () => {
    const user = userEvent.setup();
    sidebarTestState.pathname = "/offers/offer-1/pieces";
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppHeader />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Ouvrir la recherche globale" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Rechercher dans toute lÃ¢â‚¬â„¢application" }),
      "CNC-06",
    );
    await user.click(screen.getByRole("button", { name: "Lancer la recherche globale" }));

    expect(sidebarTestState.push).toHaveBeenCalledWith("/search?q=CNC-06");
  });

  it("focuses the full-page search instead of opening the header panel on search results", async () => {
    sidebarTestState.pathname = "/search";
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <input id="global-search-page-input" aria-label="Search page field" />
        <TooltipProvider>
          <AppHeader />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Ouvrir la recherche globale" }));

    expect(screen.getByRole("textbox", { name: "Search page field" })).toHaveFocus();
    expect(
      screen.queryByRole("searchbox", { name: "Rechercher dans toute lÃ¢â‚¬â„¢application" }),
    ).not.toBeInTheDocument();
  });

  it("shows and opens machine matches on the full global search page", async () => {
    const user = userEvent.setup();
    sidebarTestState.searchParams = "q=CNC-06";
    vi.mocked(getOffersRequest).mockResolvedValueOnce({
      offers: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      facets: { clients: [], sites: [] },
    });
    vi.mocked(getPiecesRequest).mockResolvedValueOnce({
      pieces: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
    vi.mocked(getMachinesPageRequest).mockResolvedValueOnce({
      machines: [
        {
          id: "machine-1",
          name: "CNC-06",
          internalNumber: "CNC-06",
          type: "DÃƒÂ©coupe",
          status: "ACTIVE",
          description: null,
          location: "Atelier A",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      statusCounts: { ACTIVE: 1 },
    });
    vi.mocked(getProductionMonitorRequest).mockResolvedValueOnce({
      bars: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      counts: { shaped: 0, assigned: 0, inProgress: 0, fabricated: 0, openNonConformities: 0 },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <GlobalSearchView initialQuery="CNC-06" />
      </QueryClientProvider>,
    );

    const machineResult = await screen.findByRole("button", { name: /CNC-06/ });
    await user.click(machineResult);

    expect(getMachinesPageRequest).toHaveBeenCalledWith({
      search: "CNC-06",
      page: 1,
      pageSize: 10,
    });
    expect(sidebarTestState.push).toHaveBeenCalledWith("/machines/machine-1");
  });

  it("opens the unread notification preview from the bell", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AppHeader />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    const notificationBell = document.querySelector('button[aria-label*="notifications"]');
    expect(notificationBell).not.toBeNull();
    fireEvent.click(notificationBell!);
    expect(await screen.findByText("Fabrication de la barre dÃƒÂ©marrÃƒÂ©e")).toBeInTheDocument();
    expect(screen.getByText(/Samira/)).toBeInTheDocument();
  });

  it("loads the admin users directory", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <UsersView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("RÃƒÂ©pertoire des utilisateurs")).toBeInTheDocument();
    expect((await screen.findAllByText("Admin")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Nouvel utilisateur" }));
    expect(await screen.findByRole("dialog", { name: "CrÃƒÂ©er un utilisateur" })).toHaveClass(
      "data-[state=open]:slide-in-from-right",
    );
  });

  it("supports user directory filtering and profile password visibility", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <UsersView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("1 utilisateur correspond aux filtres")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Rechercher un utilisateur" }), {
      target: { value: "unknown" },
    });
    expect(await screen.findByText("Aucun rÃƒÂ©sultat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RÃƒÂ©initialiser" })).toBeInTheDocument();

    render(
      <QueryClientProvider client={queryClient}>
        <ProfileView />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Profil et sÃƒÂ©curitÃƒÂ©" })).toBeInTheDocument();
    const showCurrent = screen.getByRole("button", { name: "Afficher mot de passe actuel" });
    fireEvent.click(showCurrent);
    expect(screen.getByLabelText("Mot de passe actuel")).toHaveAttribute("type", "text");
  });

  it("loads the machines directory", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MachinesView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Parc machines")).toBeInTheDocument();
    expect((await screen.findAllByText("CNC-06")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une machine" }));
    expect(await screen.findByRole("dialog", { name: "Ajouter une machine" })).toHaveClass(
      "data-[state=open]:slide-in-from-right",
    );
  });

  it("warns before saving a machine as under maintenance from its edit sheet", async () => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    vi.mocked(getMachinesPageRequest).mockResolvedValueOnce({
      machines: [
        {
          id: "machine-1",
          name: "CNC-06",
          internalNumber: "CNC-06",
          type: "DÃ©coupe",
          status: "ACTIVE",
          description: null,
          location: "Atelier A",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          assignedBarCount: 3,
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      statusCounts: { ACTIVE: 1 },
    });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MachinesView />
      </QueryClientProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "Modifier CNC-06" }));
    const statusSelect = screen.getAllByRole("combobox").at(-1)!;
    statusSelect.focus();
    await user.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("3 barre(s)");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("3 barre(s)");
  });

  it("renders the API-backed machine detail actions and queue", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MachineDetailView />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "CNC-06" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copier le numÃƒÂ©ro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument();
    expect(screen.getByText("Barres regroupÃƒÂ©es par profil")).toBeInTheDocument();
  });

  it("lets a manager release an unstarted bar from a machine in maintenance", async () => {
    vi.mocked(getMachineRequest).mockResolvedValue({
      machine: {
        id: "machine-1", name: "CNC-06", internalNumber: "CNC-06", type: "Cutting",
        status: "MAINTENANCE", description: null, location: "Workshop",
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
        activeOperationCount: 0, queue: [],
        queuePagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
        assignedBarCount: 1,
        cuttingBars: [{
          id: "bar-1", offerId: "offer-1", offerReference: "OFF-001",
          reference: "OFF-001-B001", profile: "IPE200", rawLengthMm: 6000,
          usedLengthMm: 5800, wasteMm: 200, status: "AFFECTEE",
        }],
        cuttingBarsPagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
        barMetrics: { assigned: 1, inProgress: 0, fabricatedToday: 0, fabricatedTotal: 0 },
        activeSession: null, currentProductionRun: null,
      },
    } as never);
    vi.mocked(unassignOfferBarRequest).mockResolvedValueOnce({ bar: {} as never });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MachineDetailView />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /Afficher les 1 barres/ }));
    await user.click((await screen.findAllByRole("button", { name: /Lib/i })).at(-1)!);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("OFF-001-B001");
    await user.click(screen.getByRole("button", { name: /Confirmer la lib/ }));
    await waitFor(() => expect(unassignOfferBarRequest).toHaveBeenCalledWith("offer-1", "bar-1"));
  });

  it("selects and releases all eligible bars on the maintenance page only", async () => {
    vi.mocked(unassignOfferBarRequest).mockClear();
    vi.mocked(getMachineRequest).mockResolvedValue({
      machine: {
        id: "machine-1", name: "CNC-06", internalNumber: "CNC-06", type: "Cutting",
        status: "MAINTENANCE", description: null, location: "Workshop",
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
        activeOperationCount: 0, queue: [],
        queuePagination: { page: 1, pageSize: 10, total: 0, totalPages: 1 },
        assignedBarCount: 3,
        cuttingBars: [
          {
            id: "bar-1", offerId: "offer-1", offerReference: "OFF-001",
            reference: "OFF-001-B001", profile: "IPE200", rawLengthMm: 6000,
            usedLengthMm: 5800, wasteMm: 200, status: "AFFECTEE",
          },
          {
            id: "bar-2", offerId: "offer-2", offerReference: "OFF-002",
            reference: "OFF-002-B001", profile: "HEA140", rawLengthMm: 12000,
            usedLengthMm: 11800, wasteMm: 200, status: "AFFECTEE",
          },
          {
            id: "bar-3", offerId: "offer-2", offerReference: "OFF-002",
            reference: "OFF-002-B002", profile: "HEA140", rawLengthMm: 12000,
            usedLengthMm: 11700, wasteMm: 300, status: "LANCEE",
          },
        ],
        cuttingBarsPagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
        barMetrics: { assigned: 2, inProgress: 1, fabricatedToday: 0, fabricatedTotal: 0 },
        activeSession: null, currentProductionRun: null,
      },
    } as never);
    vi.mocked(unassignOfferBarRequest).mockResolvedValue({ bar: {} as never });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MachineDetailView />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Tout sélectionner (page)" }));
    expect(screen.getByText(/2 éligible\(s\) sur cette page · 2 sélectionnée\(s\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Libérer la sélection (2)" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("OFF-001-B001");
    await user.click(screen.getByRole("button", { name: "Confirmer la libération (2)" }));

    await waitFor(() => {
      expect(unassignOfferBarRequest).toHaveBeenCalledTimes(2);
      expect(unassignOfferBarRequest).toHaveBeenCalledWith("offer-1", "bar-1");
      expect(unassignOfferBarRequest).toHaveBeenCalledWith("offer-2", "bar-2");
    });
    expect(unassignOfferBarRequest).not.toHaveBeenCalledWith("offer-2", "bar-3");
  });

  it("shows the Offer bar-list empty state from persisted API data", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OfferBarsView offerId="offer-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Aucune barre faÃƒÂ§onnÃƒÂ©e")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ouvrir le faÃƒÂ§onnage/ })).toHaveAttribute(
      "href",
      "/offers/offer-1/faconnage",
    );
  });

  it("prints a compact purchasing report with raw weight and waste percentage", async () => {
    vi.mocked(getOfferMaterialReportRequest).mockResolvedValueOnce({
      offer: { id: "offer-1", reference: "OFF-001", revision: "A", name: "Atelier", clientName: null, site: "Sfax" },
      generatedAt: "2026-11-03T10:00:00.000Z",
      materials: [{
        profile: "IPE200",
        rawLengthMm: 6000,
        quantity: 2,
        totalWasteMm: 4600,
        kgPerMeter: 22.4,
        netWeightKg: 143.4,
        grossWeightKg: 268.8,
        wasteRate: (4600 / 12000) * 100,
      }],
      bars: [
        {
          reference: "OFF-001-B001", profile: "IPE200", rawLengthMm: 6000,
          usedLengthMm: 3200, wasteMm: 2800, status: "FACONNEE",
          cuttingPlanReference: "OFF-001-CP-001", machine: null,
          netWeightKg: 71.7, grossWeightKg: 134.4,
          items: [{ reference: "P-001", sequenceNumber: 1, lengthMm: 3200 }],
        },
        {
          reference: "OFF-001-B002", profile: "IPE200", rawLengthMm: 6000,
          usedLengthMm: 3200, wasteMm: 2800, status: "FACONNEE",
          cuttingPlanReference: "OFF-001-CP-001", machine: null,
          netWeightKg: 71.7, grossWeightKg: 134.4,
          items: [{ reference: "P-002", sequenceNumber: 1, lengthMm: 3200 }],
        },
      ],
      totals: {
        barCount: 2,
        totalRawLengthMm: 12000,
        totalWasteMm: 4600,
        profileCount: 1,
        netWeightKg: 143.4,
        grossWeightKg: 268.8,
        profilesWithoutWeight: [],
        profilesWithoutNetWeight: [],
        wasteRate: (4600 / 12000) * 100,
      },
    });
    const popup = {
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
      opener: null,
      close: vi.fn(),
    } as unknown as Window;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(popup);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OfferBarsView offerId="offer-1" />
      </QueryClientProvider>,
    );

    await userEvent.setup().click(await screen.findByRole("button", { name: "Imprimer le rapport matiÃ¨re" }));
    await waitFor(() => expect(popup.document.write).toHaveBeenCalled());
    const html = vi.mocked(popup.document.write).mock.calls.at(-1)?.[0] as string;
    expect(html).toContain("Poids brut");
    expect(html).toContain("Chute");
    expect(html).toContain("268,8 kg");
    expect(html).toContain("143,4 kg");
    expect(html).toContain("Poids net piÃ¨ces");
    expect(html).toContain("Poids brut matiÃ¨re");
    expect(html).not.toContain("RepÃ¨res de barres");
    expect(html).not.toContain("Ã€ confirmer avant commande");
    expect(html).toContain("DÃ©tail de coupe et ressources par barre");
    expect(html).toContain("SchÃ©ma de coupe");
    expect(html).toContain("OFF-001-B001â€“OFF-001-B002");
    expect(html).toContain("2 barres");
    expect(html).toContain("P-001 Â· 1, P-002 Â· 1");
    openSpy.mockRestore();
  });

  it("exposes machine status filtering and a refresh result count", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MachinesView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("1 machine correspond aux filtres")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filtrer par statut machine" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Rechercher une machine" }).parentElement?.parentElement,
    ).toHaveClass("sm:grid-cols-[minmax(0,1fr)_240px]");
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument();
  });

  it("loads the production pieces directory with Tekla business columns", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PiecesView />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "PiÃƒÂ¨ces" })).toBeInTheDocument();
    expect((await screen.findAllByText("CMD-001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("S275JR").length).toBeGreaterThan(0);
    expect(screen.getAllByText("POUTRE").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pds Tot").length).toBeGreaterThan(0);
  });

  it("shows the Offer-local next RepÃƒÂ¨re and marks quality and designation optional", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PiecesView offerId="offer-1" />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/appartiennent uniquement/)).toHaveTextContent(/affaire/);
    await user.click((await screen.findAllByRole("button", { name: /Ajouter une piÃ¨ce/i }))[0]);
    expect(await screen.findByText(/Prochain repÃ¨re proposÃ© :/)).toHaveTextContent("P-014");
    expect(screen.getByLabelText("QualitÃ© (facultative)")).toBeInTheDocument();
    expect(screen.getByLabelText("DÃ©signation (facultative)")).toBeInTheDocument();
    expect(getOfferNextPieceReferenceRequest).toHaveBeenCalledWith("offer-1");
  });

  it("calculates the piece weight from a selected catalog profile and keeps it editable", async () => {
    const user = userEvent.setup();
    vi.mocked(getMaterialProfilesRequest).mockResolvedValueOnce({
      profiles: [
        {
          id: "profile-hea100",
          profile: "HEA100",
          kgPerMeter: 16.7,
          rawLengthsMm: [6000, 12100, 15100],
          isActive: true,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PiecesView offerId="offer-1" />
      </QueryClientProvider>,
    );

    await user.click((await screen.findAllByRole("button", { name: /Ajouter une piÃƒÂ¨ce/i }))[0]);
    const profileInput = await screen.findByPlaceholderText("IPE200");
    await user.click(profileInput);
    await user.click(await screen.findByRole("option", { name: "HEA100" }));
    expect(screen.getByText(/16,7 kg\/m/)).toBeInTheDocument();
    expect(screen.getByText(/Longueurs brutes disponibles pour le faÃƒÂ§onnage/)).toBeInTheDocument();
    expect(screen.getByText(/6\s?000 mm/)).toBeInTheDocument();
    expect(screen.getByText(/12\s?100 mm/)).toBeInTheDocument();
    expect(screen.getByText(/15\s?100 mm/)).toBeInTheDocument();
    const lengthInput = screen.getByLabelText("Longueur *");
    await user.clear(lengthInput);
    await user.type(lengthInput, "3200");
    const weightInput = screen.getByLabelText("Poids linÃƒÂ©ique (kg/m)");
    expect(weightInput).toHaveValue(16.7);
    expect(screen.getByLabelText("Poids total")).toHaveValue("53,44");
    expect(screen.getByText("Catalogue Ã‚Â· modifiable")).toBeInTheDocument();

    await user.clear(weightInput);
    await user.type(weightInput, "70");
    expect(screen.getByText("Saisi manuellement")).toBeInTheDocument();
    await user.clear(lengthInput);
    await user.type(lengthInput, "4000");
    expect(weightInput).toHaveValue(70);
    expect(screen.getByLabelText("Poids total")).toHaveValue("280");
    expect(screen.getByText("Saisi manuellement")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ajouter la piÃƒÂ¨ce/i }));
    await waitFor(() =>
      expect(createOfferPieceRequest).toHaveBeenCalledWith(
        "offer-1",
        expect.objectContaining({
          lengthMm: 4000,
          unitWeightKg: 280,
        }),
      ),
    );
  });

  it("adds several lengths of one profile as separate offer pieces in one batch", async () => {
    const user = userEvent.setup();
    vi.mocked(getMaterialProfilesRequest).mockResolvedValueOnce({
      profiles: [
        {
          id: "profile-hea100",
          profile: "HEA100",
          kgPerMeter: 16.7,
          rawLengthsMm: [6000, 12100],
          isActive: true,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PiecesView offerId="offer-1" />
      </QueryClientProvider>,
    );

    await user.click((await screen.findAllByRole("button", { name: /Ajouter une piÃƒÂ¨ce/i }))[0]);
    const profileInput = await screen.findByPlaceholderText("IPE200");
    await user.click(profileInput);
    await user.click(await screen.findByRole("option", { name: "HEA100" }));
    await user.type(screen.getByLabelText("Longueur *"), "3200");
    await user.clear(screen.getByLabelText("QuantitÃƒÂ© *"));
    await user.type(screen.getByLabelText("QuantitÃƒÂ© *"), "2");
    await user.click(screen.getByRole("button", { name: "Ajouter une longueur" }));
    await user.type(screen.getByLabelText("Longueur Ã‚Â· piÃƒÂ¨ce 2"), "5000");
    await user.clear(screen.getByLabelText("QuantitÃƒÂ©"));
    await user.type(screen.getByLabelText("QuantitÃƒÂ©"), "3");

    expect(screen.getByLabelText("Poids total")).toHaveValue("357,38");
    await user.click(screen.getByRole("button", { name: /Ajouter la piÃƒÂ¨ce/i }));
    await waitFor(() =>
      expect(createOfferPiecesBatchRequest).toHaveBeenCalledWith("offer-1", {
        pieces: [
          expect.objectContaining({
            profile: "HEA100",
            lengthMm: 3200,
            quantity: 2,
            unitWeightKg: 53.44,
          }),
          expect.objectContaining({
            profile: "HEA100",
            lengthMm: 5000,
            quantity: 3,
            unitWeightKg: 83.5,
          }),
        ],
      }),
    );
  });

  it("allows managers to add pieces to a READY offer without the blanket lock notice", async () => {
    const user = userEvent.setup();
    vi.mocked(getOfferRequest).mockResolvedValueOnce({
      offer: { id: "offer-1", status: "READY" },
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PiecesView offerId="offer-1" />
      </QueryClientProvider>,
    );

    const addButton = (await screen.findAllByRole("button", { name: /Ajouter une piÃƒÂ¨ce/i }))[0];
    expect(addButton).toBeEnabled();
    expect(
      screen.queryByText(/le plan validÃƒÂ© protÃƒÂ¨ge les donnÃƒÂ©es des piÃƒÂ¨ces/i),
    ).not.toBeInTheDocument();
    await user.click(addButton);
    expect(await screen.findByRole("heading", { name: "Ajouter une piÃƒÂ¨ce" })).toBeInTheDocument();
  });

  it("allows editing untouched pieces in production but protects pieces already started", async () => {
    const user = userEvent.setup();
    vi.mocked(getOfferRequest).mockResolvedValueOnce({
      offer: { id: "offer-1", status: "IN_PRODUCTION" },
    } as never);
    const basePiece = {
      id: "piece-1",
      offerId: "offer-1",
      productionStatusCounts: { PENDING: 2, FACONNEE: 0, AFFECTEE: 0, LANCEE: 0, FABRIQUEE: 0 },
      reference: "CMD-001",
      quantity: 2,
      completedUnits: 0,
      profile: "IPE200",
      quality: "S275JR",
      lengthMm: 6000,
      unitWeightKg: 2.4,
      totalWeightKg: 4.8,
      designation: "POUTRE",
      priority: "NORMAL",
      dueDate: null,
      status: "PLANNED",
      createdById: "1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      imageCount: 0,
      coverImageUrl: null,
    };
    vi.mocked(getOfferPiecesRequest).mockResolvedValueOnce({
      pieces: [
        { ...basePiece, isUnstarted: true },
        {
          ...basePiece,
          id: "piece-2",
          reference: "CMD-002",
          status: "IN_PROGRESS",
          productionStatusCounts: { PENDING: 1, FACONNEE: 1, AFFECTEE: 0, LANCEE: 0, FABRIQUEE: 0 },
          isUnstarted: false,
        },
      ],
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PiecesView offerId="offer-1" />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        /vous pouvez modifier une piÃƒÂ¨ce tant que toutes ses unitÃƒÂ©s sont encore en attente/i,
      ),
    ).toBeInTheDocument();
    await user.click((await screen.findAllByRole("button", { name: "Actions CMD-001" }))[0]);
    expect(await screen.findByRole("menuitem", { name: "Modifier" })).toBeEnabled();

    await user.keyboard("{Escape}");
    await user.click((await screen.findAllByRole("button", { name: "Actions CMD-002" }))[0]);
    expect(
      await screen.findByRole("menuitem", { name: /Certaines unitÃƒÂ©s sont engagÃƒÂ©es/ }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("exposes piece search, profile filtering and pagination", async () => {
    const user = userEvent.setup();
    vi.mocked(getPieceFacetsRequest).mockClear();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PiecesView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/1Ã¢â‚¬â€œ1 sur 1 piÃƒÂ¨ce/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrer par profil" })).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Rechercher par repÃƒÂ¨re, profil ou dÃƒÂ©signation" }),
    ).toBeInTheDocument();
    expect(getPieceFacetsRequest).not.toHaveBeenCalled();
    const scrollIntoView = Element.prototype.scrollIntoView;
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    screen.getByRole("combobox", { name: "Filtrer par profil" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(getPieceFacetsRequest).toHaveBeenCalledOnce());
    expect(await screen.findByRole("option", { name: "Profil 40" })).toBeInTheDocument();
    if (scrollIntoView) {
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        configurable: true,
        value: scrollIntoView,
      });
    } else {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("supports selecting a CSV and keeps the import preview server-backed", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PieceImportView />
      </QueryClientProvider>,
    );
    const file = new File(
      ["reference,quantity,profile,lengthMm\nCMD-002,2,Profil 40,6000"],
      "pieces.csv",
      { type: "text/csv" },
    );
    fireEvent.change(screen.getByLabelText("Fichier Tekla des piÃƒÂ¨ces"), {
      target: { files: [file] },
    });
    expect(await screen.findByText("pieces.csv")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyser et continuer" })).toBeInTheDocument();
  });

  it("requires acknowledgement of the red Jarret warning before importing", async () => {
    vi.mocked(previewPieceImportRequest).mockResolvedValueOnce({
      preview: {
        filename: "pieces.csv",
        sourceFormat: "CSV",
        columns: [],
        rowsTotal: 1,
        validRows: 1,
        invalidRows: 0,
        warningRows: 0,
        rows: [{ row: 2, values: { designation: "Jarret" }, valid: true, errors: [], warnings: [] }],
      },
    } as never);
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PieceImportView />
      </QueryClientProvider>,
    );
    const file = new File(["designation\nJarret"], "pieces.csv", { type: "text/csv" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await user.click(await screen.findByRole("button", { name: "Analyser et continuer" }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/jarret/i);
    await user.click(screen.getByRole("button", { name: /Jâ€™ai vÃ©rifiÃ©/ }));
    expect(screen.getByRole("button", { name: /Importer 1/ })).toBeEnabled();
  });

  it("opens FaÃ§onnage profile groups and stacks raw-length cards", async () => {
    vi.mocked(prepareOfferFaconnageRequest).mockResolvedValueOnce({
      preparation: {
        preparationId: "prep-1",
        selectedProfiles: ["IPE200", "HEA300"],
        requirements: [
          { profile: "IPE200", lengthMm: 6000, quantity: 5 },
          { profile: "HEA300", lengthMm: 12000, quantity: 4 },
        ],
        summary: { selectedProfileCount: 2, pieceRows: 2, totalQuantity: 9, lengthCount: 2 },
      },
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <FaconnagePreparationView offerId="offer-1" />
      </QueryClientProvider>,
    );

    await screen.findByRole("heading", { name: /Profils.*traiter/ });
    await screen.findByLabelText(/tous les profils IPE/);
    expect(screen.getByRole("textbox", { name: "Rechercher un profil" }).closest(".nim-offer-sticky-table-tools")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Tout sélectionner" }).closest(".nim-offer-sticky-table-tools")).toBeNull();
    const familyGroup = (name: string) =>
      Array.from(container.querySelectorAll("details")).find((group) =>
        group.querySelector("summary")?.textContent?.includes(name),
      );
    expect(familyGroup("IPE")).toHaveAttribute("open");
    expect(familyGroup("HEA")).toHaveAttribute("open");
    expect(familyGroup("Autres profils")).not.toHaveAttribute("open");

    const otherFamilySummary = familyGroup("Autres profils")?.querySelector("summary");
    expect(otherFamilySummary).not.toBeNull();
    fireEvent.click(otherFamilySummary as HTMLElement);
    expect(familyGroup("Autres profils")).toHaveAttribute("open");

    fireEvent.click(screen.getByRole("button", { name: /Continuer vers Fa.*onnage/ }));
    await screen.findByTestId("faconnage-preparation-result");
    expect(screen.getByRole("button", { name: "Masquer les longueurs IPE200" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Configurer les longueurs HEA300" })).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Configurer les longueurs HEA300" }));
    expect(screen.getByRole("button", { name: "Configurer les longueurs IPE200" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Masquer les longueurs HEA300" })).toHaveAttribute("aria-expanded", "true");

    const profileCards = screen.getByTestId("faconnage-raw-length-profile-list");
    expect(profileCards).toHaveClass("grid", "gap-4");
    expect(profileCards.className).not.toMatch(/grid-cols-/);
  });
  it("offers audited removal of a plan remainder and keeps the continue bar sticky", async () => {
    vi.mocked(getOfferCuttingPlansRequest).mockResolvedValueOnce({
      plans: [
        {
          id: "plan-draft",
          reference: "OFF-001-CP-001",
          status: "PARTIALLY_VALIDATED",
          validatedBarCount: 1,
          remainingBarCount: 2,
          totalBars: 3,
          totalWasteMm: 600,
          utilizationRate: 96,
          createdAt: "2026-10-16T10:00:00.000Z",
        },
      ],
    });
    vi.mocked(cancelCuttingPlanRequest).mockResolvedValueOnce({
      plan: { id: "plan-draft", status: "CANCELLED", cancelledAt: "2026-10-16T10:00:00.000Z" },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <FaconnagePreparationView offerId="offer-1" />
      </QueryClientProvider>,
    );

    const continueButton = await screen.findByRole("button", { name: "Continuer vers FaÃƒÂ§onnage" });
    expect(continueButton.parentElement?.parentElement).toHaveClass("sticky");
    await userEvent.click(await screen.findByRole("button", { name: "Supprimer le reliquat" }));
    expect(
      await screen.findByRole("heading", { name: "Supprimer le reliquat du plan ?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Les barres d.* valid?es ne changent pas/)).toBeInTheDocument();
    expect(screen.getByText(/L'action reste inscrite dans l'historique/)).toBeInTheDocument();
  });

  it("keeps validated-plan revision unavailable after production starts", async () => {
    vi.mocked(getOfferRequest).mockResolvedValueOnce({
      offer: { id: "offer-1", status: "IN_PRODUCTION" },
    } as never);
    vi.mocked(getOfferCuttingPlansRequest).mockResolvedValueOnce({
      plans: [
        {
          id: "plan-validated",
          reference: "OFF-001-CP-001",
          status: "VALIDATED",
          totalBars: 3,
          totalWasteMm: 600,
          utilizationRate: 96,
          createdAt: "2026-10-16T10:00:00.000Z",
        },
      ],
    } as never);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <FaconnagePreparationView offerId="offer-1" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/faÃƒÂ§onnage est verrouillÃƒÂ©/)).toBeInTheDocument();
    expect(screen.getByText("OFF-001-CP-001")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revenir Ãƒ  la validation" }),
    ).not.toBeInTheDocument();
  });

  it("renders traceability actions on piece detail", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PieceDetailView />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "CMD-001" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copier la rÃƒÂ©fÃƒÂ©rence" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument();
  });

  it("keeps remaining bars visible when assigning the last bar on a page", async () => {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: () => false,
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: () => undefined,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => undefined,
    });
    const user = userEvent.setup();
    let hasAssigned = false;
    const makeBar = (number: number, status = "FACONNEE") => ({
      id: `bar-${number}`,
      offerId: "offer-1",
      offerReference: "OFF-001",
      cuttingPlanId: "plan-1",
      reference: `OFF-${String(number).padStart(3, "0")}`,
      profile: "IPE200",
      rawLengthMm: 12000,
      usedLengthMm: 6000,
      wasteMm: 6000,
      status,
      machine:
        status === "AFFECTEE"
          ? { id: "machine-1", name: "CNC-06", internalNumber: "CNC-06" }
          : null,
      items: [
        {
          id: `membership-${number}`,
          pieceUnitId: `unit-${number}`,
          pieceId: `piece-${number}`,
          reference: `P-${number}`,
          sequenceNumber: 1,
          lengthMm: 6000,
          weightKg: null,
          status: "PENDING",
          active: true,
        },
      ],
      createdAt: "2026-10-01T08:00:00.000Z",
    });
    vi.mocked(getOfferBarAssignmentsRequest).mockImplementation(
      async (_offerId, { availablePage, assignmentPage, pageSize }) => {
        const assignedBar = makeBar(21, "AFFECTEE");
        const availableBars = hasAssigned
          ? availablePage === 1
            ? Array.from({ length: 20 }, (_, index) => makeBar(index + 1))
            : []
          : availablePage === 2
            ? [makeBar(21)]
            : Array.from({ length: 20 }, (_, index) => makeBar(index + 1));
        return {
          availableBars,
          assignments: hasAssigned
            ? [
                {
                  id: "assignment-21",
                  cuttingBarId: assignedBar.id,
                  machineId: "machine-1",
                  machineName: "CNC-06",
                  assignedById: "1",
                  assignedAt: "2026-10-01T08:00:00.000Z",
                  unassignedAt: null,
                  active: true,
                  bar: assignedBar,
                },
              ]
            : [],
          availableCount: hasAssigned ? 20 : 21,
          assignmentCount: hasAssigned ? 1 : 0,
          machines: [{ machineId: "machine-1", assignmentCount: hasAssigned ? 1 : 0 }],
          pagination: {
            available: {
              page: availablePage,
              pageSize,
              total: hasAssigned ? 20 : 21,
              totalPages: hasAssigned ? 1 : 2,
            },
            assignments: {
              page: assignmentPage,
              pageSize,
              total: hasAssigned ? 1 : 0,
              totalPages: 1,
            },
          },
        } as never;
      },
    );
    vi.mocked(assignOfferBarsRequest).mockImplementation(async () => {
      hasAssigned = true;
      return { assignedCount: 1 };
    });
    window.history.replaceState({}, "", "/offers/offer-1/bar-assignments?availablePage=2");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OfferBarAssignmentsView offerId="offer-1" />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(vi.mocked(getOfferBarAssignmentsRequest).mock.calls.length).toBeGreaterThan(0),
    );
    expect(
      vi.mocked(getOfferBarAssignmentsRequest).mock.calls.map((call) => call[1].availablePage),
    ).toContain(2);
    expect(await screen.findByText("OFF-021")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /OFF-021/ }));
    await user.click(screen.getByRole("combobox", { name: /machine/i }));
    await user.click(await screen.findByRole("option", { name: /CNC-06/ }));
    await user.click(screen.getByRole("button", { name: /Affecter 1 barre/ }));
    await user.click(await screen.findByRole("button", { name: /Confirmer l.affectation/ }));

    expect(await screen.findByText("OFF-001")).toBeInTheDocument();
    expect(await screen.findByText(/OFF-021/)).toBeInTheDocument();
    expect(vi.mocked(getOfferBarAssignmentsRequest).mock.calls.at(-1)?.[1].availablePage).toBe(1);
    vi.mocked(getOfferBarAssignmentsRequest)
      .mockReset()
      .mockResolvedValue({ availableBars: [], assignments: [] } as never);
    vi.mocked(assignOfferBarsRequest).mockReset();
    window.history.replaceState({}, "", "/");
  });

  it("loads the assignment board", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Tableau des affectations")).toBeInTheDocument();
    expect((await screen.findAllByText("CMD-001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("CNC-06").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Nouvelle affectation" }));
    expect(await screen.findByRole("dialog", { name: "Affecter une unitÃƒÂ©" })).toHaveClass(
      "data-[state=open]:slide-in-from-right",
    );
  });

  it("exposes machine-scoped assignment filtering and traceability links", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AssignmentsView />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText("1 affectation(s) correspondent aux filtres"),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrer par machine" })).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "CMD-001" })
        .every((link) => link.getAttribute("href") === "/offers"),
    ).toBe(true);
  });

  it("loads the operator production queue from the API", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("File de production")).toBeInTheDocument();
    expect(screen.getByText("Aucune production en cours")).toBeInTheDocument();
  });

  it("protects active production completion and preserves piece traceability", async () => {
    vi.mocked(getProductionCurrentRequest).mockResolvedValueOnce({
      current: {
        id: "operation-1",
        pieceId: "piece-1",
        pieceUnitId: "unit-1",
        reference: "CMD-001",
        sequenceNumber: 1,
        profile: "Profil 40",
        lengthMm: 6000,
        machineId: "machine-1",
        machineName: "CNC-06",
        operatorId: "1",
        operatorName: "Admin",
        status: "IN_PROGRESS",
        unitStatus: "IN_PROGRESS",
        pieceStatus: "IN_PROGRESS",
        startedAt: "2026-01-01T10:00:00.000Z",
        completedAt: null,
      },
      queue: [],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OperatorView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/Op.ration en cours/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CMD-001" })).toHaveAttribute("href", "/offers");
    fireEvent.click(screen.getByRole("button", { name: /Envoyer CMD-001 au contr.le qualit./ }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmer l'envoi/ })).toBeInTheDocument();
  });

  it("loads the quality queue from the API", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <QualityView />
      </QueryClientProvider>,
    );
    expect((await screen.findAllByText("UnitÃƒÂ©s en attente")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/CMD-001/)).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /ContrÃƒÂ´ler/ }).length).toBeGreaterThan(0);
  });

  it("surfaces an open workshop report directly in the matching offer quality page", async () => {
    vi.mocked(getProductionNonConformitiesRequest).mockResolvedValueOnce({
      nonConformities: [
        {
          id: "nc-1",
          offerId: "offer-specific",
          pieceId: "piece-1",
          pieceUnitId: "unit-1",
          cuttingBarId: "bar-1",
          productionRunId: "run-1",
          machineId: "machine-1",
          pieceReference: "CMD-209",
          sequenceNumber: 1,
          barReference: "OFF-B001",
          offerReference: "OFF-2026-0042",
          machineName: "Scie 01",
          reportedBy: { id: "operator-1", displayName: "Sami" },
          reason: "DIMENSION",
          comment: "PerÃƒÂ§age dÃƒÂ©calÃƒÂ© cÃƒÂ´tÃƒÂ© gauche.",
          status: "OPEN",
          reportedAt: "2026-01-01T12:00:00.000Z",
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <QualityView offerId="offer-specific" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/1 signalement ouvert pour cette Affaire/)).toBeInTheDocument();
    expect(getProductionNonConformitiesRequest).toHaveBeenCalledWith(
      expect.objectContaining({ offerId: "offer-specific" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Voir les signalements/ }));
    expect(await screen.findByText("PerÃƒÂ§age dÃƒÂ©calÃƒÂ© cÃƒÂ´tÃƒÂ© gauche.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /CMD-209/ })).toHaveAttribute(
      "href",
      "/offers/offer-specific/pieces/piece-1",
    );
  });

  it("supports quality result filtering, piece traceability, and non-conform feedback", async () => {
    sidebarTestState.role = "ADMIN";
    const user = userEvent.setup();
    vi.mocked(getQualityHistoryRequest).mockResolvedValue({
      controls: [
        {
          id: "control-1",
          pieceUnitId: "unit-quality-1",
          pieceId: "piece-1",
          reference: "CMD-001",
          sequenceNumber: 1,
          result: "CONFORM",
          comment: null,
          controllerId: "1",
          controllerName: "Admin",
          controlledAt: "2026-01-01T12:00:00.000Z",
          defectCategory: null,
          cycle: 1,
          images: [],
          disposition: null,
        },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <QualityView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("1 unitÃƒÂ© correspond Ãƒ  la recherche")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Historique" }));
    expect(
      screen.getByRole("combobox", { name: /Filtrer les d.cisions qualit./ }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: /CMD-001/ })
        .some((link) => link.getAttribute("href") === "/offers"),
    ).toBe(true);
    await user.click(screen.getByRole("tab", { name: /traiter/ }));
    await user.click(screen.getAllByRole("button", { name: /Contr.ler/ })[0]);
    const qualitySheetTitle = (await screen.findAllByText("ContrÃƒÂ´ler cette unitÃƒÂ©")).find(
      (element) => element.tagName === "H2",
    );
    if (!qualitySheetTitle) throw new Error("Expected the quality Sheet title to render");
    expect(qualitySheetTitle.closest('[role="dialog"]')).toHaveClass(
      "data-[state=open]:slide-in-from-right",
    );
    await user.click(await screen.findByRole("button", { name: /^Non conforme/ }));
    await user.click(await screen.findByRole("button", { name: /Confirmer non conforme/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/commentaire.*obligatoire/i);
  });

  it("renders defect evidence and the administrator deviation decision workflow", async () => {
    vi.mocked(getQualityHistoryRequest).mockResolvedValue({
      controls: [
        {
          id: "control-rejected-1",
          pieceUnitId: "unit-quality-1",
          pieceId: "piece-1",
          reference: "CMD-001",
          sequenceNumber: 1,
          result: "NON_CONFORM",
          comment: "Rayure profonde sur la face visible.",
          controllerId: "quality-1",
          controllerName: "ContrÃƒÂ´leur qualitÃƒÂ©",
          controlledAt: "2026-01-01T12:00:00.000Z",
          defectCategory: "SURFACE",
          cycle: 1,
          images: [
            {
              id: "image-1",
              originalName: "rayure.png",
              mimeType: "image/png",
              sizeBytes: 1200,
              url: "/quality/controls/control-rejected-1/images/image-1",
              createdAt: "2026-01-01T12:05:00.000Z",
            },
          ],
          disposition: {
            id: "disposition-1",
            pieceUnitId: "unit-quality-1",
            qualityControlId: "control-rejected-1",
            type: "DEVIATION",
            status: "PENDING",
            reason: "TolÃƒÂ©rance client documentÃƒÂ©e.",
            approvalComment: null,
            requestedById: "manager-1",
            requestedByName: "Manager",
            approvedById: null,
            approvedByName: null,
            requestedAt: "2026-01-01T12:10:00.000Z",
            decidedAt: null,
            completedAt: null,
          },
        },
      ],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <QualityView />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("tab", { name: "Historique" }));
    expect(await screen.findByText("Photos du dÃƒÂ©faut")).toBeInTheDocument();
    expect(screen.getByAltText("rayure.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approuver" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
  });

  it("loads persisted traceability history from the API", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <HistoryView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Journal des ÃƒÂ©vÃƒÂ©nements")).toBeInTheDocument();
    expect((await screen.findAllByText("ContrÃƒÂ´le conforme")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Admin")).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("navigation", { name: "Navigation dans les pages" }),
    ).toBeInTheDocument();
  });

  it("shows human-readable history context instead of internal entity IDs", async () => {
    vi.mocked(getHistoryRequest).mockResolvedValueOnce({
      events: [
        {
          id: "event-faconnage-1",
          eventType: "FACONNAGE_PREPARATION_CREATED",
          entityType: "FACONNAGE_PREPARATION",
          entityId: "internal-preparation-uuid",
          actorUserId: "1",
          actorName: "Admin",
          actorRole: "ADMIN",
          metadata: { summary: { selectedProfileCount: 3, pieceRows: 8, totalQuantity: 17 } },
          createdAt: "2026-01-01T10:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <HistoryView />
      </QueryClientProvider>,
    );
    expect(
      (await screen.findAllByText("PrÃƒÂ©paration du faÃƒÂ§onnage crÃƒÂ©ÃƒÂ©e")).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("PrÃƒÂ©paration de faÃƒÂ§onnage").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 profils Ã‚Â· 8 repÃƒÂ¨res Ã‚Â· 17 unitÃƒÂ©s").length).toBeGreaterThan(0);
    expect(screen.queryByText("internal-preparation-uuid")).not.toBeInTheDocument();
  });

  it("links history events back to persisted piece and machine context", async () => {
    vi.mocked(getHistoryRequest).mockResolvedValueOnce({
      events: [
        {
          id: "event-piece-1",
          eventType: "PRODUCTION_STARTED",
          entityType: "PIECE",
          entityId: "piece-1",
          actorUserId: "1",
          actorName: "Admin",
          actorRole: "ADMIN",
          metadata: { offerId: "offer-1", machineId: "machine-1", newPieceStatus: "IN_PROGRESS" },
          createdAt: "2026-01-01T10:00:00.000Z",
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <HistoryView />
      </QueryClientProvider>,
    );
    expect(
      (await screen.findAllByRole("link", { name: "Voir la piÃƒÂ¨ce" })).every(
        (link) => link.getAttribute("href") === "/offers/offer-1/pieces/piece-1",
      ),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("link", { name: "Machine" })
        .every((link) => link.getAttribute("href") === "/machines/machine-1"),
    ).toBe(true);
    expect(screen.getByText(/1Ã¢â‚¬â€œ1 sur 1 ÃƒÂ©vÃƒÂ©nement/)).toBeInTheDocument();
  });

  it("shows the material catalogue as a prominent admin settings entry", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "RÃ©fÃ©rentiel matiÃ¨re" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Catalogue des profils matiÃ¨re" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ouvrir le catalogue/ })).toHaveAttribute(
      "href",
      "/settings/profiles",
    );
  });

  it("loads persisted settings and the dedicated notification inbox", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsView />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText("PrÃƒÂ©fÃƒÂ©rences dÃ¢â‚¬â„¢affichage et dÃ¢â‚¬â„¢activitÃƒÂ©"),
    ).toBeInTheDocument();
    render(
      <QueryClientProvider client={queryClient}>
        <NotificationsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("BoÃƒÂ®te de rÃƒÂ©ception")).toBeInTheDocument();
    expect(await screen.findByText("Fabrication de la barre dÃƒÂ©marrÃƒÂ©e")).toBeInTheDocument();
  });

  it("acknowledges an inbox item and supports marking all notifications read", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <NotificationsView />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /marquer comme lue/i }));
    await waitFor(() =>
      expect(vi.mocked(markNotificationReadRequest).mock.calls[0]?.[0]).toBe("notification-1"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Tout marquer comme lu" }));
    await waitFor(() => expect(markAllNotificationsReadRequest).toHaveBeenCalledOnce());
  });

  it("requires a settings change before saving and filters notifications", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("button", { name: "Enregistrer" })).toBeDisabled();
    await userEvent.click(
      screen.getByRole("switch", { name: "Afficher le badge de notifications" }),
    );
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Compacte" }));
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeEnabled();

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationsView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("1 notification dans cette vue")).toBeInTheDocument();
    vi.mocked(getNotificationsRequest).mockResolvedValueOnce({
      notifications: [],
      unreadCount: 1,
      eventTypes: ["BAR_PRODUCTION_STARTED"],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Rechercher les notifications" }), {
      target: { value: "not-found" },
    });
    expect(await screen.findByText("Aucun rÃƒÂ©sultat")).toBeInTheDocument();
  });

  it("lists and adds a validated material profile with raw length options", async () => {
    vi.mocked(createMaterialProfileRequest).mockResolvedValueOnce({
      profile: {
        id: "profile-upn140",
        profile: "UPN140",
        kgPerMeter: 16,
        rawLengthsMm: [12100, 15100],
        isActive: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MaterialProfilesView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Catalogue des profils")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("DÃ©signation"), "UPN140");
    await userEvent.type(screen.getByLabelText("Poids linÃ©ique (kg/m)"), "16");
    await userEvent.type(screen.getByLabelText("Longueur brute 1"), "12100");
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une longueur" }));
    await userEvent.type(screen.getByLabelText("Longueur brute 2"), "15100");
    await userEvent.click(screen.getByRole("button", { name: "CrÃ©er le profil" }));
    await waitFor(() =>
      expect(createMaterialProfileRequest).toHaveBeenCalledWith({
        profile: "UPN140",
        aliases: [],
        kgPerMeter: 16,
        rawLengthsMm: [12100, 15100],
      }),
    );
  });

  it("allows admins to rename a material profile from its edit form", async () => {
    vi.mocked(updateMaterialProfileRequest).mockResolvedValueOnce({
      profile: {
        id: "profile-ipe200",
        profile: "IPE200-RENOVE",
        aliases: [],
        kgPerMeter: 22.4,
        rawLengthsMm: [6000, 12100, 15100],
        isActive: true,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MaterialProfilesView />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Catalogue des profils")).toBeInTheDocument();
    await screen.findAllByRole("button", { name: "Modifier" });
    await user.click(screen.getAllByRole("button", { name: "Modifier" })[0]!);
    const designation = document.getElementById("catalog-profile")!;
    expect(designation).toBeEnabled();
    expect(screen.queryByLabelText("RÃ©fÃ©rence du profil")).not.toBeInTheDocument();
    await user.clear(designation);
    await user.type(designation, "IPE200-RENOVE");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(updateMaterialProfileRequest).toHaveBeenCalledWith("profile-ipe200", {
        profile: "IPE200-RENOVE",
        aliases: [],
        kgPerMeter: 22.4,
        rawLengthsMm: [6000, 12100, 15100],
        isActive: true,
      }),
    );
  });

  it("keeps login submit usable and toggles password visibility both ways", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <LoginForm />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Connexion" })).toBeInTheDocument();
    expect(screen.getByText("Espace sécurisé").parentElement).toHaveClass("nim-login-enter");
    expect(screen.getByAltText("Illustration industrielle NIM").parentElement).toHaveClass(
      "pointer-events-none",
    );
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Se connecter" }).closest("form")).toHaveAttribute(
      "method",
      "post",
    );
    const passwordToggle = screen.getByRole("button", { name: "Afficher le mot de passe" });
    expect(passwordToggle).toBeInTheDocument();
    expect(passwordToggle).toHaveClass("top-1/2", "-translate-y-1/2");
    expect(passwordToggle).not.toHaveClass("active:translate-y-px");
    await user.click(passwordToggle);
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "password");

    await user.type(screen.getByLabelText("Identifiant"), "admin");
    await user.type(screen.getByLabelText("Mot de passe"), "valid-password");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    await waitFor(() =>
      expect(loginRequest).toHaveBeenCalledWith({
        username: "admin",
        password: "valid-password",
      }),
    );
    expect(await screen.findByRole("button", { name: "Se connecter" })).toBeEnabled();
  });

  it("lists client records and captures the supported contact fields when adding one", async () => {
    const user = userEvent.setup();
    vi.mocked(getClientsRequest).mockResolvedValueOnce({
      clients: [
        {
          id: "client-1",
          name: "Atelier du Nord",
          taxId: "1234567A/A/M/000",
          phoneNumbers: ["+216 70 000 000"],
          emails: ["contact@example.tn"],
          imageUrl: null,
          archivedAt: null,
          createdAt: "2026-11-01T09:00:00.000Z",
          updatedAt: "2026-11-01T09:00:00.000Z",
          offerCount: 2,
        },
      ],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    vi.mocked(createClientRequest).mockResolvedValueOnce({
      id: "client-2",
      name: "Nouvelle SociÃƒÂ©tÃƒÂ©",
      taxId: null,
      phoneNumbers: [],
      emails: [],
      imageUrl: null,
      archivedAt: null,
      createdAt: "2026-11-01T09:00:00.000Z",
      updatedAt: "2026-11-01T09:00:00.000Z",
      offerCount: 0,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ClientsView />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("link", { name: /Atelier du Nord/ })).toHaveAttribute(
      "href",
      "/clients/client-1",
    );
    expect(screen.getByText("1234567A/A/M/000")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Matricule fiscal/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Affaires/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Contact/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Ãƒâ€°tat/ })).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filtrer les clients par statut" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exporter PDF" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exporter Excel" })).toBeInTheDocument();
    const clientSort = screen.getByRole("button", { name: "Trier par Client" });
    await user.click(clientSort);
    expect(clientSort.closest("th")).toHaveAttribute("aria-sort", "ascending");
    await user.click(screen.getByRole("button", { name: "Nouveau client" }));
    await user.type(screen.getByLabelText(/Nom \/ raison sociale/), "Nouvelle SociÃƒÂ©tÃƒÂ©");
    await user.type(screen.getByRole("textbox", { name: /Matricule fiscal/ }), "1234567B/B/M/000");
    await user.type(screen.getByRole("textbox", { name: /phone 1/i }), "+216 71 000 000");
    await user.type(screen.getByRole("textbox", { name: /E-mail 1/i }), "contact@nouveau.tn");
    await user.click(screen.getByRole("button", { name: "CrÃƒÂ©er la fiche" }));

    await waitFor(() =>
      expect(createClientRequest).toHaveBeenCalledWith({
        name: "Nouvelle SociÃƒÂ©tÃƒÂ©",
        taxId: "1234567B/B/M/000",
        phoneNumbers: ["+216 71 000 000"],
        emails: ["contact@nouveau.tn"],
      }),
    );
  });

  it("opens the complete client form from an Affaire and selects the created client", async () => {
    const user = userEvent.setup();
    const client = {
      id: "client-new",
      name: "Atelier Test",
      taxId: "1234567C/C/M/000",
      phoneNumbers: ["+216 72 000 000"],
      emails: ["contact@atelier.tn"],
      imageUrl: null,
      archivedAt: null,
      createdAt: "2026-11-01T09:00:00.000Z",
      updatedAt: "2026-11-01T09:00:00.000Z",
      offerCount: 0,
    };
    vi.mocked(getClientsRequest).mockResolvedValue({
      clients: [client],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    vi.mocked(getOffersRequest).mockResolvedValueOnce({
      offers: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      facets: { clients: [], sites: [] },
    });
    vi.mocked(createClientRequest).mockResolvedValueOnce(client);
    const onSubmit = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OfferFormSheet open onOpenChange={vi.fn()} busy={false} onSubmit={onSubmit} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Nouveau client" }));
    expect(await screen.findByRole("textbox", { name: /Matricule fiscal/ })).toBeRequired();
    expect(screen.getByRole("textbox", { name: /phone 1/i })).toBeRequired();
    expect(screen.getByRole("textbox", { name: /E-mail 1/ })).toBeRequired();
    await user.click(screen.getByRole("button", { name: "CrÃƒÂ©er la fiche" }));
    expect(await screen.findAllByRole("alert")).toHaveLength(4);

    await user.type(screen.getByLabelText(/Nom \/ raison sociale/), client.name);
    await user.type(screen.getByRole("textbox", { name: /Matricule fiscal/ }), client.taxId);
    await user.type(screen.getByRole("textbox", { name: /phone 1/i }), client.phoneNumbers[0]!);
    await user.type(screen.getByRole("textbox", { name: /E-mail 1/ }), client.emails[0]!);
    await user.click(screen.getByRole("button", { name: "CrÃƒÂ©er la fiche" }));

    await waitFor(() =>
      expect(createClientRequest).toHaveBeenCalledWith({
        name: client.name,
        taxId: client.taxId,
        phoneNumbers: client.phoneNumbers,
        emails: client.emails,
      }),
    );
    await user.type(screen.getByRole("textbox", { name: /RÃƒÂ©fÃƒÂ©rence/ }), "TEST-CLIENT-01");
    await user.type(screen.getByRole("textbox", { name: /Nom de lÃ¢â‚¬â„¢affaire/ }), "Affaire test");
    await user.click(screen.getByRole("button", { name: "CrÃƒÂ©er lÃ¢â‚¬â„¢affaire" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: client.id, reference: "TEST-CLIENT-01" }),
      ),
    );
  });

  it("shows saved client recommendations while creating an Affaire", async () => {
    const client = {
      id: "client-saved",
      name: "Atelier Sfax",
      taxId: "1234567D/D/M/000",
      phoneNumbers: [],
      emails: [],
      imageUrl: null,
      archivedAt: null,
      createdAt: "2026-11-01T09:00:00.000Z",
      updatedAt: "2026-11-01T09:00:00.000Z",
      offerCount: 0,
    };
    vi.mocked(getClientsRequest).mockResolvedValue({
      clients: [client],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    vi.mocked(getOffersRequest).mockResolvedValueOnce({
      offers: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      facets: { clients: [], sites: [] },
    });
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OfferFormSheet open onOpenChange={vi.fn()} busy={false} onSubmit={vi.fn()} />
      </QueryClientProvider>,
    );
    const input = await screen.findByRole("combobox", { name: "Client de lâ€™affaire" });
    await user.type(input, "Atelier");
    await user.click(await screen.findByRole("option", { name: /Atelier Sfax.*1234567D/ }));
    expect(await screen.findByText(client.name)).toBeInTheDocument();
  });

  it("suggests existing Affaire sites while allowing a new site value", async () => {
    vi.mocked(getOffersRequest).mockResolvedValueOnce({
      offers: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      facets: { clients: [], sites: ["Sfax", "Bizerte"] },
    });
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OfferFormSheet open onOpenChange={vi.fn()} busy={false} onSubmit={onSubmit} />
      </QueryClientProvider>,
    );

    const siteInput = await screen.findByRole("combobox", { name: "Site de lâ€™affaire" });
    await user.type(siteInput, "Sfa");
    await user.click(await screen.findByRole("option", { name: "Sfax" }));
    expect(siteInput).toHaveValue("Sfax");
    await user.clear(siteInput);
    await user.type(siteInput, "GabÃ¨s");
    expect(siteInput).toHaveValue("GabÃ¨s");
  });

  it("sends operators from the standard sign-in directly to tablet production", async () => {
    const user = userEvent.setup();
    const operatorUser = {
      id: "operator-1",
      username: "ahmed",
      displayName: "Ahmed Ben Ali",
      role: "OPERATOR" as const,
    };
    vi.mocked(loginRequest).mockResolvedValueOnce({ user: operatorUser });
    vi.mocked(operatorTabletLoginRequest).mockResolvedValueOnce({
      operator: { id: operatorUser.id, displayName: operatorUser.displayName },
      expiresAt: "2026-10-20T23:00:00.000Z",
    });
    vi.mocked(getCurrentTabletOperatorRequest).mockResolvedValueOnce({
      operator: { id: operatorUser.id, displayName: operatorUser.displayName },
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <LoginForm />
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText("Identifiant"), "ahmed");
    await user.type(screen.getByLabelText("Mot de passe"), "Operator!2026");
    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    await waitFor(() =>
      expect(operatorTabletLoginRequest).toHaveBeenCalledWith(
        expect.objectContaining({ username: "ahmed", password: "Operator!2026" }),
      ),
    );
    await waitFor(() =>
      expect(sidebarTestState.replace).toHaveBeenCalledWith("/production/tablet"),
    );
    expect(queryClient.getQueryData(["tablet", "operator"])).toEqual({
      operator: { id: operatorUser.id, displayName: operatorUser.displayName },
    });
  });

  it("announces offline state and connection recovery", async () => {
    const originalOnline = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    render(<OfflineStatus />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Hors connexion");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    fireEvent(window, new Event("online"));
    expect(await screen.findByRole("status")).toHaveTextContent("Connexion rÃƒÂ©tablie");
    if (originalOnline) Object.defineProperty(window.navigator, "onLine", originalOnline);
    else Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  });
});
