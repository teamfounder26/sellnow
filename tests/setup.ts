import { randomBytes } from "node:crypto";
process.env.APP_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
process.env.APP_SIGNING_SECRET ??= randomBytes(32).toString("hex");
