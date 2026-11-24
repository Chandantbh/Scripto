'use client';

import {useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent} from 'react';
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
import {
  ChevronDown,
  Expand,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Wand2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {jsPDF} from 'jspdf';
import html2canvas from 'html2canvas';
import {useRouter} from 'next/navigation';

import {generateConceptMap} from '@/ai/flows/generate-concept-map';
import type {ConceptMapOutput} from '@/ai/flows/concept-map-schema';
import {
  getSavedConceptMapsAction,
  saveConceptMapAction,
  type SavedConceptMap,
} from '@/app/actions/concept-maps';
import AIErrorBanner from '@/components/app/ai-error-banner';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle} from '@/components/ui/sheet';
import {Textarea} from '@/components/ui/textarea';
import {Skeleton} from '@/components/ui/skeleton';
import {classifyAIError, unwrapAIActionResult} from '@/lib/ai-action-result';
import {reserveGuestGeneration} from '@/lib/guest-mode';
import {useAuth} from '@clerk/nextjs';
import {useToast} from '@/hooks/use-toast';

const LOCAL_MAPS_KEY = 'scripto-concept-maps';
const NODE_WIDTH = 230;
const NODE_HEIGHT = 132;
type ConceptNode = ConceptMapOutput['nodes'][number];

function isSavedConceptMap(value: unknown): value is SavedConceptMap {
  if (typeof value !== 'object' || value === null) return false;
  const map = value as Partial<SavedConceptMap>;
  return typeof map.id === 'string'
    && typeof map.sourceTitle === 'string'
    && typeof map.createdAt === 'string'
    && Array.isArray(map.nodes)
    && Array.isArray(map.edges)
    && map.nodes.every(node =>
      typeof node === 'object'
      && node !== null
      && typeof node.id === 'string'
      && typeof node.label === 'string'
      && (node.summary === undefined || typeof node.summary === 'string')
      && (node.group === undefined || typeof node.group === 'string'),
    )
    && map.edges.every(edge =>
      typeof edge === 'object'
      && edge !== null
      && typeof edge.source === 'string'
      && typeof edge.target === 'string'
      && typeof edge.label === 'string',
    );
}

function readLocalMaps(): SavedConceptMap[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LOCAL_MAPS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isSavedConceptMap) : [];
  } catch (error) {
    console.error('Could not read concept maps saved on this device.', error);
    return [];
  }
}

function buildFlowNodes(map: ConceptMapOutput): Node<ConceptNode>[] {
  const incoming = new Map(map.nodes.map(node => [node.id, 0]));
  const outgoing = new Map(map.nodes.map(node => [node.id, [] as string[]]));
  for (const edge of map.edges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.get(edge.source)?.push(edge.target);
  }

  const root = map.nodes.find(node => incoming.get(node.id) === 0) ?? map.nodes[0];
  const depth = new Map<string, number>([[root.id, 0]]);
  const queue = [root.id];
  while (queue.length) {
    const source = queue.shift()!;
    for (const target of outgoing.get(source) ?? []) {
      if (depth.has(target)) continue;
      depth.set(target, (depth.get(source) ?? 0) + 1);
      queue.push(target);
    }
  }
  for (const node of map.nodes) {
    if (!depth.has(node.id)) depth.set(node.id, 1);
  }

  const levels = new Map<number, ConceptNode[]>();
  for (const node of map.nodes) {
    const level = depth.get(node.id) ?? 1;
    levels.set(level, [...(levels.get(level) ?? []), node]);
  }

  return map.nodes.map(concept => {
    const level = depth.get(concept.id) ?? 1;
    const siblings = levels.get(level) ?? [];
    const siblingIndex = siblings.findIndex(node => node.id === concept.id);
    return {
      id: concept.id,
      data: concept,
      position: {
        x: 120 + level * 340,
        y: 120 + siblingIndex * 210 - ((siblings.length - 1) * 105),
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      type: 'monochromeConcept',
    };
  });
}

function buildFlowEdges(map: ConceptMapOutput): Edge[] {
  return map.edges.map((edge, index) => ({
    id: `concept-edge-${index}-${edge.source}-${edge.target}`,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? 'relates to',
    type: 'smoothstep',
    markerEnd: {type: MarkerType.ArrowClosed, color: '#52525b'},
    style: {stroke: '#71717a', strokeWidth: 1.5},
    labelStyle: {fill: '#18181b', fontWeight: 600, fontSize: 11},
    labelBgStyle: {fill: '#ffffff', fillOpacity: 0.95},
  }));
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]!);
}

function createMapSvg(nodes: Node<ConceptNode>[], edges: Edge[], title: string): string {
  const minX = Math.min(...nodes.map(node => node.position.x));
  const minY = Math.min(...nodes.map(node => node.position.y));
  const maxX = Math.max(...nodes.map(node => node.position.x + NODE_WIDTH));
  const maxY = Math.max(...nodes.map(node => node.position.y + NODE_HEIGHT));
  const margin = 48;
  const width = maxX - minX + margin * 2;
  const height = maxY - minY + margin * 2;
  const positions = new Map(nodes.map(node => [node.id, node.position]));
  const edgeMarkup = edges.map(edge => {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) return '';
    const sourceIsLeft = source.x <= target.x;
    const x1 = source.x - minX + (sourceIsLeft ? NODE_WIDTH : 0) + margin;
    const y1 = source.y - minY + NODE_HEIGHT / 2 + margin;
    const x2 = target.x - minX + (sourceIsLeft ? 0 : NODE_WIDTH) + margin;
    const y2 = target.y - minY + NODE_HEIGHT / 2 + margin;
    const label = typeof edge.label === 'string' ? edge.label : '';
    return `<g><path d="M ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="#71717a" stroke-width="2" marker-end="url(#arrow)"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 7}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="600" fill="#18181b">${escapeXml(label)}</text></g>`;
  }).join('');

  const nodeMarkup = nodes.map(node => {
    const x = node.position.x - minX + margin;
    const y = node.position.y - minY + margin;
    const label = escapeXml(node.data.label);
    const summary = escapeXml((node.data.summary ?? '').slice(0, 100));
    const group = node.data.group
      ? `<text x="${x + 14}" y="${y + 22}" font-family="Arial,sans-serif" font-size="10" fill="#71717a">${escapeXml(node.data.group)}</text>`
      : '';
    const labelY = node.data.group ? y + 49 : y + 36;
    return `<g><rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="14" fill="#ffffff" stroke="#d4d4d8" stroke-width="2"/>${group}<text x="${x + 14}" y="${labelY}" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#09090b">${label}</text><text x="${x + 14}" y="${labelY + 25}" font-family="Arial,sans-serif" font-size="12" fill="#71717a">${summary}</text></g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escapeXml(title)}</title><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#52525b"/></marker></defs><rect width="100%" height="100%" fill="#fafafa"/><text x="${margin}" y="28" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="#09090b">${escapeXml(title)}</text><g transform="translate(0 18)">${edgeMarkup}${nodeMarkup}</g></svg>`;
}

function MonochromeConceptNode({data}: NodeProps<ConceptNode>) {
  return (
    <div className="h-[132px] w-[230px] overflow-hidden rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-950 shadow-lg">
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-white" />
      {data.group ? <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{data.group}</p> : null}
      <p className="text-sm font-bold leading-tight">{data.label}</p>
      {data.summary ? <p className="mt-1 line-clamp-3 text-xs leading-snug text-zinc-500">{data.summary}</p> : null}
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-white" />
    </div>
  );
}

const nodeTypes = {monochromeConcept: MonochromeConceptNode};

function ConceptMapStudio() {
  const {isLoaded, isSignedIn} = useAuth();
  const router = useRouter();
  const {toast} = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState<ConceptNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [topic, setTopic] = useState('');
  const [details, setDetails] = useState('');
  const [refinementPreset, setRefinementPreset] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSavedMaps, setIsLoadingSavedMaps] = useState(true);
  const [savedMaps, setSavedMaps] = useState<SavedConceptMap[]>([]);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const generationInProgressRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const {fitView, zoomIn, zoomOut} = useReactFlow();

  const hasMap = nodes.length > 0;
  const selectedNode = nodes.find(node => node.id === selectedId);

  const applyMap = useCallback((map: SavedConceptMap) => {
    const graph = {nodes: map.nodes, edges: map.edges};
    setTopic(map.sourceTitle);
    setDetails('');
    setNodes(buildFlowNodes(graph));
    setEdges(buildFlowEdges(graph));
    setActiveMapId(map.id);
    setSelectedId(null);
    setDrawerOpen(false);
    setLayoutRevision(revision => revision + 1);
  }, [setEdges, setNodes]);

  useEffect(() => {
    if (!isLoaded) return;
    let active = true;
    const loadSavedMaps = async () => {
      try {
        const maps = isSignedIn
          ? await getSavedConceptMapsAction()
          : readLocalMaps();
        if (!active) return;
        setSavedMaps(maps);
        if (maps[0]) applyMap(maps[0]);
      } catch (error) {
        if (!active) return;
        console.error('Saved concept maps could not be loaded.', error);
        toast({
          variant: 'destructive',
          title: 'Saved maps unavailable',
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      } finally {
        if (active) setIsLoadingSavedMaps(false);
      }
    };
    void loadSavedMaps();
    return () => {
      active = false;
    };
  }, [applyMap, isLoaded, isSignedIn, toast]);

  useEffect(() => {
    if (!hasMap || !canvasRef.current) return;
    const element = canvasRef.current;
    let frame = window.requestAnimationFrame(() => fitView({padding: 48, duration: 400}));
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => fitView({padding: 48, duration: 250}));
    });
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitView, hasMap, layoutRevision]);

  const toggleCanvasFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await canvasRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      console.error('Concept map fullscreen could not be changed.', error);
      toast({variant: 'destructive', title: 'Fullscreen unavailable'});
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
      const sourceTitle = topic.trim();
      const refinedDetails = [details.trim(), refinementPreset].filter(Boolean).join('\n');
      const result = unwrapAIActionResult(await generateConceptMap({
        topic: sourceTitle,
        details: refinedDetails || undefined,
      }));
      setNodes(buildFlowNodes(result));
      setEdges(buildFlowEdges(result));
      setSelectedId(null);
      setActiveMapId(null);
      setLayoutRevision(revision => revision + 1);
      setDrawerOpen(false);
      requestAnimationFrame(() => workspaceRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'}));
      toast({title: 'Concept Map Generated', description: `Created map for: ${sourceTitle}`});

      try {
        let savedMap: SavedConceptMap;
        if (isSignedIn) {
          const saved = await saveConceptMapAction({
            sourceTitle,
            nodes: result.nodes,
            edges: result.edges,
          });
          if (!saved) throw new Error('Sign in to save concept maps to your account.');
          savedMap = saved;
        } else {
          savedMap = {
            id: window.crypto.randomUUID(),
            sourceTitle,
            nodes: result.nodes,
            edges: result.edges,
            createdAt: new Date().toISOString(),
          };
          window.localStorage.setItem(LOCAL_MAPS_KEY, JSON.stringify([savedMap, ...readLocalMaps()]));
        }
        setSavedMaps(current => [savedMap, ...current.filter(map => map.id !== savedMap.id)]);
        setActiveMapId(savedMap.id);
      } catch (error) {
        console.error('Generated concept map could not be saved.', error);
        toast({
          variant: 'destructive',
          title: 'Map generated but not saved',
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      }
    } catch (error) {
      const friendly = classifyAIError(error);
      setGenerationError(friendly.message);
      toast({variant: 'destructive', title: 'Could not generate concept map', description: friendly.message});
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
      setNodes(current => current.map(node => ({...node, style: undefined, selected: false})));
      setEdges(current => current.map(edge => ({
        ...edge,
        animated: false,
        style: {stroke: '#71717a', strokeWidth: 1.5},
      })));
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
          ? {stroke: '#2563eb', strokeWidth: 3}
          : {stroke: '#d4d4d8', strokeWidth: 1},
      };
    }));
    setNodes(current => current.map(node => ({
      ...node,
      selected: node.id === selectedId || connected.has(node.id),
      style: node.id === selectedId
        ? {boxShadow: '0 0 0 4px rgba(59,130,246,.25)', borderRadius: 16}
        : connected.has(node.id)
          ? {borderRadius: 16, opacity: 1}
          : {borderRadius: 16, opacity: 0.55},
    })));
  }, [selectedId, setEdges, setNodes]);

  const fileBaseName = topic.trim().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'concept-map';
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const captureCanvas = async () => {
    if (!canvasRef.current) throw new Error('Concept map canvas is unavailable.');
    return html2canvas(canvasRef.current, {backgroundColor: '#ffffff', scale: 2});
  };

  const handleDownloadPdf = async () => {
    try {
      const canvas = await captureCanvas();
      const pdf = new jsPDF({orientation: 'landscape'});
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, width, height);
      pdf.save(`${fileBaseName}.pdf`);
      toast({title: 'Downloaded', description: 'Concept map saved as PDF.'});
    } catch (error) {
      console.error('Concept map PDF export failed.', error);
      toast({variant: 'destructive', title: 'PDF export failed'});
    }
  };

  const handleDownloadPng = async () => {
    try {
      const canvas = await captureCanvas();
      const image = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG rendering failed.')), 'image/png');
      });
      downloadBlob(image, `${fileBaseName}.png`);
      toast({title: 'Downloaded', description: 'Concept map saved as PNG.'});
    } catch (error) {
      console.error('Concept map PNG export failed.', error);
      toast({variant: 'destructive', title: 'PNG export failed'});
    }
  };

  const handleDownloadSvg = () => {
    try {
      const svg = createMapSvg(nodes, edges, topic || 'Concept map');
      downloadBlob(new Blob([svg], {type: 'image/svg+xml;charset=utf-8'}), `${fileBaseName}.svg`);
      toast({title: 'Downloaded', description: 'Concept map saved as SVG.'});
    } catch (error) {
      console.error('Concept map SVG export failed.', error);
      toast({variant: 'destructive', title: 'SVG export failed'});
    }
  };

  const resetWorkspace = () => {
    setNodes([]);
    setEdges([]);
    setTopic('');
    setDetails('');
    setSelectedId(null);
    setActiveMapId(null);
    setDrawerOpen(false);
  };

  const savedMapsMenu = savedMaps.length ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          Saved Maps <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {savedMaps.map(map => (
          <DropdownMenuItem key={map.id} onSelect={() => applyMap(map)}>
            {activeMapId === map.id ? '✓ ' : ''}{map.sourceTitle}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <div ref={workspaceRef} className="flex min-h-[calc(100vh-4rem)] flex-col p-4 md:p-6">
      {hasMap ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2 shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{topic || 'Concept map'}</p>
          </div>
          {savedMapsMenu}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">Export <ChevronDown className="ml-2 h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleDownloadPdf}>PDF Map</DropdownMenuItem>
              <DropdownMenuItem onSelect={handleDownloadPng}>Export PNG</DropdownMenuItem>
              <DropdownMenuItem onSelect={handleDownloadSvg}>Export SVG</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={toggleCanvasFullscreen}>
            {isCanvasFullscreen ? <Minimize2 className="mr-2 h-4 w-4" /> : <Maximize2 className="mr-2 h-4 w-4" />}
            Fullscreen
          </Button>
          <Button size="sm" onClick={() => setDrawerOpen(true)}>Refine / Edit Topic</Button>
        </div>
      ) : (
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Concept Mapper</h1>
            <p className="text-muted-foreground">Visualize relationships between complex ideas.</p>
          </div>
          {savedMapsMenu}
        </div>
      )}

      <AIErrorBanner
        message={generationError}
        onRetry={generationError ? handleGenerate : undefined}
        showSignIn={generationError?.toLowerCase().includes('sign in') ?? false}
      />

      {!hasMap && !isLoading && (
        <Card className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5">
          <div className="space-y-2">
            <Label>Topic</Label>
            <Input placeholder="Enter a topic..." value={topic} maxLength={200} onChange={event => setTopic(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Details (Optional)</Label>
            <Textarea
              placeholder="Focus on specific aspects..."
              value={details}
              maxLength={5000}
              onChange={event => setDetails(event.target.value)}
              className="min-h-[180px]"
            />
          </div>
          <Button data-enter-submit="true" onClick={handleGenerate} disabled={isLoading} className="w-full">
            <Wand2 className="mr-2 h-4 w-4" />
            Generate Map
          </Button>
        </Card>
      )}

      {hasMap && (
        <Card ref={canvasRef} className="relative h-[72vh] min-h-[560px] w-full overflow-hidden border-2 border-muted">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            nodesDraggable
            panOnDrag
            zoomOnPinch
            zoomOnScroll
            minZoom={0.2}
            maxZoom={2}
          >
            <Background />
          </ReactFlow>

          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-lg backdrop-blur">
            <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => zoomIn({duration: 200})}><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => zoomOut({duration: 200})}><ZoomOut className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => fitView({padding: 48, duration: 300})}>
              <RotateCcw className="mr-2 h-4 w-4" /> Fit to Screen
            </Button>
            <Button variant="ghost" size="icon" aria-label="Fullscreen canvas" onClick={toggleCanvasFullscreen}><Expand className="h-4 w-4" /></Button>
          </div>

          {selectedNode && (
            <div className="absolute right-4 top-4 z-30 w-[min(340px,calc(100%-2rem))] rounded-2xl border border-white/20 bg-white/90 p-4 shadow-2xl backdrop-blur-xl">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Selected concept</p>
              <h3 className="mt-1 text-lg font-bold">{selectedNode.data.label}</h3>
              {selectedNode.data.group ? <p className="mt-1 text-xs font-medium text-muted-foreground">{selectedNode.data.group}</p> : null}
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {selectedNode.data.summary || 'A key concept in this map.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/notes?mode=topic&topic=${encodeURIComponent(String(selectedNode.data.label))}`)}
                >
                  See in Notes
                </Button>
                <Button
                  size="sm"
                  onClick={() => router.push(`/quiz?topic=${encodeURIComponent(String(selectedNode.data.label))}&mode=topic`)}
                >
                  Quiz This Concept
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {isLoading && !hasMap && (
        <Card className="mx-auto w-full max-w-3xl p-8 text-center" role="status" aria-live="polite">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm font-semibold">Building your concept map...</p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </Card>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit Input / Refine with AI</SheetTitle>
            <SheetDescription>Refine the source without leaving the workspace.</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {savedMaps.length > 0 && (
              <div className="space-y-2">
                <Label>Saved Maps</Label>
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {savedMaps.map(map => (
                    <Button
                      key={map.id}
                      type="button"
                      variant={activeMapId === map.id ? 'secondary' : 'ghost'}
                      className="w-full justify-start truncate"
                      onClick={() => applyMap(map)}
                    >
                      {map.sourceTitle}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Topic</Label>
              <Input value={topic} maxLength={200} onChange={event => setTopic(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Source or focus details</Label>
              <Textarea value={details} maxLength={5000} className="min-h-[180px]" onChange={event => setDetails(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Refinement preset</Label>
              <div className="grid gap-2">
                {['Add more depth', 'Simplify branches', 'Focus on exam key terms'].map(preset => (
                  <Button
                    key={preset}
                    type="button"
                    variant={refinementPreset === preset ? 'default' : 'outline'}
                    onClick={() => setRefinementPreset(preset)}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={resetWorkspace}>New Map</Button>
              <Button onClick={handleGenerate} disabled={isLoading}>
                {isLoading ? 'Regenerating...' : 'Regenerate Map'}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {isLoadingSavedMaps ? <span className="sr-only" aria-live="polite">Loading saved maps</span> : null}
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
