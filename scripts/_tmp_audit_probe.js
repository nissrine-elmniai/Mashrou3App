const fs = require("fs");
const https = require("https");
const net = require("net");

const seed = fs.readFileSync(
  "c:/Users/User/mashrou3App/Mashrou3App/scripts/.env.seed",
  "utf8"
);
const envEx = fs.readFileSync(
  "c:/Users/User/mashrou3App/Mashrou3App/.env.example",
  "utf8"
);
const env = fs.readFileSync(
  "c:/Users/User/mashrou3App/Mashrou3App/.env",
  "utf8"
);
const key = (seed.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/) || [])[1].trim();
const pwdMatch =
  env.match(/SUPABASE_DB_PASSWORD\s*=\s*"?([^"\r\n]+)"?/) ||
  envEx.match(/SUPABASE_DB_PASSWORD\s*=\s*"?([^"\r\n]+)"?/);
const pwd = pwdMatch ? pwdMatch[1].trim() : null;

function rest(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        hostname: "104.18.38.10",
        path,
        method: "GET",
        headers: {
          Host: "okqmyayjeiwzjkwlkmia.supabase.co",
          apikey: key,
          Authorization: "Bearer " + key,
          ...headers,
        },
        timeout: 30000,
        servername: "okqmyayjeiwzjkwlkmia.supabase.co",
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: d, headers: res.headers })
        );
      }
    );
    r.on("error", reject);
    r.on("timeout", () => {
      r.destroy();
      reject(new Error("timeout"));
    });
    r.end();
  });
}

function tcpCheck(host, port, ms = 8000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port, family: 4 }, () => {
      s.end();
      resolve(true);
    });
    s.setTimeout(ms, () => {
      s.destroy();
      resolve(false);
    });
    s.on("error", () => resolve(false));
  });
}

(async () => {
  console.log("pwd present", !!pwd);
  console.log(
    "tcp db:5432",
    await tcpCheck("db.okqmyayjeiwzjkwlkmia.supabase.co", 5432)
  );
  console.log(
    "tcp pooler:6543",
    await tcpCheck("aws-0-eu-central-1.pooler.supabase.com", 6543)
  );

  // Probe missing columns from 0004 that should NOT exist
  for (const col of [
    "juze",
    "tumun",
    "note",
    "created_at",
    "updated_at",
    "nb_hizb_completes",
    "date",
  ]) {
    const r = await rest(
      `/rest/v1/progression?select=${col}&limit=1`
    );
    const ok = r.status === 200;
    const err = ok ? "" : r.body.slice(0, 120);
    console.log(`col ${col}: ${r.status} ${err}`);
  }

  // Cron: no direct REST; try known RPCs list via openapi paths
  const oa = await rest("/rest/v1/", { Accept: "application/openapi+json" });
  console.log("openapi", oa.status, oa.body.length);
  if (oa.status === 200) {
    const spec = JSON.parse(oa.body);
    const paths = Object.keys(spec.paths || {});
    const rpc = paths.filter((p) => p.startsWith("/rpc/")).sort();
    console.log(
      "rpc with cron/presence/progress",
      rpc.filter((p) => /cron|presence|progress|rappel/i.test(p)).join(", ")
    );
  }
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
