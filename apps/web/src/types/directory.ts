export type OrgUnitSuggestion = {
  id: string;
  name: string;
  fullPath: string;
  level: number;
};

export type PositionSuggestion = {
  id: string;
  title: string;
  isSupervisor: boolean;
  plannedFte: number;
  occupiedFte: number;
  orgUnit: OrgUnitSuggestion;
};

export type DirectorySuggestion =
  | {
      kind: "position";
      id: string;
      title: string;
      orgUnit: OrgUnitSuggestion;
    }
  | {
      kind: "org_unit";
      id: string;
      name: string;
      fullPath: string;
      level: number;
    };

export type PositionReport = {
  positionId: string;
  title: string;
  orgUnit: OrgUnitSuggestion;
  count: number;
  occupiedFte: number;
};

export type PositionContext = {
  position: PositionSuggestion;
  adminManager: PositionSuggestion | null;
  directReports: PositionReport[];
  totalSubordinateCount: number;
  totalSubordinateOccupiedFte: number;
};
