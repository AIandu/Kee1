import React, { useState, useEffect } from 'react';
import { useGetDashboardSummary, useCreateProject, useListProjects } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, Briefcase, FileCode2, Plus, Target, Github, Search, Loader2, Lock, Globe, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface GithubRepo {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  updatedAt: string;
  private: boolean;
}

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function useGithubRepos() {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/github/repos?per_page=100`);
      if (!res.ok) throw new Error(await res.text());
      setRepos(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load repos');
    } finally {
      setLoading(false);
    }
  };

  return { repos, loading, error, fetch: fetch_ };
}

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: projects } = useListProjects();
  const createMut = useCreateProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [search, setSearch] = useState('');
  const [portfolioSearch, setPortfolioSearch] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [form, setForm] = useState({ name: '', repoUrl: '', analysisMode: 'blind', description: '' });
  const { repos, loading: reposLoading, error: reposError, fetch: fetchRepos } = useGithubRepos();

  // Auto-refresh dashboard every 8s if any project is analyzing
  const hasAnalyzing = projects?.some(p => p.status === 'analyzing');
  useEffect(() => {
    if (!hasAnalyzing) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
    }, 8000);
    return () => clearInterval(id);
  }, [hasAnalyzing, queryClient]);

  const openDialog = () => {
    setIsOpen(true);
    setStep('pick');
    setSearch('');
    setForm({ name: '', repoUrl: '', analysisMode: 'blind', description: '' });
    fetchRepos();
  };

  const pickRepo = (repo: GithubRepo) => {
    setForm({
      name: repo.name,
      repoUrl: repo.url,
      analysisMode: 'blind',
      description: repo.description ?? '',
    });
    setStep('form');
  };

  const handleManual = () => {
    setForm({ name: '', repoUrl: '', analysisMode: 'blind', description: '' });
    setStep('form');
  };

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createMut.mutate(
      { data: { name: form.name, repoUrl: form.repoUrl || undefined, analysisMode: form.analysisMode as 'blind' | 'documented', description: form.description || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
          queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
          setIsOpen(false);
          toast({ title: 'Project added', description: `${form.name} is in your portfolio. Open it to run the AI Council.` });
        },
        onError: (e) => {
          toast({ title: 'Error', description: String(e), variant: 'destructive' });
        },
      }
    );
  };

  const filteredRepos = repos.filter(r =>
    r.fullName.toLowerCase().includes(search.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const visibleProjects = (projects ?? []).filter(project => {
    const searchable = [project.name, project.githubOwner, project.githubRepository, project.description]
      .filter(Boolean).join(' ').toLowerCase();
    const classification = project.effectiveClassification ?? project.classification ?? 'unreviewed';
    return (
      (!portfolioSearch || searchable.includes(portfolioSearch.toLowerCase())) &&
      (classificationFilter === 'all' || classification === classificationFilter) &&
      (statusFilter === 'all' || project.status === statusFilter) &&
      (!ownerFilter || (project.githubOwner ?? '').toLowerCase().includes(ownerFilter.toLowerCase()))
    );
  });

  const formatCurrency = (val: number | null | undefined) => {
    if (!val) return '—';
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${Math.round(val / 1_000)}K`;
    return `$${val}`;
  };

  if (isLoading) {
    return (
      <div className="p-12 animate-pulse space-y-8">
        <div className="h-8 bg-muted rounded w-1/4 mb-8" />
        <div className="grid grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded" />)}
        </div>
        <div className="h-96 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-12 space-y-12">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Portfolio Dashboard</h1>
          <p className="text-muted-foreground">Strategic overview of your software assets and their market readiness.</p>
        </div>

        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={openDialog} className="gap-2 bg-foreground text-background hover:bg-foreground/90">
              <Plus className="w-4 h-4" /> Add Project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="font-serif">
                {step === 'pick' ? 'Choose a GitHub Repository' : 'Confirm Project Details'}
              </DialogTitle>
            </DialogHeader>

            {step === 'pick' && (
              <div className="flex flex-col gap-4 flex-1 min-h-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search your repositories..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>

                {reposLoading && (
                  <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Connecting to GitHub...</span>
                  </div>
                )}

                {reposError && (
                  <div className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{reposError}</div>
                )}

                {!reposLoading && !reposError && (
                  <div className="overflow-y-auto flex-1 space-y-1 pr-1" style={{ maxHeight: 360 }}>
                    {filteredRepos.map(repo => (
                      <button
                        key={repo.fullName}
                        onClick={() => pickRepo(repo)}
                        className="w-full text-left px-4 py-3 rounded-lg hover:bg-muted/60 transition-colors group border border-transparent hover:border-border"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {repo.private
                              ? <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              : <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            }
                            <span className="font-medium text-sm text-foreground truncate">{repo.fullName}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                            {repo.language && <span className="font-mono">{repo.language}</span>}
                            {repo.stars > 0 && <span>★ {repo.stars}</span>}
                          </div>
                        </div>
                        {repo.description && (
                          <p className="text-xs text-muted-foreground mt-1 ml-5 line-clamp-1">{repo.description}</p>
                        )}
                      </button>
                    ))}
                    {filteredRepos.length === 0 && !reposLoading && (
                      <p className="text-center text-sm text-muted-foreground py-8">No repositories match your search.</p>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-border">
                  <button onClick={handleManual} className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                    <Github className="w-3.5 h-3.5" /> Enter URL manually instead
                  </button>
                </div>
              </div>
            )}

            {step === 'form' && (
              <div className="space-y-4 py-2">
                {form.repoUrl && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md text-sm text-muted-foreground">
                    <Github className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate font-mono text-xs">{form.repoUrl}</span>
                  </div>
                )}
                <Input
                  placeholder="Project Name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="font-serif text-lg bg-muted/30"
                  autoFocus
                />
                {!form.repoUrl && (
                  <Input
                    placeholder="GitHub Repository URL"
                    value={form.repoUrl}
                    onChange={e => setForm({ ...form, repoUrl: e.target.value })}
                  />
                )}
                <Select value={form.analysisMode} onValueChange={val => setForm({ ...form, analysisMode: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Analysis Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blind">Blind — code only, ignore documentation</SelectItem>
                    <SelectItem value="documented">Documented — use all available context</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Additional context (optional)..."
                  className="resize-none"
                  rows={3}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep('pick')} className="flex-1">Back</Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!form.name.trim() || createMut.isPending}
                    className="flex-1 bg-foreground text-background hover:bg-foreground/90"
                  >
                    {createMut.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Adding...</> : 'Add to Portfolio'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Projects</p>
                <p className="text-2xl font-light text-foreground">{summary?.totalProjects ?? 0}</p>
              </div>
              <div className="p-2 bg-secondary/20 rounded-md"><Briefcase className="w-4 h-4 text-secondary" /></div>
            </div>
            <div className="mt-4 flex items-center text-xs text-muted-foreground">
              <span>{summary?.analyzedProjects ?? 0} fully analyzed</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Avg Value Score</p>
                <p className="text-2xl font-light text-foreground">{Math.round(summary?.avgValueScore || 0)}<span className="text-sm text-muted-foreground">/100</span></p>
              </div>
              <div className="p-2 bg-muted rounded-md"><Target className="w-4 h-4 text-foreground/60" /></div>
            </div>
            <Progress value={summary?.avgValueScore || 0} className="mt-4 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Avg Readiness</p>
                <p className="text-2xl font-light text-foreground">{Math.round(summary?.avgReadinessScore || 0)}<span className="text-sm text-muted-foreground">/100</span></p>
              </div>
              <div className="p-2 bg-muted rounded-md"><FileCode2 className="w-4 h-4 text-foreground/60" /></div>
            </div>
            <Progress value={summary?.avgReadinessScore || 0} className="mt-4 h-1.5 [&>div]:bg-secondary" />
          </CardContent>
        </Card>
      </div>

      {/* Projects table */}
      <section>
        <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-medium text-foreground">Portfolio</h2>
            <span className="text-sm text-muted-foreground">Original estimates are preserved; overrides are shown as effective values.</span>
          </div>
          <div className="flex gap-2">
            <a href={`${API_BASE}/api/projects/export?format=csv`} className="inline-flex items-center gap-2 border border-border rounded-md px-3 py-2 text-xs hover:bg-muted">
              <Download className="w-3.5 h-3.5" /> CSV
            </a>
            <a href={`${API_BASE}/api/projects/export?format=json`} className="inline-flex items-center gap-2 border border-border rounded-md px-3 py-2 text-xs hover:bg-muted">
              <Download className="w-3.5 h-3.5" /> JSON
            </a>
        </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
          <Input value={portfolioSearch} onChange={e => setPortfolioSearch(e.target.value)} placeholder="Search owner, repository, or project" />
          <Input value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} placeholder="GitHub owner" />
          <Select value={classificationFilter} onValueChange={setClassificationFilter}>
            <SelectTrigger><SelectValue placeholder="Classification" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classifications</SelectItem>
              <SelectItem value="sell">SELL</SelectItem>
              <SelectItem value="hold">HOLD</SelectItem>
              <SelectItem value="develop">DEVELOP</SelectItem>
              <SelectItem value="unreviewed">UNREVIEWED</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Analysis status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All analysis statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="analyzing">Analyzing</SelectItem>
              <SelectItem value="analyzed">Analyzed</SelectItem>
              <SelectItem value="ready_for_market">Ready for market</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-4 sm:px-6 font-mono text-xs text-muted-foreground uppercase tracking-wider font-medium">Project</th>
                <th className="px-4 py-4 sm:px-6 font-mono text-xs text-muted-foreground uppercase tracking-wider font-medium">Status</th>
                <th className="hidden sm:table-cell px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider font-medium">Value Score</th>
                <th className="hidden md:table-cell px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider font-medium">Readiness</th>
                <th className="hidden lg:table-cell px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider font-medium text-right">Est. Value</th>
                <th className="px-4 py-4 sm:px-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleProjects.map((project, i) => (
                <motion.tr
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={project.id}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="hover:bg-muted/30 active:bg-muted/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-4 sm:px-6">
                     <div className="font-medium text-foreground">{project.name}</div>
                     <div className="text-xs text-muted-foreground mt-0.5">{project.githubOwner && project.githubRepository ? `${project.githubOwner}/${project.githubRepository}` : project.primaryLanguage || '—'}</div>
                     <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{String(project.effectiveClassification ?? project.classification ?? 'unreviewed')}</div>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                      project.status === 'ready_for_market' ? 'bg-primary/10 text-primary' :
                      project.status === 'analyzed' ? 'bg-secondary/20 text-secondary-foreground' :
                      project.status === 'analyzing' ? 'bg-muted text-muted-foreground' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {project.status === 'analyzing' && <Loader2 className="w-3 h-3 animate-spin" />}
                      {project.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell px-6 py-4">
                    <div className="flex items-center gap-2">
                       <span className="font-mono w-6 text-xs">{project.valueScore ?? '—'}</span>
                       <Progress value={project.valueScore ?? 0} className="w-16 h-1.5" />
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono w-6 text-xs">{project.readinessScore ?? '—'}</span>
                      <Progress value={project.readinessScore ?? 0} className="w-16 h-1.5 [&>div]:bg-secondary" />
                    </div>
                  </td>
                  <td className="hidden lg:table-cell px-6 py-4 text-right font-mono text-sm">
                     <span title="Estimate, not an appraisal">{formatCurrency(project.valueOverride ?? project.estimatedMarketValue)}</span>
                  </td>
                  <td className="px-4 py-4 sm:px-6 text-right">
                    <ArrowUpRight className="w-4 h-4 text-muted-foreground inline-block" />
                  </td>
                </motion.tr>
              ))}
              {visibleProjects.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <div className="space-y-3">
                      <Briefcase className="w-8 h-8 mx-auto text-muted-foreground/40" />
                      <p className="text-muted-foreground text-sm">No projects yet.</p>
                      <p className="text-muted-foreground/60 text-xs">Add a GitHub repository to begin your first AI Council analysis.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
