# Project Alexandria / History Atlas
## OMP(Oh My Pi) 상세 작업지시서
### 작업명: Wikidata + Wikipedia Knowledge Layer 구축

## 0. 작업 목적

현재 `historyatlas.net`의 **Globe + 역사적 영역 Polygon 표시 기능은 이미 완성된 상태**라고 간주한다.

이번 작업의 목적은 기존 Globe를 다시 만들거나 지도 렌더링 엔진을 재작성하는 것이 아니다.

이번 작업은 다음 기능을 추가하는 것이다.

> **역사적 Polygon → History Atlas Entity → Wikidata QID → Wikipedia 설명/구조화 정보 → 지도 UI의 Knowledge Panel**

즉, 현재 History Atlas가 가지고 있는 **Where + When** 위에 **What**을 붙이는 작업이다.

핵심 철학:

> **History has coordinates.**

이번 작업이 완료되면 사용자는 지도 위의 역사적 정치체 영역을 클릭하여, 해당 정치체의 이름뿐 아니라 Wikidata 및 Wikipedia에서 연결된 기본적인 역사 정보를 확인할 수 있어야 한다.

---

# 1. 현재 상태 및 작업 전제

## 1.1 현재 완성되어 있다고 간주할 부분

다음 기능은 이미 구현되어 있다고 간주하고, 불필요하게 재작성하지 않는다.

- Cesium 기반 Globe 표시
- 역사적 Polygon 표시
- GeoJSON 또는 이에 준하는 영역 데이터 로딩
- 연도별/시대별 정치체 영역 표시
- Polygon hover 또는 click 식별
- 기본적인 웹 프로젝트 실행 및 빌드
- `historyatlas.net`용 프론트엔드 기반 코드

OMP는 먼저 현재 repository를 검사하여 위 기능이 실제로 어디까지 구현되어 있는지 확인하고, **기존 구조를 존중하면서 최소 변경으로 Knowledge Layer를 추가**한다.

## 1.2 이번 작업에서 만들 핵심 데이터 흐름

```text
Historical Polygon
      │
      ▼
History Atlas Entity
      │
      ├── entity_id
      │
      ├── display_name
      │
      └── wikidata_id
             │
             ▼
         Wikidata
             │
     ┌───────┴────────┐
     ▼                ▼
Structured Facts   Wikipedia sitelink
                        │
                        ▼
                 Wikipedia summary
                        │
                        ▼
               History Atlas
               Knowledge Panel
```

---

# 2. 가장 중요한 설계 원칙

## 2.1 Wikidata QID를 내부 Primary Key로 사용하지 않는다

History Atlas 자체의 내부 식별자를 반드시 둔다.

잘못된 구조:

```json
{
  "id": "Q2277",
  "name": "Roman Empire"
}
```

권장 구조:

```json
{
  "entity_id": "ha:polity:roman_empire",
  "name": "Roman Empire",
  "wikidata_id": "Q2277"
}
```

즉:

- `entity_id` = History Atlas 내부 영구 식별자
- `wikidata_id` = 외부 Knowledge Source 연결용 식별자

이 원칙은 반드시 지킨다.

## 2.2 Polygon과 Entity를 분리한다

하나의 역사적 정치체는 여러 시대에 여러 geometry를 가질 수 있다.

예:

```text
Roman Empire
    │
    ├── Geometry: 100 AD
    ├── Geometry: 200 AD
    ├── Geometry: 300 AD
    └── Entity: 동일
```

따라서 `polygon = entity`로 고정하지 않는다.

## 2.3 Wikipedia URL을 Polygon에 직접 박아 넣는 방식은 피한다

가능하면 다음 계층을 사용한다.

```text
Polygon/SpatialRecord
        ↓
entity_id
        ↓
Entity Registry
        ↓
wikidata_id
        ↓
Wikipedia sitelink
```

## 2.4 자동 매칭 결과는 confidence와 provenance를 남긴다

이름만 같다고 자동 확정하지 않는다.

최소한 다음 상태를 둔다.

```text
confirmed
probable
ambiguous
unmatched
```

가능하면 confidence score도 저장한다.

예:

```json
{
  "wikidata_id": "Q2277",
  "match_status": "confirmed",
  "match_confidence": 0.98,
  "match_method": "name+alias+temporal"
}
```

## 2.5 원본 역사 데이터는 훼손하지 않는다

기존 GeoJSON 또는 polygon source를 직접 덮어쓰지 않는다.

Knowledge Layer 데이터는 별도 파일 또는 별도 데이터 구조로 유지한다.

---

# 3. 이번 작업 범위

이번 작업은 아래 **Phase A ~ Phase D**까지 수행한다.

---

# Phase A — Existing Data Audit + Entity Layer

## 목표

현재 Polygon 데이터에서 정치체 목록을 추출하고, History Atlas 자체 Entity Registry를 만든다.

## 해야 할 일

### A-1. 현재 프로젝트 구조 조사

OMP는 먼저 다음을 확인한다.

- Globe 렌더링 진입 파일
- Polygon 데이터 파일 위치
- 데이터 포맷
- feature properties
- 연도/시대 정보 저장 방식
- click/hover 이벤트 구현 위치
- 기존 sidebar/popup UI 존재 여부
- frontend framework
- build system
- API 호출 구조 유무

결과를 코드 수정 전에 간단히 보고한다.

### A-2. Polygon attribute 분석

Polygon feature에 어떤 속성이 있는지 실제 파일을 읽고 조사한다.

예:

```text
NAME
ABBREVN
PARTOF
YEAR
START
END
...
```

추측하지 말고 실제 데이터에서 확인한다.

### A-3. Entity 후보 추출

Polygon 데이터의 정치체를 추출하여 중복을 제거한다.

동일 정치체가 여러 시점에 여러 polygon으로 존재하더라도 하나의 entity로 묶을 수 있는 구조를 만든다.

### A-4. Entity Registry 생성

권장 파일 예:

```text
src/data/entities.json
```

또는 프로젝트 구조상 더 적절한 위치가 있다면 그 위치를 사용한다.

권장 schema:

```json
{
  "entity_id": "ha:polity:roman_empire",
  "type": "polity",
  "name": "Roman Empire",
  "aliases": [],
  "wikidata_id": null,
  "match_status": "unmatched",
  "match_confidence": null,
  "source_feature_names": ["Roman Empire"]
}
```

### A-5. 내부 Entity ID 생성 규칙

예:

```text
ha:polity:roman_empire
ha:polity:kingdom_of_france
ha:polity:joseon
```

규칙:

- lowercase
- ASCII slug
- stable
- deterministic
- 동일 entity에 대해 실행할 때마다 같은 ID
- 이름 변경으로 ID가 쉽게 바뀌지 않도록 구조 고려

초기 MVP에서는 slug 기반으로 시작해도 되지만, ID 생성 함수를 독립시켜 나중에 교체 가능하게 한다.

## Phase A 완료조건

- 현재 polygon 정치체 목록이 추출됨
- Entity Registry 존재
- polygon과 entity 연결 방법이 구현됨
- 기존 globe 표시가 깨지지 않음

---

# Phase B — Wikidata Entity Resolution

## 목표

History Atlas Entity에 Wikidata QID를 연결한다.

## 중요한 제한

절대로 이름 문자열 exact match 하나만으로 자동 확정하지 않는다.

## 매칭 신호

가능한 범위에서 다음 요소를 함께 사용한다.

1. 이름
2. alias
3. alternate language labels
4. 정치체 type
5. inception/start
6. dissolution/end
7. 상위 정치체
8. predecessor/successor
9. 시대적 일치성

MVP에서는 모든 조건을 완벽히 구현할 필요는 없지만, 최소한:

```text
name/alias + historical/political entity type + temporal plausibility
```

를 고려한다.

## B-1. Wikidata 검색 모듈

권장 모듈 예:

```text
src/knowledge/wikidata.ts
```

기능:

```ts
searchWikidataEntity(name)
getWikidataEntity(qid)
getWikidataSitelinks(qid)
getWikidataFacts(qid)
```

실제 함수명은 프로젝트 코딩 convention에 맞출 수 있다.

## B-2. 자동 매칭 결과 구조

예:

```json
{
  "entity_id": "ha:polity:roman_empire",
  "wikidata_id": "Q2277",
  "match_status": "probable",
  "match_confidence": 0.93,
  "match_method": "label+alias+type+temporal",
  "matched_label": "Roman Empire"
}
```

## B-3. ambiguous 처리

후보가 여러 개인 경우 임의로 하나를 확정하지 않는다.

예:

```json
{
  "match_status": "ambiguous",
  "candidates": [
    {
      "qid": "Q....",
      "label": "...",
      "score": 0.78
    },
    {
      "qid": "Q....",
      "label": "...",
      "score": 0.71
    }
  ]
}
```

## B-4. 수동 override

다음과 같은 override file을 만든다.

```text
src/data/entity-overrides.json
```

예:

```json
{
  "ha:polity:joseon": {
    "wikidata_id": "Q28179",
    "status": "confirmed"
  }
}
```

자동 매칭보다 manual override가 우선하도록 한다.

## B-5. 런타임 실시간 매칭 금지

매번 사용자가 polygon을 클릭할 때 Wikidata 검색을 수행하여 entity resolution을 하면 안 된다.

Entity resolution은:

- build-time
- pre-processing
- admin/script 실행

중 하나로 수행하고 결과를 저장한다.

런타임에는 이미 확정된 QID를 사용한다.

## Phase B 완료조건

- Entity Registry에 `wikidata_id` 연결 가능
- ambiguous/unmatched 처리 가능
- manual override 가능
- 동일 script 재실행 시 deterministic
- API error가 기존 데이터를 파괴하지 않음

---

# Phase C — Wikidata + Wikipedia Knowledge Data

## 목표

QID를 바탕으로 사용자가 읽을 수 있는 기본 knowledge를 가져온다.

## C-1. Wikidata에서 가져올 최소 structured facts

정치체마다 가능한 범위에서 다음을 가져온다.

- label
- description
- aliases
- inception/start
- dissolution/end
- capital
- country/political entity type
- predecessor
- successor
- official language 또는 주요 언어 (가능하면)
- image/flag는 이번 단계에서는 선택사항

Wikidata에 값이 없으면 `null` 처리한다.

절대 임의 생성하지 않는다.

## C-2. Wikipedia 연결

QID의 sitelink를 사용하여 Wikipedia 문서를 연결한다.

우선 언어 정책:

1. 사용자가 현재 선택한 locale
2. 영어
3. available sitelink 중 적절한 fallback

초기 MVP에서 locale switching이 아직 없다면:

```text
English first
```

로 구현하고 구조는 다국어 확장 가능하게 만든다.

## C-3. Wikipedia 설명

사용자 패널에는 전체 문서를 넣지 않는다.

가져올 정보:

- article title
- short summary/extract
- canonical URL
- optional thumbnail

권장 길이:

- 1~3 단락 이하
- UI에서는 약 400~800자 수준에서 접거나 `Read more` 제공

## C-4. 라이선스/출처

UI에 다음 출처를 표시할 수 있는 구조를 만든다.

```text
Data: Wikidata
Text: Wikipedia
Read more
```

Wikipedia 원문을 History Atlas의 자체 저작물처럼 보이게 해서는 안 된다.

## C-5. API 실패 fallback

Wikipedia가 실패해도 panel 자체는 열려야 한다.

fallback priority:

```text
Wikipedia summary
    ↓
Wikidata description
    ↓
"Description not available"
```

## C-6. caching

사용자가 polygon을 클릭할 때마다 동일 API를 반복 호출하지 않는다.

MVP에서는 다음 중 가장 간단한 것을 사용한다.

- in-memory cache
- localStorage cache
- pre-generated static JSON

현재 사이트가 static hosting 중심이라면 **pre-generated static JSON 또는 local cache**를 우선 검토한다.

과도한 backend는 만들지 않는다.

## Phase C 완료조건

하나의 confirmed entity에 대해 다음 객체를 얻을 수 있어야 한다.

```json
{
  "entity_id": "ha:polity:roman_empire",
  "wikidata_id": "Q2277",
  "name": "Roman Empire",
  "description": "...",
  "start": "...",
  "end": "...",
  "capital": ["..."],
  "predecessors": [],
  "successors": [],
  "wikipedia": {
    "language": "en",
    "title": "Roman Empire",
    "summary": "...",
    "url": "..."
  }
}
```

---

# Phase D — Globe Knowledge Panel UI

## 목표

사용자가 역사 Polygon을 클릭하면 관련 텍스트 정보를 보여준다.

## D-1. Interaction

현재 polygon click handler를 이용한다.

흐름:

```text
polygon click
   ↓
feature
   ↓
entity_id
   ↓
Knowledge Registry
   ↓
side panel
```

## D-2. UI 형태

Popup보다 desktop에서는 right-side panel을 우선한다.

예:

```text
┌───────────────────────────────┐
│ Roman Empire                  │
│ 27 BC – 476 AD                │
│                               │
│ The Roman Empire was ...      │
│                               │
│ Capital                       │
│ Rome                          │
│                               │
│ Predecessor                   │
│ Roman Republic                │
│                               │
│ Successor                     │
│ ...                           │
│                               │
│ Data: Wikidata                │
│ Text: Wikipedia               │
│ [Read more]                   │
└───────────────────────────────┘
```

## D-3. 최소 표시 항목

반드시:

- entity name
- Wikipedia 또는 Wikidata description
- time period
- capital if available
- source
- Wikipedia Read more link

선택:

- predecessor
- successor
- aliases

## D-4. 상태별 UI

### matched
정상 정보 표시.

### unmatched

```text
No linked historical reference yet.
```

지도 자체는 계속 동작해야 한다.

### loading

```text
Loading historical information...
```

### error

```text
Historical information is temporarily unavailable.
```

### null data
빈칸 대신 해당 행 자체를 숨기는 것을 우선한다.

## D-5. Mobile

모바일에서는 right panel 대신:

- bottom sheet
- full width overlay

중 기존 UI와 잘 맞는 것을 선택한다.

## Phase D 완료조건

사용자가 polygon을 클릭하면:

1. 해당 polygon에 대응하는 History Atlas entity가 선택되고
2. QID-linked knowledge가 로딩되며
3. 설명이 side panel에 나오고
4. Wikipedia 원문으로 이동할 수 있으며
5. unmatched entity도 오류 없이 처리되어야 한다.

---

# 4. 이번 작업에서 하지 말 것

다음 작업은 **이번 Work Order 범위 밖**이다.

OMP가 임의로 추가하지 않는다.

- 전쟁/조약/event 전체 그래프
- 정치체 간 edge/arrow visualization
- 인물 데이터
- 도시 전체 데이터
- 검색 엔진
- LLM/AI chat
- RAG
- embedding/vector database
- PostgreSQL/PostGIS
- user authentication
- subscription/payment
- creator MP4 export
- full multilingual UI
- full History Data Hub
- universal entity resolution
- Wikipedia 전체 문서 저장
- 전체 Wikidata dump 다운로드
- knowledge graph database
- Neo4j

이번 작업의 목적은 오직:

> **현재의 Polygon을 신뢰 가능한 텍스트 Knowledge Layer와 연결**

하는 것이다.

---

# 5. 권장 파일 구조

현재 repository를 보고 기존 구조를 우선한다.

별도 구조가 없다면 다음을 참고한다.

```text
src/
├── data/
│   ├── entities.json
│   ├── entity-overrides.json
│   └── knowledge/
│       └── entities-knowledge.json
│
├── knowledge/
│   ├── types.ts
│   ├── entityRegistry.ts
│   ├── wikidata.ts
│   ├── wikipedia.ts
│   ├── knowledgeService.ts
│   └── cache.ts
│
├── map/
│   └── ... existing globe code
│
├── ui/
│   └── knowledgePanel.ts
│
└── ...

scripts/
├── extract-entities.ts
├── match-wikidata.ts
└── build-knowledge.ts
```

핵심은:

```text
map rendering
     ≠
entity resolution
     ≠
external knowledge API
     ≠
UI
```

가 되게 한다.

---

# 6. 데이터 모델

## Entity

```ts
type EntityType = "polity";

interface HistoryEntity {
  entityId: string;
  type: EntityType;
  name: string;
  aliases: string[];

  wikidataId: string | null;

  matchStatus:
    | "confirmed"
    | "probable"
    | "ambiguous"
    | "unmatched";

  matchConfidence: number | null;

  sourceFeatureNames: string[];
}
```

## Knowledge

```ts
interface EntityKnowledge {
  entityId: string;
  wikidataId: string | null;

  label: string;
  description: string | null;

  inception: string | null;
  dissolution: string | null;

  capitals: KnowledgeReference[];
  predecessors: KnowledgeReference[];
  successors: KnowledgeReference[];

  wikipedia: WikipediaKnowledge | null;

  provenance: {
    wikidataFetchedAt: string | null;
    wikipediaFetchedAt: string | null;
  };
}
```

## Wikipedia

```ts
interface WikipediaKnowledge {
  language: string;
  title: string;
  summary: string;
  url: string;
  thumbnailUrl?: string | null;
}
```

---

# 7. 테스트 요구사항

OMP는 최소한 다음 테스트를 작성한다.

## Entity extraction

- duplicate polity names
- null name
- whitespace variation
- case variation
- same entity in multiple time slices

## Mapping

- confirmed override
- ambiguous result
- no result
- invalid QID
- external API failure

## Wikipedia

- sitelink exists
- English fallback
- article missing
- API rate/error
- empty summary

## UI

가능한 테스트 범위에서:

- matched entity
- unmatched entity
- loading
- error
- panel close
- second polygon click updates panel

## Regression

가장 중요:

- 기존 globe 렌더링 정상
- 기존 polygon 표시 정상
- 기존 hover/click 동작 훼손 없음
- knowledge failure가 map failure로 전파되지 않음

---

# 8. API 및 네트워크 원칙

## Wikidata

가능하면 공식 Wikimedia/Wikidata endpoint/API를 사용한다.

## Wikipedia

공식 Wikimedia REST/API 계열을 사용한다.

## Rate limit

- 반복 요청 최소화
- 동일 entity 캐시
- batch 가능하면 batch
- API에 과도한 병렬 요청 금지

## 브라우저 직접 호출 문제

현재 프로젝트가 static site인 경우, CORS와 rate limitation을 실제로 검사한다.

직접 브라우저 호출이 실용적이면 그대로 사용한다.

그렇지 않으면 무리하게 backend 전체를 도입하지 말고:

```text
pre-build script
      ↓
static JSON
```

방식을 우선 고려한다.

OMP는 **단순성을 최우선**으로 선택한다.

---

# 9. 완료 산출물

작업 완료 시 최소 다음을 남긴다.

1. Entity Registry
2. Wikidata mapping mechanism
3. manual override mechanism
4. Wikidata knowledge fetcher
5. Wikipedia summary fetcher
6. cache/prebuild mechanism
7. Knowledge Panel
8. tests
9. documentation
10. execution report

추가 문서:

```text
docs/KNOWLEDGE_LAYER.md
```

여기에 다음을 기록한다.

- architecture
- data flow
- API
- entity mapping policy
- cache policy
- failure handling
- license/source handling
- future extension points

---

# 10. 작업 수행 순서

OMP는 한 번에 모든 코드를 작성하지 않는다.

다음 순서를 따른다.

## Step 1 — Repository 조사

다음 내용 보고:

- 현재 stack
- globe 관련 파일
- polygon source
- properties
- click handler
- 현재 data model
- 가장 적합한 integration point

**이 단계에서는 코드를 크게 수정하지 않는다.**

## Step 2 — Phase A 구현

완료 후:

- 변경 파일
- entity 수
- duplicate 처리
- unresolved 문제
- test 결과

보고.

## Step 3 — Phase B 구현

완료 후:

- total entities
- confirmed
- probable
- ambiguous
- unmatched

통계 보고.

## Step 4 — Phase C 구현

샘플 entity 최소 5개에 대해 실제 knowledge object 생성 확인.

## Step 5 — Phase D UI 연결

대표 polygon 5개 이상 수동 smoke test.

## Step 6 — 전체 회귀 테스트 + build

---

# 11. 성공 기준

작업을 성공으로 판단하려면 다음을 모두 만족해야 한다.

```text
[ ] 기존 globe 정상
[ ] 기존 polygon 정상
[ ] polygon → entity_id 연결
[ ] entity_id → Wikidata QID 연결
[ ] QID → Wikipedia 연결
[ ] polygon click → Knowledge Panel 표시
[ ] unmatched polygon도 정상 처리
[ ] source 표시
[ ] API failure가 globe를 깨뜨리지 않음
[ ] build 성공
[ ] tests 성공
[ ] docs 작성
```

---

# 12. OMP가 반드시 피해야 할 행동

- 기존 globe를 마음대로 재작성
- 기존 CSS/UI 전체 리디자인
- 다른 framework로 migration
- Wikidata QID를 내부 ID로 사용
- 자동 matching을 무조건 confirmed 처리
- Wikipedia URL을 polygon property에 직접 hardcode
- Wikipedia 전체 내용을 scrape
- 대규모 AI 기능 추가
- backend부터 만드는 것
- 요구하지 않은 DB 추가
- 기존 polygon source overwrite
- test 없이 완료 선언
- API 응답 예시를 실제 결과인 것처럼 fabrication

---

# 13. 완료 보고 형식

최종 보고는 반드시 아래 형식을 따른다.

```text
Project Alexandria — Knowledge Layer Work Report

1. Status
PASS / PARTIAL / BLOCKED

2. Existing Stack
- ...

3. Files Changed
- ...

4. Entity Resolution
Total:
Confirmed:
Probable:
Ambiguous:
Unmatched:

5. Knowledge Layer
Wikidata:
Wikipedia:
Caching:

6. UI
- ...

7. Tests
- unit:
- integration:
- build:
- manual smoke test:

8. Remaining Risks
- ...

9. Deferred Scope
- ...

10. Recommended Next Step
- ...
```

---

# 14. OMP 실행용 PROMPT

아래 내용을 OMP에게 그대로 전달한다.

---

## PROMPT START

You are the lead software engineer for **History Atlas**, internally called **Project Alexandria**.

The existing application already has a working historical globe and historical polygon layer. Do **not** rebuild the globe unless inspection proves a small change is required for integration.

The objective of this task is to add the first **Knowledge Layer**:

> Historical Polygon → History Atlas Entity → Wikidata QID → Wikidata facts + Wikipedia summary → Knowledge Panel

The guiding product principle is:

> **History has coordinates.**

### Mandatory first action

Before modifying the code, inspect the repository and report:

1. Current frontend stack.
2. Globe/map library and entry point.
3. Polygon data location and format.
4. Actual feature properties found in the current historical polygon dataset.
5. How year/time information is represented.
6. Where polygon hover/click interaction is implemented.
7. Existing sidebar/popup component, if any.
8. Best integration point for a Knowledge Panel.
9. Any API/network restrictions in the current deployment architecture.

Do not assume these details. Inspect the actual code and data.

### Architecture rules

Use a History Atlas internal entity ID as the primary identifier.

Example:

```json
{
  "entity_id": "ha:polity:roman_empire",
  "name": "Roman Empire",
  "wikidata_id": "Q2277"
}
```

Do NOT use Wikidata QID as History Atlas' internal primary key.

Separate:

- polygon/spatial state,
- historical entity,
- Wikidata mapping,
- knowledge data,
- UI.

A single entity may have many polygon geometries across time.

Do not mutate or overwrite the original historical polygon data.

### Entity resolution

Build an Entity Registry from the actual existing polygon data.

Match entities to Wikidata using more than exact string matching whenever practical.

Consider:

- label,
- aliases,
- entity type,
- temporal plausibility,
- historical context.

Every mapping must have one of:

- confirmed
- probable
- ambiguous
- unmatched

and should contain confidence/method metadata where practical.

Provide a manual override mechanism.

Manual override must take precedence over automatic matching.

Do not perform entity-resolution search every time a user clicks a polygon. Resolve and persist mappings in advance.

### Knowledge retrieval

For a resolved Wikidata QID, obtain a small set of structured facts:

- label
- description
- inception
- dissolution
- capital
- predecessor
- successor

Use null if unavailable. Never invent facts.

Resolve the Wikipedia article via the Wikidata sitelink.

Retrieve only a useful short summary and canonical article URL. Do not ingest entire Wikipedia articles.

Use fallback:

1. Wikipedia summary
2. Wikidata description
3. neutral “Description not available”

Design the code so locale support can be added later. If the current app has no locale system, English may be the first default.

### Caching / static architecture

Do not introduce a backend unless it is genuinely necessary.

Inspect CORS and API behavior.

Prefer the simplest viable architecture:

- pre-generated static knowledge JSON,
- in-memory cache,
- or local browser cache.

For a static site, strongly consider build-time/preprocessing retrieval if it avoids runtime instability and rate-limit problems.

### UI

On polygon click:

```text
feature
→ entity_id
→ Entity Registry
→ Knowledge Registry
→ Knowledge Panel
```

Desktop: prefer a right-side panel if compatible with current UI.

Mobile: use a bottom sheet or responsive overlay.

Panel must gracefully support:

- loading
- matched
- unmatched
- error

Minimum visible content:

- entity name
- time period if available
- readable description
- capital if available
- Wikidata/Wikipedia attribution
- “Read more” Wikipedia link

Missing fields should normally be hidden rather than shown as blank.

### Scope exclusions

Do NOT implement in this task:

- battles/treaties graph,
- interaction edges/arrows,
- people,
- cities dataset,
- AI chatbot,
- RAG,
- vector database,
- PostGIS,
- Neo4j,
- authentication,
- payments,
- creator video export,
- full multilingual UI,
- full History Data Hub,
- full Wikidata dump ingestion.

This task is only the first polygon-to-knowledge connection.

### Required implementation sequence

Proceed in these gates:

#### Gate 1 — Repository audit
Inspection and report only.

#### Gate 2 — Entity Layer
Create entity extraction and Entity Registry.

Run tests and report entity statistics.

#### Gate 3 — Wikidata Mapping
Implement entity resolution, statuses, confidence, and manual overrides.

Report:

- total
- confirmed
- probable
- ambiguous
- unmatched

#### Gate 4 — Knowledge Builder
Implement Wikidata facts + Wikipedia sitelink/summary + caching or static generation.

Validate at least 5 real entities.

#### Gate 5 — Knowledge Panel
Connect actual polygon clicks to Knowledge Panel.

Manually smoke-test at least 5 polygons.

#### Gate 6 — Regression / Documentation
Run all relevant tests and production build.

Confirm existing globe and polygon rendering are intact.

Create or update:

`docs/KNOWLEDGE_LAYER.md`

Document architecture, mapping rules, APIs, cache strategy, failure behavior, attribution, and future extension points.

### Stop conditions

If a gate exposes a design decision that can significantly alter existing architecture, stop and report it before doing a broad refactor.

Do not silently make destructive architecture changes.

### Final completion report

Use exactly this structure:

```text
Project Alexandria — Knowledge Layer Work Report

1. Status
PASS / PARTIAL / BLOCKED

2. Existing Stack

3. Files Changed

4. Entity Resolution
Total:
Confirmed:
Probable:
Ambiguous:
Unmatched:

5. Knowledge Layer
Wikidata:
Wikipedia:
Caching:

6. UI

7. Tests
Unit:
Integration:
Build:
Manual smoke test:

8. Remaining Risks

9. Deferred Scope

10. Recommended Next Step
```

Do not declare PASS solely because the code compiles. The user-facing polygon-click flow must actually be verified.

## PROMPT END

---

# 15. 이후 단계 — 이번 작업 완료 후

이번 Work Order가 PASS되면 다음 순서는 별도 작업으로 한다.

```text
Knowledge Layer v1
        ↓
Event Layer
        ↓
Battle / Treaty / Alliance
        ↓
Entity-to-Entity Relationship
        ↓
Temporal Edge Visualization
```

즉 다음 Work Order에서 처음으로:

```text
Polity A
   │
   ├── WAR ──→ Polity B
   ├── ALLIANCE ──→ Polity C
   └── TREATY ──→ Polity D
```

같은 관계를 History Atlas의 시공간 구조에 얹는다.

이번 작업에서는 여기까지 확장하지 않는다.
