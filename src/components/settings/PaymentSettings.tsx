"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Landmark, FlaskConical, Loader2 } from "lucide-react";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@/components/ui";
import { useT } from "@/lib/i18n/client";
import { connectStripeAction, connectBillplzAction, connectTestGatewayAction, disconnectProviderAction } from "@/app/actions/settings";

type Integ = { id: string; provider: string; mode: string; status: string };

export function PaymentSettings({ canEdit, integrations, testAllowed, baseUrl }: { canEdit: boolean; integrations: Integ[]; testAllowed: boolean; baseUrl: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [stripe, setStripe] = useState({ sk: "", wh: "" });
  const [bp, setBp] = useState({ apiKey: "", xSignatureKey: "", collectionId: "", mode: "test" as "test" | "live" });
  const get = (p: string) => integrations.find((i) => i.provider === p);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      setOk(false);
      const r = await fn();
      if (r.ok) setOk(true);
      else setError(r.error ?? "errors.unexpected");
      router.refresh();
    });

  const Status = ({ p }: { p: string }) => {
    const i = get(p);
    return i?.status === "connected" ? (
      <span className="flex items-center gap-2">
        <Badge tone="success">{t("settings.connected")}</Badge>
        <Badge tone={i.mode === "live" ? "yellow" : "neutral"}>{i.mode === "live" ? t("common.live") : t("common.test")}</Badge>
      </span>
    ) : (
      <Badge>{t("settings.disconnected")}</Badge>
    );
  };
  const Disconnect = ({ p }: { p: "stripe" | "billplz" | "test" }) =>
    get(p)?.status === "connected" && canEdit ? (
      <Button size="sm" variant="ghost" onClick={() => run(() => disconnectProviderAction(p))} disabled={pending}>
        {t("settings.disconnect")}
      </Button>
    ) : null;

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <p className="text-lg font-bold">{t("settings.payTitle")}</p>
        <p className="text-sm text-muted">{t("settings.paySub")}</p>
      </div>
      {error && <Notice tone="danger">{t(error)}</Notice>}
      {ok && <Notice tone="success">{t("payments.connectedOk")}</Notice>}
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-bold"><CreditCard className="size-5" /> {t("settings.stripeTitle")}</p>
            <Status p="stripe" />
          </div>
          <p className="text-sm text-muted">{t("settings.stripeDesc")}</p>
          <Field label={t("settings.stripeSecret")}>
            <Input type="password" autoComplete="off" value={stripe.sk} onChange={(e) => setStripe({ ...stripe, sk: e.target.value })} />
          </Field>
          <Field label={t("settings.stripeWebhook")}>
            <Input type="password" autoComplete="off" value={stripe.wh} onChange={(e) => setStripe({ ...stripe, wh: e.target.value })} />
          </Field>
          {get("stripe") && (
            <p className="text-xs text-muted">
              {t("settings.stripeWebhookUrl")} <code className="break-all font-semibold text-ink">{baseUrl}/api/webhooks/stripe/{get("stripe")!.id}</code>
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => run(() => connectStripeAction(stripe.sk, stripe.wh))}>{pending && <Loader2 className="size-4 animate-spin" />}{t("settings.connect")}</Button>
            <Disconnect p="stripe" />
          </div>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-bold"><Landmark className="size-5" /> {t("settings.billplzTitle")}</p>
            <Status p="billplz" />
          </div>
          <p className="text-sm text-muted">{t("settings.billplzDesc")}</p>
          <Notice tone="warning">{t("settings.billplzNote")}</Notice>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("settings.billplzKey")}><Input type="password" autoComplete="off" value={bp.apiKey} onChange={(e) => setBp({ ...bp, apiKey: e.target.value })} /></Field>
            <Field label={t("settings.billplzXsig")}><Input type="password" autoComplete="off" value={bp.xSignatureKey} onChange={(e) => setBp({ ...bp, xSignatureKey: e.target.value })} /></Field>
            <Field label={t("settings.billplzCollection")}><Input value={bp.collectionId} onChange={(e) => setBp({ ...bp, collectionId: e.target.value })} /></Field>
            <Field label={t("settings.billplzMode")}>
              <Select value={bp.mode} onChange={(e) => setBp({ ...bp, mode: e.target.value as "test" | "live" })}>
                <option value="test">{t("settings.billplzSandbox")}</option>
                <option value="live">{t("settings.billplzProduction")}</option>
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => run(() => connectBillplzAction(bp))}>{t("settings.connect")}</Button>
            <Disconnect p="billplz" />
          </div>
        </Card>

        {testAllowed && (
          <Card className="space-y-3 border-dashed p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-bold"><FlaskConical className="size-5 text-warning" /> {t("settings.testTitle")}</p>
              <Status p="test" />
            </div>
            <p className="text-sm text-muted">{t("settings.testDesc")}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => run(() => connectTestGatewayAction())}>{t("settings.connect")}</Button>
              <Disconnect p="test" />
            </div>
          </Card>
        )}
      </fieldset>
      <p className="text-xs text-muted">{t("settings.secretsNote")}</p>
    </div>
  );
}
