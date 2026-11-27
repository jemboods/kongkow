const { ethers } = require("hardhat");
async function main() {
  const [d] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(d.address);
  const fee = await ethers.provider.getFeeData();
  console.log("deployer:", d.address);
  console.log("balance BNB:", ethers.formatEther(bal));
  console.log("gasPrice gwei:", ethers.formatUnits(fee.gasPrice, "gwei"));
}
main();
