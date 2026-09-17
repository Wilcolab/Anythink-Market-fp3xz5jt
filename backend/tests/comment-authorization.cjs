const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

async function check(owner, item, expected, saveError) {
  let handler;
  const mutations = [];
  let status;
  let forwarded;
  const router = {
    param() {}, get() {}, post() {}, put() {},
    delete(route, auth, callback) {
      if (route === "/:item/comments/:comment") handler = callback;
    }
  };
  const Comment = { find() {
    mutations.push("delete");
    return { remove() { return { exec() { return Promise.resolve(); } }; } };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../routes/api/items.js"), "utf8"), {
    module: { exports: {} },
    require(name) {
      if (name === "express") return { Router: () => router };
      if (name === "mongoose") return { model: n => n === "Comment" ? Comment : {} };
      return {};
    }
  });
  await handler({
    payload: { id: "alice" },
    comment: { _id: "comment", seller: owner, item },
    item: { _id: "item", comments: { remove() { mutations.push("unlink"); } },
      save() {
        mutations.push("save");
        return saveError ? Promise.reject(saveError) : Promise.resolve();
      }
    }
  }, { sendStatus(code) { status = code; } }, error => { forwarded = error; });
  assert.strictEqual(status, expected);
  assert.strictEqual(forwarded, saveError);
  assert.deepStrictEqual(mutations, expected === 204 ? ["unlink", "save", "delete"] :
    saveError ? ["unlink", "save"] : []);
}

(async () => {
  await check("bob", "item", 403);
  await check("alice", "other-item", 404);
  await check("alice", "item", 204);
  await check("alice", "item", undefined, new Error("save failed"));
  console.log("PASS: ownership, item binding, successful deletion, and save-error handling");
})().catch(error => { console.error(error); process.exitCode = 1; });
