import { run, subcommands } from "cmd-ts";

import { cmdCreateCards } from "./cmdCreateCards.ts";

const app = subcommands({
  name: "just create-cards",
  cmds: {
    "create-cards": cmdCreateCards,
  },
});

try {
  void run(app, Deno.args);
} catch (err) {
  console.log("Unhandled error", err);
}
