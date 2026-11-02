import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/auth/session";
import { getT } from "@/lib/i18n/server";
import { listIntegrations, testGatewayAllowed } from "@/lib/payments/integrations";
import { aiCreditLedger, aiGenerations, discountCodes, workspaceMembers, users } from "@/lib/db/schema";
import { AIConnectionTest } from "@/components/settings/AIConnectionTest";
import { creditBalance } from "@/lib/billing/credits";
import { getPlan } from "@/lib/billing/plans";
import { getAIProvider } from "@/lib/ai/provider";
import { readDevVerifyLink, resendVerificationAction } from "@/app/actions/auth";
import { renameWorkspaceAction } from "@/app/actions/workspace";
import { formatMYR } from "@/lib/money";
import { Badge, Button, Card, Field, Input, Notice, SectionHeader } from "@/components/ui";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SelltroPaySettings } from "@/components/commerce/SelltroPaySettings";
import { OrderPaymentSettings } from "@/components/commerce/OrderPaymentSettings";
import { ShippingSettings } from "@/components/commerce/ShippingSettings";
import { bankHistory, getSellerAccount, selltroEnvironment, selltroReady } from "@/lib/finance/selltro-pay";
import { getOrderSettings } from "@/lib/orders/settings";
import { exportRulesCsv, listRules, listZones } from "@/lib/shipping/rules";
import { getShipper } from "@/lib/couriers/service";
import { DiscountSettings } from "@/components/settings/DiscountSettings";
import { appUrl } from "@/lib/http";

const TABS = ["profile", "workspace", "payments", "orders", "shipping", "billing", "ai", "discounts"] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as (typeof TABS)[number]) : "profile";
  const { db, workspace, user, role } = await requireWorkspace("viewer");
  const { t, locale } = await getT();
  const fmt = new Intl.DateTimeFormat(locale === "ms" ? "ms-MY" : "en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: workspace.timezone });

  return (
    <>
      <SectionHeader title={t("settings.title")} />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((k) => (
          <Link key={k} href={`/dashboard/settings?tab=${k}`} className={`whitespace-nowrap rounded-pill px-4 py-1.5 text-sm font-semibold ${tab === k ? "bg-primary text-white" : "border border-line bg-surface text-muted"}`}>
            {k === "ai" ? t("aiSettings.tab") : k === "payments" ? t("selltro.title") : t(`settings.${k}`)}
          </Link>
        ))}
      </div>

      {tab === "profile" && (
        <div className="max-w-2xl space-y-4">
          <Card className="p-5">
            <p className="font-bold">{t("common.language")}</p>
            <p className="mb-3 text-sm text-muted">{t("settings.languageHelp")}</p>
            <LanguageSwitcher />
          </Card>
          <Card className="space-y-3 p-5">
            <p className="font-bold">{t("auth.email")}</p>
            <p className="flex items-center gap-2 text-sm">
              {user.email} {user.emailVerifiedAt ? <Badge tone="success">✓ {t("auth.verified")}</Badge> : <Badge tone="warning">{t("auth.verifyTitle")}</Badge>}
            </p>
            {!user.emailVerifiedAt && (
              <>
                <p className="text-sm text-muted">{t("auth.verifyBody", { email: user.email })}</p>
                <form action={resendVerificationAction}>
                  <Button size="sm" variant="secondary">{t("auth.verifyResend")}</Button>
                </form>
                {await (async () => {
                  const link = await readDevVerifyLink();
                  return link ? (
                    <Notice tone="blue">
                      {t("auth.verifyDevNote")}{" "}
                      <a href={link} className="break-all font-semibold underline">{link}</a>
                    </Notice>
                  ) : null;
                })()}
              </>
            )}
          </Card>
        </div>
      )}

      {tab === "workspace" && (
        <div className="max-w-2xl space-y-4">
          <Card className="p-5">
            <form action={async (f: FormData) => { "use server"; await renameWorkspaceAction(undefined, f); }} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={t("settings.workspaceName")}>
                  <Input name="name" defaultValue={workspace.name} disabled={role !== "owner" && role !== "admin"} />
                </Field>
              </div>
              <Button disabled={role !== "owner" && role !== "admin"}>{t("common.save")}</Button>
            </form>
          </Card>
          <Card className="p-5">
            <p className="font-bold">{t("settings.members")}</p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {(await db.select({ role: workspaceMembers.role, name: users.name, email: users.email }).from(workspaceMembers).innerJoin(users, eq(users.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspace.id))).map((m) => (
                <li key={m.email} className="flex items-center justify-between py-2.5">
                  <span>
                    <b>{m.name}</b> <span className="text-muted">· {m.email}</span>
                  </span>
                  <Badge>{t(`settings.roles.${m.role}`)}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{t("settings.membersNote")}</p>
          </Card>
        </div>
      )}

      {tab === "payments" && (async () => {
        const acct = await getSellerAccount(db, workspace.id);
        const legacy = (await listIntegrations(db, workspace.id)).find((i) => i.kind === "payment" && i.status === "connected");
        const banks = await bankHistory(db, workspace.id);
        return (
          <SelltroPaySettings
            canEdit={role === "owner"}
            environment={selltroEnvironment()}
            status={acct?.status ?? "NOT_ACTIVATED"}
            reviewNote={acct?.reviewNote ?? null}
            legacyProvider={legacy && acct?.status !== "ACTIVE" ? legacy.provider : null}
            banks={banks.map((b) => ({ id: b.id, bankName: b.bankName, last4: b.accountLast4, holderName: b.holderName, status: b.status, current: !b.supersededAt, createdAt: b.createdAt.toISOString() }))}
          />
        );
      })()}

      {tab === "orders" && <OrderPaymentSettings initial={await getOrderSettings(db, workspace.id)} selltroActive={await selltroReady(db, workspace.id)} canEdit={role === "owner" || role === "admin"} />}

      {tab === "shipping" && (async () => {
        const [rules, zones, shipper] = await Promise.all([listRules(db, workspace.id), listZones(db, workspace.id), getShipper(db, workspace.id)]);
        return <ShippingSettings rules={rules} zones={zones} shipper={shipper} canEdit={role === "owner" || role === "admin"} csv={exportRulesCsv(rules)} />;
      })()}

      {tab === "billing" && (
        <div className="max-w-3xl space-y-4">
          {await (async () => {
            const plan = getPlan(workspace.plan);
            const [balance, ledger, ai] = await Promise.all([creditBalance(db, workspace.id), db.query.aiCreditLedger.findMany({ where: eq(aiCreditLedger.workspaceId, workspace.id), orderBy: desc(aiCreditLedger.createdAt), limit: 30 }), getAIProvider()]);
            return (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card className="p-5">
                    <p className="text-sm font-semibold text-muted">{t("settings.plan")}</p>
                    <p className="mt-2 text-2xl font-extrabold capitalize">{plan.id}</p>
                    <p className="text-sm text-muted">{plan.priceSen ? `${formatMYR(plan.priceSen, locale)}${t("landing.perMonth")}` : "RM0"}</p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-sm font-semibold text-muted">{t("settings.creditBalance")}</p>
                    <p className="mt-2 text-2xl font-extrabold">{balance}</p>
                  </Card>
                  <Card className="p-5">
                    <p className="text-sm font-semibold text-muted">{t("settings.aiStatus")}</p>
                    <p className="mt-2 text-sm font-semibold">{ai ? t("settings.aiConfigured", { model: ai.model }) : t("settings.aiNotConfigured")}</p>
                  </Card>
                </div>
                <Notice tone="blue">{t("settings.upgradeNote")} {t("settings.topupNote")}</Notice>
                <Card className="p-5">
                  <p className="font-bold">{t("settings.usage")}</p>
                  <ul className="mt-3 divide-y divide-line text-sm">
                    {ledger.map((l) => (
                      <li key={l.id} className="flex items-center justify-between py-2">
                        <span>{t(`settings.ledgerReason.${l.reason}`)}</span>
                        <span className="flex items-center gap-3">
                          <time className="text-xs text-muted">{fmt.format(l.createdAt)}</time>
                          <b className={l.delta < 0 ? "text-danger" : "text-success"}>{l.delta > 0 ? `+${l.delta}` : l.delta}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            );
          })()}
        </div>
      )}

      {tab === "ai" && (
        <div className="max-w-3xl space-y-4">
          {await (async () => {
            const provider = await getAIProvider();
            const usage = await db.query.aiGenerations.findMany({ where: eq(aiGenerations.workspaceId, workspace.id), orderBy: desc(aiGenerations.createdAt), limit: 20 });
            return (
              <>
                <Card className="p-5">
                  <p className="text-sm font-semibold text-muted">{t("aiSettings.provider")}</p>
                  <p className="mt-1 text-lg font-bold">{provider ? `${provider.name} · ${provider.model}` : t("settings.aiNotConfigured")}</p>
                  <p className="mt-1 text-sm text-muted">{t("aiSettings.serverOnly")}</p>
                  {(role === "owner" || role === "admin") && <AIConnectionTest />}
                </Card>
                <Card className="p-5">
                  <p className="font-bold">{t("aiSettings.usage")}</p>
                  {usage.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">{t("aiSettings.noUsage")}</p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs text-muted">
                          <tr>
                            <th className="py-1.5 pr-3 font-semibold">{t("aiSettings.cols.task")}</th>
                            <th className="py-1.5 pr-3 font-semibold">{t("aiSettings.cols.model")}</th>
                            <th className="py-1.5 pr-3 font-semibold">{t("aiSettings.cols.tokens")}</th>
                            <th className="py-1.5 pr-3 font-semibold">{t("aiSettings.cols.credits")}</th>
                            <th className="py-1.5 font-semibold">{t("aiSettings.cols.status")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {usage.map((g) => (
                            <tr key={g.id}>
                              <td className="py-2 pr-3 font-mono text-xs">{g.task}</td>
                              <td className="py-2 pr-3 text-xs">{g.model}</td>
                              <td className="py-2 pr-3 tabular-nums">{g.inputTokens ?? 0} / {g.outputTokens ?? 0}</td>
                              <td className="py-2 pr-3 tabular-nums">{g.status === "failed" ? "0 (refunded)" : g.credits}</td>
                              <td className="py-2"><Badge tone={g.status === "succeeded" ? "success" : g.status === "failed" ? "danger" : "neutral"}>{g.status}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </>
            );
          })()}
        </div>
      )}

      {tab === "discounts" && (
        <DiscountSettings
          canEdit={role === "owner" || role === "admin"}
          codes={(await db.query.discountCodes.findMany({ where: eq(discountCodes.workspaceId, workspace.id), orderBy: desc(discountCodes.createdAt) })).map((d) => ({ id: d.id, code: d.code, kind: d.kind as "percent" | "fixed", value: d.value, active: d.active, maxRedemptions: d.maxRedemptions, redemptions: d.redemptions }))}
        />
      )}
    </>
  );
}
