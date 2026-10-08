import test from "node:test";
import assert from "node:assert/strict";
import {
  workerIsAlive,
  processIdentity,
} from "../src/lib/render/WorkerIdentity";
test("recovery rejects zombie workers and reused process IDs, while retaining a live matching owner", () => {
  assert.equal(
    workerIsAlive(process.pid, "123", () => ({ state: "Z", startedAt: "123" })),
    false,
  );
  assert.equal(
    workerIsAlive(process.pid, "123", () => ({ state: "S", startedAt: "456" })),
    false,
  );
  assert.equal(
    workerIsAlive(process.pid, "123", () => ({ state: "S", startedAt: "123" })),
    true,
  );
  assert.equal(workerIsAlive(), false);
  assert.equal(workerIsAlive(process.pid), false);
  const identity = processIdentity(process.pid);
  if (identity)
    assert.equal(workerIsAlive(process.pid, identity.startedAt), true);
});
