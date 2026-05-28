import type {
  DirectorySuggestion,
  OrgUnitSuggestion,
  PositionContext,
  PositionSuggestion
} from "../types/directory";

export async function searchOrgUnits(query: string): Promise<OrgUnitSuggestion[]> {
  const params = new URLSearchParams({ query });
  const response = await fetch(`/api/directory/org-units?${params.toString()}`);

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as OrgUnitSuggestion[];
}

export async function searchPositions(
  query: string,
  orgUnitId?: string | null
): Promise<PositionSuggestion[]> {
  const params = new URLSearchParams({ query });
  if (orgUnitId) {
    params.set("orgUnitId", orgUnitId);
  }

  const response = await fetch(`/api/directory/positions?${params.toString()}`);

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as PositionSuggestion[];
}

export async function searchDirectory(query: string): Promise<DirectorySuggestion[]> {
  const [orgUnits, positions] = await Promise.all([searchOrgUnits(query), searchPositions(query)]);
  const orgUnitItems: DirectorySuggestion[] = orgUnits.slice(0, 8).map((orgUnit) => ({
    kind: "org_unit",
    id: orgUnit.id,
    name: orgUnit.name,
    fullPath: orgUnit.fullPath,
    level: orgUnit.level
  }));
  const positionItems: DirectorySuggestion[] = positions.slice(0, 12).map((position) => ({
    kind: "position",
    id: position.id,
    title: position.title,
    orgUnit: position.orgUnit
  }));

  return [...orgUnitItems, ...positionItems].slice(0, 20);
}

export async function loadPositionContext(positionId: string): Promise<PositionContext | null> {
  const response = await fetch(`/api/directory/positions/${positionId}/context`);

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as PositionContext;
}
