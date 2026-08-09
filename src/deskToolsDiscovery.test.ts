import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ktcDeskToolsOpenEndpoint,
  ktcDeskToolsRegistrationDirectory,
  ktcIsDeskToolsServiceRegistration,
  ktcReadDeskToolsInstallationRegistration,
  ktcReadDeskToolsServiceRegistration,
} from "./deskToolsDiscovery.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktc-desk-discovery-"));
  temporaryDirectories.push(directory);
  return directory;
}

function service(port = 48_375): Record<string, unknown> {
  return {
    schema_version: 1,
    service: "phoenix-desk-tools",
    protocol_version: 1,
    host: "127.0.0.1",
    port,
    pid: 123,
    instance_id: "instance-123",
    started_at: "2026-07-20T12:00:00.000Z",
    health_path: "/api/caa/health",
    caa_open_path: "/api/caa/dialog/open",
  };
}

describe("Desk Tools discovery", () => {
  it("uses the shared platform registration location", () => {
    expect(ktcDeskToolsRegistrationDirectory({}, "darwin", "/Users/test"))
      .toBe("/Users/test/Library/Application Support/phoenix-wing/phoenix/services/desk-tools");
    expect(ktcDeskToolsRegistrationDirectory({ LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" }, "win32", "C:\\Users\\test"))
      .toBe(path.join("C:\\Users\\test\\AppData\\Local", "phoenix-wing", "phoenix", "services", "desk-tools"));
  });

  it("accepts only the loopback v1 service contract", () => {
    expect(ktcIsDeskToolsServiceRegistration(service())).toBe(true);
    expect(ktcIsDeskToolsServiceRegistration({ ...service(), host: "localhost" })).toBe(false);
    expect(ktcIsDeskToolsServiceRegistration({ ...service(), port: 70_000 })).toBe(false);
    expect(ktcIsDeskToolsServiceRegistration({ ...service(), caa_open_path: "/other" })).toBe(false);
  });

  it("reads a valid live service and derives its open endpoint", () => {
    const directory = temporaryDirectory();
    fs.writeFileSync(path.join(directory, "service.v1.json"), JSON.stringify(service(48_382)));
    const registration = ktcReadDeskToolsServiceRegistration(directory);
    expect(registration).toBeDefined();
    expect(ktcDeskToolsOpenEndpoint(registration!)).toBe("http://127.0.0.1:48382/api/caa/dialog/open");
  });

  it("rejects malformed and oversized registrations", () => {
    const directory = temporaryDirectory();
    fs.writeFileSync(path.join(directory, "service.v1.json"), "{");
    expect(ktcReadDeskToolsServiceRegistration(directory)).toBeUndefined();
    fs.writeFileSync(path.join(directory, "service.v1.json"), "x".repeat(64 * 1024 + 1));
    expect(ktcReadDeskToolsServiceRegistration(directory)).toBeUndefined();
  });

  it("reads the stable native provider installation record", () => {
    const directory = temporaryDirectory();
    const provider = path.join(directory, "runtime", "native-provider.json");
    fs.writeFileSync(path.join(directory, "installation.v1.json"), JSON.stringify({
      schema_version: 1,
      product: "phoenix-desk-tools",
      product_version: "0.2.0",
      native_provider_manifest: provider,
      updated_at: "2026-07-20T12:00:00.000Z",
    }));
    expect(ktcReadDeskToolsInstallationRegistration(directory)?.native_provider_manifest).toBe(provider);
  });
});
