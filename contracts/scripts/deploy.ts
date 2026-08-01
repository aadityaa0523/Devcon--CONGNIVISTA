import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Deploying VoxVault to Sepolia...");

  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with account: ${deployer.address}`);

  // Configuration - can be set via env vars or hardcoded
  const ownerAddress = process.env.OWNER_ADDRESS || deployer.address;
  const sessionKeyDuration = 30 * 60; // 30 minutes
  const recoveryTimelock = 48 * 60 * 60; // 48 hours (or shorter for demo)
  const guardianCommitments: string[] = []; // Add guardian commitments if needed

  console.log(`Owner: ${ownerAddress}`);
  console.log(`Session Key Duration: ${sessionKeyDuration} seconds`);
  console.log(`Recovery Timelock: ${recoveryTimelock} seconds`);

  // Deploy VoxVault
  const VoxVault = await ethers.getContractFactory("VoxVault");
  const voxVault = await VoxVault.deploy(
    ownerAddress,
    sessionKeyDuration,
    recoveryTimelock,
    guardianCommitments
  );

  const contractAddress = await voxVault.getAddress();
  console.log(`VoxVault deployed to: ${contractAddress}`);

  // Wait for a couple of confirmations
  await voxVault.deploymentTransaction()?.wait(2);
  console.log("Contract confirmed on-chain");

  // Save deployment info
  const deploymentInfo = {
    contractAddress,
    deployerAddress: deployer.address,
    ownerAddress,
    sessionKeyDuration,
    recoveryTimelock,
    deploymentTx: voxVault.deploymentTransaction()?.hash,
    deploymentBlock: await ethers.provider.getBlockNumber(),
    network: "sepolia",
    timestamp: new Date().toISOString(),
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentPath = path.join(deploymentsDir, "sepolia.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to ${deploymentPath}`);

  // Verify on Etherscan (optional - wait for indexing first)
  console.log("Waiting for Etherscan indexing...");
  await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 second wait

  try {
    console.log("Verifying contract on Etherscan...");
    await ethers.provider.waitForTransaction(voxVault.deploymentTransaction()?.hash);

    // Verification will be attempted via hardhat-verify plugin
    // Run: npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
    console.log(`\nTo verify on Etherscan, run:`);
    console.log(
      `npx hardhat verify --network sepolia ${contractAddress} "${ownerAddress}" ${sessionKeyDuration} ${recoveryTimelock} "[]"`
    );
  } catch (error) {
    console.error("Verification attempt:", error);
  }

  console.log("\n✅ Deployment complete!");
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`View on Etherscan: https://sepolia.etherscan.io/address/${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
