import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Star, Share2, Search, ShieldCheck, Heart, Sparkles, Zap, Brain, MessageCircle } from 'lucide-react';
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
      <main className="relative z-10 flex-1 flex flex-col items-center">
        <section className="px-4 py-20 text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-8"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="inline-flex items-center px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-4"
            >
              <Heart className="w-3 h-3 mr-2 fill-primary" />
              Inspired by Deer — Your Virtual Companion
            </motion.div>
            
            <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight leading-[1.1]">
              <motion.span
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="block"
              >
                A companion that
              </motion.span>
              <motion.span
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-400 to-blue-500 animate-gradient bg-[length:200%_auto]"
              >
                browses with you.
              </motion.span>
            </h1>
            
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
            >
              DHeer isn't just a bookmark manager. It's a virtual companion that lives in your browser, 
              remembers your journey, and keeps you productive with a touch of personality.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center mt-8"
            >
              <ShinyButton className="h-12 px-8 text-lg hover:scale-105 transition-transform" onClick={handleLogin}>
                Start Your Journey
                <ArrowRight className="w-5 h-5 ml-2" />
              </ShinyButton>
              <Button 
                variant="secondary" 
                className="h-12 px-8 text-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:scale-105 transition-transform"
                onClick={() => window.location.href = '/public'}
              >
                Explore Community
              </Button>
            </motion.div>
          </motion.div>
        </section>

        {/* Story Section */}
        <section className="w-full max-w-6xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-16 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-6"
          >
            <h2 className="text-3xl font-bold font-display">More than just storage</h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              We spent thousands of hours browsing the web, losing focus, and forgetting where we found that one amazing resource. 
              Inspired by the concept of a "Deer" — a gentle, watchful companion — we built DHeer to be your browser's guardian.
            </p>
            <ul className="space-y-4">
              {[
                { icon: Sparkles, text: "Acts as a virtual companion that stays with you on every page." },
                { icon: Brain, text: "Remembers what you did and provides context when you need it." },
                { icon: MessageCircle, text: "Cracks jokes and mentions your browsing stats to keep things light." }
              ].map((item, i) => (
                <motion.li 
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + (i * 0.1), duration: 0.5 }}
                  className="flex items-start gap-3"
                >
                  <div className="mt-1 bg-primary/20 p-1 rounded-full"><item.icon className="w-4 h-4 text-primary" /></div>
                  <span>{item.text}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
            className="bg-gradient-to-br from-primary/10 to-blue-500/10 border border-white/10 rounded-3xl p-8 aspect-square flex items-center justify-center relative overflow-hidden group"
          >
             <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
             <div className="z-10 text-center space-y-4">
               <motion.div 
                 animate={{ 
                   scale: [1, 1.1, 1],
                   rotate: [0, 5, -5, 0]
                 }}
                 transition={{ 
                   duration: 4, 
                   repeat: Infinity,
                   ease: "easeInOut"
                 }}
                 className="w-24 h-24 bg-primary/20 rounded-full mx-auto flex items-center justify-center shadow-[0_0_40px_rgba(156,100,251,0.2)]"
               >
                 <Heart className="w-12 h-12 text-primary" />
               </motion.div>
               <p className="text-sm font-medium text-primary uppercase tracking-widest">Active Companion</p>
               <h3 className="text-2xl font-bold italic">"You've been on this page for 20 mins... <br/> Go take a walk, friend!"</h3>
             </div>
          </motion.div>
        </section>

        {/* Feature Grid */}
        <section className="w-full bg-white/5 border-y border-white/5 py-24">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-4xl font-bold font-display">Stay Productive, Stay Sane</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">Designed to improve your digital workflow while looking after your well-being.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: Zap,
                  title: "Productivity Pulse",
                  desc: "DHeer monitors your idle time and motivates you to get back to work or take a much-needed break."
                },
                {
                  icon: Search,
                  title: "Instant Recall",
                  desc: "Find anything you've saved in milliseconds with our powerful multi-field fuzzy search engine."
                },
                {
                  icon: ShieldCheck,
                  title: "Browsing Insights",
                  desc: "Get fun stats about how many websites you've visited and how much time you've spent exploring."
                },
                {
                  icon: Share2,
                  title: "Public Feed",
                  desc: "Share your best finds with the community or discover what other people are bookmarking today."
                },
                {
                  icon: Brain,
                  title: "Smart Tags",
                  desc: "Organize your digital life with an intuitive tagging system that makes categorization effortless."
                },
                {
                  icon: MessageCircle,
                  title: "Sidekick Extension",
                  desc: "A powerful Chrome extension that brings DHeer to every tab, acting as your sidebar companion."
                }
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="p-8 rounded-2xl bg-background border border-white/5 hover:border-primary/30 transition-all hover:shadow-xl hover:shadow-primary/5"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 text-primary">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-4 py-32 text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="space-y-8"
          >
            <h2 className="text-4xl md:text-5xl font-bold font-display leading-tight">Ready to meet your <br/> new digital companion?</h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">Join thousands of users who are organizing their web journey with DHeer.</p>
            <ShinyButton className="h-14 px-10 text-xl" onClick={handleLogin}>
              Create Your Account
              <ArrowRight className="w-6 h-6 ml-2" />
            </ShinyButton>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-12 text-center text-sm text-muted-foreground border-t border-white/5 bg-black/20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <img src={icon128} alt="DHeer Logo" className="w-6 h-6 opacity-50" />
            <span className="font-bold opacity-50">DHeer</span>
          </div>
          <p>© 2024 DHeer. Inspired by the gentle watchers. Built with precision and care.</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-primary transition-colors">Privacy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms</a>
            <a href="#" className="hover:text-primary transition-colors">Extension</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
