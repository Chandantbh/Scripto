'use client';

import { useState, useCallback, useRef } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  MarkerType,
  Handle,
  Position,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wand2, Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { generateConceptMap, type ConceptMapInput, type ConceptMapOutput } from '@/ai/flows/generate-concept-map';
import { useToast } from '@/hooks/use-toast';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import AIErrorBanner from '@/components/app/ai-error-banner';
import { getAIErrorMessage, unwrapAIActionResult } from '@/lib/ai-action-result';
import { useAuth } from '@clerk/nextjs';
import { reserveGuestGeneration } from '@/lib/guest-mode';
import GenerationSkeleton from '@/components/app/generation-skeleton';

const initialNodes: Node[] = [
  {
    id: '1',
    data: { label: 'Enter a topic to generate a concept map' },
    position: { x: 250, y: 250 },
    type: 'monochromeConcept',
  },
];

const initialEdges: Edge[] = [];

function MonochromeConceptNode({ data }: NodeProps<{ label: string; description?: string }>) {
  return (
    <div className="w-[220px] rounded-md border-2 border-zinc-900 bg-white px-3 py-2 text-zinc-950 shadow-sm">
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-white" />
      <p className="text-sm font-bold leading-tight">{data.label}</p>
      {data.description ? (
        <p className="mt-1 text-xs leading-snug text-zinc-500">{data.description}</p>
      ) : null}
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-zinc-900 !bg-white" />
    </div>
  );
}

const nodeTypes = { monochromeConcept: MonochromeConceptNode };

export default function ConceptMapPage() {
  const { isSignedIn } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [topic, setTopic] = useState('');
  const [details, setDetails] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const { toast } = useToast();
  const generationInProgressRef = useRef(false);
  const [composerOpen, setComposerOpen] = useState(true);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const mapDataToFlowElements = (data: ConceptMapOutput) => {
    const newNodes: Node[] = (data.concepts || []).map((concept, index) => {
        const columns = Math.ceil(Math.sqrt(data.concepts.length || 1));
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = 80 + column * 280;
        const y = 80 + row * 180;

        return {
            id: concept.id,
            data: { label: concept.label, description: concept.description },
            position: { x, y },
            type: 'monochromeConcept',
        };
    });

    const newEdges: Edge[] = (data.relationships || []).map((rel, i) => ({
        id: `e-${rel.source}-${rel.target}-${i}`,
        source: rel.source,
        target: rel.target,
        label: rel.relation,
        type: 'smoothstep',
        markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#18181b',
        },
        animated: false,
        style: { stroke: '#18181b', strokeWidth: 1.5 },
        labelStyle: { fill: '#18181b', fontWeight: 600, fontSize: 11 },
        labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
        labelBgPadding: [4, 3],
        labelBgBorderRadius: 4,
    }));

    setNodes(newNodes);
    setEdges(newEdges);
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
      // In a real implementation, we would call the AI service
      // For now we simulate or use the actual flow if available
      const input: ConceptMapInput = { topic, additionalDetails: details };
      // NOTE: This assumes generateConceptMap returns the structure we need.
      // If it returns a raw string/markdown, we'd need to parse it here.
      // Based on file names, it seems to return a structured object.
      
      const result = unwrapAIActionResult(await generateConceptMap(input));
      
      if (result) {
         mapDataToFlowElements(result);
         setComposerOpen(false);
         toast({ title: 'Concept Map Generated', description: `Created map for: ${topic}` });
      }

    } catch (error) {
      setGenerationError(getAIErrorMessage(error));
    } finally {
      generationInProgressRef.current = false;
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    const element = document.querySelector('.react-flow') as HTMLElement;
    if (!element) return;

    try {
        const canvas = await html2canvas(element);
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'landscape',
        });
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`concept-map-${topic.replace(/\s+/g, '-')}.pdf`);
        
        toast({ title: 'Downloaded', description: 'Concept map saved as PDF.' });
    } catch (err) {
        console.error('Download failed', err);
        toast({ variant: 'destructive', title: 'Download Failed' });
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-4 md:p-6 gap-6">
       <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Concept Mapper</h1>
          <p className="text-muted-foreground">Visualize relationships between complex ideas.</p>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" onClick={() => {
                setNodes(initialNodes);
                setEdges(initialEdges);
                setTopic('');
                setDetails('');
                setGenerationError(null);
                setComposerOpen(true);
            }}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
            </Button>
            <Button variant="secondary" onClick={handleDownload} disabled={nodes.length <= 1}>
                <Download className="mr-2 h-4 w-4" />
                Export PDF
            </Button>
        </div>
      </div>

      <AIErrorBanner message={generationError} />

      {nodes.length > 1 && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{topic || 'Concept map'}</p>
            <p className="text-xs text-muted-foreground">Active concept workspace</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setComposerOpen(true)}>
            + New topic / Edit input
          </Button>
        </div>
      )}

      <div className={nodes.length > 1 && !composerOpen
        ? 'grid grid-cols-1 gap-6 h-full'
        : nodes.length === 1
          ? 'mx-auto w-full max-w-3xl'
          : 'grid grid-cols-1 gap-6 h-full lg:grid-cols-4'}>
        <Card className={`${nodes.length > 1 && !composerOpen ? 'hidden' : nodes.length === 1 ? 'w-full' : 'lg:col-span-1'} p-4 flex flex-col gap-4 h-fit`}>
            <div className="space-y-2">
                <Label>Topic</Label>
                <Input 
                    placeholder="Drop a topic before the syllabus humbles you..."
                    value={topic} 
                    maxLength={200}
                    onChange={e => setTopic(e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label>Details (Optional)</Label>
                <Textarea 
                    placeholder="Focus on specific aspects..." 
                    value={details} 
                    maxLength={5000}
                    onChange={e => setDetails(e.target.value)}
                    className="min-h-[100px]"
                />
            </div>
            <Button data-enter-submit="true" onClick={handleGenerate} disabled={isLoading} className="group relative w-full">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Generate Map
            </Button>

            <div className="mt-4 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <p className="font-semibold mb-1">Tips:</p>
                <ul className="list-disc list-inside space-y-1">
                    <li>Start with a broad topic</li>
                    <li>Add specific focus details</li>
                    <li>Drag nodes to rearrange</li>
                    <li>Export to study later</li>
                </ul>
            </div>
        </Card>

        <Card className={`${nodes.length === 1 ? 'hidden' : nodes.length > 1 && !composerOpen ? '' : 'lg:col-span-3'} h-[600px] lg:h-full border-2 border-muted overflow-hidden relative`}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={{
                    type: 'smoothstep',
                    animated: false,
                    style: { stroke: '#18181b', strokeWidth: 1.5 },
                    labelStyle: { fill: '#18181b', fontWeight: 600, fontSize: 11 },
                    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.95 },
                }}
                fitView
            >
                <Controls />
                <Background />
            </ReactFlow>
            {isLoading && (
                <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-50">
                    <div className="w-full">
                        <GenerationSkeleton kind="map" />
                    </div>
                </div>
            )}
        </Card>
      </div>
    </div>
  );
}
