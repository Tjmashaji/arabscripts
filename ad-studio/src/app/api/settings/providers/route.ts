import { handler } from "@/server/http/route";
import { capabilityStatus } from "@/server/providers/registry";
import { env } from "@/server/env";

export const GET = handler(async () => ({ capabilities: capabilityStatus(), simulation_allowed: env().simulationAllowed }));
