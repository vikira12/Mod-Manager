import { modrinthProvider } from './modrinth'
import type { ModProvider } from './types'

// 새 소스(CurseForge 등)를 추가할 때는 구현체를 만들어 여기에 등록만 하면 된다
const providers = new Map<string, ModProvider>([
  [modrinthProvider.id, modrinthProvider],
])

export const DEFAULT_PROVIDER_ID = modrinthProvider.id

export function getProvider(id: string = DEFAULT_PROVIDER_ID): ModProvider {
  const provider = providers.get(id)
  if (!provider) throw new Error(`알 수 없는 모드 프로바이더: ${id}`)
  return provider
}

export const defaultProvider: ModProvider = modrinthProvider

export * from './types'
