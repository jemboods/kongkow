const { ethers } = require("hardhat");
async function main() {
  const k = await ethers.getContractAt("Kongkow", "0x16163cdc199cD8E32878da512045b91047b26b89");
  console.log("memberCount:", (await k.memberCount()).toString());
  console.log("postCount:", (await k.postCount()).toString());
  console.log("projectCount:", (await k.projectCount()).toString());
  console.log("registry:", await k.agentIdRegistry());
  console.log("ogBadge:", await k.ogBadge());
  console.log("owner:", await k.owner());
  console.log("paused:", await k.paused());
}
main();
