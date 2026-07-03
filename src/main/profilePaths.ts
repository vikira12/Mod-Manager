import { app } from 'electron'
import path from 'path'
import { db } from './db'
import { getDefaultModsPath } from './jarScanner'

// 게임 루트 (.minecraft)
export function getMinecraftRoot(): string {
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME ?? '', 'Library', 'Application Support', 'minecraft')
  }
  return path.join(process.env.APPDATA ?? process.env.HOME ?? '', '.minecraft')
}

// 프로필 전용 모드 보관소 (중앙 저장소)
export function getProfileStoragePath(profileId: string | number): string {
  return path.join(app.getPath('userData'), 'profiles', String(profileId), 'mods')
}

// 프로필의 실제 mods 폴더 (install_path가 없으면 게임 기본 폴더)
export function getProfileModsPath(profileId: string): string {
  const profile = db.prepare('SELECT install_path FROM profiles WHERE id = ?').get(profileId) as { install_path?: string | null } | undefined
  return path.resolve(profile?.install_path || getDefaultModsPath())
}
