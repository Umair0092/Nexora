import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Mic,
  Video,
  Brain,
  Globe,
  BarChart3,
  CheckCircle,
  ArrowRight,
  Zap,
  Target,
  TrendingUp,
  Users,
  Star,
  Code,
  Briefcase,
  DollarSign,
  UserCheck,
} from "lucide-react";
import heroImage from "@assets/stock_images/professional_job_int_751b16c0.jpg";

const features = [
  {
    icon: Mic,
    title: "Real-Time Voice Analysis",
    description: "Multilingual speech-to-text in English, Urdu, French, and Spanish with intelligent answer detection.",
  },
  {
    icon: Video,
    title: "Non-Verbal Feedback",
    description: "Real-time webcam analysis monitors posture and gestures, providing instant visual feedback.",
  },
  {
    icon: Brain,
    title: "AI-Powered Evaluation",
    description: "Semantic analysis by large language models provides context-aware assessment and personalized feedback.",
  },
];

const howItWorks = [
  {
    step: 1,
    title: "Select Your Domain",
    description: "Choose from Software Engineering, Marketing, Finance, HR, and more.",
  },
  {
    step: 2,
    title: "Start Practice Session",
    description: "Answer domain-specific questions while being recorded via webcam and microphone.",
  },
  {
    step: 3,
    title: "Receive Real-Time Feedback",
    description: "Get instant visual indicators for posture and gestures during your session.",
  },
  {
    step: 4,
    title: "Review Performance Report",
    description: "Access detailed scores, transcripts, and AI-generated improvement recommendations.",
  },
];

const domains = [
  { icon: Code, name: "Software Engineering", description: "Technical interviews, coding challenges, system design" },
  { icon: Briefcase, name: "Marketing", description: "Campaign strategies, brand positioning, analytics" },
  { icon: DollarSign, name: "Finance", description: "Financial analysis, investment strategies, risk management" },
  { icon: UserCheck, name: "Human Resources", description: "Behavioral questions, culture fit, leadership" },
];

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Software Engineer at Google",
    content: "Nexora helped me identify and fix nervous habits I didn't know I had. Landed my dream job!",
    rating: 5,
  },
  {
    name: "Michael Rodriguez",
    role: "Marketing Manager",
    content: "The multilingual support was a game-changer for my international career. Highly recommend!",
    rating: 5,
  },
];

const stats = [
  { value: "10,000+", label: "Interview-Ready Professionals" },
  { value: "95%", label: "Success Rate" },
  { value: "4", label: "Languages Supported" },
  { value: "50+", label: "Domain Topics" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground font-bold text-lg">
              N
            </div>
            <span className="text-xl font-semibold">Nexora</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 flex-wrap">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-features">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-how-it-works">
              How It Works
            </a>
            <a href="#domains" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-domains">
              Domains
            </a>
          </nav>
          <div className="flex items-center gap-3 flex-wrap">
            <ThemeToggle />
            <a href="/auth" data-testid="button-login">
              <Button>
                Get Started
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 md:py-32 lg:py-40">
          <div className="max-w-2xl">
            <Badge className="mb-6 text-sm" variant="secondary">
              AI-Powered Interview Preparation
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Redefining Interview Readiness
            </h1>
            <p className="text-lg md:text-xl text-white/80 mb-8 leading-relaxed">
              Practice domain-specific interviews with real-time verbal and non-verbal feedback.
              Get AI-powered evaluation and personalized recommendations to ace your next interview.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
              <a href="/auth" data-testid="button-hero-cta">
                <Button size="lg" className="text-base">
                  Start Practicing Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </a>
              <a href="#features" data-testid="button-learn-more">
                <Button size="lg" variant="outline" className="text-base bg-white/10 backdrop-blur-sm text-white border-white/30">
                  Learn More
                </Button>
              </a>
            </div>
            <div className="mt-12 flex items-center gap-6 flex-wrap">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-white text-sm font-medium"
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <p className="text-white/80 text-sm">
                Join <span className="font-semibold text-white">10,000+</span> interview-ready professionals
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 border-b bg-muted/30">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl md:text-4xl font-bold text-foreground" data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4" variant="secondary">Features</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need to Succeed</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our comprehensive platform analyzes every aspect of your interview performance.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature) => (
              <Card key={feature.title} className="p-6" data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}>
                <CardContent className="p-0">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-muted/30">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div>
              <Badge className="mb-4" variant="secondary">Multilingual Support</Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Practice in Your Preferred Language</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Our advanced speech-to-text technology supports English, Urdu, French, and Spanish,
                enabling candidates from diverse backgrounds to practice effectively.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {["English", "Urdu", "French", "Spanish"].map((lang) => (
                  <div key={lang} className="flex items-center gap-3 p-3 rounded-lg bg-background border">
                    <Globe className="w-5 h-5 text-primary" />
                    <span className="font-medium">{lang}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <div className="text-center p-8">
                  <Globe className="w-24 h-24 text-primary mx-auto mb-4" />
                  <p className="text-lg font-semibold">4 Languages</p>
                  <p className="text-muted-foreground">Seamless transcription</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4" variant="secondary">How It Works</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple 4-Step Process</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Get started in minutes and receive actionable feedback immediately.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {howItWorks.map((item) => (
              <div key={item.step} className="relative" data-testid={`step-${item.step}`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    {item.step}
                  </div>
                  {item.step < 4 && (
                    <div className="hidden lg:block flex-1 h-0.5 bg-border" />
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="domains" className="py-20 md:py-28 bg-muted/30">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4" variant="secondary">Domain Coverage</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Industry-Specific Practice</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Prepare for interviews in your specific field with curated question banks.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {domains.map((domain) => (
              <Card key={domain.name} className="p-6 hover-elevate cursor-pointer" data-testid={`card-domain-${domain.name.toLowerCase().replace(/\s+/g, '-')}`}>
                <CardContent className="p-0">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <domain.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{domain.name}</h3>
                  <p className="text-sm text-muted-foreground">{domain.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4" variant="secondary">Analytics</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Comprehensive Performance Insights</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Track your progress with detailed analytics and actionable recommendations.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-6">
              <CardContent className="p-0">
                <BarChart3 className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold mb-2">Question-by-Question Scores</h3>
                <p className="text-sm text-muted-foreground">
                  Detailed breakdown of your performance on each question with AI-generated feedback.
                </p>
              </CardContent>
            </Card>
            <Card className="p-6">
              <CardContent className="p-0">
                <Target className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold mb-2">Strengths & Weaknesses</h3>
                <p className="text-sm text-muted-foreground">
                  Identify what you're doing well and where you need improvement.
                </p>
              </CardContent>
            </Card>
            <Card className="p-6">
              <CardContent className="p-0">
                <TrendingUp className="w-10 h-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold mb-2">Personalized Recommendations</h3>
                <p className="text-sm text-muted-foreground">
                  Actionable tips tailored to your unique performance patterns.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 bg-muted/30">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4" variant="secondary">Testimonials</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">What Our Users Say</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {testimonials.map((testimonial) => (
              <Card key={testimonial.name} className="p-6" data-testid={`testimonial-${testimonial.name.toLowerCase().replace(/\s+/g, '-')}`}>
                <CardContent className="p-0">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-foreground mb-6">"{testimonial.content}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                      {testimonial.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{testimonial.name}</p>
                      <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="relative overflow-hidden rounded-2xl bg-primary p-12 md:p-16 text-center">
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80" />
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
                Ready to Ace Your Next Interview?
              </h2>
              <p className="text-lg text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
                Join thousands of professionals who have improved their interview skills with Nexora.
              </p>
              <a href="/auth" data-testid="button-cta-final">
                <Button size="lg" variant="secondary" className="text-base">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground font-bold">
                N
              </div>
              <span className="text-lg font-semibold">Nexora</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Nexora. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
