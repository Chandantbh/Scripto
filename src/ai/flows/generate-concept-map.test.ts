import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ConceptMapOutputSchema, sanitizeConceptMap} from './concept-map-schema';

test('requires the strict coordinate-free graph shape', () => {
  const graph = {nodes: [{id: 'root', label: 'Central topic'}], edges: []};
  assert.equal(ConceptMapOutputSchema.safeParse(graph).success, true);
  assert.equal(ConceptMapOutputSchema.safeParse({
    ...graph,
    nodes: [{...graph.nodes[0], x: 12, y: 24}],
  }).success, false);
});

test('sanitizes node limits, labels, IDs, relationships, and disconnected concepts', () => {
  const raw = {
    nodes: [
      {id: 'topic', label: 'Central concept overview', summary: 'Central summary', x: 20},
      ...Array.from({length: 15}, (_, index) => ({
        id: `concept-${index}`,
        label: `Concept ${index}`,
      })),
      {id: 'concept-0', label: 'Duplicate should be removed'},
      {id: '', label: 'Invalid'},
    ],
    edges: [
      {source: 'topic', target: 'concept-0', label: 'connects to'},
      {source: 'topic', target: 'concept-0', label: 'duplicate'},
      {source: 'missing', target: 'concept-1', label: 'invalid'},
      {source: 'concept-2', target: 'concept-3', label: 'has a much longer relationship'},
    ],
  };

  const result = sanitizeConceptMap(raw);
  assert.equal(result.nodes.length, 15);
  assert.equal(result.nodes[0].id, 'topic');
  assert.equal(result.nodes[0].label, 'Central concept overview');
  assert.equal(result.nodes[0].summary, 'Central summary');
  assert.deepEqual(Object.keys(result.nodes[0]).sort(), ['id', 'label', 'summary']);
  assert.ok(result.nodes.every(node => node.label.split(/\s+/).length <= 4));
  assert.equal(result.edges.some(edge => edge.source === 'missing' || edge.target === 'missing'), false);

  const incoming = new Map(result.nodes.map(node => [node.id, 0]));
  for (const edge of result.edges) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  assert.equal([...incoming.values()].filter(count => count === 0).length, 1);
  assert.ok(result.nodes.slice(1).every(node => (incoming.get(node.id) ?? 0) > 0));
  assert.ok(result.edges.every(edge => edge.label!.split(/\s+/).length <= 4));
});

test('moves excess label words into the summary and handles malformed graph data', () => {
  const result = sanitizeConceptMap({
    nodes: [
      {id: 'root', label: 'A very concise central concept', summary: 'Existing details'},
      {id: 'child', label: 'Related idea'},
    ],
    edges: [{source: 'child', target: 'root'}],
  });

  assert.deepEqual(result.nodes[0], {
    id: 'root',
    label: 'A very concise central',
    summary: 'Existing details concept',
  });
  assert.deepEqual(result.edges, [{source: 'root', target: 'child', label: 'relates to'}]);
  assert.deepEqual(sanitizeConceptMap(null), {nodes: [], edges: []});
});
