const API_BASE = 'https://api.modrinth.com/v2';

// my github(부끄렁)
const HEADERS = {
  'User-Agent': 'my-mod-manager/1.0.0 (seowon2191@gmail.com)'
};

export async function getVersionDetails(versionId: string): Promise<any> {
  const response = await fetch(`${API_BASE}/version/${versionId}`, { headers: HEADERS });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function getRequiredDependencies(versionId: string, visited = new Set<string>()): Promise<any[]> {
  if (visited.has(versionId)) return [];
  visited.add(versionId);

  const versionData = await getVersionDetails(versionId);
  let allModsToInstall: any[] = [versionData];

  const requiredDeps = versionData.dependencies.filter((dep: any) => dep.dependency_type === 'required');

  for (const dep of requiredDeps) {
    if (dep.version_id) {
      console.log(`[${versionData.project_id}]Exploring the essential mode of... -> ${dep.version_id}`);
      const childDeps = await getRequiredDependencies(dep.version_id, visited);
      allModsToInstall = allModsToInstall.concat(childDeps);
    }
  }

  return allModsToInstall;
}