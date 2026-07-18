import React, { useState } from 'react';
import { useListVaultEntries, useCreateVaultEntry, useDeleteVaultEntry, getListVaultEntriesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Archive, FileText, MessageSquare, Lightbulb, GitCommit, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const typeIcons = {
  note: FileText,
  document: Archive,
  conversation: MessageSquare,
  idea: Lightbulb,
  decision: GitCommit
};

export default function Vault() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entries, isLoading } = useListVaultEntries();
  const createMut = useCreateVaultEntry();
  const deleteMut = useDeleteVaultEntry();

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<any>('note');

  if (isLoading) {
    return <div className="p-12 animate-pulse"><div className="h-8 bg-muted w-1/4 mb-8"></div></div>;
  }

  const filtered = entries?.filter(e => {
    if (filterType !== 'all' && e.entryType !== filterType) return false;
    if (search && !e.title.toLowerCase().includes(search.toLowerCase()) && !e.content.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCreate = () => {
    createMut.mutate({
      data: {
        title: newTitle,
        content: newContent,
        entryType: newType
      }
    }, {
      onSuccess: () => {
        toast({ title: 'Entry saved to vault' });
        setIsCreateOpen(false);
        setNewTitle('');
        setNewContent('');
        queryClient.invalidateQueries({ queryKey: getListVaultEntriesQueryKey() });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm('Permanently delete this entry?')) {
      deleteMut.mutate({ id }, {
        onSuccess: () => {
          toast({ title: 'Entry deleted' });
          queryClient.invalidateQueries({ queryKey: getListVaultEntriesQueryKey() });
        }
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-12 space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Master Vault</h1>
          <p className="text-muted-foreground">A searchable archive of intelligence, ideas, and decisions.</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> New Entry</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="font-serif">Add to Vault</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Input 
                placeholder="Title" 
                value={newTitle} 
                onChange={e => setNewTitle(e.target.value)} 
                className="font-serif text-lg bg-muted/30"
              />
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger>
                  <SelectValue placeholder="Entry Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="idea">Idea</SelectItem>
                  <SelectItem value="decision">Decision</SelectItem>
                  <SelectItem value="conversation">Conversation</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                </SelectContent>
              </Select>
              <Textarea 
                placeholder="Content..." 
                className="min-h-[200px] resize-y"
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
              />
              <Button onClick={handleCreate} disabled={!newTitle || !newContent || createMut.isPending} className="w-full">
                Save Entry
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex gap-4 items-center bg-card p-2 rounded-lg border border-border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search vault..." 
            className="pl-9 border-none bg-transparent shadow-none focus-visible:ring-0"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="w-px h-6 bg-border"></div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px] border-none shadow-none focus:ring-0">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="note">Notes</SelectItem>
            <SelectItem value="idea">Ideas</SelectItem>
            <SelectItem value="decision">Decisions</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered?.map((entry) => {
          const Icon = typeIcons[entry.entryType as keyof typeof typeIcons] || FileText;
          return (
            <Card key={entry.id} className="group hover:border-primary/30 transition-colors flex flex-col h-[280px]">
              <CardContent className="p-6 flex flex-col h-full relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Icon className="w-4 h-4" />
                    <span className="text-xs font-mono uppercase tracking-wider">{entry.entryType}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="opacity-0 group-hover:opacity-100 absolute top-4 right-4 h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <h3 className="font-serif text-lg font-medium text-foreground mb-2 line-clamp-2">{entry.title}</h3>
                <p className="text-sm text-foreground/70 flex-1 overflow-hidden relative">
                  {entry.content}
                  <span className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-card to-transparent" />
                </p>
                <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </span>
                  {entry.tags && entry.tags.length > 0 && (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{entry.tags[0]}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered?.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            No entries found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
}
