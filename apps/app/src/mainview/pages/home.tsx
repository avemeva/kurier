import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function Home() {
  const [count, setCount] = useState(0);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">Telegram AI</h1>
          <p className="text-text-secondary">
            Desktop app powered by Electrobun, React 19 & shadcn/ui
          </p>
          <div className="flex gap-2 flex-wrap">
            <Badge className="bg-blue-9 text-white hover:bg-blue-10">Electrobun</Badge>
            <Badge className="bg-blue-9 text-white hover:bg-blue-10">React 19</Badge>
            <Badge className="bg-blue-9 text-white hover:bg-blue-10">Tailwind v4</Badge>
            <Badge className="bg-blue-9 text-white hover:bg-blue-10">shadcn/ui</Badge>
          </div>
        </div>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Demo Pages</CardTitle>
            <CardDescription className="text-text-tertiary">
              Interactive component demos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/demo-chat">
              <Button variant="outline">Chat Demo →</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Radix Sand Palette</CardTitle>
            <CardDescription className="text-text-tertiary">
              12-step color scale from @radix-ui/colors
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-1">
              {[
                { bg: 'bg-sand-1', text: 'text-sand-12' },
                { bg: 'bg-sand-2', text: 'text-sand-12' },
                { bg: 'bg-sand-3', text: 'text-sand-12' },
                { bg: 'bg-sand-4', text: 'text-sand-12' },
                { bg: 'bg-sand-5', text: 'text-sand-12' },
                { bg: 'bg-sand-6', text: 'text-sand-12' },
                { bg: 'bg-sand-7', text: 'text-sand-1' },
                { bg: 'bg-sand-8', text: 'text-sand-1' },
                { bg: 'bg-sand-9', text: 'text-sand-1' },
                { bg: 'bg-sand-10', text: 'text-sand-1' },
                { bg: 'bg-sand-11', text: 'text-sand-1' },
                { bg: 'bg-sand-12', text: 'text-sand-1' },
              ].map((s, i) => (
                <div
                  key={s.bg}
                  className={`${s.bg} h-10 flex-1 rounded-md flex items-end justify-center pb-1`}
                >
                  <span className={`text-[10px] font-mono ${s.text}`}>{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              {[
                { bg: 'bg-blue-1', text: 'text-blue-12' },
                { bg: 'bg-blue-2', text: 'text-blue-12' },
                { bg: 'bg-blue-3', text: 'text-blue-12' },
                { bg: 'bg-blue-4', text: 'text-blue-12' },
                { bg: 'bg-blue-5', text: 'text-blue-12' },
                { bg: 'bg-blue-6', text: 'text-blue-12' },
                { bg: 'bg-blue-7', text: 'text-white' },
                { bg: 'bg-blue-8', text: 'text-white' },
                { bg: 'bg-blue-9', text: 'text-white' },
                { bg: 'bg-blue-10', text: 'text-white' },
                { bg: 'bg-blue-11', text: 'text-white' },
                { bg: 'bg-blue-12', text: 'text-white' },
              ].map((s, i) => (
                <div
                  key={s.bg}
                  className={`${s.bg} h-10 flex-1 rounded-md flex items-end justify-center pb-1`}
                >
                  <span className={`text-[10px] font-mono ${s.text}`}>{i + 1}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Counter</CardTitle>
            <CardDescription className="text-text-tertiary">
              Interactive state + shadcn buttons
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Button onClick={() => setCount((c) => c + 1)}>Count: {count}</Button>
              <Button variant="outline" onClick={() => setCount(0)}>
                Reset
              </Button>
              <Button variant="destructive" onClick={() => setCount(-1)}>
                Break
              </Button>
              <Button variant="ghost" onClick={() => setCount(42)}>
                42
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Text Hierarchy</CardTitle>
            <CardDescription className="text-text-tertiary">
              FiraCode Nerd Font + Radix sand text colors
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-text-primary font-bold">Primary — sand-12</p>
            <p className="text-text-secondary">Secondary — sand-11</p>
            <p className="text-text-tertiary">Tertiary — sand-10</p>
            <p className="text-text-quaternary">Quaternary — sand-9</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stack</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { name: 'Electrobun', desc: 'Native desktop runtime' },
                { name: 'React 19', desc: 'UI framework' },
                { name: 'Tailwind CSS v4', desc: 'CSS-first config' },
                { name: 'shadcn/ui', desc: 'Component library' },
                { name: 'Radix Colors', desc: 'Sand palette' },
                { name: 'Biome', desc: 'Linter & formatter' },
              ].map((item) => (
                <div
                  key={item.name}
                  className="rounded-lg border border-sand-6 bg-sand-2 p-3 space-y-1 hover:bg-sand-3 transition-colors"
                >
                  <p className="font-medium text-sm text-text-primary">{item.name}</p>
                  <p className="text-xs text-text-tertiary">{item.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
