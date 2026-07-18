import React from 'react';
import { useListTasks, useApproveTask, getListTasksQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ListTodo, CheckCircle2, PlayCircle, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function Tasks() {
  const { data: tasks, isLoading } = useListTasks();
  const approveMut = useApproveTask();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (isLoading) {
    return <div className="p-12 animate-pulse"><div className="h-8 bg-muted w-1/4 mb-8"></div></div>;
  }

  const handleApprove = (id: number, approved: boolean) => {
    approveMut.mutate({ id, data: { approved } }, {
      onSuccess: () => {
        toast({ title: approved ? 'Task Approved' : 'Task Rejected' });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
      }
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-5 h-5 text-secondary" />;
      case 'running': return <PlayCircle className="w-5 h-5 text-primary animate-pulse" />;
      case 'failed': return <AlertTriangle className="w-5 h-5 text-destructive" />;
      case 'awaiting_approval': return <ShieldCheck className="w-5 h-5 text-primary" />;
      default: return <Clock className="w-5 h-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-12 space-y-8">
      <header className="flex items-center gap-4 border-b border-border pb-6">
        <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center">
          <ListTodo className="w-6 h-6 text-secondary" />
        </div>
        <div>
          <h1 className="text-3xl font-serif text-foreground">Task Queue</h1>
          <p className="text-muted-foreground">Monitor autonomous operations and pending approvals.</p>
        </div>
      </header>

      <div className="space-y-4">
        {tasks?.map((task) => (
          <Card key={task.id} className={task.status === 'awaiting_approval' ? 'border-primary shadow-sm' : ''}>
            <CardContent className="p-6 flex flex-col md:flex-row items-start justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="mt-1">
                  {getStatusIcon(task.status)}
                </div>
                <div>
                  <h3 className="font-medium text-foreground text-lg">{task.title}</h3>
                  {task.description && (
                    <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{task.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    <span>{new Date(task.createdAt).toLocaleString()}</span>
                    {task.projectId && (
                      <span className="bg-muted px-2 py-0.5 rounded">Project #{task.projectId}</span>
                    )}
                  </div>
                </div>
              </div>

              {task.status === 'awaiting_approval' && (
                <div className="flex shrink-0 gap-2 w-full md:w-auto">
                  <Button onClick={() => handleApprove(task.id, true)} className="flex-1 md:flex-auto">Approve</Button>
                  <Button variant="outline" onClick={() => handleApprove(task.id, false)} className="flex-1 md:flex-auto border-destructive/30 text-destructive hover:bg-destructive/10">Reject</Button>
                </div>
              )}
              {task.status !== 'awaiting_approval' && (
                <div className="shrink-0 flex items-center h-10 px-3 bg-muted/50 rounded-md">
                  <span className="text-xs font-mono uppercase tracking-wider font-semibold text-foreground/70">{task.status.replace(/_/g, ' ')}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {tasks?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No active tasks.
          </div>
        )}
      </div>
    </div>
  );
}
