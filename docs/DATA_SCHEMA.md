# History Data Hub Schema — Draft v0.1

This schema is a long-term direction, not a blocker for the first viewer release.

## Principle

Entity is the historical subject. Geometry is a time-bounded spatial state of that entity.

```text
Entity
  ├─ names / aliases
  ├─ type
  ├─ temporal states
  ├─ spatial states
  ├─ relationships
  └─ sources
```

## Entity

```json
{
  "id": "stable-id",
  "type": "polity",
  "name": {
    "default": "Example Empire",
    "localized": {
      "ko": "예시 제국"
    }
  },
  "aliases": [],
  "start": null,
  "end": null,
  "sourceIds": []
}
```

## Spatial state

```json
{
  "id": "spatial-state-id",
  "entityId": "stable-id",
  "validFrom": 100,
  "validTo": 199,
  "geometry": {},
  "precision": "approximate",
  "sourceIds": []
}
```

## Source

```json
{
  "id": "source-id",
  "title": "Dataset title",
  "publisher": "Publisher",
  "url": "source URL",
  "license": "license identifier",
  "accessedAt": "YYYY-MM-DD",
  "notes": ""
}
```

## Relationship

```json
{
  "subjectId": "entity-a",
  "predicate": "part-of",
  "objectId": "entity-b",
  "validFrom": null,
  "validTo": null,
  "sourceIds": []
}
```

## Year convention

Use signed astronomical-style integer years internally only after a deliberate decision:

- positive: CE,
- zero: potentially 1 BCE depending on astronomical convention,
- negative: BCE.

Before implementation, explicitly document conversion rules shown to users. The MVP does not need to finalize this.
