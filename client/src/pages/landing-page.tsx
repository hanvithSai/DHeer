import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Star, Share2, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShinyButton } from '@/components/ui/shiny-button';
import icon128 from '@assets/icon128_1767721345183.png';

export default function LandingPage() {
  const handleLogin = () => {
    window.location.href = '/api/login';
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-primary/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      {/* Navbar */}
      <nav className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={icon128} alt="DHeer Logo" className="w-10 h-10 drop-shadow-lg" />
          <span className="font-display font-bold text-2xl tracking-tight">DHeer</span>
        </div>
        <div className="flex gap-4">
          <Button variant="ghost" className="hidden sm:flex" onClick={() => window.location.href = '/public'}>
            Explore Public
          </Button>
          <Button variant="outline" className="border-primary/50 hover:bg-primary/10" onClick={handleLogin}>
            Sign In
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto space-y-8"
        >
          <div className="inline-flex items-center px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-4">
            <Star className="w-3 h-3 mr-2 fill-primary" />
            The modern bookmark manager
          </div>
          
          <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight leading-[1.1]">
            Save the web, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-400 to-blue-500 animate-gradient bg-[length:200%_auto]">
              organize your mind.
            </span>
          </h1>
          
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            A beautiful, lightning-fast way to save links, add notes, and organize your digital life. 
            Sync across devices and share with the world.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <ShinyButton className="h-12 px-8 text-lg" onClick={handleLogin}>
              Get Started for Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </ShinyButton>
            <Button 
              variant="secondary" 
              className="h-12 px-8 text-lg bg-white/5 hover:bg-white/10 border border-white/10"
              onClick={() => window.location.href = '/public'}
            >
              Browse Public Feed
            </Button>
          </div>
        </motion.div>

        {/* Feature Grid */}
        <div className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">
          {[
            {
              icon: Search,
              title: "Instant Search",
              desc: "Find anything you've saved in milliseconds with our powerful fuzzy search engine."
            },
            {
              icon: ShieldCheck,
              title: "Private by Default",
              desc: "Your bookmarks are yours. We encrypt your data and never track your browsing history."
            },
            {
              icon: Share2,
              title: "Easy Sharing",
              desc: "Curate collections and share them with a single link, or keep everything private."
            }
          ].map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-primary/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
                <feature.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-8 text-center text-sm text-muted-foreground border-t border-white/5 bg-black/20">
        <p>© 2024 DHeer. Built with precision and care.</p>
      </footer>
    </div>
  );
}
