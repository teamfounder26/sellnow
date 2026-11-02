import { requireAdmin } from "@/lib/admin/guard";
import { getConfig } from "@/lib/finance/settings";
import { selltroEnvironment } from "@/lib/finance/selltro-pay";
import { Panel } from "@/components/admin/ui";
import { PlatformSettingsForm } from "@/components/admin/PlatformSettingsForm";

export const metadata = { title: "Platform Settings" };

export default async function SettingsAdmin() {
  const a = await requireAdmin("settings.edit");
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">Platform settings</h1>
      <p className="text-sm text-muted">Every change asks for your password and is written to the audit trail. Money switches default to OFF.</p>
      <Panel title="Selltro Pay, settlements & couriers">
        <PlatformSettingsForm initial={await getConfig(a.db)} environment={selltroEnvironment()} />
      </Panel>
    </>
  );
}
