import { strictEqual, deepStrictEqual } from "node:assert";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { ROLE_ROUTES, DEFAULT_LANDING, canAccess } from "./permissions";

test("Campaign-request route files are removed, including for wildcard admins", () => {
  strictEqual(existsSync(new URL("../routes/request-campaign.tsx", import.meta.url)), false);
  strictEqual(existsSync(new URL("../routes/campaign-requests.tsx", import.meta.url)), false);
  deepStrictEqual(ROLE_ROUTES.admin, ["*"]);
});

test("No explicit role route or landing points at campaign-request pages", () => {
  for (const routes of Object.values(ROLE_ROUTES)) {
    strictEqual(routes.includes("/request-campaign"), false);
    strictEqual(routes.includes("/campaign-requests"), false);
  }
  for (const landing of Object.values(DEFAULT_LANDING)) {
    strictEqual(landing === "/request-campaign" || landing === "/campaign-requests", false);
  }
});

test("WC, legacy JFC and coordinator lose request access without losing existing campaign access", () => {
  for (const role of ["wc", "jfc", "coordinator"] as const) {
    strictEqual(canAccess(role, "/request-campaign"), false);
    strictEqual(canAccess(role, "/campaign-requests"), false);
    strictEqual(canAccess(role, "/campaigns"), true);
    strictEqual(canAccess(role, "/review"), true);
  }
  strictEqual(canAccess("wc", "/launch"), true);
  strictEqual(canAccess("jfc", "/launch"), true);
  strictEqual(canAccess("coordinator", "/launch"), false);
});

test("Network Administrator gains only launch access and keeps its landing", () => {
  deepStrictEqual(ROLE_ROUTES.network_admin, [
    "/ecosystem-view", "/user-level-analysis", "/", "/campaigns", "/review", "/launch",
  ]);
  strictEqual(canAccess("network_admin", "/launch"), true);
  strictEqual(canAccess("network_admin", "/settings"), false);
  strictEqual(canAccess("network_admin", "/request-campaign"), false);
  strictEqual(canAccess("network_admin", "/campaign-requests"), false);
  strictEqual(DEFAULT_LANDING.network_admin, "/user-level-analysis");
});

test("All other roles retain their exact route permissions", () => {
  const { network_admin: _networkAdmin, ...otherRoutes } = ROLE_ROUTES;
  deepStrictEqual(otherRoutes, {
    admin: ["*"],
    jfc: ["/user-level-analysis", "/", "/campaigns", "/review", "/launch", "/ecosystem-view"],
    wc: ["/user-level-analysis", "/", "/campaigns", "/review", "/launch", "/ecosystem-view"],
    coordinator: ["/user-level-analysis", "/", "/campaigns", "/review"],
    owner: ["/user-level-analysis", "/"],
    ecosystem: ["/ecosystem-view", "/user-level-analysis", "/"],
    user: ["/user-level-analysis", "/", "/campaigns", "/review"],
  });
});