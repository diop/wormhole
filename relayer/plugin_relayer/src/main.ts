/*
1 Load config files onto process environment
2 Init Logging
3 Create The Common Environment
4 Init Plugins
5 Branch, based on Listen or Execute

Listen Path
-Init Listener

Execute
-Init Executor
*/

require("./helpers/loadConfig");

import { setDefaultWasm } from "@certusone/wormhole-sdk/lib/cjs/solana/wasm";
import * as executorHarness from "./executor/executorHarness";
import { getLogger } from "./helpers/logHelper";
import { PromHelper, PromMode } from "./helpers/promHelpers";
// import * as redisHelper from "./helpers/redisHelper";
import { createStorage, RedisStorage } from "./helpers/storage";
import * as listenerHarness from "./listener/listenerHarness";
import { loadPlugins } from "./loadPlugins";
import { loadUntypedEnvs } from "./helpers/loadConfig";
import { getCommonEnv, validateEnvs } from "./helpers/validateConfig";

setDefaultWasm("node");

// instantiate common environment

async function main() {
  await loadUntypedEnvs().then(async o => validateEnvs(o));
  const commonEnv = getCommonEnv();
  console.log("here");
  const logger = getLogger();
  const plugins = await loadPlugins(commonEnv);
  const storage = await createStorage(commonEnv);

  launchReadinessPortTask();

  if (process.env.MODE === "listener") {
    logger.info("Running in listener mode");
    // init listener harness
    const promHelper = new PromHelper(
      "plugin_relayer",
      commonEnv.promPort,
      PromMode.Listen
    );

    await listenerHarness.run(plugins, storage);
  } else if (process.env.MODE === "executor") {
    logger.info("Running in executor mode");
    // init executor harness
    const promHelper = new PromHelper(
      "plugin_relayer",
      commonEnv.promPort,
      PromMode.Execute
    );

    executorHarness.run(plugins, storage);
  } else {
    throw new Error(
      "Expected MODE env var to be listener or executor, instead got: " +
        process.env.MODE
    );
  }
}

async function launchReadinessPortTask() {
  const commonEnv = getCommonEnv();
  if (commonEnv.readinessPort) {
    const Net = await import("net");
    const readinessServer = new Net.Server();
    readinessServer.listen(commonEnv.readinessPort, function () {
      getLogger().info(
        "listening for readiness requests on port " + commonEnv.readinessPort
      );
    });

    readinessServer.on("connection", function (socket: any) {
      //logger.debug("readiness connection");
    });
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
