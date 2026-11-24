'use server';

import {auth} from '@clerk/nextjs/server';
import {z} from 'zod';
import {getSupabaseServerClient} from '@/lib/supabase-server';

const conceptMapNodeSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
  summary: z.string().max(5_000).optional(),
  group: z.string().max(100).optional(),
}).strict();

const conceptMapEdgeSchema = z.object({
  source: z.string().trim().min(1).max(100),
  target: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
}).strict();

const conceptMapSchema = z.object({
  sourceTitle: z.string().trim().min(1).max(200),
  nodes: z.array(conceptMapNodeSchema).min(8).max(15),
  edges: z.array(conceptMapEdgeSchema).max(100),
}).strict();

export type SavedConceptMap = {
  id: string;
  sourceTitle: string;
  nodes: z.infer<typeof conceptMapNodeSchema>[];
  edges: Array<{source: string; target: string; label?: string}>;
  createdAt: string;
};

export async function saveConceptMapAction(input: unknown): Promise<SavedConceptMap | null> {
  const {userId} = await auth();
  if (!userId) return null;

  const parsed = conceptMapSchema.safeParse(input);
  if (!parsed.success) throw new Error('Concept map details are invalid and could not be saved.');

  const client = getSupabaseServerClient();
  if (!client) throw new Error('Concept map storage is not configured.');

  const {data, error} = await client
    .from('concept_maps')
    .insert({
      user_id: userId,
      source_title: parsed.data.sourceTitle,
      nodes: parsed.data.nodes,
      edges: parsed.data.edges,
    })
    .select('id, source_title, nodes, edges, created_at')
    .single();
  if (error) {
    console.error('Scripto concept map could not be saved.', error);
    throw new Error('Concept map could not be saved. Please try again.');
  }
  return parseSavedConceptMap(data);
}

export async function getSavedConceptMapsAction(): Promise<SavedConceptMap[]> {
  const {userId} = await auth();
  if (!userId) return [];

  const client = getSupabaseServerClient();
  if (!client) throw new Error('Concept map storage is not configured.');

  const {data, error} = await client
    .from('concept_maps')
    .select('id, source_title, nodes, edges, created_at')
    .eq('user_id', userId)
    .order('created_at', {ascending: false})
    .limit(50);
  if (error) {
    console.error('Scripto concept maps could not be loaded.', error);
    throw new Error('Saved concept maps could not be loaded. Please try again.');
  }
  return (data ?? []).map(parseSavedConceptMap);
}

function parseSavedConceptMap(row: {
  id: string;
  source_title: string;
  nodes: unknown;
  edges: unknown;
  created_at: string;
}): SavedConceptMap {
  return {
    id: row.id,
    sourceTitle: row.source_title,
    nodes: z.array(conceptMapNodeSchema).parse(row.nodes),
    edges: z.array(conceptMapEdgeSchema).parse(row.edges),
    createdAt: row.created_at,
  };
}
