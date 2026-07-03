<p align="center">
  <img src="resources/icon.png" width="96" alt="ModForge 아이콘" />
</p>

<h1 align="center">ModForge</h1>

<p align="center">
  모드 의존성 자동 해결부터 게임 실행까지 — Minecraft 모드 매니저 겸 런처
</p>

---

ModForge는 CurseForge류 런처가 잘 못 하는 부분을 파고드는 데스크톱 앱입니다:
**모드 간 의존성과 충돌을 정밀하게 해석**하고, **파일 복사 없이 프로필을 통째로 전환**하며,
공식 런처 없이도 **게임을 직접 실행**합니다.

## 주요 기능

### 의존성 해결 엔진
- 모드 하나를 고르면 필요한 의존성 트리를 DFS로 해석하고 설치 순서를 위상 정렬로 산출
- Modrinth 의존성의 **버전 고정(pin)** 을 존중하고, 프로필과 호환되지 않으면 안전하게 폴백
- release > beta > alpha **채널 인지** 버전 선택
- 서로 다른 모드가 같은 의존성에 다른 버전을 요구하는 **pin 충돌을 감지·경고**

### 충돌 감지
- Modrinth `incompatible` 메타데이터 검사
- 메타데이터로는 안 잡히는 조합(OptiFine↔Sodium 등)을 잡는 **자체 충돌 규칙 DB**
- **수동으로 넣은 jar까지 스캔**(`fabric.mod.json`/`mods.toml` 직접 파싱)해서 충돌 검사에 포함

### 프로필 & Junction 전환
- 프로필별 모드 보관소를 두고, 활성 프로필을 `.minecraft/mods`에 **junction으로 연결**
- 프로필 전환 = 링크 교체. 파일 복사 없음, 즉시 반영
- 설치 전 자동 백업, 마지막 백업 복구

### 게임 실행 (풀 런처)
- **자체 실행**: Microsoft 로그인(Device Code Flow) 또는 **오프라인 모드**로 JVM을 직접 실행
  - 버전 JSON 체인 해석, 클라이언트/라이브러리/에셋 다운로드(sha1 검증, 병렬)
  - 게임 요구 Java 버전에 맞는 런타임 자동 탐색(공식 런처 번들 런타임 재사용)
  - 실시간 게임 로그(에러/경고 색상), 크래시 리포트 자동 감지
- **공식 런처 위임**: 로그인 없이도 `launcher_profiles.json`에 등록 후 공식 런처로 실행
- **로더 자동 설치**: Fabric/Quilt는 메타 API로 즉시, Forge/NeoForge는 설치기를 headless로 실행

### 모드팩
- **`.mrpack`(Modrinth 표준) 가져오기** — 프로필 자동 생성, 해시 벌크 조회로 메타데이터 등록
- ModForge 자체 포맷 내보내기/가져오기

### 그 외
- 설치된 모드 업데이트 확인/일괄 적용 (발행일 비교로 다운그레이드 방지)
- 설치 성향 기반 추천 모드
- 인기 모드 로컬 DB 동기화 → 오프라인 검색, 빠른 의존성 분석
- 자동 업데이트 (GitHub Releases)

## 아키텍처

```
src/main/
├─ providers/        모드 소스 추상화 (ModProvider 인터페이스 + Modrinth 구현)
├─ catalog.ts        로컬 SQLite 캐시·검색·동기화·업데이트 (네트워크 코드 없음)
├─ resolver.ts       의존성 DFS + 위상 정렬 + pin/충돌 감지
├─ conflicts.ts      자체 충돌 규칙 엔진
├─ jarScanner.ts     mods 폴더 jar 메타데이터 스캔
├─ junction.ts       IPC 허브 + 프로필/junction 관리
├─ launcher.ts       로더 설치(Fabric/Quilt/Forge/NeoForge) + Java 탐색 + 공식 런처 연동
├─ gameFiles.ts      버전 JSON 체인 해석 + 클라이언트/라이브러리/에셋 다운로드
├─ gameLaunch.ts     자체 실행 (natives 추출, 클래스패스, 인자 구성, spawn)
├─ auth.ts           MSA 인증(Device Code Flow) + 오프라인 세션
├─ mrpack.ts         .mrpack 가져오기
└─ db.ts             SQLite 스키마/마이그레이션
```

새 모드 소스(CurseForge 등)는 `providers/`에 구현체를 만들어 레지스트리에 등록하면
캐시·resolver·UI 수정 없이 동작하도록 설계되어 있습니다.

## 개발

```bash
npm install        # 의존성 설치 (better-sqlite3 네이티브 리빌드 포함)
npm run dev        # 개발 모드 실행
npm run typecheck  # 타입 검사
npm run build      # 타입 검사 + 번들 빌드
```

## 배포

```bash
npm run build:win    # dist/ModForge-<버전>-setup.exe 생성
```

GitHub에서 `v<버전>` 태그로 Release를 만들고 `dist/`의 `setup.exe`, `latest.yml`, `.blockmap`을
업로드하면, 설치된 앱들이 시작 시 자동으로 업데이트를 확인합니다.
(`GH_TOKEN` 설정 시 `npx electron-builder --win --publish always`로 업로드까지 자동화 가능)

> 코드 서명 인증서가 없으므로 SmartScreen 경고가 표시될 수 있습니다.

## Microsoft 로그인 설정 (자체 실행용)

자체 실행으로 온라인 플레이를 하려면 본인 소유의 Azure 앱 Client ID가 필요합니다:

1. [Azure Portal](https://portal.azure.com) → App registrations → 새 등록 (개인 Microsoft 계정 지원)
2. 인증 설정에서 "모바일 및 데스크톱 애플리케이션" 플랫폼 추가 + **공용 클라이언트 흐름 허용**
3. [Mojang의 Minecraft API 사용 승인](https://aka.ms/mce-reviewappid) 신청
4. 앱 사이드바에서 로그인 시 Client ID 입력 (또는 `MODFORGE_MSA_CLIENT_ID` 환경변수)

로그인 없이 테스트하려면 사이드바의 **오프라인 모드**를 사용하세요 (싱글플레이 전용).

## 기술 스택

Electron · React · TypeScript · better-sqlite3 · [Modrinth API](https://docs.modrinth.com/)

## 참고

- 현재 Windows 우선 지원입니다 (junction 기반 프로필 전환은 Windows에서 관리자 권한 없이 동작).
- 이 프로젝트는 Mojang/Microsoft와 무관한 비공식 도구입니다.
