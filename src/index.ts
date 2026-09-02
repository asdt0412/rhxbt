import cron from "node-cron";
import { assertProductionConfig, flags, hasXCredentials } from "./config.js";
import { closeDb, initDb } from "./db.js";
import { runHarness, runSelfTest } from "./harness.js";
import { log } from "./logger.js";
import { runDailyRecap, runLookTick, runReplyPipeline } from "./pipeline.js";

function banner(): void {
  log.info("rhood agent starting", {
    dryRun: flags.dryRun,
    selfTest: flags.selfTest,
    once: flags.once,
    fixtures: flags.fixtures,
  });
}

async function main(): Promise<void> {
  banner();
  assertProductionConfig();
  await initDb();

  if (flags.selfTest) {
    runSelfTest();
    await runHarness();
    log.info("self-test + harness complete — exiting");
    await closeDb();
    return;
  }

  if (flags.dryRun) {
    runSelfTest();
    if (flags.fixtures || !hasXCredentials()) {
      await runHarness();
    }
  }

  if (flags.once) {
    // Independent loops — never await one from the other.
    await Promise.all([runLookTick(), runReplyPipeline()]);
    await closeDb();
    return;
  }

  // Look cadence only: how often we inspect the chain. Posting is event-driven.
  const lookJob = cron.schedule("*/3 * * * *", () => {
    void runLookTick().catch((err) => log.error("look tick", { err: String(err) }));
  });

  const recapJob = cron.schedule(
    "0 21 * * *",
    () => {
      void runDailyRecap().catch((err) => log.error("daily recap", { err: String(err) }));
    },
    { timezone: "America/New_York" },
  );

  const replyJob = cron.schedule("*/10 * * * *", () => {
    void runReplyPipeline().catch((err) => log.error("reply cycle", { err: String(err) }));
  });

  void runLookTick().catch((err) => log.error("initial look", { err: String(err) }));
  void runReplyPipeline().catch((err) => log.error("initial reply", { err: String(err) }));

  log.info(
    "loops armed independently: look */3min (post iff analyzer says so), recap 21:00 ET, replies */10min (max 1)",
  );

  const shutdown = async (signal: string) => {
    log.info("shutdown", { signal });
    lookJob.stop();
    recapJob.stop();
    replyJob.stop();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (err) => {
  log.error("fatal", { err: String(err) });
  await closeDb();
  process.exit(1);
});
