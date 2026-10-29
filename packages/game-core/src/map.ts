export interface Territory {
  id: string;
  castle: boolean;
  neighbors: readonly string[];
}

export const territoryId = (index: number): string =>
  `t_${String(index).padStart(2, '0')}`;

export const MAP: readonly Territory[] = Object.freeze(
  Array.from({ length: 15 }, (_, index) =>
    Object.freeze({
      id: territoryId(index),
      castle: index % 5 === 0,
      neighbors: Object.freeze(
        [
          territoryId((index + 14) % 15),
          territoryId((index + 1) % 15),
          ...(index % 5 === 2
            ? [territoryId((index + 5) % 15), territoryId((index + 10) % 15)]
            : []),
        ].sort(),
      ),
    }),
  ),
);

export function validateMap(map: readonly Territory[]): string[] {
  const errors: string[] = [];
  const nodes = new Map(map.map((node) => [node.id, node]));
  if (map.length !== 15 || nodes.size !== 15)
    errors.push('Expected 15 unique territories');
  if (map.filter((node) => node.castle).length !== 3)
    errors.push('Expected three castles');
  for (const node of map) {
    if (new Set(node.neighbors).size !== node.neighbors.length)
      errors.push(`Duplicate edge: ${node.id}`);
    for (const neighbor of node.neighbors) {
      if (
        neighbor === node.id ||
        !nodes.get(neighbor)?.neighbors.includes(node.id)
      )
        errors.push(`Invalid edge: ${node.id}/${neighbor}`);
    }
  }
  const visited = new Set<string>();
  const pending = map[0] ? [map[0].id] : [];
  while (pending.length) {
    const id = pending.pop();
    if (id === undefined || visited.has(id)) continue;
    visited.add(id);
    pending.push(...(nodes.get(id)?.neighbors ?? []));
  }
  if (visited.size !== map.length) errors.push('Map is disconnected');
  return errors;
}
