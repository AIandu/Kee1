import React, { useState } from 'react';
import { useRoute, Link } from 'wouter';
import { 
  useGetProject, 
  useGetProjectAnalyses, 
  useGetProjectRelationships,
  useApproveAnalysis,
  useAnalyzeProject,
  AnalysisConfidenceLevel,
  AnalysisRole
} from '@workspace/api-client-react';
import { 
  ArrowLeft, Search, Code, LineChart, FileText, DollarSign, ShieldCheck, 
  Play, ExternalLink, Check, X, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';

const roleConfig = {
  [AnalysisRole.researcher]: { icon: Search, color: 'text-blue-500', label: 'Researcher' },
  [AnalysisRole.engineering_reviewer]: { icon: Code, color: 'text-emerald-500', label: 'Engineering' },
  [AnalysisRole.product_analyst]: { icon: LineChart, color: 'text-purple-500', label: 'Product' },
  [AnalysisRole.documentation_specialist]: { icon: FileText, color: 'text-orange-500', label: 'Documentation' },
  [AnalysisRole.market_evaluator]: { icon: DollarSign, color: 'text-green-600', label: 'Market' },
  [AnalysisRole.governor]: { icon: ShieldCheck, color: 'text-primary', label: 'Governor' },
};

const confConfig = {
  [AnalysisConfidenceLevel.confirmed]: { bg: 'bg-primary/20', text: 'text-primary', label: 'Confirmed' },
  [AnalysisConfidenceLevel.inferred]: { bg: 'bg-secondary/30', text: 'text-secondary-foreground', label: 'Inferred' },
  [AnalysisConfidenceLevel.unknown]: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Unknown' },
};

export default function ProjectDetail() {
  const [, params] = useRoute('/projects/:id');
  const projectId = parseInt(params?.id || '0', 10);
  const { toast } = useToast();

  const { data: project, isLoading: projLoading } = useGetProject(projectId, { query: { enabled: !!projectId } });
  const { data: analyses, isLoading: analysesLoading, refetch: refetchAnalyses } = useGetProjectAnalyses(projectId, { query: { enabled: !!projectId } });
  const { data: rels } = useGetProjectRelationships(projectId, { query: { enabled: !!projectId } });

  const analyzeMut = useAnalyzeProject();
  const approveMut = useApproveAnalysis();

  const [governorNotes, setGovernorNotes] = useState<Record<number, string>>({});

  if (projLoading || analysesLoading) {
    return <div className="p-12 animate-pulse"><div className="h-8 bg-muted w-1/3 mb-8"></div></div>;
  }

  if (!project) return <div className="p-12">Project not found</div>;

  const handleAnalyze = () => {
    analyzeMut.mutate({ id: projectId, data: {} }, {
      onSuccess: () => {
        toast({ title: 'Analysis queued', description: 'The AI Council is analyzing the project.' });
      }
    });
  };

  const handleVerdict = (analysisId: number, status: 'approved' | 'rejected') => {
    approveMut.mutate({
      id: analysisId,
      data: { status, note: governorNotes[analysisId] }
    }, {
      onSuccess: () => {
        toast({ title: `Analysis ${status}` });
        refetchAnalyses();
      }
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-12 space-y-12">
      <Link href="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Link>

      <header className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-4xl font-serif text-foreground">{project.name}</h1>
            <span className={`px-2.5 py-1 text-xs font-mono uppercase tracking-wider rounded-md ${
              project.status === 'ready_for_market' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              {project.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-lg text-muted-foreground max-w-3xl">
            {project.inferredDescription || project.description || 'No description available.'}
          </p>
          {project.repoUrl && (
            <a href={project.repoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center mt-4 text-sm text-primary hover:underline">
              <ExternalLink className="w-4 h-4 mr-1.5" /> Repository
            </a>
          )}
        </div>
        <Button onClick={handleAnalyze} disabled={analyzeMut.isPending} className="gap-2 bg-foreground text-background hover:bg-foreground/90">
          <Play className="w-4 h-4" /> 
          {analyzeMut.isPending ? 'Queuing...' : 'Trigger Full Analysis'}
        </Button>
      </header>

      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="font-serif text-xl">AI Council Findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {analyses && analyses.length > 0 ? analyses.map(analysis => {
              const RoleIcon = roleConfig[analysis.role]?.icon || Search;
              const conf = confConfig[analysis.confidenceLevel];
              
              return (
                <div key={analysis.id} className="pb-8 border-b border-border last:border-0 last:pb-0">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-card border border-border rounded-md shadow-sm">
                        <RoleIcon className={`w-5 h-5 ${roleConfig[analysis.role]?.color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{roleConfig[analysis.role]?.label}</p>
                        <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider">{new Date(analysis.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${conf.bg} ${conf.text}`}>
                      {conf.label}
                    </div>
                  </div>
                  
                  <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80 mb-4 whitespace-pre-wrap">
                    {analysis.content}
                  </div>

                  {analysis.governorStatus === 'pending' ? (
                    <div className="bg-primary/5 border border-primary/20 rounded-md p-4 mt-4">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2 flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4" /> Governor Review Required
                      </p>
                      <Textarea 
                        placeholder="Governor notes (optional)..."
                        className="mb-3 text-sm bg-background"
                        value={governorNotes[analysis.id] || ''}
                        onChange={e => setGovernorNotes(prev => ({...prev, [analysis.id]: e.target.value}))}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleVerdict(analysis.id, 'approved')} className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
                          <Check className="w-4 h-4" /> Approve Finding
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleVerdict(analysis.id, 'rejected')} className="gap-1 text-destructive hover:bg-destructive/10">
                          <X className="w-4 h-4" /> Reject
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className={`mt-4 flex items-center gap-2 text-sm ${analysis.governorStatus === 'approved' ? 'text-primary' : 'text-destructive'}`}>
                      {analysis.governorStatus === 'approved' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      <span className="font-medium capitalize">{analysis.governorStatus} by Governor</span>
                      {analysis.governorNote && <span className="text-muted-foreground ml-2">— "{analysis.governorNote}"</span>}
                    </div>
                  )}
                </div>
              );
            }) : (
              <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
                <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p>No analyses performed yet.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Value Indicators</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Value Score</span>
                  <span className="font-mono">{project.valueScore || 0}/100</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${project.valueScore || 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Readiness</span>
                  <span className="font-mono">{project.readinessScore || 0}/100</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-secondary" style={{ width: `${project.readinessScore || 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Opportunity</span>
                  <span className="font-mono">{project.opportunityScore || 0}/100</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-foreground" style={{ width: `${project.opportunityScore || 0}%` }}></div>
                </div>
              </div>
            </CardContent>
          </Card>

          {rels && rels.relationships.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg">Relationships</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {rels.relationships.map((rel, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground capitalize">{rel.relationType.replace(/_/g, ' ')}</span>
                      <Link href={`/projects/${rel.relatedProjectId}`} className="font-medium text-foreground hover:text-primary transition-colors">
                        {rel.relatedProjectName || `Project #${rel.relatedProjectId}`}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {project.tags && project.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {project.tags.map(tag => (
                <span key={tag} className="px-2.5 py-1 bg-muted text-muted-foreground text-xs rounded-md">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
