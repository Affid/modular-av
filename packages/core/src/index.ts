import { installApi } from "./api.ts";
import "./foundry/globals.ts";

Hooks.once("init", () => {
  installApi(game);
});
