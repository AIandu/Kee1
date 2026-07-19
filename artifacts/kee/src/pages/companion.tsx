import React, { useState } from 'react';
import { useGetDailyCompanion, useCreateVaultEntry, VaultEntryInputEntryType } from '@workspace/api-client-react';
import avatarUrl from '@assets/1783969794751_1784416923551.png';
import { motion } from 'framer-motion';
import { Plus, Send, Clock, Activity, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

function localGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning, Loretta. Kee has been watching your portfolio.';
  if (h >= 12 && h < 17) return 'Good afternoon, Loretta. Here is your intelligence briefing.';
  if (h >= 17 && h < 21) return 'Good evening, Loretta. Let us review what matters most.';
  return 'Working late, Loretta. Kee is with you.';
}

export default function Companion() {
  const { data: companion, isLoading } = useGetDailyCompanion();
  const [idea, setIdea] = useState('');
  const createVaultEntryMut = useCreateVaultEntry();
  const { toast } = useToast();
  const greeting = localGreeting();

  const handleSaveIdea = () => {
    if (!idea.trim()) return;
    createVaultEntryMut.mutate({
      data: {
        title: 'Quick Capture Idea',
        content: idea,
        entryType: VaultEntryInputEntryType.idea,
      },
    }, {
      onSuccess: () => {
        toast({ title: 'Saved to Master Vault' });
        setIdea('');
      },
    });
  };

  if (isLoading || !companion) {
    return (
      <div className="p-6 animate-pulse space-y-6">
        <div className="h-10 bg-muted rounded w-2/3" />
        <div className="h-48 bg-muted rounded" />
        <div className="h-32 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:px-8 sm:py-12 space-y-10">

      {/* ── Header ── */}
      <header className="border-b border-border pb-8 space-y-6">
        {/* Avatar + greeting */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden shadow-sm border border-border shrink-0">
            <img src={avatarUrl} alt="Kee" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">
              {companion.date}
            </p>
            <h1 className="text-2xl sm:text-3xl font-serif text-foreground leading-snug">
              {greeting}
            </h1>
          </div>
        </div>

        {/* Stats row — full width, side by side, never cut off */}
        <div className="flex items-center gap-6 sm:gap-10">
          <div>
            <span className="text-3xl font-light text-primary block">
              {companion.pendingApprovals ?? 0}
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Pending Approvals
            </span>
          </div>
          <div className="w-px h-10 bg-border" />
          <div>
            <span className="text-3xl font-light text-foreground block">
              {companion.projectsAwaitingAnalysis ?? 0}
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              Awaiting Analysis
            </span>
          </div>
        </div>
      </header>

      {/* ── Body — stacked on mobile, side-by-side on lg ── */}
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-10">

        {/* Activity Feed */}
        <section className="lg:col-span-8 space-y-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Activity className="w-4 h-4" /> Activity Feed
          </h2>

          <div className="space-y-4 relative before:absolute before:left-5 before:top-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
            {companion.recentActivity.map((activity, i) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="relative flex items-start gap-3"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-card shrink-0 shadow-sm z-10">
                  {activity.type === 'project_added'      ? <Plus         className="w-4 h-4 text-primary" /> :
                   activity.type === 'analysis_completed' ? <CheckCircle2 className="w-4 h-4 text-secondary" /> :
                   activity.type === 'vault_entry'        ? <FileText     className="w-4 h-4 text-muted-foreground" /> :
                                                            <Clock        className="w-4 h-4 text-muted-foreground" />}
                </div>
                <Card className="flex-1 hover:border-primary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <span className="text-xs font-mono text-muted-foreground">
                        {new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {activity.projectName && (
                        <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-sm whitespace-nowrap">
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
              <p className="pl-14 text-muted-foreground text-sm py-6">No recent activity to report.</p>
            )}
          </div>
        </section>

        {/* Idea Studio */}
        <section className="lg:col-span-4 space-y-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Private Idea Studio
          </h2>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-5 space-y-4">
              <Textarea
                placeholder="Capture a thought, prompt, or directive…"
                className="min-h-[120px] bg-background resize-none focus-visible:ring-primary/30"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveIdea();
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

          {companion.ideaPrompts && companion.ideaPrompts.length > 0 && (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Suggested Focus
              </h2>
              <ul className="space-y-3">
                {companion.ideaPrompts.map((prompt, i) => (
                  <li
                    key={i}
                    className="text-sm p-3 bg-card border border-border rounded-md text-foreground/80 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  >
                    {prompt}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

      </div>
    </div>
  );
}
