import type { integrations } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { readSecrets, testGatewayAllowed } from "./integrations";
import { StripeGateway } from "./stripe";
import { BillplzGateway } from "./billplz";
import { TestGateway } from "./test-gateway";
import type { BillplzSecrets, PaymentGateway, StripeSecrets } from "./types";

export function gatewayFor(row: typeof integrations.$inferSelect): PaymentGateway {
  switch (row.provider) {
    case "stripe":
      return new StripeGateway(readSecrets<StripeSecrets>(row));
    case "billplz":
      return new BillplzGateway(readSecrets<BillplzSecrets>(row), row.mode === "live" ? "live" : "test");
    case "test":
      if (!testGatewayAllowed()) throw new AppError("payments.testGatewayDisabled");
      return new TestGateway();
    default:
      throw new AppError("payments.notConfigured");
  }
}
