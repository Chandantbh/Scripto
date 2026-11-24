import {z} from 'genkit';

const ConceptMapNodeSchema = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(120),
  summary: z.string().max(5_000).optional(),
  group: z.string().max(100).optional(),
}).strict();

const ConceptMapEdgeSchema = z.object({
  source: z.string().min(1).max(100),
  target: z.string().min(1).max(100),
  label: z.string().max(120).optional(),
}).strict();

export const ConceptMapOutputSchema = z.object({
  nodes: z.array(ConceptMapNodeSchema),
  edges: z.array(ConceptMapEdgeSchema),
}).strict();
export type ConceptMapOutput = z.infer<typeof ConceptMapOutputSchema>;

export function sanitizeConceptMap(raw: unknown): ConceptMapOutput {
  if (typeof raw !== 'object' || raw === null) {
    return {nodes: [], edges: []};
  }
  const record = raw as {nodes?: unknown; edges?: unknown};
  if (!Array.isArray(record.nodes)) return {nodes: [], edges: []};

  const nodes: ConceptMapOutput['nodes'] = [];
  const ids = new Set<string>();
  for (const value of record.nodes) {
    if (typeof value !== 'object' || value === null) continue;
    const node = value as {id?: unknown; label?: unknown; summary?: unknown; group?: unknown};
    if (typeof node.id !== 'string' || typeof node.label !== 'string') continue;
    const id = node.id.trim();
    const words = node.label.trim().split(/\s+/).filter(Boolean);
    if (!id || id.length > 100 || !words.length || ids.has(id)) continue;

    const label = words.slice(0, 4).join(' ').slice(0, 120);
    const overflow = words.slice(4).join(' ');
    const summary = [
      typeof node.summary === 'string' ? node.summary.trim() : '',
      overflow,
    ].filter(Boolean).join(' ').slice(0, 5_000);
    const group = typeof node.group === 'string' ? node.group.trim().slice(0, 100) : '';
    ids.add(id);
    nodes.push({
      id,
      label,
      ...(summary ? {summary} : {}),
      ...(group ? {group} : {}),
    });
    if (nodes.length === 15) break;
  }

  if (nodes.length === 0) return {nodes, edges: []};

  const uniqueEdges = new Map<string, NonNullable<ConceptMapOutput['edges'][number]>>();
  if (Array.isArray(record.edges)) {
    for (const value of record.edges) {
      if (typeof value !== 'object' || value === null) continue;
      const edge = value as {source?: unknown; target?: unknown; label?: unknown};
      if (typeof edge.source !== 'string' || typeof edge.target !== 'string') continue;
      const source = edge.source.trim();
      const target = edge.target.trim();
      if (source.length > 100 || target.length > 100 || !ids.has(source) || !ids.has(target) || source === target) continue;
      const key = `${source}\u0000${target}`;
      if (uniqueEdges.has(key)) continue;
      const labelWords = typeof edge.label === 'string'
        ? edge.label.trim().split(/\s+/).filter(Boolean)
        : [];
      uniqueEdges.set(key, {
        source,
        target,
        label: (labelWords.length ? labelWords.slice(0, 4).join(' ') : 'relates to').slice(0, 120),
      });
    }
  }

  const candidates = [...uniqueEdges.values()];
  const root = nodes[0];
  const adjacency = new Map(nodes.map(node => [node.id, [] as string[]]));
  for (const edge of candidates) {
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }

  const edges: ConceptMapOutput['edges'] = [];
  const edgeKeys = new Set<string>();
  const visited = new Set([root.id]);
  const queue = [root.id];
  while (queue.length) {
    const parent = queue.shift()!;
    for (const child of adjacency.get(parent) ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      queue.push(child);
      const original = candidates.find(edge => edge.source === parent && edge.target === child);
      edges.push({
        source: parent,
        target: child,
        label: original?.label ?? 'relates to',
      });
      edgeKeys.add(`${parent}\u0000${child}`);
    }
  }

  for (const node of nodes) {
    if (node.id === root.id || visited.has(node.id)) continue;
    edges.push({source: root.id, target: node.id, label: 'relates to'});
    edgeKeys.add(`${root.id}\u0000${node.id}`);
    visited.add(node.id);
  }

  for (const edge of candidates) {
    const key = `${edge.source}\u0000${edge.target}`;
    if (edge.target !== root.id && !edgeKeys.has(key)) {
      edges.push(edge);
      edgeKeys.add(key);
    }
  }

  return {
    nodes: [root, ...nodes.filter(node => node.id !== root.id)],
    edges,
  };
}
