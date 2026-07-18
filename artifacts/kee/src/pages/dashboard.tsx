import React from 'react';
import { useGetDashboardSummary } from '@workspace/api-client-react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowUpRight, BarChart3, Briefcase, FileCode2, Plus, Target } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DialogHeader } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@radix-ui/react-dialog';
import { SelectTrigger, SelectValue, SelectContent, SelectItem } from '@radix-ui/react-select';
import { Button, Select } from 'react-day-picker';

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();

  if (isLoading || !summary) {
    return (
      <div className="p-12 animate-pulse space-y-8">
        <div className="h-8 bg-muted rounded w-1/4 mb-8"></div>
        <div className="grid grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded"></div>)}
        </div>
        <div className="h-96 bg-muted rounded"></div>
      </div>
    );
  }

  const formatCurrency = (val: number | null | undefined) => {
    if (val == null) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="max-w-7xl mx-auto p-12 space-y-12">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Portfolio Dashboard</h1>
          <p className="text-muted-foreground">Strategic overview of your software assets and their market readiness.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-foreground text-background hover:bg-foreground/90"><Plus className="w-4 h-4" /> Add Project</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="font-serif">Add Software Asset</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Input 
                placeholder="Project Name" 
                value={newProject.name} 
                onChange={e => setNewProject({...newProject, name: e.target.value})} 
                className="font-serif text-lg bg-muted/30"
              />
              <Input 
                placeholder="Repository URL (optional)" 
                value={newProject.repoUrl} 
                onChange={e => setNewProject({...newProject, repoUrl: e.target.value})} 
              />
              <Select value={newProject.analysisMode} onValueChange={val => setNewProject({...newProject, analysisMode: val})}>
                <SelectTrigger>
                  <SelectValue placeholder="Analysis Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="documented">Documented (Uses repo docs)</SelectItem>
                  <SelectItem value="blind">Blind (Ignores docs, code only)</SelectItem>
                </SelectContent>
              </Select>
              <Textarea 
                placeholder="Brief description or context..." 
                className="resize-y"
                value={newProject.description}
                onChange={e => setNewProject({...newProject, description: e.target.value})}
              />
              <Button onClick={handleCreateProject} disabled={!newProject.name || createProjectMut.isPending} className="w-full">
                Add to Portfolio
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Total Value</p>
                <p className="text-2xl font-light text-primary">{formatCurrency(summary.totalEstimatedValue)}</p>
              </div>
              <div className="p-2 bg-primary/10 rounded-md"><BarChart3 className="w-4 h-4 text-primary" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Projects</p>
                <p className="text-2xl font-light text-foreground">{summary.totalProjects}</p>
              </div>
              <div className="p-2 bg-secondary/20 rounded-md"><Briefcase className="w-4 h-4 text-secondary" /></div>
            </div>
            <div className="mt-4 flex items-center text-xs text-muted-foreground">
              <span>{summary.analyzedProjects} fully analyzed</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Avg Value Score</p>
                <p className="text-2xl font-light text-foreground">{Math.round(summary.avgValueScore || 0)}<span className="text-sm text-muted-foreground">/100</span></p>
              </div>
              <div className="p-2 bg-muted rounded-md"><Target className="w-4 h-4 text-foreground/60" /></div>
            </div>
            <Progress value={summary.avgValueScore || 0} className="mt-4 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Avg Readiness</p>
                <p className="text-2xl font-light text-foreground">{Math.round(summary.avgReadinessScore || 0)}<span className="text-sm text-muted-foreground">/100</span></p>
              </div>
              <div className="p-2 bg-muted rounded-md"><FileCode2 className="w-4 h-4 text-foreground/60" /></div>
            </div>
            <Progress value={summary.avgReadinessScore || 0} className="mt-4 h-1.5 [&>div]:bg-secondary" />
          </CardContent>
        </Card>
      </div>

      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-medium text-foreground">Top Projects</h2>
          <span className="text-sm text-muted-foreground">Ranked by Value Score</span>
        </div>
        
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider font-medium">Project</th>
                <th className="px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider font-medium">Status</th>
                <th className="px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider font-medium">Value Score</th>
                <th className="px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider font-medium">Readiness</th>
                <th className="px-6 py-4 font-mono text-xs text-muted-foreground uppercase tracking-wider font-medium text-right">Est. Value</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.topProjects.map((project, i) => (
                <motion.tr 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={project.id} 
                  className="hover:bg-muted/30 transition-colors group"
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-foreground">{project.name}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[200px] mt-1">{project.primaryLanguage || 'Unknown'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      project.status === 'ready_for_market' ? 'bg-primary/10 text-primary' :
                      project.status === 'analyzed' ? 'bg-secondary/20 text-secondary-foreground' :
                      project.status === 'analyzing' ? 'bg-muted text-muted-foreground animate-pulse' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {project.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono w-6">{project.valueScore || '-'}</span>
                      <Progress value={project.valueScore || 0} className="w-16 h-1.5" />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono w-6">{project.readinessScore || '-'}</span>
                      <Progress value={project.readinessScore || 0} className="w-16 h-1.5 [&>div]:bg-secondary" />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono">
                    {formatCurrency(project.estimatedMarketValue)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/projects/${project.id}`} className="inline-flex p-2 hover:bg-background rounded-md text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100">
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                  </td>
                </motion.tr>
              ))}
              {summary.topProjects.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No projects found. Add projects to see them ranked here.
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
