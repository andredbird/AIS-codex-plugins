# Plan Mirror

[English](#english) · [Русский](#русский)

## English

### What it does

Plan Mirror audits a technical implementation plan against a confirmed project contract. It finds blocking problems, may produce one complete improved candidate, and asks a fresh blind Critic to review that candidate independently.

It checks requirements coverage, architecture, dependencies, data and security risks, concurrency, operations, verification criteria, scope, and task implementability. The source plan is hash-checked and never overwritten.

Repository-aware mode creates a private immutable snapshot of allowed text files. The Critic can only use the read-only evidence tools `list_tree`, `search`, `read_range`, and `get_metadata`; shell, web search, project rules, and user configuration are disabled for reviewer processes.

### Quick start

Requirements:

- Node.js 20 or newer;
- an authenticated `codex` CLI with `codex exec`;
- an explicit model ID in `.plan-mirror.json` or `PLAN_MIRROR_MODEL`.

Install the public marketplace:

```bash
codex plugin marketplace add andredbird/AIS-codex-plugins --ref v0.1.2
```

Restart the desktop app, open a new Codex chat, and run `$plan-mirror:doctor`. If project configuration is missing, Doctor shows the proposed model and file changes, asks for explicit confirmation, safely creates or updates `.plan-mirror.json`, adds the private paths to `.gitignore`, and reruns itself. It never replaces a different existing model automatically. Then invoke `$plan-mirror:review` and provide the plan path. The skill helps confirm the contract before starting the review.

Example request:

```text
$plan-mirror:review

Review PLAN.md against my confirmed requirements. Use repository evidence for claims about existing code. Do not modify the source plan.
```

### Configuration and direct CLI usage

Copy `config.example.json` to `.plan-mirror.json` in the project being reviewed and replace `explicit-model-id`, or export `PLAN_MIRROR_MODEL`.

```bash
node /absolute/path/to/plan-mirror/scripts/plan-mirror.mjs doctor

# Run only after the user confirms the displayed changes:
node /absolute/path/to/plan-mirror/scripts/plan-mirror.mjs setup --model MODEL_ID

node /absolute/path/to/plan-mirror/scripts/plan-mirror.mjs review \
  --plan PLAN.md \
  --contract project-contract.json

node /absolute/path/to/plan-mirror/scripts/plan-mirror.mjs review \
  --plan PLAN.md \
  --contract project-contract.json \
  --repo . \
  --scope src,tests
```

Keep the shell working directory at the project being reviewed. Final artifacts are written under `.plan-mirror/runs/`: `candidate.md`, `report.md`, and `result.json`.

Possible statuses include `NO_BLOCKERS_FOUND_WITHIN_SCOPE`, `NO_BLOCKERS_FOUND_WITH_NOTES`, `ACTION_REQUIRED`, `DECISION_REQUIRED`, and `INCOMPLETE`. A successful status only means that no blocking findings were found within the confirmed contract, inspected evidence, exclusions, and rubric.

## Русский

### Что делает плагин

Plan Mirror проверяет технический план относительно подтверждённого contract проекта. Он находит блокирующие проблемы, при возможности создаёт один полный улучшенный вариант и передаёт его новому независимому Critic.

Проверяются покрытие требований, архитектура, зависимости, риски данных и безопасности, конкурентность, эксплуатация, критерии проверки, границы scope и исполнимость отдельных задач. Исходный план защищён контрольной суммой и никогда не перезаписывается.

В repo-aware режиме создаётся приватный неизменяемый snapshot разрешённых текстовых файлов. Critic получает только read-only инструменты `list_tree`, `search`, `read_range` и `get_metadata`. Shell, интернет, правила проекта и пользовательская конфигурация для reviewer-процессов отключены.

### Быстрый старт

Требования:

- Node.js 20 или новее;
- авторизованный `codex` CLI с командой `codex exec`;
- явный ID модели в `.plan-mirror.json` или `PLAN_MIRROR_MODEL`.

Установите публичный marketplace:

```bash
codex plugin marketplace add andredbird/AIS-codex-plugins --ref v0.1.2
```

Перезапустите приложение, откройте новый чат Codex и вызовите `$plan-mirror:doctor`. Если настройки проекта отсутствуют, Doctor покажет предлагаемую модель и точные изменения файлов, запросит явное подтверждение, безопасно создаст или дополнит `.plan-mirror.json`, добавит приватные пути в `.gitignore` и повторит проверку. Другую существующую модель он автоматически не заменяет. Затем вызовите `$plan-mirror:review` и укажите путь к плану. Skill поможет сначала подтвердить contract.

Пример запроса:

```text
$plan-mirror:review

Проверь PLAN.md относительно подтверждённых требований. Для утверждений о существующем коде используй evidence из репозитория. Не изменяй исходный план.
```

### Настройка и прямой запуск

Скопируйте `config.example.json` в `.plan-mirror.json` проверяемого проекта и замените `explicit-model-id` либо задайте `PLAN_MIRROR_MODEL`.

```bash
node /absolute/path/to/plan-mirror/scripts/plan-mirror.mjs doctor

# Запускайте только после подтверждения показанных пользователю изменений:
node /absolute/path/to/plan-mirror/scripts/plan-mirror.mjs setup --model MODEL_ID

node /absolute/path/to/plan-mirror/scripts/plan-mirror.mjs review \
  --plan PLAN.md \
  --contract project-contract.json

node /absolute/path/to/plan-mirror/scripts/plan-mirror.mjs review \
  --plan PLAN.md \
  --contract project-contract.json \
  --repo . \
  --scope src,tests
```

Запускайте команды из корня проверяемого проекта. Итоговые файлы сохраняются в `.plan-mirror/runs/`: `candidate.md`, `report.md` и `result.json`.

Возможные статусы: `NO_BLOCKERS_FOUND_WITHIN_SCOPE`, `NO_BLOCKERS_FOUND_WITH_NOTES`, `ACTION_REQUIRED`, `DECISION_REQUIRED` и `INCOMPLETE`. Успешный статус означает только отсутствие блокирующих замечаний в пределах подтверждённого contract, прочитанных evidence, исключений и rubric.

## MVP boundaries / Ограничения MVP

- exactly one optional Fixer cycle / не более одного цикла Fixer;
- no automatic replacement of the source plan / исходный план не заменяется автоматически;
- no panel, strict mode, or resume / пока нет panel, strict mode и resume;
- diagnostic evidence logs may contain project details and must not be committed / диагностические evidence-логи могут содержать сведения проекта и не должны публиковаться.
