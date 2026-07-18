import React from 'react';
import { Users, Search, Code, LineChart, FileText, DollarSign, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const council = [
  {
    role: 'Researcher',
    icon: Search,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    desc: 'Scours the web, documentation, and repositories to gather concrete evidence and historical context. Never infers, only reports facts.'
  },
  {
    role: 'Engineering Reviewer',
    icon: Code,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    desc: 'Analyzes architecture, code quality, technical debt, and readiness. Identifies implementation risks and estimates build costs.'
  },
  {
    role: 'Product Analyst',
    icon: LineChart,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    desc: 'Evaluates user experience, feature completeness, and product-market fit. Determines what the product actually does versus what it claims.'
  },
  {
    role: 'Documentation Specialist',
    icon: FileText,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    desc: 'Generates clear, concise descriptions, READMEs, and technical docs based on the combined findings of the council.'
  },
  {
    role: 'Market Evaluator',
    icon: DollarSign,
    color: 'text-green-600',
    bg: 'bg-green-600/10',
    desc: 'Assesses monetization potential, market opportunity score, and estimated market value based on similar assets.'
  },
  {
    role: 'Governor',
    icon: ShieldCheck,
    color: 'text-primary',
    bg: 'bg-primary/10',
    desc: 'The final arbiter. You. Reviews all findings, approves or rejects inferences, and directs the council\'s next actions.'
  }
];

export default function Council() {
  return (
    <div className="max-w-6xl mx-auto p-12 space-y-12">
      <header className="text-center max-w-2xl mx-auto mb-16">
        <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Users className="w-8 h-8 text-foreground" />
        </div>
        <h1 className="text-4xl font-serif text-foreground mb-4">The AI Council</h1>
        <p className="text-lg text-muted-foreground">
          Six specialized intelligence agents working in concert to analyze, evaluate, and extract value from your software assets.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {council.map((member) => (
          <Card key={member.role} className="group hover:border-primary/20 transition-all duration-300">
            <CardContent className="p-8">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 ${member.bg}`}>
                <member.icon className={`w-6 h-6 ${member.color}`} />
              </div>
              <h2 className="text-xl font-serif font-medium text-foreground mb-3">{member.role}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {member.desc}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
