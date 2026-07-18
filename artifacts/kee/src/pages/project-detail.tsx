import React, { useState, useEffect } from 'react';
import { useRoute, Link } from 'wouter';
import {
  useGetProject,
  useGetProjectAnalyses,
  useApproveAnalysis,
  useAnalyzeProject,
  AnalysisConfidenceLevel,
  AnalysisRole
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Search, Code, LineChart, FileText, DollarSign, ShieldCheck,
  Play, ExternalLink, Check, X, AlertCircle, Loader2, Github, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';

const roleConfig: Record<string, { icon: React.ElementType; color: string; label: string; description: string }> = {
  [AnalysisRole.researcher]: {
    icon: Search, color: 'text-blue-500',
    label: 'Researcher',
    description: 'Establishes factual, verifiable truth about the repository',
  },
  [AnalysisRole.engineering_reviewer]: {
    icon: Code, color: 'text-emerald-500',
    label: 'Engineering Reviewer',
    description: 'Assesses architecture, code quality, and technical risk',
  },
  [AnalysisRole.product_analyst]: {
    icon: LineChart, color: 'text-purple-500',
    label: 'Product Analyst',
    description: 'Identifies user value, feature gaps, and ICP',
  },
  [AnalysisRole.documentation_specialist]: {
    icon: FileText, color: 'text-orange-500',
    label: 'Documentation Specialist',
    description: 'Evaluates knowledge transfer readiness and enterprise adoptability',
  },
  [AnalysisRole.market_evaluator]: {
    icon: DollarSign, color: 'text-green-600',
    label: 'Market Evaluator',
    description: 'Maps competitive landscape, TAM, and acquisition value',
  },
  [AnalysisRole.governor]: {
    icon: ShieldCheck, color: 'text-primary',
    label: 'Governor',
    description: 'Synthesizes all findings and produces the final verified verdict',
  },
};

const confConfig: Record<string, { bg: string; text: string; label: string }> = {
  [AnalysisConfidenceLevel.confirmed]: { bg: 'bg-primary/20', text: 'text-primary', label: 'Confirmed' },
  [AnalysisConfidenceLevel.inferred]: { bg: 'bg-secondary/30', text: 'text-secondary-foreground', label: 'Inferred' },
  [AnalysisConfidenceLevel.unknown]: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Unknown' },
};

const COUNCIL_STEPS = [
  { key: AnalysisRole.researcher, label: 'Researcher' },
  { key: AnalysisRole.engineering_reviewer, label: 'Engineering' },
  { key: AnalysisRole.product_analyst, label: 'Product' },
  { key: AnalysisRole.documentation_specialist, label: 'Documentation' },
  { key: AnalysisRole.market_evaluator, label: 'Market' },
  { key: AnalysisRole.governor, label: 'Governor' },
];

export default function ProjectDetail() {
  const [, params] = useRoute('/projects/:id');
  const projectId = parseInt(params?.id || '0', 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: project, isLoading: projLoading } = useGetProject(projectId, { query: { enabled: !!projectId } });
  const { data: analyses, isLoading: analysesLoading } = useGetProjectAnalyses(projectId, { query: { enabled: !!projectId } });

  const analyzeMut = useAnalyzeProject();
  const approveMut = useApproveAnalysis();
  const [governorNotes, setGovernorNotes] = useState<Record<number, string>>({});

  const isAnalyzing = project?.status === 'analyzing';
  const completedRoles = new Set((analyses ?? []).map(a => a.role));

  // Poll while analyzing
  useEffect(() => {
    if (!isAnalyzing) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/analyses`] });
    }, 5000);
    return () => clearInterval(id);
  }, [isAnalyzing, projectId, queryClient]);

  if (projLoading || analysesLoading) {
    return (
      <div className="p-12 space-y-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-24" />
        <div className="h-10 bg-muted rounded w-1/3" />
        <div className="h-4 bg-muted rounded w-2/3" />
      </div>
    );
  }

  if (!project) return <div className="p-12 text-muted-foreground">Project not found.</div>;

  const handleAnalyze = () => {
    analyzeMut.mutate(
      { id: projectId, data: {} },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
          toast({ title: 'Council convening', description: 'Fetching your GitHub repo and queuing all six council members.' });
        },
        onError: (e: unknown) => {
          const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e);
          toast({ title: 'Analysis failed', description: msg, variant: 'destructive' });
        },
      }
    );
  };

  const handleVerdict = (analysisId: number, status: 'approved' | 'rejected') => {
    approveMut.mutate(
      { id: analysisId, data: { status, note: governorNotes[analysisId] } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/analyses`] });
          toast({ title: `Finding ${status}` });
        },
      }
    );
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (!val) return '—';
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${Math.round(val / 1_000)}K`;
    return `$${val}`;
  };

  return (
    <div className="max-w-6xl mx-auto p-12 space-y-10">
      <Link href="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Link>

      {/* Header */}
      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="text-4xl font-serif text-foreground">{project.name}</h1>
            <span className={`px-2.5 py-1 text-xs font-mono uppercase tracking-wider rounded-md flex items-center gap-1 ${
              project.status === 'ready_for_market' ? 'bg-primary/10 text-primary' :
              project.status === 'analyzed' ? 'bg-secondary/20 text-secondary-foreground' :
              project.status === 'analyzing' ? 'bg-muted text-muted-foreground' :
              'bg-muted text-muted-foreground'
            }`}>
              {project.status === 'analyzing' && <Loader2 className="w-3 h-3 animate-spin" />}
              {project.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-base text-muted-foreground max-w-2xl">
            {project.inferredDescription || project.description || 'No description yet. Run the AI Council to generate one.'}
          </p>
          {project.repoUrl && (
            <a href={project.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center mt-3 text-sm text-primary hover:underline gap-1.5">
              <Github className="w-4 h-4" /> {project.repoUrl.replace('https://github.com/', '')}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={analyzeMut.isPending || isAnalyzing}
          className="shrink-0 gap-2 bg-foreground text-background hover:bg-foreground/90"
        >
          {isAnalyzing
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
            : analyzeMut.isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Queuing...</>
            : <><Play className="w-4 h-4" /> {(analyses?.length ?? 0) > 0 ? 'Re-analyze' : 'Run AI Council'}</>
          }
        </Button>
      </header>

      {/* Analyzing — progress tracker */}
      {isAnalyzing && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-sm font-semibold text-primary">Council in session</p>
                <p className="text-xs text-muted-foreground mt-0.5">Members are reading your repository and forming their findings...</p>
              </div>
              <RefreshCw className="w-4 h-4 text-primary animate-spin" />
            </div>
            <div className="grid grid-cols-6 gap-2">
              {COUNCIL_STEPS.map(step => {
                const done = completedRoles.has(step.key);
                return (
                  <div key={step.key} className="text-center">
                    <div className={`h-1.5 rounded-full mb-2 ${done ? 'bg-primary' : 'bg-muted'}`} />
                    <p className={`text-xs ${done ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{step.label}</p>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              {completedRoles.size} of {COUNCIL_STEPS.length} members reported — refreshing automatically
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-8">
        {/* Council findings */}
        <div className="col-span-2 space-y-6">
          <h2 className="text-lg font-medium text-foreground">AI Council Findings</h2>

          {(analyses?.length ?? 0) === 0 && !isAnalyzing && (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-lg">
              <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium mb-1">No analysis yet</p>
              <p className="text-xs opacity-70">
                {project.repoUrl
                  ? 'Click "Run AI Council" to send this repo to all six council members.'
                  : 'Add a GitHub URL to this project first, then run the council.'
                }
              </p>
            </div>
          )}

          {(analyses ?? []).map(analysis => {
            const config = roleConfig[analysis.role] ?? roleConfig[AnalysisRole.researcher];
            const RoleIcon = config.icon;
            const conf = confConfig[analysis.confidenceLevel] ?? confConfig[AnalysisConfidenceLevel.unknown];
            const isGovernor = analysis.role === AnalysisRole.governor;

            return (
              <Card key={analysis.id} className={isGovernor ? 'border-primary/30 bg-primary/3' : ''}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-card border border-border rounded-md shadow-sm">
                        <RoleIcon className={`w-5 h-5 ${config.color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{config.label}</p>
                        <p className="text-xs text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${conf.bg} ${conf.text}`}>
                        {conf.label}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(analysis.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="text-sm text-foreground/85 whitespace-pre-wrap leading-relaxed font-mono bg-muted/30 rounded-md p-4 max-h-80 overflow-y-auto">
                    {analysis.content}
                  </div>

                  {/* Governor approval controls */}
                  {!isGovernor && analysis.governorStatus === 'pending' && (
                    <div className="mt-4 bg-primary/5 border border-primary/20 rounded-md p-4">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3 flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4" /> Your Approval Required
                      </p>
                      <Textarea
                        placeholder="Governor notes (optional)..."
                        className="mb-3 text-sm bg-background resize-none"
                        rows={2}
                        value={governorNotes[analysis.id] ?? ''}
                        onChange={e => setGovernorNotes(prev => ({ ...prev, [analysis.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleVerdict(analysis.id, 'approved')} className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
                          <Check className="w-3.5 h-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleVerdict(analysis.id, 'rejected')} className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10">
                          <X className="w-3.5 h-3.5" /> Reject
                        </Button>
                      </div>
                    </div>
                  )}

                  {!isGovernor && analysis.governorStatus !== 'pending' && (
                    <div className={`mt-3 flex items-center gap-2 text-xs ${analysis.governorStatus === 'approved' ? 'text-primary' : 'text-destructive'}`}>
                      {analysis.governorStatus === 'approved' ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                      <span className="font-medium capitalize">{analysis.governorStatus} by Governor</span>
                      {analysis.governorNote && <span className="text-muted-foreground">— "{analysis.governorNote}"</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Value Indicators</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                { label: 'Value Score', value: project.valueScore, color: 'bg-primary' },
                { label: 'Readiness', value: project.readinessScore, color: 'bg-secondary' },
                { label: 'Opportunity', value: project.opportunityScore, color: 'bg-foreground' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono text-xs">{value != null ? `${value}/100` : '—'}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${value ?? 0}%` }} />
                  </div>
                </div>
              ))}

              {(project.estimatedMarketValue || project.estimatedBuildCost) && (
                <div className="pt-4 border-t border-border space-y-3">
                  {project.estimatedMarketValue ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Market Value</span>
                      <span className="font-mono text-primary font-medium">{formatCurrency(project.estimatedMarketValue)}</span>
                    </div>
                  ) : null}
                  {project.estimatedBuildCost ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Build Cost</span>
                      <span className="font-mono">{formatCurrency(project.estimatedBuildCost)}</span>
                    </div>
                  ) : null}
                  {project.estimatedMarketValue && project.estimatedBuildCost ? (
                    <div className="flex justify-between text-sm pt-2 border-t border-border">
                      <span className="text-muted-foreground">ROI Multiple</span>
                      <span className="font-mono text-sm font-semibold">
                        {(project.estimatedMarketValue / project.estimatedBuildCost).toFixed(1)}×
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>

          {project.tags && project.tags.length > 0 && (
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Tags</p>
              <div className="flex flex-wrap gap-2">
                {project.tags.map(tag => (
                  <span key={tag} className="px-2.5 py-1 bg-muted text-muted-foreground text-xs rounded-md font-mono">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {project.primaryLanguage && (
            <Card>
              <CardContent className="p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Primary Language</span>
                  <span className="font-mono font-medium">{project.primaryLanguage}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
