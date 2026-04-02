import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: '"Be Vietnam Pro", system-ui, sans-serif' }}>
      {/* Navbar */}
      <nav className="border-b border-[#F1F1F3] sticky top-0 bg-white/95 backdrop-blur-sm z-50">
        <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between h-[72px]">
          <div className="flex items-center gap-10">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-[40px] h-[40px] bg-[#FF9500] rounded-[8px] flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
              </div>
              <span className="text-xl font-semibold text-[#262626]">HireFunnel</span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-[#59595A] hover:text-[#262626]">Features</a>
              <a href="#how-it-works" className="text-sm text-[#59595A] hover:text-[#262626]">How It Works</a>
              <a href="#pricing" className="text-sm text-[#59595A] hover:text-[#262626]">Pricing</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-[#262626] hover:text-[#FF9500]">Sign In</Link>
            <Link href="/login" className="px-5 py-2.5 bg-[#FF9500] text-white text-sm font-medium rounded-[8px] hover:bg-[#EA8500] transition-colors">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-[1200px] mx-auto px-6 pt-20 pb-16">
        <div className="max-w-[720px] mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#FFF7ED] rounded-full text-[#FF9500] text-sm font-medium mb-6">
            <span>For service businesses hiring hourly workers</span>
          </div>
          <h1 className="text-[42px] md:text-[56px] font-bold text-[#262626] leading-[1.15] mb-6">
            Turn your hiring into a <span className="text-[#FF9500]">system</span> — not chaos
          </h1>
          <p className="text-lg md:text-xl text-[#59595A] leading-relaxed mb-10 max-w-[580px] mx-auto">
            Screen, qualify, and move candidates from first click to hired — automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login" className="px-8 py-4 bg-[#FF9500] text-white font-semibold rounded-[8px] hover:bg-[#EA8500] transition-colors text-lg">
              Start Building Your Hiring Funnel
            </Link>
            <a href="#how-it-works" className="px-8 py-4 border border-[#E4E4E7] text-[#262626] font-medium rounded-[8px] hover:bg-[#F7F7F8] transition-colors text-lg">
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section className="bg-[#262626] py-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-[32px] font-bold text-white text-center mb-4">Hiring today looks like this</h2>
          <p className="text-[#9CA3AF] text-center mb-12 text-lg">You waste hours just to find one decent hire</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-[960px] mx-auto">
            {[
              { icon: '🔍', text: 'Candidates come from everywhere — you don\'t know what works' },
              { icon: '❌', text: 'Most applicants are unqualified or not serious' },
              { icon: '🔁', text: 'You repeat the same explanations again and again' },
              { icon: '📱', text: 'Follow-ups are manual → people drop off' },
              { icon: '📅', text: 'You schedule everyone → most don\'t show up' },
              { icon: '⏰', text: 'Hours wasted just to find one decent hire' },
            ].map((item, i) => (
              <div key={i} className="bg-[#333333] rounded-[12px] p-6 border border-[#444]">
                <span className="text-2xl mb-3 block">{item.icon}</span>
                <p className="text-[#E5E7EB] text-sm leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features / How It Works */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[36px] font-bold text-[#262626] mb-4">A complete hiring funnel in one place</h2>
            <p className="text-lg text-[#59595A] max-w-[560px] mx-auto">Instead of managing hiring manually, build a system that does it for you.</p>
          </div>

          <div className="space-y-20">
            {[
              {
                num: '01',
                title: 'Bring candidates from any source',
                desc: 'Post ads on Indeed, Facebook groups, Craigslist — each with its own tracked link. Always know where your best candidates come from.',
                highlight: 'Track every source automatically',
                icon: '🔗',
              },
              {
                num: '02',
                title: 'Automatically screen every applicant',
                desc: 'Send candidates through a structured flow: application form, qualification questions, video interview. Only serious candidates make it through.',
                highlight: 'Stop talking to everyone',
                icon: '🎯',
              },
              {
                num: '03',
                title: 'See all candidates in one pipeline',
                desc: 'Every applicant is automatically organized by source, answers, video responses, and status. No more lost messages or messy spreadsheets.',
                highlight: 'One dashboard for everything',
                icon: '📊',
              },
              {
                num: '04',
                title: 'Automate all follow-ups',
                desc: 'The system automatically sends training, scheduling links, and filters out unqualified candidates. Candidates move forward without your involvement.',
                highlight: 'Hands-free candidate progression',
                icon: '⚡',
              },
              {
                num: '05',
                title: 'Train candidates before you meet them',
                desc: 'Show how the work is done, set expectations, and filter out non-serious people. You only talk to prepared candidates.',
                highlight: 'Pre-trained, ready-to-hire candidates',
                icon: '🎥',
              },
              {
                num: '06',
                title: 'Only schedule qualified people',
                desc: 'By the time someone books, they passed screening, completed training, and understand the job. Fewer no-shows, better interviews.',
                highlight: 'Qualified-only scheduling',
                icon: '✅',
              },
              {
                num: '07',
                title: 'Know what actually works',
                desc: 'See which source brings quality candidates, which ads convert, and where candidates drop off. Stop guessing. Start optimizing.',
                highlight: 'Data-driven hiring decisions',
                icon: '📈',
              },
            ].map((feature, i) => (
              <div key={i} className={`flex flex-col ${i % 2 ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-12`}>
                <div className="md:w-1/2">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-[50px] font-extrabold text-[#FFEDD5] leading-none">{feature.num}</span>
                    <span className="text-2xl">{feature.icon}</span>
                  </div>
                  <h3 className="text-[24px] font-semibold text-[#262626] mb-3">{feature.title}</h3>
                  <p className="text-[#59595A] leading-relaxed mb-4">{feature.desc}</p>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#FFF7ED] rounded-[8px]">
                    <span className="text-sm font-medium text-[#FF9500]">{feature.highlight}</span>
                  </div>
                </div>
                <div className="md:w-1/2">
                  <div className="bg-[#F7F7F8] rounded-[16px] h-[280px] flex items-center justify-center border border-[#F1F1F3]">
                    <span className="text-[80px]">{feature.icon}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats / Social Proof */}
      <section className="bg-[#FFF7ED] py-16">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            {[
              { num: '80%', label: 'Less time spent on unqualified candidates' },
              { num: '3x', label: 'More qualified hires per month' },
              { num: '60%', label: 'Reduction in no-shows' },
            ].map((stat, i) => (
              <div key={i}>
                <div className="text-[48px] font-extrabold text-[#FF9500]">{stat.num}</div>
                <p className="text-[#59595A] mt-2">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What You Get */}
      <section id="features" className="py-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-[36px] font-bold text-[#262626] mb-4">What you get</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-[960px] mx-auto">
            {[
              { icon: '🏗️', title: 'Structured hiring funnel', desc: 'Build multi-step flows with forms, questions, and video' },
              { icon: '🤖', title: 'Automated screening', desc: 'Qualify candidates automatically with branching logic' },
              { icon: '📬', title: 'Automatic follow-ups', desc: 'Send training, links, and reminders without lifting a finger' },
              { icon: '📋', title: 'Candidate pipeline', desc: 'See every candidate, their answers, and status in one place' },
              { icon: '📊', title: 'Source + ad analytics', desc: 'Know which ads and sources bring the best candidates' },
              { icon: '🎓', title: 'Training modules', desc: 'Train candidates before you meet them with video courses' },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-[12px] p-6 border border-[#F1F1F3] hover:shadow-md transition-shadow">
                <span className="text-3xl mb-4 block">{item.icon}</span>
                <h3 className="text-lg font-semibold text-[#262626] mb-2">{item.title}</h3>
                <p className="text-sm text-[#59595A] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-[#F7F7F8] py-20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-[36px] font-bold text-[#262626] mb-4">Simple pricing</h2>
            <p className="text-lg text-[#59595A]">Start free. Upgrade when you need more.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-[800px] mx-auto">
            <div className="bg-white rounded-[16px] p-8 border border-[#F1F1F3]">
              <h3 className="text-xl font-semibold text-[#262626] mb-2">Free</h3>
              <div className="text-[48px] font-extrabold text-[#262626] mb-4">$0<span className="text-lg font-normal text-[#59595A]">/month</span></div>
              <ul className="space-y-3 mb-8">
                {['1 active flow', '3 ads / tracked links', '50 candidates/month', 'Basic screening', 'Video responses'].map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[#59595A]">
                    <svg className="w-4 h-4 text-[#FF9500] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block w-full py-3 text-center border border-[#E4E4E7] rounded-[8px] text-[#262626] font-medium hover:bg-[#F7F7F8]">Get Started</Link>
            </div>
            <div className="bg-[#262626] rounded-[16px] p-8 border border-[#333] relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#FF9500] text-white text-xs font-medium rounded-full">Most Popular</div>
              <h3 className="text-xl font-semibold text-white mb-2">Pro</h3>
              <div className="text-[48px] font-extrabold text-white mb-4">$79<span className="text-lg font-normal text-[#9CA3AF]">/month</span></div>
              <ul className="space-y-3 mb-8">
                {['Unlimited flows', 'Unlimited ads', 'Unlimited candidates', 'Advanced screening + branching', 'Video interviews', 'Training modules', 'Automations', 'Source analytics', 'Priority support'].map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[#D1D5DB]">
                    <svg className="w-4 h-4 text-[#FF9500] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/login" className="block w-full py-3 text-center bg-[#FF9500] rounded-[8px] text-white font-medium hover:bg-[#EA8500]">Start Free Trial</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20">
        <div className="max-w-[1200px] mx-auto px-6 text-center">
          <h2 className="text-[36px] md:text-[42px] font-bold text-[#262626] mb-4">Stop interviewing everyone.<br/>Start hiring the right people.</h2>
          <p className="text-lg text-[#59595A] mb-8 max-w-[480px] mx-auto">Build your hiring system in minutes. No setup complexity. No switching between tools.</p>
          <Link href="/login" className="inline-block px-10 py-4 bg-[#FF9500] text-white font-semibold rounded-[8px] hover:bg-[#EA8500] transition-colors text-lg">
            Create Your First Hiring Flow
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#262626] py-16">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between gap-10 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-[36px] h-[36px] bg-[#FF9500] rounded-[6px] flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
                </div>
                <span className="text-white font-semibold">HireFunnel</span>
              </div>
              <p className="text-[#9CA3AF] text-sm max-w-[280px]">Turn your hiring into a system. Screen, qualify, and hire — automatically.</p>
            </div>
            <div className="grid grid-cols-2 gap-10">
              <div>
                <h4 className="text-white font-medium mb-3">Product</h4>
                <div className="space-y-2 text-sm text-[#9CA3AF]">
                  <p><a href="#features" className="hover:text-white">Features</a></p>
                  <p><a href="#pricing" className="hover:text-white">Pricing</a></p>
                  <p><a href="#how-it-works" className="hover:text-white">How It Works</a></p>
                </div>
              </div>
              <div>
                <h4 className="text-white font-medium mb-3">Company</h4>
                <div className="space-y-2 text-sm text-[#9CA3AF]">
                  <p>About</p>
                  <p>Contact</p>
                  <p>Privacy</p>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-[#333] pt-6 text-center text-sm text-[#656567]">
            &copy; {new Date().getFullYear()} HireFunnel. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
