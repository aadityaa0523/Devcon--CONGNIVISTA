import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys two instances of the same contract:
 *
 *   main — 30-minute sessions, 48-hour recovery timelock. The real configuration.
 *   demo — 2-minute sessions, 3-minute recovery timelock. Identical bytecode,
 *          different constructor arguments, so that request -> wait -> execute can
 *          be shown live. A 48-hour wait cannot be demonstrated on stage, and
 *          shipping a separate "demo mode" code path would mean demonstrating
 *          something other than what ships.
 */

const MAIN = {
  label: "main",
  sessionKeyDuration: 30 * 60,
  recoveryTimelock: 48 * 60 * 60,
};

const DEMO = {
  label: "demo",
  sessionKeyDuration: 2 * 60,
  recoveryTimelock: 3 * 60,
};

interface DeploymentRecord {
  label: string;
  address: string;
  owner: string;
  sessionKeyDuration: number;
  recoveryTimelock: number;
  constructorArgs: [string, number, number, string[]];
  txHash: string | undefined;
  blockNumber: number | undefined;
}

async function deployOne(
  config: typeof MAIN,
  owner: string,
  guardians: string[]
): Promise<DeploymentRecord> {
  const factory = await ethers.getContractFactory("VoxVault");
  const args: [string, number, number, string[]] = [
    owner,
    config.sessionKeyDuration,
    config.recoveryTimelock,
    guardians,
  ];

  console.log(`\nDeploying "${config.label}"…`);
  const contract = await factory.deploy(...args);
  const receipt = await contract.deploymentTransaction()?.wait(1);
  const address = await contract.getAddress();

  console.log(`  address        ${address}`);
  console.log(`  session key    ${config.sessionKeyDuration}s`);
  console.log(`  recovery lock  ${config.recoveryTimelock}s`);

  return {
    label: config.label,
    address,
    owner,
    sessionKeyDuration: config.sessionKeyDuration,
    recoveryTimelock: config.recoveryTimelock,
    constructorArgs: args,
    txHash: contract.deploymentTransaction()?.hash,
    blockNumber: receipt?.blockNumber,
  };
}

async function verify(record: DeploymentRecord): Promise<void> {
  try {
    await run("verify:verify", {
      address: record.address,
      constructorArguments: record.constructorArgs,
    });
    console.log(`  verified: ${record.label}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("already verified")) {
      console.log(`  already verified: ${record.label}`);
    } else {
      // Etherscan often has not indexed the bytecode yet. Not fatal — the
      // command to retry by hand is printed at the end.
      console.log(`  verification deferred for ${record.label}: ${message}`);
    }
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const owner = process.env.OWNER_ADDRESS || deployer.address;

  if (!ethers.isAddress(owner)) {
    throw new Error(`OWNER_ADDRESS is not a valid address: ${owner}`);
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Network   ${network.name}`);
  console.log(`Deployer  ${deployer.address}`);
  console.log(`Balance   ${ethers.formatEther(balance)} ETH`);
  console.log(`Owner     ${owner}`);

  if (balance === 0n) {
    throw new Error(
      "Deployer has no ETH. Fund it from a Sepolia faucet before deploying."
    );
  }

  // Guardians are added from the UI after deployment, so their salts can be
  // generated client-side and shared out-of-band.
  const guardians: string[] = [];

  const records = [
    await deployOne(MAIN, owner, guardians),
    await deployOne(DEMO, owner, guardians),
  ];

  const dir = path.join(__dirname, "../deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${network.name}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      { network: network.name, deployedAt: new Date().toISOString(), records },
      null,
      2
    )
  );
  console.log(`\nWrote ${file}`);

  if (network.name !== "hardhat" && network.name !== "localhost") {
    // Give Etherscan a moment to index the new bytecode before verifying.
    console.log("\nWaiting 40s for Etherscan to index…");
    await new Promise((resolve) => setTimeout(resolve, 40_000));
    for (const record of records) {
      await verify(record);
    }
  }

  console.log("\nNext steps:");
  console.log(`  1. Put this in frontend/.env.local:`);
  console.log(`     VITE_CONTRACT_ADDRESS=${records[0].address}`);
  console.log(
    `  2. For the live recovery demo, switch it to the demo instance:`
  );
  console.log(`     VITE_CONTRACT_ADDRESS=${records[1].address}`);
  console.log(`  3. If verification was deferred, retry with:`);
  for (const record of records) {
    console.log(
      `     npx hardhat verify --network ${network.name} ${record.address} "${record.owner}" ${record.sessionKeyDuration} ${record.recoveryTimelock} "[]"`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
