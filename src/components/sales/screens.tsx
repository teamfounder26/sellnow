/**
 * Screen content for device mockups, laid out in `em` (see devices.tsx). The dashboard mirrors the
 * real SellNow dashboard (same labels, sections and design tokens); the stores are clearly sample
 * brands for demonstration.
 */

const Bar = ({ w, c = "#E3EAF3", h = 0.7 }: { w: number; c?: string; h?: number }) => <span className="block rounded-full" style={{ width: `${w}em`, height: `${h}em`, background: c }} />;

/** Desktop — the SellNow dashboard (welcome, website banner, KPIs, AI Recommendations, Business setup). */
export function DashboardScreen() {
  const nav = ["#1F83D8", "#C7D3E0", "#C7D3E0", "#C7D3E0", "#C7D3E0", "#C7D3E0", "#C7D3E0"];
  return (
    <div className="flex h-full bg-[#F6F9FD] text-[#171717]" style={{ fontSize: "1em" }}>
      <div className="flex w-[5em] flex-col items-center gap-[1.2em] bg-white/90 py-[1.2em] shadow-[0_0_0_1px_#E8EEF5]">
        <span className="flex size-[2.6em] items-center justify-center rounded-[0.8em] bg-[#1F83D8] text-[1em] font-black text-white">S</span>
        {nav.map((c, i) => <span key={i} className="size-[1.9em] rounded-[0.6em]" style={{ background: i === 0 ? "#E8F4FF" : "transparent", boxShadow: `inset 0 0 0 0.18em ${c}` }} />)}
      </div>
      <div className="min-w-0 flex-1 p-[1.6em]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[1.75em] font-extrabold leading-tight tracking-tight">Good morning, Aina! Ready to grow your business?</p>
            <p className="mt-[0.2em] text-[0.95em] text-[#667085]">Here&apos;s how your business is doing</p>
          </div>
          <span className="rounded-full bg-gradient-to-r from-[#6E8BFF] to-[#9B6BFF] px-[1em] py-[0.5em] text-[0.85em] font-bold text-white">Ask AI</span>
        </div>
        <div className="mt-[1.2em] flex items-center gap-[1.2em] rounded-[1.2em] bg-gradient-to-r from-[#1F83D8] to-[#1264AC] p-[1.2em] text-white">
          <div className="flex-1">
            <p className="text-[1.15em] font-extrabold">Your new website is ready to explore!</p>
            <p className="text-[0.85em] opacity-85">We&apos;ve prepared something special for your business. Take a look and make it yours.</p>
          </div>
          <span className="rounded-full bg-white px-[1.1em] py-[0.55em] text-[0.85em] font-bold text-[#1264AC]">Preview Website</span>
        </div>
        <div className="mt-[1.2em] grid grid-cols-4 gap-[1em]">
          {[
            ["Total sales", "RM 4,280", "#1F83D8"],
            ["Orders", "86", "#7C5CE0"],
            ["Visitors", "2,341", "#1FA36A"],
            ["Customers", "64", "#F07A3A"],
          ].map(([k, v, c]) => (
            <div key={k} className="rounded-[1em] bg-white p-[1em] shadow-[0_0.2em_0.8em_rgba(15,40,80,0.06)]">
              <p className="text-[0.8em] font-semibold text-[#667085]">{k}</p>
              <p className="mt-[0.2em] text-[1.5em] font-extrabold tabular-nums">{v}</p>
              <svg viewBox="0 0 100 24" className="mt-[0.3em] h-[1.6em] w-full" aria-hidden="true"><polyline points="0,20 15,16 30,18 45,10 60,12 75,6 100,4" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" /></svg>
            </div>
          ))}
        </div>
        <div className="mt-[1.2em] grid grid-cols-[1.4fr_1fr] gap-[1em]">
          <div className="rounded-[1em] bg-white p-[1.1em] shadow-[0_0.2em_0.8em_rgba(15,40,80,0.06)]">
            <p className="text-[1em] font-extrabold">AI Recommendations</p>
            {[
              ["Share your website link", "Post it on WhatsApp, Facebook or TikTok."],
              ["Create your first marketing poster", "Generate ad copy in Creative Studio."],
            ].map(([a, b]) => (
              <div key={a} className="mt-[0.7em] flex items-start gap-[0.7em] rounded-[0.8em] bg-[#F6F9FD] p-[0.7em]">
                <span className="mt-[0.15em] size-[1.4em] shrink-0 rounded-full bg-gradient-to-br from-[#9B6BFF] to-[#6E8BFF]" />
                <div><p className="text-[0.85em] font-bold">{a}</p><p className="text-[0.75em] text-[#667085]">{b}</p></div>
              </div>
            ))}
          </div>
          <div className="rounded-[1em] bg-white p-[1.1em] shadow-[0_0.2em_0.8em_rgba(15,40,80,0.06)]">
            <p className="text-[1em] font-extrabold">Business setup</p>
            {["Website", "Creative Studio", "Payments", "First sale"].map((k, i) => (
              <div key={k} className="mt-[0.65em] flex items-center gap-[0.6em] text-[0.82em]">
                <span className="flex size-[1.3em] items-center justify-center rounded-full text-[0.8em] font-black text-white" style={{ background: i < 2 ? "#1FA36A" : "#D9E2EC" }}>{i < 2 ? "✓" : ""}</span>
                <span className={i < 2 ? "font-semibold" : "text-[#667085]"}>{k}</span>
              </div>
            ))}
            <div className="mt-[0.9em] h-[0.6em] rounded-full bg-[#E8F4FF]"><div className="h-full w-1/2 rounded-full bg-[#1F83D8]" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tablet — a generated ecommerce site for a sample handmade skincare brand. */
export function StoreScreen() {
  return (
    <div className="h-full bg-[#FBF7F2] text-[#2B2421]">
      <div className="flex items-center justify-between px-[2em] py-[1.1em]">
        <span className="font-serif text-[1.5em] italic">Lumière Botanics</span>
        <div className="flex gap-[1.6em] text-[0.9em] opacity-75"><span>Shop</span><span>Our story</span><span>FAQ</span></div>
        <span className="rounded-full bg-[#B4846C] px-[1em] py-[0.4em] text-[0.85em] font-bold text-white">Cart · 1</span>
      </div>
      <div className="grid grid-cols-2 items-center gap-[2em] px-[2em] pt-[1em]">
        <div>
          <p className="text-[0.8em] font-bold uppercase tracking-[0.2em] text-[#B4846C]">Handmade in Penang</p>
          <p className="mt-[0.5em] font-serif text-[2.6em] leading-[1.05]">Gentle skincare, made by hand.</p>
          <p className="mt-[0.7em] text-[0.95em] opacity-75">Small batches. Natural oils. Kind to sensitive skin.</p>
          <span className="mt-[1.2em] inline-block rounded-full bg-[#2B2421] px-[1.4em] py-[0.7em] text-[0.9em] font-bold text-white">Shop the collection</span>
        </div>
        <div className="relative aspect-square rounded-[1.6em] bg-gradient-to-br from-[#EED9C7] to-[#D9B8A0]">
          <span className="absolute bottom-[14%] left-[22%] h-[52%] w-[24%] rounded-[1em] bg-gradient-to-b from-[#FFFFFF] to-[#F1E2D6] shadow-[0_1em_2em_rgba(80,40,20,0.2)]" />
          <span className="absolute bottom-[14%] left-[22%] h-[14%] w-[24%] rounded-b-[1em] bg-[#B4846C]" />
          <span className="absolute bottom-[14%] right-[18%] h-[36%] w-[26%] rounded-full bg-gradient-to-b from-[#FFF8F1] to-[#E8D1BF] shadow-[0_1em_2em_rgba(80,40,20,0.18)]" />
        </div>
      </div>
      <div className="mt-[1.6em] grid grid-cols-3 gap-[1.2em] px-[2em]">
        {[["Rose Glow Serum", "RM 59"], ["Oat Calm Cream", "RM 45"], ["Kelulut Lip Balm", "RM 18"]].map(([n, p]) => (
          <div key={n} className="rounded-[1.2em] bg-white p-[0.9em] shadow-[0_0.3em_1em_rgba(80,40,20,0.07)]">
            <div className="h-[6em] rounded-[0.8em] bg-gradient-to-br from-[#F4E6DA] to-[#E3C8B3]" />
            <p className="mt-[0.6em] text-[0.95em] font-bold">{n}</p>
            <div className="mt-[0.4em] flex items-center justify-between"><span className="text-[0.95em] font-extrabold text-[#B4846C]">{p}</span><span className="rounded-full bg-[#2B2421] px-[0.8em] py-[0.3em] text-[0.75em] font-bold text-white">Add to Cart</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Phone — the SellNow builder ("What do you want to sell?") with a generation transition. */
export function BuilderScreen() {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[#EAF4FF] to-white px-[2em] pb-[2em] pt-[4.5em] text-[#171717]">
      <div className="flex gap-[0.5em]">{["IDEA", "DETAILS", "PROFILE", "STORE", "LAUNCH"].map((s, i) => <span key={s} className="h-[0.45em] flex-1 rounded-full" style={{ background: i === 0 ? "#1F83D8" : "#D6E4F2" }} />)}</div>
      <p className="mt-[2.4em] text-[2.4em] font-extrabold leading-tight tracking-tight">What do you want to sell?</p>
      <p className="mt-[0.6em] text-[1.15em] text-[#667085]">Type it, upload a photo or record a voice note.</p>
      <div className="sn-pulse mt-[1.6em] rounded-[1.4em] bg-white p-[1.3em] text-[1.25em] shadow-[0_0_0_0.15em_#1F83D8,0_0.8em_2em_rgba(31,131,216,0.18)]">
        I want to sell handmade skincare products.<span className="sn-caret ml-[0.1em] inline-block h-[1.1em] w-[0.12em] translate-y-[0.2em] bg-[#1F83D8]" />
      </div>
      <div className="mt-[1.2em] flex gap-[0.8em] text-[1em]">
        {["Photo", "PDF", "Voice"].map((x) => <span key={x} className="rounded-full bg-white px-[1em] py-[0.5em] font-semibold shadow-[0_0_0_0.1em_#D6E4F2]">{x}</span>)}
      </div>
      <div className="sn-gen mt-auto rounded-[1.4em] bg-white p-[1.3em] shadow-[0_0.6em_2em_rgba(15,40,80,0.1)]">
        <p className="text-[1.05em] font-bold">Creating your page…</p>
        <div className="mt-[0.8em] space-y-[0.5em]"><Bar w={22} c="#CFE6FB" /><Bar w={16} c="#E3EAF3" /><Bar w={19} c="#E3EAF3" /></div>
      </div>
      <span className="mt-[1.2em] rounded-full bg-[#1F83D8] py-[0.9em] text-center text-[1.2em] font-bold text-white">Continue</span>
    </div>
  );
}

// ---------------- Category screens (one composition per business type)

export function CatScreen({ id }: { id: string }) {
  switch (id) {
    case "physical":
      return (
        <div className="h-full bg-[#FFF9F2] px-[1.6em] pt-[3.6em] text-[#2B1A10]">
          <p className="text-[2em] font-black">Dapur Mak Teh</p>
          <div className="mt-[1em] rounded-full bg-white px-[1em] py-[0.6em] text-[1em] text-[#9A7B66] shadow-[0_0_0_0.1em_#F3E3D3]">Search sambal…</div>
          <div className="mt-[1.2em] grid grid-cols-2 gap-[1em]">
            {[["Sambal Garing", "RM 19.90", "#D9480F"], ["Sambal Hijau", "RM 17.90", "#5C940D"], ["Serunding", "RM 15.00", "#A0522D"], ["Bundle 3-in-1", "RM 49.00", "#D9480F"]].map(([n, p, c]) => (
              <div key={n} className="rounded-[1.2em] bg-white p-[0.8em] shadow-[0_0.3em_1em_rgba(80,40,10,0.07)]">
                <div className="h-[7em] rounded-[0.9em]" style={{ background: `linear-gradient(135deg, ${c}33, ${c}88)` }} />
                <p className="mt-[0.5em] text-[1.05em] font-bold">{n}</p>
                <p className="text-[1em] font-extrabold" style={{ color: c }}>{p}</p>
              </div>
            ))}
          </div>
          <div className="mt-[1.2em] rounded-full bg-[#D9480F] py-[0.9em] text-center text-[1.15em] font-bold text-white">Checkout · 2 items</div>
        </div>
      );
    case "digital":
      return (
        <div className="grid h-full grid-cols-[1fr_1.1fr] gap-[2em] bg-[#FAFAFF] p-[2.2em] text-[#1E1B4B]">
          <div className="relative rounded-[1.2em] bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] p-[1.6em] text-white shadow-[0_1.2em_2.4em_rgba(79,70,229,0.3)]">
            <p className="text-[0.85em] font-bold uppercase tracking-[0.2em] opacity-80">Ebook</p>
            <p className="mt-[0.6em] text-[2.1em] font-black leading-tight">Start Your Home Bakery</p>
            <p className="mt-[0.8em] text-[0.95em] opacity-80">48 pages · PDF</p>
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[2em] font-extrabold leading-tight">Turn your kitchen into a business.</p>
            <p className="mt-[0.6em] text-[1em] opacity-70">Recipes, costing sheets and a pricing guide.</p>
            <p className="mt-[1em] text-[2em] font-black text-[#4F46E5]">RM 29</p>
            <span className="mt-[0.8em] rounded-full bg-[#4F46E5] py-[0.8em] text-center text-[1em] font-bold text-white">Buy & download</span>
            <p className="mt-[0.6em] text-[0.8em] opacity-60">Secure download link after payment</p>
          </div>
        </div>
      );
    case "service":
      return (
        <div className="h-full bg-[#F8FAFC] px-[1.6em] pt-[3.6em] text-[#0F172A]">
          <p className="text-[0.9em] font-bold uppercase tracking-[0.2em] text-[#1D4ED8]">Photography</p>
          <p className="mt-[0.4em] text-[2em] font-black leading-tight">Moments by Hafiz</p>
          <div className="mt-[1em] grid grid-cols-3 gap-[0.5em]">{["#93C5FD", "#1D4ED8", "#BFDBFE"].map((c) => <div key={c} className="h-[5.5em] rounded-[0.8em]" style={{ background: c }} />)}</div>
          {[["Wedding", "from RM 1,800"], ["Event", "from RM 600"]].map(([n, p]) => (
            <div key={n} className="mt-[0.9em] flex items-center justify-between rounded-[1em] bg-white p-[1em] shadow-[0_0.2em_0.8em_rgba(15,23,42,0.06)]"><span className="text-[1.1em] font-bold">{n}</span><span className="text-[1em] font-extrabold text-[#1D4ED8]">{p}</span></div>
          ))}
          <div className="mt-[1em] rounded-[1em] bg-white p-[1em] shadow-[0_0.2em_0.8em_rgba(15,23,42,0.06)]">
            <p className="text-[1em] font-bold">Request a quote</p>
            <div className="mt-[0.6em] space-y-[0.5em]"><Bar w={24} /><Bar w={24} /></div>
            <div className="mt-[0.8em] rounded-full bg-[#1D4ED8] py-[0.7em] text-center text-[1em] font-bold text-white">Send enquiry</div>
          </div>
        </div>
      );
    case "booking":
      return (
        <div className="grid h-full grid-cols-[1.1fr_1fr] gap-[1.6em] bg-[#FFF8F3] p-[2em] text-[#2B1A10]">
          <div>
            <p className="text-[1.8em] font-black">Glow Facial Studio</p>
            <p className="mt-[0.3em] text-[1em] opacity-70">Choose a service and a time</p>
            {[["Hydrating Facial", "60 min · RM 120"], ["Acne Treatment", "45 min · RM 95"]].map(([n, d], i) => (
              <div key={n} className="mt-[0.9em] rounded-[1em] bg-white p-[0.9em]" style={{ boxShadow: i === 0 ? "0 0 0 0.15em #F07A3A" : "0 0.2em 0.8em rgba(80,40,10,0.06)" }}><p className="text-[1.05em] font-bold">{n}</p><p className="text-[0.85em] opacity-70">{d}</p></div>
            ))}
          </div>
          <div className="rounded-[1.2em] bg-white p-[1.2em] shadow-[0_0.3em_1em_rgba(80,40,10,0.08)]">
            <p className="text-[1em] font-bold">Thu, 14 Nov</p>
            <div className="mt-[0.8em] grid grid-cols-2 gap-[0.5em]">{["10:00", "11:30", "14:00", "15:30", "17:00", "18:30"].map((tm, i) => <span key={tm} className="rounded-[0.6em] py-[0.5em] text-center text-[0.95em] font-semibold" style={{ background: i === 2 ? "#F07A3A" : "#FFF0E5", color: i === 2 ? "#fff" : "#7A3E1D" }}>{tm}</span>)}</div>
            <div className="mt-[1em] rounded-full bg-[#2B1A10] py-[0.7em] text-center text-[0.95em] font-bold text-white">Request booking</div>
          </div>
        </div>
      );
    case "event":
      return (
        <div className="h-full bg-gradient-to-b from-[#7C3AED] to-[#C026D3] px-[1.6em] pt-[3.6em] text-white">
          <p className="text-[0.9em] font-bold uppercase tracking-[0.2em] opacity-80">Online workshop</p>
          <p className="mt-[0.4em] text-[2.2em] font-black leading-tight">Baking 101: Kek Lapis Basics</p>
          <div className="mt-[1em] grid grid-cols-2 gap-[0.6em] text-[0.95em]">{[["Date", "Sat, 23 Nov"], ["Time", "8:00 pm"], ["Where", "Online"], ["Seats", "Limited"]].map(([k, v]) => <div key={k} className="rounded-[0.8em] bg-white/15 p-[0.7em]"><p className="opacity-75">{k}</p><p className="font-bold">{v}</p></div>)}</div>
          <div className="mt-[1.2em] rounded-[1.2em] bg-white p-[1em] text-[#1A1033]">
            <div className="flex justify-between text-[1.05em] font-bold"><span>General ticket</span><span>RM 35</span></div>
            <div className="mt-[0.8em] rounded-full bg-[#7C3AED] py-[0.8em] text-center text-[1em] font-bold text-white">Register now</div>
          </div>
        </div>
      );
    default:
      return (
        <div className="grid h-full grid-cols-[0.8fr_1.4fr] bg-[#F7F5FF] text-[#1E1B4B]">
          <div className="space-y-[0.8em] bg-white p-[1.4em]">
            <p className="text-[1.3em] font-black">Ruang Kreatif</p>
            {["Home", "Lessons", "Community", "Events"].map((n, i) => <p key={n} className="rounded-[0.6em] px-[0.6em] py-[0.4em] text-[0.95em] font-semibold" style={{ background: i === 1 ? "#EDE9FE" : "transparent" }}>{n}</p>)}
          </div>
          <div className="p-[1.6em]">
            <p className="text-[1.8em] font-black leading-tight">Join our creators&apos; circle</p>
            <div className="mt-[1em] grid grid-cols-2 gap-[0.8em]">
              {[["Monthly", "RM 25 / month"], ["Yearly", "RM 250 / year"]].map(([n, p], i) => (
                <div key={n} className="rounded-[1em] bg-white p-[1em]" style={{ boxShadow: i === 1 ? "0 0 0 0.15em #7C5CE0" : "0 0.2em 0.8em rgba(30,27,75,0.06)" }}><p className="text-[1em] font-bold">{n}</p><p className="text-[1em] font-extrabold text-[#7C5CE0]">{p}</p></div>
              ))}
            </div>
            <div className="mt-[1em] rounded-full bg-[#7C5CE0] py-[0.7em] text-center text-[1em] font-bold text-white">Request to join</div>
          </div>
        </div>
      );
  }
}
