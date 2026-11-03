import { Check, FileText, Image as ImageIcon, Link2, Mic, Package, Printer, Sparkles, Truck } from "lucide-react";

/**
 * Small interface vignettes for the feature tour. They mirror real SellNow screens (same labels and
 * states as the app) with sample data, so each claim next to them is shown, not just told.
 */

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-[22px] bg-white p-5 shadow-[0_30px_70px_-34px_rgba(15,40,80,0.45)] ring-1 ring-[#E6EDF5] ${className}`}>{children}</div>
);
const Pill = ({ children, tone }: { children: React.ReactNode; tone: string }) => <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{children}</span>;

function BuilderMock() {
  return (
    <div className="relative">
      <Card>
        <p className="text-lg font-extrabold">What do you want to sell?</p>
        <div className="mt-3 rounded-2xl bg-[#F6F9FD] p-3 text-sm text-[#3B4452] ring-2 ring-[#1F83D8]/30">Saya nak jual kek lapis Sarawak, tempahan untuk raya…</div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#3B4452]">
          {[[Mic, "Voice note 0:24"], [ImageIcon, "kek-lapis.jpg"], [FileText, "price-list.pdf"], [Link2, "facebook.com/…"]].map(([I, l]) => {
            const Icon = I as typeof Mic;
            return <span key={l as string} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-[#E3EAF3]"><Icon className="size-3.5 text-[#1F83D8]" aria-hidden="true" />{l as string}</span>;
          })}
        </div>
      </Card>
      <Card className="relative -mt-4 ml-4 sm:-mr-2 sm:ml-16">
        <p className="text-xs font-extrabold uppercase tracking-wider text-[#7A8494]">Business profile</p>
        <dl className="mt-2 space-y-2 text-sm">
          {[
            ["Business name", "Lapis Mak Su", "From you", "bg-[#E8F8F0] text-[#127A4C]"],
            ["Category", "Physical products", "Detected", "bg-[#E8F4FF] text-[#1264AC]"],
            ["Tagline", "Lapis raya, resipi keluarga", "AI suggested", "bg-[#F0EAFE] text-[#5B3DB8]"],
            ["Price", "—", "Please confirm", "bg-[#FFF0E5] text-[#A4501A]"],
          ].map(([k, v, s, t]) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <dt className="text-[#7A8494]">{k}</dt>
              <dd className="flex items-center gap-2 font-semibold">{v}<Pill tone={t!}>{s}</Pill></dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}

function WebsiteMock() {
  const types = [
    ["Sales Page", "One hero product", true],
    ["Online Store", "Catalog, cart & checkout", false],
    ["Digital Store", "Files delivered securely", false],
    ["Service Website", "Packages & enquiries", false],
  ] as const;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-lg font-extrabold">Let&apos;s build your website.</p>
        <span className="rounded-full bg-[#F2F8FF] p-1 text-[11px] font-bold text-[#1264AC]"><span className="rounded-full bg-white px-2 py-0.5 shadow-sm">Desktop</span> <span className="px-2">Mobile</span></span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {types.map(([n, d, rec]) => (
          <div key={n} className={`rounded-2xl p-3 ring-1 ${rec ? "bg-[#F2F8FF] ring-2 ring-[#1F83D8]" : "ring-[#E6EDF5]"}`}>
            <div className="h-16 rounded-xl bg-gradient-to-br from-[#FFF0E5] via-white to-[#E8F4FF] p-2">
              <span className="block h-2 w-10 rounded-full bg-[#171717]/70" />
              <span className="mt-1.5 block h-1.5 w-14 rounded-full bg-[#C7D3E0]" />
              <span className="mt-2 block h-3 w-8 rounded-full bg-[#1F83D8]" />
            </div>
            <p className="mt-2 text-sm font-extrabold">{n}</p>
            <p className="text-[11px] text-[#7A8494]">{d}</p>
            {rec && <Pill tone="mt-1.5 bg-[#1F83D8] text-white"><Sparkles className="size-3" aria-hidden="true" />Recommended</Pill>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function PayMock() {
  return (
    <div className="relative">
      <Card>
        <div className="flex items-center justify-between">
          <p className="text-xs font-extrabold uppercase tracking-wider text-[#7A8494]">Earnings &amp; Settlements</p>
          <Pill tone="bg-[#E8F8F0] text-[#127A4C]"><Check className="size-3" aria-hidden="true" />Active</Pill>
        </div>
        <p className="mt-2 text-4xl font-extrabold tracking-tight tabular-nums">RM 1,284.50</p>
        <p className="text-sm text-[#7A8494]">Available earnings · next settlement tomorrow</p>
        <div className="mt-4 space-y-2 text-sm">
          {[["Gross sales", "RM 1,320.00"], ["Processing fees", "− RM 35.50"], ["Net to your bank", "RM 1,284.50"]].map(([k, v], i) => (
            <div key={k} className={`flex justify-between ${i === 2 ? "border-t border-dashed border-[#E3EAF3] pt-2 font-extrabold" : "text-[#5B6574]"}`}><span>{k}</span><span className="tabular-nums">{v}</span></div>
          ))}
        </div>
      </Card>
      <Card className="relative -mt-3 ml-6 sm:-mr-2 !p-4 sm:ml-24">
        <p className="text-xs font-extrabold uppercase tracking-wider text-[#7A8494]">Checkout · Pay with</p>
        <div className="mt-2 space-y-1.5 text-sm font-semibold">
          {[["FPX online banking", true], ["Cash on delivery", false], ["Bank transfer", false]].map(([l, on]) => (
            <div key={l as string} className={`flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ${on ? "bg-[#F2F8FF] ring-[#1F83D8]" : "ring-[#E6EDF5]"}`}>
              <span className={`size-3.5 rounded-full ${on ? "border-4 border-[#1F83D8]" : "border-2 border-[#C7D3E0]"}`} />{l as string}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ShipMock() {
  const rows = [
    ["#SN-1042", "Nurul A.", "Paid", "J&T Express", "bg-[#E8F8F0] text-[#127A4C]"],
    ["#SN-1041", "Daniel L.", "COD", "Ninja Van", "bg-[#FFF0E5] text-[#A4501A]"],
    ["#SN-1040", "Siti H.", "Paid", "Pos Laju", "bg-[#E8F8F0] text-[#127A4C]"],
  ];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-lg font-extrabold">Ready to Ship</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#171717] px-3 py-1.5 text-xs font-bold text-white"><Printer className="size-3.5" aria-hidden="true" />Print 3 airway bills</span>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map(([id, n, s, c, t]) => (
          <div key={id} className="flex items-center gap-3 rounded-2xl bg-[#F8FAFD] px-3 py-2.5 text-sm ring-1 ring-[#EEF2F7]">
            <span className="flex size-8 items-center justify-center rounded-xl bg-white ring-1 ring-[#E3EAF3]"><Package className="size-4 text-[#1F83D8]" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1"><p className="font-bold">{id}</p><p className="text-xs text-[#7A8494]">{n}</p></div>
            <Pill tone={t!}>{s}</Pill>
            <span className="hidden items-center gap-1 text-xs font-semibold text-[#3B4452] sm:inline-flex"><Truck className="size-3.5" aria-hidden="true" />{c}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[#7A8494]">Shipping via ParcelDaily · sample orders</p>
    </Card>
  );
}

function MarketMock() {
  return (
    <div className="grid items-end gap-3 sm:grid-cols-[0.8fr_1fr]">
      <div className="overflow-hidden rounded-[22px] bg-gradient-to-br from-[#FFD76A] via-[#FFB07A] to-[#F07A3A] p-4 text-[#3A1A00] shadow-[0_30px_70px_-34px_rgba(160,70,20,0.6)]">
        <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-70">Poster · 4:5</p>
        <p className="mt-6 text-xl font-black leading-tight">Sambal Garing Mak Teh</p>
        <p className="mt-1 text-xs font-semibold">Pedas berani. Rangup sampai habis.</p>
        <div className="mx-auto mt-4 size-20 rounded-full bg-white/50 ring-8 ring-white/30" />
        <span className="mt-4 inline-block rounded-full bg-[#3A1A00] px-3 py-1 text-[11px] font-bold text-white">Order Sekarang</span>
      </div>
      <Card className="!p-4">
        <p className="text-xs font-extrabold uppercase tracking-wider text-[#7A8494]">Ad performance · 7 days</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          {[["Spend", "RM 140"], ["Purchases", "12"], ["Cost / purchase", "RM 11.67"], ["ROAS", "3.4×"]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-[#F6F9FD] p-2"><p className="text-[11px] text-[#7A8494]">{k}</p><p className="font-extrabold tabular-nums">{v}</p></div>
          ))}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#E8F8F0] p-2.5 text-xs text-[#127A4C]"><Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /><span><b>Scale opportunity:</b> cost per purchase is below your target.</span></div>
        <p className="mt-2 text-[10px] text-[#98A2B3]">Sample numbers</p>
      </Card>
    </div>
  );
}

function GrowMock() {
  return (
    <div className="relative">
      <Card>
        <p className="text-xs font-extrabold uppercase tracking-wider text-[#7A8494]">Your Business Journey</p>
        <div className="mt-3 flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FFE7A3] to-[#E7B33A] text-2xl font-black text-[#5A3E00] shadow-[inset_0_-4px_0_rgba(0,0,0,0.12),0_10px_20px_-8px_rgba(160,110,10,0.7)] ring-4 ring-white">3</div>
          <div className="flex-1">
            <p className="font-extrabold">Sales Achiever — Level 3</p>
            <p className="text-sm text-[#7A8494]">64 / 100 orders</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EEF2F7]"><div className="h-full w-[64%] rounded-full bg-gradient-to-r from-[#1F83D8] to-[#7C5CE0]" /></div>
          </div>
        </div>
      </Card>
      <Card className="relative -mt-3 ml-4 sm:-mr-2 !p-4 sm:ml-20">
        <p className="text-xs font-extrabold uppercase tracking-wider text-[#7A8494]">Customers</p>
        <div className="mt-2 space-y-2 text-sm">
          {[["Aisyah R.", "4 orders · RM 312"], ["Kumar S.", "Lead · asked about wholesale"], ["Mei Ling T.", "2 orders · RM 98"]].map(([n, d]) => (
            <div key={n} className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-full bg-[#E8F4FF] text-xs font-bold text-[#1264AC]">{n![0]}</span>
              <div><p className="font-bold leading-tight">{n}</p><p className="text-xs text-[#7A8494]">{d}</p></div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export const TOUR_MOCKS: Record<string, () => React.JSX.Element> = {
  builder: BuilderMock,
  website: WebsiteMock,
  pay: PayMock,
  ship: ShipMock,
  market: MarketMock,
  grow: GrowMock,
};
