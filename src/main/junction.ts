import fs from 'fs/promises';

export async function createJunction(targetFolder: string, linkPath: string): Promise<void> {
  try {
    await fs.rm(linkPath, { recursive: true, force: true });
    
    await fs.symlink(targetFolder, linkPath, 'junction');
    
    console.log(`junction connect sucess: ${linkPath} -> ${targetFolder}`);
  } catch (error) {
    console.error("junction connect fail:", error);
  }
}