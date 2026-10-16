// نقطة تشغيل العامل الخلفي: npm run worker
import { closeWorkerPool } from "./db";
import { tick, WORKER_ID } from "./runner";

let stopping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`[worker] ${WORKER_ID} started`);
  while (!stopping) {
    try {
      const worked = await tick();
      if (!worked) await sleep(1000);
    } catch (e) {
      console.error("[worker] loop error", e);
      await sleep(3000);
    }
  }
  await closeWorkerPool();
  console.log("[worker] stopped");
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stopping = true));
void main();
