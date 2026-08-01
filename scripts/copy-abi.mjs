import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const artifactPath = path.join(__dirname, '../contracts/artifacts/contracts/VoxVault.sol/VoxVault.json');
const abiOutputPath = path.join(__dirname, '../frontend/src/abi/VoxVault.json');

try {
  // Read the compiled contract artifact
  if (!fs.existsSync(artifactPath)) {
    console.warn(`Artifact not found at ${artifactPath}`);
    console.log('Run `npm run compile -w contracts` first');
    process.exit(0);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));

  // Extract the ABI
  const abi = artifact.abi;

  // Ensure output directory exists
  const outputDir = path.dirname(abiOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write the ABI to frontend
  fs.writeFileSync(abiOutputPath, JSON.stringify(abi, null, 2));

  console.log(`✅ ABI copied to ${abiOutputPath}`);
} catch (error) {
  console.error('Failed to copy ABI:', error.message);
  process.exit(1);
}
