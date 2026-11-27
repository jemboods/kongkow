const { ethers } = require("hardhat");
async function main() {
  const k = await ethers.getContractAt("Kongkow", "0x1F3aD13f2fD29B44C212aE8A08d8AB0d8BFF854A");
  console.log("memberCount:", (await k.memberCount()).toString());
  console.log("postCount:", (await k.postCount()).toString());
  console.log("projectCount:", (await k.projectCount()).toString());
  console.log("registry:", await k.agentIdRegistry());
  console.log("ogBadge:", await k.ogBadge());
  console.log("owner:", await k.owner());
  console.log("paused:", await k.paused());
}
main();
