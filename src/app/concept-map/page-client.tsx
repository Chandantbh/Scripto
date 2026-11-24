'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import ReactFlow, {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ChevronDown, Expand, Maximize2, Minimize2, RotateCcw, Wand2, ZoomIn, ZoomOut } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

import { generateConceptMap, type ConceptMapOutput } from '@/ai/flows/generate-concept-map';
import AIErrorBanner from '@/components/app/ai-error-banner';
import GenerationSkeleton from '@/components/app/generation-skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { classifyAIError, unwrapAIActionResult } from '@/lib/ai-action-result';
import { reserveGuestGeneration } from '@/lib/guest-mode';
import { useAuth } from '@clerk/nextjs';
import { useToast } from '@/hooks/use-toast';

function MonochromeConceptNode({ data }: NodeProps<{ label: string; description?: string }>) {
  return (
    <div className="w-[220px] rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-950 shadow-lg">
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-white" />
      <p className="text-sm font-bold leading-tight">{data.label}</p>
      {data.description ? <p className="mt-1 text-xs leading-snug text-zinc-500">{data.description}</p> : null}
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-white" />
    </div>
  );
}

const nodeTypes = { monochromeConcept: MonochromeConceptNode };

function ConceptMapStudio() {
  const { isSignedIn } = useAuth();
  const { toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState<{ label: string; description?: string }>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
  const [topic, setTopic] = useState('');
  const [details, setDetails] = useState('');
  const [refinementPreset, setRefinementPreset] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const generationInProgressRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const hasMap = nodes.length > 0;
  const selectedNode = nodes.find(node => node.id === selectedId);

  const toggleCanvasFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await canvasRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      setIsCanvasFullscreen(value => !value);
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => setIsCanvasFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const onConnect = useCallback((params: Connection) => {
    setEdges(current => addEdge(params, current));
  }, [setEdges]);

  const layoutConcepts = (data: ConceptMapOutput) => {
    const sourceConcepts = data.nodes ?? data.concepts;
    const sourceRelationships = data.edges?.map(edge => ({
      source: edge.source,
      target: edge.target,
      relation: edge.label ?? '',
    })) ?? data.relationships;
    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, number>();
    for (const concept of sourceConcepts) incoming.set(concept.id, 0);
    for (const rel of sourceRelationships) {
      outgoing.set(rel.source, [...(outgoing.get(rel.source) ?? []), rel.target]);
      incoming.set(rel.target, (incoming.get(rel.target) ?? 0) + 1);
    }

    const roots = sourceConcepts.filter(concept => (incoming.get(concept.id) ?? 0) === 0);
    const rootId = roots[0]?.id ?? sourceConcepts[0]?.id;
    const depth = new Map<string, number>([[rootId, 0]]);
    const queue = [rootId];
    while (queue.length) {
      const source = queue.shift()!;
      for (const target of outgoing.get(source) ?? []) {
        if (!depth.has(target)) {
          depth.set(target, (depth.get(source) ?? 0) + 1);
          queue.push(target);
        }
      }
    }
    for (const concept of sourceConcepts) if (!depth.has(concept.id)) depth.set(concept.id, 1);

    const levels = new Map<number, typeof sourceConcepts>();
    for (const concept of sourceConcepts) {
      const value = depth.get(concept.id) ?? 1;
      levels.set(value, [...(levels.get(value) ?? []), concept]);
    }

    return sourceConcepts.map(concept => {
      const level = depth.get(concept.id) ?? 1;
      const peers = levels.get(level) ?? [];
      const peerIndex = peers.findIndex(peer => peer.id === concept.id);
      return {
        id: concept.id,
        data: { label: concept.label, description: concept.description },
        position: { x: 120 + level * 330, y: 100 + peerIndex * 190 - ((peers.length - 1) * 95) },
        type: 'monochromeConcept',
      } satisfies Node<{ label: string; description?: string }>;
    });
  };

  const handleGenerate = async () => {
    if (generationInProgressRef.current) return;
    if (!reserveGuestGeneration(Boolean(isSignedIn))) return;
    if (!topic.trim()) {
      setGenerationError('Enter a topic to generate a concept map.');
      return;
    }
    generationInProgressRef.current = true;
    setIsLoading(true);
    setGenerationError(null);
    try {
      const refinedDetails = [details.trim(), refinementPreset].filter(Boolean).join('\n');
      const result = unwrapAIActionResult(await generateConceptMap({
        topic,
        details: refinedDetails || undefined,
      }));
      const nextNodes = layoutConcepts(result);
      const nextEdges: Edge[] = (result.edges?.map(edge => ({
        source: edge.source,
        target: edge.target,
        label: edge.label ?? '',
      })) ?? result.relationships.map(rel => ({
        source: rel.source,
        target: rel.target,
        label: rel.relation,
      }))).map((rel, index) => ({
        id: `e-${rel.source}-${rel.target}-${index}`,
        source: rel.source,
        target: rel.target,
        label: rel.label,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#52525b' },
        style: { stroke: '#71717a', strokeWidth: 1.5 },
        labelStyle: { fill: '#18181b', fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
      }));
      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedId(null);
      setDrawerOpen(false);
      requestAnimationFrame(() => {
        workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.setTimeout(() => fitView({ padding: 0.18, duration: 500 }), 120);
      });
      toast({ title: 'Concept Map Generated', description: `Created map for: ${topic}` });
    } catch (error) {
      const friendly = classifyAIError(error);
      setGenerationError(friendly.message);
      toast({ variant: 'destructive', title: 'Could not generate concept map', description: friendly.message });
    } finally {
      generationInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  const handleNodeClick = (_event: ReactMouseEvent, node: Node) => {
    setSelectedId(node.id);
  };

  useEffect(() => {
    if (!selectedId) {
      setNodes(current => current.map(node => ({ ...node, style: undefined, selected: false })));
      setEdges(current => current.map(edge => ({ ...edge, animated: false, style: { stroke: '#71717a', strokeWidth: 1.5 } })));
      return;
    }
    const connected = new Set<string>();
    setEdges(current => current.map(edge => {
      const active = edge.source === selectedId || edge.target === selectedId;
      if (active) {
        connected.add(edge.source);
        connected.add(edge.target);
      }
      return {
        ...edge,
        animated: active,
        style: active
          ? { stroke: '#2563eb', strokeWidth: 3 }
          : { stroke: '#d4d4d8', strokeWidth: 1 },
      };
    }));
    setNodes(current => current.map(node => ({
      ...node,
      selected: node.id === selectedId || connected.has(node.id),
      style: node.id === selectedId
        ? { boxShadow: '0 0 0 4px rgba(59,130,246,.25)', borderRadius: 16 }
        : connected.has(node.id)
          ? { borderRadius: 16, opacity: 1 }
          : { borderRadius: 16, opacity: 0.55 },
    })));
  }, [selectedId, setEdges, setNodes]);

  const handleDownload = async () => {
    const element = canvasRef.current;
    if (!element) return;
    try {
      const canvas = await html2canvas(element);
      const pdf = new jsPDF({ orientation: 'landscape' });
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, width, height);
      pdf.save(`concept-map-${topic.replace(/\s+/g, '-').toLowerCase()}.pdf`);
      toast({ title: 'Downloaded', description: 'Concept map saved as PDF.' });
    } catch {
      toast({ variant: 'destructive', title: 'Download Failed' });
    }
  };

  const resetWorkspace = () => {
    setNodes([]);
    setEdges([]);
    setTopic('');
    setDetails('');
    setSelectedId(null);
    setDrawerOpen(false);
  };

  return (
    <div ref={workspaceRef} className="flex min-h-[calc(100vh-4rem)] flex-col p-4 md:p-6">
      {hasMap ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2 shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{topic || 'Concept map'}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">Export <ChevronDown className="ml-2 h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleDownload}>PDF Map</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={toggleCanvasFullscreen}>
            {isCanvasFullscreen ? <Minimize2 className="mr-2 h-4 w-4" /> : <Maximize2 className="mr-2 h-4 w-4" />}
            Fullscreen
          </Button>
          <Button size="sm" onClick={() => setDrawerOpen(true)}>Refine / Edit Topic</Button>
        </div>
      ) : (
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Concept Mapper</h1>
            <p className="text-muted-foreground">Visualize relationships between complex ideas.</p>
          </div>
        </div>
      )}

      <AIErrorBanner message={generationError} onRetry={generationError ? handleGenerate : undefined}
        showSignIn={generationError?.toLowerCase().includes('sign in') ?? false} />

      {!hasMap && (
        <Card className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5">
          <div className="space-y-2">
            <Label>Topic</Label>
            <Input placeholder="Enter a topic..." value={topic} maxLength={200} onChange={event => setTopic(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Details (Optional)</Label>
            <Textarea placeholder="Focus on specific aspects..." value={details} maxLength={5000}
              onChange={event => setDetails(event.target.value)} className="min-h-[180px]" />
          </div>
          <Button data-enter-submit="true" onClick={handleGenerate} disabled={isLoading} className="w-full">
            {isLoading ? <Wand2 className="mr-2 h-4 w-4 animate-pulse" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Generate Map
          </Button>
        </Card>
      )}

      {hasMap && (
        <Card ref={canvasRef} className="relative min-h-[78vh] w-full flex-1 overflow-hidden border-2 border-muted">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background />
          </ReactFlow>

          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-lg backdrop-blur">
            <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => zoomIn({ duration: 200 })}><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => zoomOut({ duration: 200 })}><ZoomOut className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Fit to view" onClick={() => fitView({ padding: 0.18, duration: 300 })}><RotateCcw className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Fullscreen canvas" onClick={toggleCanvasFullscreen}><Expand className="h-4 w-4" /></Button>
          </div>

          {selectedNode && (
            <div className="absolute right-4 top-4 z-30 w-[min(320px,calc(100%-2rem))] rounded-2xl border border-white/20 bg-white/75 p-4 shadow-2xl backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Selected concept</p>
              <h3 className="mt-1 text-lg font-bold">{selectedNode.data.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{selectedNode.data.description || 'A key concept in this map.'}</p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => window.location.assign(`/eli5?topic=${encodeURIComponent(String(selectedNode.data.label))}&text=${encodeURIComponent(String(selectedNode.data.description || selectedNode.data.label))}`)}>
                  Explain Simply
                </Button>
                <Button size="sm"
                  onClick={() => window.location.assign(`/quiz?topic=${encodeURIComponent(String(selectedNode.data.label))}&mode=topic`)}>
                  Quiz This Concept
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {isLoading && !hasMap && (
        <div className="fixed inset-x-0 bottom-0 top-16 z-40 bg-background/80">
          <GenerationSkeleton kind="map" />
        </div>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit Input / Refine with AI</SheetTitle>
            <SheetDescription>Refine the source without leaving the workspace.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Topic</Label>
              <Input value={topic} maxLength={200} onChange={event => setTopic(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Source or focus details</Label>
              <Textarea value={details} maxLength={5000} className="min-h-[180px]"
                onChange={event => setDetails(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Refinement preset</Label>
              <div className="grid gap-2">
                {['Add more depth', 'Simplify branches', 'Focus on exam key terms'].map(preset => (
                  <Button key={preset} type="button" variant={refinementPreset === preset ? 'default' : 'outline'}
                    onClick={() => setRefinementPreset(preset)}>
                    {preset}
                  </Button>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={handleGenerate} disabled={isLoading}>
              {isLoading ? 'Regenerating...' : 'Regenerate Map'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function ConceptMapPage() {
  return (
    <ReactFlowProvider>
      <ConceptMapStudio />
    </ReactFlowProvider>
  );
}
