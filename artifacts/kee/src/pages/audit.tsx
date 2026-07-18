import React from 'react';
import { useListAuditLogs, useApproveAuditLog, getListAuditLogsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { History, CheckCircle2, XCircle, Shield, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function Audit() {
  const { data: logs, isLoading } = useListAuditLogs();
  const approveMut = useApproveAuditLog();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (isLoading) {
    return <div className="p-12 animate-pulse"><div className="h-8 bg-muted w-1/4 mb-8"></div></div>;
  }

  const handleApproval = (id: number, status: 'approved' | 'rejected') => {
    approveMut.mutate({ id, data: { status } }, {
      onSuccess: () => {
        toast({ title: `Change ${status}` });
        queryClient.invalidateQueries({ queryKey: getListAuditLogsQueryKey() });
      }
    });
  };

  return (
    <div className="max-w-5xl mx-auto p-12 space-y-8">
      <header className="flex items-center gap-4 border-b border-border pb-6">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
          <History className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-serif text-foreground">Change Audit</h1>
          <p className="text-muted-foreground">Review and govern automated system changes.</p>
        </div>
      </header>

      <div className="space-y-4">
        {logs?.map((log) => (
          <Card key={log.id} className={`border-l-4 ${
            log.approvalStatus === 'pending' ? 'border-l-primary bg-primary/5' :
            log.approvalStatus === 'approved' ? 'border-l-secondary bg-card' :
            'border-l-destructive bg-card'
          }`}>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-1 bg-background border border-border rounded text-xs font-mono font-medium capitalize">
                      {log.agent}
                    </span>
                    <span className="text-sm font-medium text-foreground">{log.action}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>
                  
                  {log.reason && (
                    <p className="text-sm text-muted-foreground italic border-l-2 border-muted pl-3">
                      "{log.reason}"
                    </p>
                  )}

                  {(log.before || log.after) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 font-mono text-xs">
                      {log.before && (
                        <div className="bg-destructive/5 text-destructive-foreground/80 p-3 rounded border border-destructive/20 whitespace-pre-wrap">
                          <span className="block text-destructive font-bold mb-1 opacity-70">BEFORE</span>
                          {log.before}
                        </div>
                      )}
                      {log.after && (
                        <div className="bg-secondary/10 text-secondary-foreground p-3 rounded border border-secondary/20 whitespace-pre-wrap">
                          <span className="block text-secondary-foreground font-bold mb-1 opacity-70">AFTER</span>
                          {log.after}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex md:flex-col gap-2 shrink-0 md:min-w-[140px]">
                  {log.approvalStatus === 'pending' ? (
                    <>
                      <Button size="sm" onClick={() => handleApproval(log.id, 'approved')} className="w-full gap-2 bg-primary hover:bg-primary/90">
                        <CheckCircle2 className="w-4 h-4" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleApproval(log.id, 'rejected')} className="w-full gap-2 text-destructive hover:bg-destructive/10 border-destructive/20">
                        <XCircle className="w-4 h-4" /> Reject
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 justify-end md:justify-start px-3 py-2 bg-muted rounded-md text-sm">
                      {log.approvalStatus === 'approved' ? (
                        <><Shield className="w-4 h-4 text-secondary" /> <span className="text-foreground">Approved</span></>
                      ) : (
                        <><XCircle className="w-4 h-4 text-destructive" /> <span className="text-destructive">Rejected</span></>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {logs?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No audit logs found.
          </div>
        )}
      </div>
    </div>
  );
}
