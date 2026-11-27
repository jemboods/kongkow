// Verify Kongkow + KongkowOG on Sourcify API v2 using the Hardhat build-info.
// Usage: node scripts/verify-sourcify.js
const fs = require("fs");
const path = require("path");

const KONGKOW = "0x1F3aD13f2fD29B44C212aE8A08d8AB0d8BFF854A";
const OG = "0x318DA5d4dD57437C8B75Bd5A91DaB4Dec7e34d1d";
const CHAIN = "56";
const BASE = "https://sourcify.dev/server";

function loadBuildInfo() {
  const biDir = path.join(__dirname, "..", "artifacts", "build-info");
  const biFile = fs
    .readdirSync(biDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(biDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  return JSON.parse(fs.readFileSync(biFile, "utf8"));
}

async function verify(bi, address, sourcePath, contractName) {
  const res = await fetch(`${BASE}/v2/verify/${CHAIN}/${address}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stdJsonInput: bi.input,
      compilerVersion: bi.solcLongVersion,
      contractIdentifier: `${sourcePath}:${contractName}`,
    }),
  });
  const job = await res.json();
  console.log(contractName, "submit:", res.status, JSON.stringify(job).slice(0, 200));
  if (!job.verificationId) return;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const poll = await fetch(`${BASE}/v2/verify/${job.verificationId}`);
    const status = await poll.json();
    if (status.isJobCompleted) {
      console.log(
        contractName,
        "result:",
        JSON.stringify(status.contract || status).slice(0, 300)
      );
      return;
    }
  }
  console.log(contractName, "still pending after polling");
}

(async () => {
  const bi = loadBuildInfo();
  await verify(bi, KONGKOW, "contracts/Kongkow.sol", "Kongkow");
  await verify(bi, OG, "contracts/KongkowOG.sol", "KongkowOG");
})();
