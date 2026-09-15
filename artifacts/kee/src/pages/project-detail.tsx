import React, { useState, useEffect, useRef } from 'react';
import { useRoute, Link } from 'wouter';
import {
  useGetProject,
  useGetProjectAnalyses,
  useAnalyzeProject,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Play, ExternalLink, Github, Loader2, AlertCircle, RefreshCw, Copy, Check, Send, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import avatarUrl from '@assets/1783969794751_1784416923551.png';

type Tab = 'overview' | 'code' | 'whitepaper' | 'outreach' | 'chat';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function ChatPanel({ projectId }: { projectId: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Ask me anything about this project — the code, the market, who to pitch, what to fix first. I know it well.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const history = messages.slice(1); // skip the welcome message from history
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: text, history }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { reply: string };
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[520px]">
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 mt-0.5">
                <img src={avatarUrl} alt="Kee" className="w-full h-full object-cover" />
              </div>
            )}
            <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-foreground text-background rounded-br-sm'
                : 'bg-muted text-foreground rounded-bl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 mt-0.5">
              <img src={avatarUrl} alt="Kee" className="w-full h-full object-cover" />
            </div>
            <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-border pt-4 flex gap-2 items-end">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask Kee about this project…"
          className="resize-none min-h-[44px] max-h-32 text-sm"
          rows={1}
        />
        <Button onClick={send} disabled={!input.trim() || loading} size="sm" className="shrink-0 h-10 w-10 p-0">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function MarkdownBlock({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <button
        onClick={copy}
        className="absolute top-3 right-3 p-1.5 rounded bg-muted/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono bg-muted/30 rounded-lg p-5 overflow-x-auto">
        {content}
      </pre>
    </div>
  );
}

export default function ProjectDetail() {
  const [, params] = useRoute('/projects/:id');
  const projectId = parseInt(params?.id || '0', 10);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const { data: project, isLoading: projLoading } = useGetProject(projectId, { query: { enabled: !!projectId } });
  const { data: analyses, isLoading: analysesLoading } = useGetProjectAnalyses(projectId, { query: { enabled: !!projectId } });
  const analyzeMut = useAnalyzeProject();

  const isAnalyzing = project?.status === 'analyzing';

  useEffect(() => {
    if (!isAnalyzing) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/analyses`] });
    }, 5000);
    return () => clearInterval(id);
  }, [isAnalyzing, projectId, queryClient]);

  const handleAnalyze = () => {
    analyzeMut.mutate(
      { id: projectId, data: {} },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
          toast({ title: 'Kee is reading your code…', description: 'Analysis running in background. This takes 60–90 seconds.' });
        },
        onError: (e: unknown) => {
          const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? String(e);
          toast({ title: 'Analysis failed', description: msg, variant: 'destructive' });
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

  if (projLoading || analysesLoading) {
    return (
      <div className="px-4 py-8 sm:px-8 space-y-6 animate-pulse max-w-4xl mx-auto">
        <div className="h-4 bg-muted rounded w-24" />
        <div className="h-10 bg-muted rounded w-1/2" />
        <div className="h-64 bg-muted rounded" />
      </div>
    );
  }

  if (!project) return <div className="p-8 text-muted-foreground">Project not found.</div>;

  const byRole = (role: string) => analyses?.find(a => a.role === role);
  const governor = byRole('governor');
  const codeAudit = byRole('researcher');
  const engineering = byRole('engineering_reviewer');
  const whitePaper = byRole('product_analyst');
  const outreach = byRole('documentation_specialist');
  const market = byRole('market_evaluator');

  const hasResults = (analyses?.length ?? 0) > 0;
  const hasScores = project.valueScore != null;

  const tabs: { id: Tab; label: string; available: boolean }[] = [
    { id: 'overview', label: 'Overview', available: true },
    { id: 'code', label: 'Code Analysis', available: hasResults },
    { id: 'whitepaper', label: 'White Paper', available: !!whitePaper },
    { id: 'outreach', label: 'Outreach', available: !!(outreach || market) },
    { id: 'chat', label: '💬 Ask Kee', available: true },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-10 space-y-8">

      {/* Back */}
      <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors gap-1.5">
        <ArrowLeft className="w-4 h-4" /> Portfolio
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-serif text-foreground">{project.name}</h1>
            {project.repoUrl && (
              <a href={project.repoUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center mt-2 text-sm text-primary hover:underline gap-1.5">
                <Github className="w-4 h-4" />
                {project.repoUrl.replace('https://github.com/', '')}
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
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
              : analyzeMut.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting…</>
              : <><Play className="w-4 h-4" /> {hasResults ? 'Re-analyze' : 'Analyze with Kee'}</>}
          </Button>
        </div>

        <p className="text-muted-foreground text-base leading-relaxed">
          {project.inferredDescription || project.description || 'Run Kee\'s analysis to generate an intelligent description.'}
        </p>

        {project.tags && project.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {project.tags.map(tag => (
              <span key={tag} className="px-2.5 py-0.5 bg-muted text-muted-foreground text-xs rounded font-mono">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Analyzing progress */}
      {isAnalyzing && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-primary">Kee is reading your code…</p>
              <RefreshCw className="w-4 h-4 text-primary animate-spin" />
            </div>
            <div className="space-y-2">
              {['Code Audit', 'Improvement Plan', 'White Paper', 'Outreach Strategy', 'Market Analysis', 'Kee\'s Summary'].map((step, i) => {
                const roles = ['researcher', 'engineering_reviewer', 'product_analyst', 'documentation_specialist', 'market_evaluator', 'governor'];
                const done = !!byRole(roles[i]);
                return (
                  <div key={step} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${done ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                    <span className={`text-xs ${done ? 'text-primary font-medium' : 'text-muted-foreground'}`}>{step}</span>
                    {done && <Check className="w-3 h-3 text-primary ml-auto" />}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scores */}
      {hasScores && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Value', value: project.valueScore, color: 'bg-primary' },
            { label: 'Readiness', value: project.readinessScore, color: 'bg-secondary' },
            { label: 'Opportunity', value: project.opportunityScore, color: 'bg-foreground' },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-light mb-1">{value ?? '—'}<span className="text-xs text-muted-foreground">/100</span></p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full`} style={{ width: `${value ?? 0}%` }} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Financials */}
      {(project.estimatedMarketValue || project.estimatedBuildCost) && (
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-light text-primary">{formatCurrency(project.estimatedMarketValue)}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Market Value</p>
          </div>
          <div>
            <p className="text-xl font-light">{formatCurrency(project.estimatedBuildCost)}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">Build Cost</p>
          </div>
          {project.estimatedMarketValue && project.estimatedBuildCost ? (
            <div>
              <p className="text-xl font-light text-primary">
                {(project.estimatedMarketValue / project.estimatedBuildCost).toFixed(1)}×
              </p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">ROI Multiple</p>
            </div>
          ) : <div />}
        </div>
      )}

      {/* Tabs */}
      {hasResults && (
        <div className="space-y-6">
          <div className="flex gap-1 border-b border-border overflow-x-auto">
            {tabs.filter(t => t.available).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {activeTab === 'overview' && governor && (
            <div className="space-y-4">
              <div className="prose prose-sm max-w-none">
                <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap">{governor.content}</p>
              </div>
              {project.primaryLanguage && (
                <p className="text-xs text-muted-foreground font-mono">Primary language: {project.primaryLanguage}</p>
              )}
            </div>
          )}

          {/* Code Analysis tab */}
          {activeTab === 'code' && (
            <div className="space-y-6">
              {codeAudit && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Code Audit</h3>
                  <MarkdownBlock content={codeAudit.content} />
                </div>
              )}
              {engineering && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Improvement Roadmap</h3>
                  <MarkdownBlock content={engineering.content} />
                </div>
              )}
              {!codeAudit && !engineering && (
                <p className="text-muted-foreground text-sm">Code analysis not available.</p>
              )}
            </div>
          )}

          {/* White Paper tab */}
          {activeTab === 'whitepaper' && whitePaper && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Generated README.md</h3>
                <span className="text-xs text-muted-foreground">Ready to paste into GitHub</span>
              </div>
              <MarkdownBlock content={whitePaper.content} />
            </div>
          )}

          {/* Outreach tab */}
          {activeTab === 'outreach' && (
            <div className="space-y-6">
              {outreach && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Outreach Strategy</h3>
                  <MarkdownBlock content={outreach.content} />
                </div>
              )}
              {market && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Market Report</h3>
                  <MarkdownBlock content={market.content} />
                </div>
              )}
            </div>
          )}

          {/* Chat tab */}
          {activeTab === 'chat' && (
            <ChatPanel projectId={projectId} />
          )}
        </div>
      )}

      {/* No results yet */}
      {!hasResults && !isAnalyzing && (
        <div className="text-center py-20 border border-dashed border-border rounded-lg">
          <AlertCircle className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground mb-1">No analysis yet</p>
          <p className="text-xs text-muted-foreground/70 mb-6">
            {project.repoUrl
              ? 'Tap "Analyze with Kee" to scan this repository.'
              : 'Add a GitHub URL then run analysis.'}
          </p>
          {project.repoUrl && (
            <Button onClick={handleAnalyze} disabled={analyzeMut.isPending} size="sm" className="gap-2">
              <Play className="w-4 h-4" /> Analyze with Kee
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
