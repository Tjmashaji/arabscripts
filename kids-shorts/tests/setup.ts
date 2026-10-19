import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";

process.env.DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "kids-shorts-test-"));
process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(63) + "1";
process.env.APP_URL = "http://localhost:3000";
