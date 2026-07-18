import React, { useState } from 'react';
import { useGetDailyCompanion, useCreateVaultEntry, VaultEntryInputEntryType } from '@workspace/api-client-react';
import avatarUrl from '@assets/1783969794751_1784416923551.png';
import { motion } from 'framer-motion';
import { Plus, Send, Clock, Activity, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function Companion() {
  const { data: companion, isLoading } = useGetDailyCompanion();
  const [idea, setIdea] = useState('');
  const createVaultEntryMut = useCreateVaultEntry();
  const { toast } = useToast();

  const handleSaveIdea = () => {
    if (!idea.trim()) return;
    
    createVaultEntryMut.mutate({
      data: {
        title: 'Quick Capture Idea',
        content: idea,
        entryType: VaultEntryInputEntryType.idea
      }
    }, {
      onSuccess: () => {
        toast({ title: 'Saved to Master Vault' });
        setIdea('');
      }
    });
  };

  if (isLoading || !companion) {
    return (
      <div className="p-12 animate-pulse space-y-8">
        <div className="h-12 bg-muted rounded w-1/3"></div>
        <div className="h-64 bg-muted rounded"></div>
        <div className="h-40 bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-12 space-y-12">
      <header className="flex items-end justify-between border-b border-border pb-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-full overflow-hidden shadow-sm border border-border">
            <img src={avatarUrl} alt="Kee" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-sm font-mono text-muted-foreground uppercase tracking-widest mb-1">{companion.date}</p>
            <h1 className="text-3xl font-serif text-foreground">{companion.greeting}</h1>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-end">
            <span className="text-2xl font-light text-primary">{companion.pendingApprovals || 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Pending Approvals</span>
          </div>
          <div className="w-px h-10 bg-border mx-2"></div>
          <div className="flex flex-col items-end">
            <span className="text-2xl font-light text-foreground">{companion.projectsAwaitingAnalysis || 0}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Awaiting Analysis</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-12">
        <div className="col-span-8 space-y-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
              <Activity className="w-4 h-4" /> Activity Feed
            </h2>
            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
              {companion.recentActivity.map((activity, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  key={activity.id} 
                  className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-card shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                    {activity.type === 'project_added' ? <Plus className="w-4 h-4 text-primary" /> :
                     activity.type === 'analysis_completed' ? <CheckCircle2 className="w-4 h-4 text-secondary" /> :
                     activity.type === 'vault_entry' ? <FileText className="w-4 h-4 text-muted-foreground" /> :
                     <Clock className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <Card className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] hover:border-primary/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-mono text-muted-foreground">
                          {new Date(activity.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        {activity.projectName && (
                          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-sm">
                            {activity.projectName}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground">{activity.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
              {companion.recentActivity.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-8">No recent activity to report.</p>
              )}
            </div>
          </section>
        </div>

        <div className="col-span-4 space-y-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-6">Private Idea Studio</h2>
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-5 space-y-4">
                <Textarea 
                  placeholder="Capture a thought, prompt, or directive..." 
                  className="min-h-[120px] bg-background resize-none focus-visible:ring-primary/30"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleSaveIdea();
                    }
                  }}
                />
                <Button 
                  className="w-full gap-2" 
                  onClick={handleSaveIdea}
                  disabled={!idea.trim() || createVaultEntryMut.isPending}
                >
                  <Send className="w-4 h-4" /> Save to Vault
                </Button>
              </CardContent>
            </Card>
          </section>

          {companion.ideaPrompts && companion.ideaPrompts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">Suggested Focus</h2>
              <ul className="space-y-3">
                {companion.ideaPrompts.map((prompt, i) => (
                  <li key={i} className="text-sm p-3 bg-card border border-border rounded-md text-foreground/80 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors">
                    {prompt}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
