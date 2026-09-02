import cron from "node-cron";
import { watchNewPools } from "./collectors/newPools.js";
import { assertProductionConfig, flags, hasXCredentials } from "./config.js";
import { closeDb, initDb } from "./db.js";
import { runHarness, runSelfTest } from "./harness.js";
import { log } from "./logger.js";
import { ingestSignals, runPostingPipeline, runReplyPipeline } from "./pipeline.js";

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
    await runPostingPipeline();
    await runReplyPipeline();
    await closeDb();
    return;
  }

  const stopWatch = watchNewPools((signal) => {
    log.info("realtime pool signal", { ref: signal.ref });
    void ingestSignals([signal]);
  });

  const postingJob = cron.schedule("*/3 * * * *", () => {
    void runPostingPipeline().catch((err) => log.error("posting cycle", { err: String(err) }));
  });

  const replyTimer = setInterval(() => {
    void runReplyPipeline().catch((err) => log.error("reply cycle", { err: String(err) }));
  }, 90_000);

  void runPostingPipeline().catch((err) => log.error("initial posting", { err: String(err) }));
  void runReplyPipeline().catch((err) => log.error("initial reply", { err: String(err) }));

  log.info("loops armed: posting */3min, replies 90s, ws new-pools");

  const shutdown = async (signal: string) => {
    log.info("shutdown", { signal });
    postingJob.stop();
    clearInterval(replyTimer);
    stopWatch();
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
